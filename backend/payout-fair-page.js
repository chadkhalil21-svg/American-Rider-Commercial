'use strict';

// Fair, bounded, restart-safe pages for confirmed Operator payout obligations.
// Without a cursor, the first 25 blocked debts can exclude later eligible
// Operators forever. Paging changes ONLY which debts are examined; the existing
// Stripe/FireStore payout, eligibility, capture and idempotency guards still
// decide whether one cent can move.
const { FieldPath } = require('firebase-admin/firestore');

const PAGE_LIMIT = 25;
const CURSOR_COLLECTION = 'scheduler_state';
const CURSOR_DOCUMENT = 'operator_payout_page';

function cleanCursor(value) {
  // Firestore document IDs do not include '/', and only privileged server
  // code writes this cursor. Reject malformed values rather than trusting them.
  return typeof value === 'string' && value.length > 0 && value.length <= 1500 &&
    value !== '.' && value !== '..' && !value.includes('/') ? value : null;
}

async function payoutPage({ db, pageSize = PAGE_LIMIT } = {}) {
  if (!db || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > PAGE_LIMIT)
    throw new Error('Invalid bounded payout query');
  const cursorRef = db.collection(CURSOR_COLLECTION).doc(CURSOR_DOCUMENT);
  const cursorSnap = await cursorRef.get();
  const priorCursor = cursorSnap.exists ? cleanCursor(cursorSnap.data()?.lastRideId) : null;

  const queryFrom = after => {
    let query = db.collection('rides')
      .where('needsPayout', '==', true)
      .orderBy(FieldPath.documentId())
      .limit(pageSize);
    if (after) query = query.startAfter(after);
    return query;
  };
  let snap = await queryFrom(priorCursor).get();
  let wrapped = false;
  if (priorCursor && !snap.docs.length) {
    // A removed or last-in-order cursor must not stall the queue indefinitely.
    snap = await queryFrom(null).get();
    wrapped = true;
  }
  const docs = snap.docs;
  // The caller must call checkpoint() only AFTER safely attempting this page.
  // If a process dies after Stripe succeeds but before this checkpoint, the
  // normal durable transfer-once reconciliation handles any replay.
  const checkpoint = async () => {
    if (docs.length) {
      const lastRideId = cleanCursor(docs[docs.length - 1].id);
      if (!lastRideId) throw new Error('Payout page has invalid ride identity');
      await cursorRef.set({ lastRideId, updatedAt: Date.now() }, { merge: true });
    } else if (priorCursor) {
      await cursorRef.set({ lastRideId: null, updatedAt: Date.now() }, { merge: true });
    }
  };
  return { docs, checkpoint, wrapped, from: priorCursor, inspected: docs.length };
}

module.exports = { payoutPage, PAGE_LIMIT, CURSOR_COLLECTION, CURSOR_DOCUMENT };
