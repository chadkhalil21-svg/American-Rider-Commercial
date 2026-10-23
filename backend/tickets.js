// Support tickets — the part that makes "a person has your case" true.
//
// The whole point of this file is that it CANNOT quietly fail. The old escalation told the
// traveler a specialist was responding and notified nobody; the fix is worthless if filing a
// ticket can fail silently and the screen still says help is coming. So every function here
// returns { ok } and the caller changes what the traveler is told based on it.
//
// Two destinations, deliberately:
//   1. Firestore — the durable record. Survives restarts, queryable, is the case history.
//   2. Email     — the alert. A record nobody looks at is not support.
//
// ⚠️ CORRECTION, 17 Aug 2026. This header used to say email was the only missing half and
// that `ok` reflected "the Firestore write alone, which means someone has to actually watch
// that collection". BOTH halves were missing. `firebase-admin` was never a dependency of
// this server, so the Firestore write never happened either, and fileTicket returned
// { ok:false } for every case it was ever given. Nobody was watching that collection because
// nothing was in it. Both destinations must be configured before real travel:
//   FIREBASE_SERVICE_ACCOUNT  (see backend/firebase-admin.js)  — the durable record
//   SUPPORT_EMAIL + RESEND_API_KEY                             — the alert
// /health reports whether each is actually working, so this cannot hide again.
const { readKey } = require('./env');
const { adminDb, adminStatus } = require('./firebase-admin');
const crypto = require('node:crypto');

// Operator qualification and screening are Operations cases, not Patron
// complaints, even when the same signed-in account has both roles.
function isOperatorCase(ticket) {
  const category = String(ticket?.category || '');
  const reason = String(ticket?.reason || '');
  return /^operator(?:[-\s]|$)/i.test(category) ||
    /^Operator screening — review (?:existing|new) provider report$/.test(reason);
}

// WAS: a require inside a try/catch that swallowed the reason, against a package that was
// not in package.json — so this returned false forever and every ticket silently vanished.
// See backend/firebase-admin.js for the full account of it.
const db = () => adminDb();

/** An unguessable case id. Earlier six-digit random numbers could collide and overwrite cases. */
function newCaseNo() {
  return `AR-C-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
}

async function notifyByEmail(ticket) {
  const to = readKey('SUPPORT_EMAIL');
  const key = readKey('RESEND_API_KEY');
  if (!to || !key) return false; // not configured — the caller must not claim otherwise
  const emergency = ticket.kind === 'emergency';
  const operatorRelations = !emergency && isOperatorCase(ticket);
  const paymentDeadline = ticket.reason === 'Payment disputed';
  // Existing standard Resend alert, not a new channel or an emergency page.
  const scheduledReview = ticket.reason === 'Scheduled Travel requires Operations review';
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json',
        // Resend deduplicates equal requests for 24h; stable incident/case ID
        // prevents a one-minute monitor retry from spamming emergency email.
        'Idempotency-Key': `case-alert/${ticket.caseNo}` },
      body: JSON.stringify({
        from: 'American Rider <support@americanrider.app>',
        to: [to],
        subject: paymentDeadline
          ? `PAYMENT DEADLINE · ${ticket.caseNo} · ${ticket.trip?.no || 'no travel number'}`
          : emergency
          ? // First word in the inbox says what it is. Nothing else we send is capitalised
            // like this, so an emergency cannot be mistaken for a billing question.
            `EMERGENCY · ${ticket.caseNo} · ${ticket.trip?.no || 'no travel number'}`
          : scheduledReview
          ? `SCHEDULED REVIEW · ${ticket.caseNo} · ${ticket.trip?.no || 'no travel number'}`
          : `${ticket.caseNo} · ${operatorRelations ? 'Operator Relations' : 'Patron Support'} · ${ticket.trip?.no || 'no travel number'}`,
        text:
          `Case ${ticket.caseNo}\n` +
          `Traveler: ${ticket.email || ticket.uid}\n` +
          `Travel: ${ticket.trip?.no || '—'}  ${ticket.trip?.dep || '?'} → ${ticket.trip?.arr || '?'}\n` +
          `Charged: ${ticket.trip?.totalCents != null ? '$' + (ticket.trip.totalCents / 100).toFixed(2) : '—'}\n` +
          (emergency && ticket.emergency
            ? `Operator: ${ticket.emergency.operator || '—'}\n` +
              `Vehicle: ${ticket.emergency.vehicle || '—'}  PLATE ${ticket.emergency.plate || '—'}\n` +
              `Location: ${ticket.emergency.address || '—'}\n` +
              `Coordinates: ${
                ticket.emergency.coords
                  ? `${ticket.emergency.coords.lat}, ${ticket.emergency.coords.lng}`
                  : '—'
              }\n`
            : '') +
          `Routed to a person because: ${ticket.reason}\n\n` +
          `In the traveler's words:\n${ticket.description}\n`,
      }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * File a case. Returns { ok, caseNo }.
 * ok=true means a case was stored or an email was accepted, NOT that a person answered.
 * The caller must distinguish stored, emailed and neither from the returned flags.
 */
async function fileTicket({ uid, email, description, trip, reason, kind, emergency, category, idempotencyKey }) {
  const keyed = (kind === 'emergency' || kind === 'support') && !!uid &&
    /^[\w-]{16,100}$/.test(String(idempotencyKey || ''));
  const caseNo = keyed ? `AR-C-${crypto.createHash('sha256').update(`${uid}:${idempotencyKey}`).digest('hex').slice(0,24).toUpperCase()}` : newCaseNo();
  const ticket = {
    caseNo, uid: uid || null, email: email || null,
    description: String(description || '').slice(0, 4000),
    trip: trip || null, reason: reason || null,
    // What the traveler filed it under ('fare', 'route', 'cancel', 'safety'), when the app said.
    category: typeof category === 'string' && category ? category.slice(0, 40) : null,
    // 'support' or 'emergency'. An emergency is queried, sorted and alerted differently
    // from a fare question, so it is stamped rather than inferred from the wording.
    kind: kind || 'support',
    emergency: emergency || null,
    status: 'open', createdAt: Date.now(),
  };

  let stored = false;
  let failReason = adminStatus().reason;
  const d = db();
  if (d) {
    try {
      const ref=d.collection('support_tickets').doc(caseNo);
      if (keyed) {
        const previous=await ref.get();
        if (previous.exists) {
          if (previous.data()?.uid !== uid || previous.data()?.kind !== kind) return {ok:false,caseNo:null,stored:false,emailed:false};
          if (previous.data()?.alertAcceptedAt) return {ok:true,caseNo,stored:true,emailed:true,repeated:true};
          // Preserve the original case and its latest evidence during an alert retry.
          Object.assign(ticket,previous.data());
        } else await ref.create(ticket);
      } else await ref.create(ticket);
      stored = true;
    } catch (e) {
      failReason = `Firestore write failed: ${e.message}`;
    }
  }

  const emailed = await notifyByEmail(ticket);
  if (emailed && stored && keyed) {
    try { await d.collection('support_tickets').doc(caseNo).set({alertAcceptedAt:Date.now()},{merge:true}); }
    catch { /* delivery can be duplicated on retry, but the case and need for attention remain */ }
  }

  // A case is only "reaching a person" if it is somewhere a person will find it.
  // `reason` is logged rather than returned to the app: the traveler needs to know it
  // failed, not why our credentials are wrong. But an operator of this server must be able
  // to find out in one place, so a failure is never silent again.
  if (!stored && !emailed) {
    console.error(
      `[tickets] case ${caseNo} REACHED NOBODY — ${failReason || 'email not configured'}`,
    );
  }
  return { ok: stored || emailed, caseNo, stored, emailed, failReason };
}

/**
 * Move an open emergency case's location on, as the vehicle moves.
 *
 * Only the traveler who opened the case may write to it. An unguessable case identifier
 * is not authorization to move somebody else's reported position.
 *
 * Returns { ok }. Best-effort by design: the app has already told the traveler where the
 * notification stands, and a dropped update must not change that.
 */
async function updateTicketLocation({ caseNo, uid, address, coords, rideId = null }) {
  const d = db();
  if (!d || !caseNo || !uid) return { ok: false };
  try {
    const ref = d.collection('support_tickets').doc(String(caseNo));
    const snap = await ref.get();
    if (!snap.exists) return { ok: false };
    const existing = snap.data() || {};
    // Neither an ordinary support record nor a closed incident may receive
    // GPS updates, regardless of the caller's role or knowledge of a case ID.
    if (existing.kind !== 'emergency' ||
        ['resolved', 'closed'].includes(existing.status)) return { ok: false };
    if (coords && (!Number.isFinite(coords.lat) || !Number.isFinite(coords.lng) ||
        Math.abs(coords.lat) > 90 || Math.abs(coords.lng) > 180))
      return { ok: false };
    if (!coords && !address) return { ok: false };

    const fromAssignedOperator = existing.uid !== uid;
    if (fromAssignedOperator) {
      // Route monitoring creates the Emergency ticket under the Traveler UID.
      // The assigned Operator may have the most accurate live position, but
      // must prove membership in THAT active Travel and THAT monitored case.
      // Neither a case number nor an arbitrary rideId grants access.
      const { emergencyTravelContext } = require('./emergency-travel-context');
      const context = await emergencyTravelContext({ db: d, uid, rideId });
      if (!context || context.active !== true ||
          context.role !== 'operator' ||
          context.monitoredCase?.caseNo !== String(caseNo))
        return { ok: false };
    }

    // An Operator's handset is not the Traveler's handset, especially before
    // pickup. Keep each reported position separate and label the reporter.
    const position = { address: address || null, coords: coords || null, at: Date.now() };
    if (fromAssignedOperator) {
      await ref.update({ 'emergency.operatorLocation': position });
    } else {
      await ref.update({
        'emergency.address': position.address,
        'emergency.coords': position.coords,
        'emergency.locationAt': position.at,
      });
    }

    // THE FIRST LOCATION HAS TO BE EMAILED, NOT JUST STORED.
    //
    // The alert fires the instant the emergency screen opens, which is the right thing —
    // a traveler who dials 911 and never returns to the app must still have been reported.
    // But at that instant the phone has not resolved its position yet (permission prompt,
    // then GPS), so the email that reaches a person said "Location: —". Every fix after
    // that only patched this document, which nobody re-reads. The one screen whose whole
    // purpose is answering "where are you" was telling our own team nothing.
    //
    // So: the first time a location lands on an emergency case, send it. Later movement
    // stays in the document — two emails is right, forty is noise.
    const hadLocation = !!(existing.emergency && (existing.emergency.address ||
      existing.emergency.coords || existing.emergency.operatorLocation?.address ||
      existing.emergency.operatorLocation?.coords));
    if (!hadLocation && (address || coords)) {
      const emergency = fromAssignedOperator
        ? { ...existing.emergency, operatorLocation: position }
        : { ...existing.emergency, address: position.address, coords: position.coords };
      await notifyLocationByEmail({ ...existing, emergency });
    }
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/** The follow-up an emergency case sends the moment it learns where the traveler is. */
async function notifyLocationByEmail(ticket) {
  const to = readKey('SUPPORT_EMAIL');
  const key = readKey('RESEND_API_KEY');
  if (!to || !key) return false;
  const e = ticket.emergency || {};
  // Never call an Operator handset's GPS the Traveler's location.
  const operatorOnly = !(e.coords || e.address) &&
    !!(e.operatorLocation?.coords || e.operatorLocation?.address);
  const reported = operatorOnly ? e.operatorLocation : e;
  const source = operatorOnly ? 'Assigned Operator device' : 'Case reporter device';
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json',
        // Resend deduplicates equal requests for 24h; stable incident/case ID
        // prevents a one-minute monitor retry from spamming emergency email.
        'Idempotency-Key': `case-location/${ticket.caseNo}` },
      body: JSON.stringify({
        from: 'American Rider <support@americanrider.app>',
        to: [to],
        subject: `EMERGENCY LOCATION · ${ticket.caseNo} · ${ticket.trip?.no || 'no travel number'}`,
        text:
          `Case ${ticket.caseNo} — a reported device position has been recorded.\n\n` +
          `Position source: ${source}\n` +
          `Location: ${reported.address || '—'}\n` +
          `Coordinates: ${reported.coords ? `${reported.coords.lat}, ${reported.coords.lng}` : '—'}\n` +
          (reported.coords ? `Map: https://maps.google.com/?q=${reported.coords.lat},${reported.coords.lng}\n` : '') +
          `\nVehicle: ${e.vehicle || '—'}  PLATE ${e.plate || '—'}\n` +
          `Operator: ${e.operator || '—'}\n` +
          `Traveler: ${ticket.email || ticket.uid}\n\n` +
          `Later movement is recorded on the case document, not emailed.\n`,
      }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * List the most recent Traveler-visible support cases, with a bounded Firestore
 * read budget. Operator qualification/insurance cases share the collection but
 * cannot be shown in Patron Support. Fetch progressively until we have enough
 * eligible cases, the collection is exhausted, or at most 100 documents are read.
 *
 * Requires support_tickets(uid ASC, createdAt DESC) to be READY in Firebase BEFORE
 * this query is deployed. Unindexed query must fail closed, never silently sort
 * arbitrary older cases in lieu of the actual newest ones.
 */
async function listTickets(uid, { limit = 20, database } = {}) {
  const d = database || db();
  if (!uid) return [];
  if (!d) throw new Error('Support case records are unavailable');
  const requested = Number.isSafeInteger(limit) && limit > 0 ? Math.min(limit, 100) : 20;
  const budget = 100;
  const base = d.collection('support_tickets').where('uid', '==', String(uid))
    .orderBy('createdAt', 'desc');
  const eligible = [];
  let scanned = 0;
  let cursor = null;
  let exhausted = false;

  while (eligible.length < requested && scanned < budget) {
    const size = Math.min(budget - scanned, Math.max(20, requested * 2));
    const page = cursor ? base.startAfter(cursor) : base;
    const snap = await page.limit(size).get();
    const docs = snap.docs || [];
    scanned += docs.length;
    for (const doc of docs) {
      const item = (typeof doc.data === 'function' ? doc.data() : doc) || {};
      if (item.caseNo && !isOperatorCase(item)) eligible.push(item);
      if (eligible.length >= requested) break;
    }
    if (docs.length < size) { exhausted = true; break; }
    if (!docs.length) { exhausted = true; break; }
    cursor = docs[docs.length - 1];
  }

  const cases = eligible.slice(0, requested).map((x) => ({
    caseNo: String(x.caseNo),
    kind: x.kind === 'emergency' ? 'emergency' : 'support',
    createdAt: Number(x.createdAt) || 0,
    tripNo: x.trip && typeof x.trip === 'object' && x.trip.no ? String(x.trip.no) : null,
    status: typeof x.status === 'string' && x.status ? x.status : 'open',
    acknowledgedAt: Number(x.acknowledgedAt) || null,
  }));
  // There may be older cases when the page fills. Never claim this is the entire
  // history when the bounded server query cannot establish that fact.
  cases.possiblyIncomplete = !exhausted;
  return cases;
}

/**
 * Resolve a support case. Server-side only: the account can read its status but cannot
 * manufacture closure. A resolution is an operational fact, not an inbox convention.
 */
async function resolveTicket({ caseNo, resolution, actor = 'operations', now = Date.now() }, { database } = {}) {
  const d = database || db();
  if (!d || !caseNo || !String(resolution || '').trim()) return { ok: false, reason: 'case, database and resolution are required' };
  const ref = d.collection('support_tickets').doc(String(caseNo));
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, reason: 'not found' };
  const ticket = snap.data() || {};
  if (ticket.status === 'resolved') return { ok: true, alreadyResolved: true };
  await ref.set({
    status: 'resolved',
    resolution: String(resolution).trim().slice(0, 4000),
    resolvedAt: now,
    resolvedBy: String(actor || 'operations').slice(0, 120),
  }, { merge: true });
  return { ok: true };
}

module.exports = { fileTicket, newCaseNo, updateTicketLocation, listTickets, resolveTicket, isOperatorCase };
