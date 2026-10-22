const { cancelTravel } = require('./travelmoney');
const { paymentMatches } = require('./booking');

const PREPARED_TTL_MS = 15 * 60 * 1000;
const PAID_UNMATCHED_TTL_MS = 2 * 60 * 1000;
const BATCH_LIMIT = 100;
const CURSOR_COLLECTION = 'recovery_cursors';
const CURSOR_DOCUMENT = 'booking_recovery';
// One checkpoint read per leased sweep and at most one merge write when
// a query's first page cannot cover all outstanding recovery work.
const CURSOR_FIELDS = Object.freeze({
  awaiting_payment: 'preparedAfterId',
  awaiting_assignment: 'assignmentAfterId',
  refund_pending: 'refundAfterId',
});

/**
 * Every confirmed charge without a served Travel needs either an Operator or an owed refund.
 * Operates only on server-held owner ids; no phone or caller may choose the payment to refund.
 * A failed provider action remains refundPending and is retried on a later leased sweep.
 */
async function sweepBookingRecovery({ db, deps, stripeConfigured, now = Date.now() }) {
  if (!db) return { ok: false, reason: 'Firestore unavailable' };
  const out = { ok: true, scanned: 0, closed: [], pending: [], errors: [], overCapacity: false };
  const cursorRef = db.collection(CURSOR_COLLECTION).doc(CURSOR_DOCUMENT);
  let previous = {};
  try {
    const cursorSnap = await cursorRef.get();
    previous = cursorSnap.exists ? (cursorSnap.data() || {}) : {};
  } catch (e) {
    // Do not silently fall back to the same first page forever.
    return { ...out, ok: false,
      errors: [`Recovery checkpoint unavailable: ${String(e.message || e)}`] };
  }
  const advances = {};
  const groups = [
    { field: 'status', value: 'awaiting_payment', ttl: PREPARED_TTL_MS, cursor: CURSOR_FIELDS.awaiting_payment },
    { field: 'status', value: 'awaiting_assignment', ttl: PAID_UNMATCHED_TTL_MS, cursor: CURSOR_FIELDS.awaiting_assignment },
    { field: 'refundPending', value: true, ttl: 0, cursor: CURSOR_FIELDS.refund_pending },
  ];
  for (const group of groups) {
    let snap;
    try {
      // A malformed/stale refundPending flag on a non-cancelled Travel must not
      // occupy the first 100 recovery slots indefinitely. Filter at Firestore,
      // not *after* the bounded query. Paid cancelled Travels retain priority.
      let query = db.collection('rides').where(group.field, '==', group.value);
      if (group.field === 'refundPending') query = query.where('status', '==', 'cancelled');
      // Cursor on the indexed Firestore document name avoids costly offsets
      // and reaches past the 100 oldest unresolved cases.
      query = query.orderBy('__name__');
      const saved = previous[group.cursor];
      const validCursor = typeof saved === 'string' && saved.length > 0 &&
        saved.length <= 200 && !saved.includes('/');
      if (validCursor) query = query.startAfter(saved);
      snap = await query.limit(BATCH_LIMIT).get();
      if (!snap.docs.length && validCursor) {
        // End reached. Wrap only once, keeping scans bounded.
        let first = db.collection('rides').where(group.field, '==', group.value);
        if (group.field === 'refundPending') first = first.where('status', '==', 'cancelled');
        snap = await first.orderBy('__name__').limit(BATCH_LIMIT).get();
      }
      const next = snap.docs.length >= BATCH_LIMIT ? snap.docs.at(-1).id : null;
      if ((previous[group.cursor] ?? null) !== next) advances[group.cursor] = next;
    }
    catch (e) { out.ok = false; out.errors.push(String(e.message || e)); continue; }
    if (snap.docs.length >= BATCH_LIMIT) out.overCapacity = true;
    out.scanned += snap.docs.length;
    for (const doc of snap.docs) {
      let ride = doc.data() || {};
      if (group.field === 'refundPending' && ride.status !== 'cancelled') continue;
      if (ride.reservationId && !ride.paymentIntentId) {
        try {
          const reservation = await db.collection('scheduled_rides').doc(String(ride.reservationId)).get();
          const piId = reservation.exists ? reservation.data().paymentIntentId : null;
          if (piId) {
            const pi = await deps.verifiedTravelPayment(piId);
            if (!paymentMatches({ ...ride, paymentIntentId: piId }, pi, ride.travelerUid, doc.id)) {
              out.ok = false; out.pending.push(doc.id);
              out.errors.push(`${doc.id}: scheduled payment ownership/amount unavailable`);
              continue;
            }
            // A manual requires_capture authorization is NOT a captured charge.
            // Do not stamp paidAt: it changes receipt, refund and webhook behavior.
            // Preserve the provider's real held-vs-settled state across a crash.
            const manualHold = pi.status === 'requires_capture' &&
              pi.capture_method === 'manual' && pi.metadata?.capturePolicy === 'manual_v1';
            const recovered = manualHold
              ? { paymentIntentId: piId, paymentCapturePolicy: 'manual_v1',
                  authorizationState: 'held', authorizedAt: now,
                  authorizedAmountCents: Number(pi.amount) }
              : { paymentIntentId: piId, paidAt: now,
                  paymentCapturePolicy: 'captured_legacy' };
            await db.collection('rides').doc(doc.id).set(recovered, { merge: true });
            ride = { ...ride, ...recovered };
          }
        } catch (e) {
          out.ok = false; out.pending.push(doc.id);
          out.errors.push(`${doc.id}: scheduled payment reconciliation: ${String(e.message || e)}`);
          continue;
        }
      }
      const ttl = group.value === 'awaiting_payment' && ride.paidAt ? PAID_UNMATCHED_TTL_MS : group.ttl;
      if (ttl && now - Number(ride.paidAt || ride.createdAt || now) < ttl) continue;
      try {
        const result = await cancelTravel({ db, uid: ride.travelerUid, rideId: doc.id,
          deps, stripeConfigured, now });
        if (result.status === 200 && !result.body.pending) out.closed.push(doc.id);
        else if (result.status === 202 || result.body.pending) out.pending.push(doc.id);
        else { out.ok = false; out.errors.push(`${doc.id}: ${result.body.code || result.body.error}`); }
      } catch (e) { out.ok = false; out.errors.push(`${doc.id}: ${String(e.message || e)}`); }
    }
  }
  if (Object.keys(advances).length) {
    try {
      // Save AFTER processing; crashed workers may repeat safely thanks to
      // existing Travel cancellation idempotency and the single-leader lease.
      await cursorRef.set(advances, { merge: true });
    } catch (e) {
      out.ok = false;
      out.errors.push(`Recovery checkpoint not persisted: ${String(e.message || e)}`);
    }
  }
  return out;
}

module.exports = { sweepBookingRecovery, PREPARED_TTL_MS, PAID_UNMATCHED_TTL_MS, BATCH_LIMIT };
