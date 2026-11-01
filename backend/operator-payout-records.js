'use strict';

/**
 * Read-only, account-scoped payout records for Operators.
 * This is not a Stripe bank-payout report, nor a payout-recovery queue.
 * Page by Firestore document ID to avoid an unbounded historical query or
 * reliance on an uncommissioned date composite index. Cursors are opaque IDs.
 */
const { FieldPath } = require('firebase-admin/firestore');
const PAGE_SIZE = 12;

function statusForCompletedTravel(ride) {
  if (ride.status !== 'completed') return null;
  const cents = ride.operatorPaidCents;
  if (ride.transferId && Number.isSafeInteger(cents) && cents >= 0)
    return { kind: 'transfer_recorded', cents };
  // Missing transferId cannot prove that no transfer took place in Stripe.
  // Never call this amount "owed" without independent reconciliation.
  return { kind: 'reconciliation_needed', cents: null };
}

async function operatorPayoutRecords({ db, operatorUid, after = null }) {
  if (!db || typeof db.collection !== 'function') throw new Error('Database unavailable');
  if (typeof operatorUid !== 'string' || !operatorUid.trim())
    throw new Error('Authenticated Operator required');
  if (after !== null && (typeof after !== 'string' || after.length < 1 ||
      after.length > 256 || after.includes('/')))
    throw new Error('Invalid page cursor');

  let query = db.collection('rides')
    .where('operatorId', '==', operatorUid)
    .orderBy(FieldPath.documentId())
    .limit(PAGE_SIZE + 1);
  if (after) query = query.startAfter(after);
  const snap = await query.get();
  const all = snap.docs || [];
  const docs = all.slice(0, PAGE_SIZE);
  const records = [];
  for (const doc of docs) {
    const ride = doc.data() || {};
    if (String(ride.operatorId) !== operatorUid) throw new Error('Operator ownership mismatch');
    const outcome = statusForCompletedTravel(ride);
    if (!outcome) continue;
    records.push({
      rideId: doc.id,
      tripNo: typeof ride.tripNo === 'string' ? ride.tripNo : null,
      completedAt: Number.isSafeInteger(ride.completedAt) ? ride.completedAt : null,
      status: outcome.kind,
      transferredCents: outcome.cents,
    });
  }
  // Build 60's existing Revenue ledger displays these owner-scoped wallet
  // figures. Matured-unpaid earnings are explicitly not represented as paid.
  // Never add these values to Travel Fare, create a second Stripe transfer,
  // or repeat them on later pages.
  if (!after) {
    const wallet = await db.collection('recruiter_commission_wallets').doc(operatorUid).get();
    if (wallet.exists) {
      const w = wallet.data() || {};
      const available = w.availableCents;
      const paid = w.netPaidCents;
      for (const n of [available, paid]) {
        if (n !== undefined && (!Number.isSafeInteger(n) || n < 0))
          throw new Error('Referral wallet requires reconciliation');
      }
      if (Number.isSafeInteger(available) && available > 0) {
        records.unshift({
          rideId: 'referral-available',
          tripNo: 'Referral earnings 
    nextCursor: all.length > PAGE_SIZE && docs.length ? docs[docs.length - 1].id : null,
    // We have intentionally NOT returned an all-time earnings/owed balance.
    scope: 'one_page_of_server_records',
  };
}
module.exports = { PAGE_SIZE, statusForCompletedTravel, operatorPayoutRecords };
 + (available / 100).toFixed(2) + ' (earned, not yet paid)',
          completedAt: null,
          status: 'reconciliation_needed',
          transferredCents: null,
        });
      }
      if (Number.isSafeInteger(paid) && paid > 0) {
        records.unshift({
          rideId: 'referral-verified-paid',
          tripNo: 'Referral earnings (verified paid)',
          completedAt: null,
          status: 'transfer_recorded',
          transferredCents: paid,
        });
      }
    }
  }
  return {
    ok: true,
    records,
    hasMore: all.length > PAGE_SIZE,
    nextCursor: all.length > PAGE_SIZE && docs.length ? docs[docs.length - 1].id : null,
    // We have intentionally NOT returned an all-time earnings/owed balance.
    scope: 'one_page_of_server_records',
  };
}
module.exports = { PAGE_SIZE, statusForCompletedTravel, operatorPayoutRecords };
