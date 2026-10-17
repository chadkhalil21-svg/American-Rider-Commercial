'use strict';

/**
 * READ-ONLY migration census for outstanding Operator fares.
 *
 * This deliberately does NOT initiate a transfer, declare any debt settled,
 * write an index, or treat payoutPending as an exhaustive historical flag.
 * Each bounded page can be reconciled against Stripe before a new recovery
 * queue is activated. Cursor progress must be checkpointed by the caller.
 */
const { FieldPath } = require('firebase-admin/firestore');

function classifyRecordedPayout(ride) {
  if (ride?.status !== 'completed' || !ride.paymentIntentId) return 'not_payable_history';
  if (ride.transferId) return 'transfer_recorded';
  // All unrecorded transfer identities require Stripe reconciliation,
  // regardless of payoutPending:true/false/missing on older documents.
  if (ride.payoutPending === true) return 'pending_reconciliation';
  if (ride.payoutPending === false) return 'missing_transfer_identity';
  return 'legacy_unclassified';
}

async function censusOperatorPage({ db, operatorId, afterId = null, pageSize = 100 }) {
  if (!db || typeof db.collection !== 'function') throw new Error('Database is required');
  if (typeof operatorId !== 'string' || !operatorId.trim()) throw new Error('Operator UID is required');
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new Error('Page size must be 1–100');
  if (afterId != null && (typeof afterId !== 'string' || !afterId)) throw new Error('Invalid checkpoint');

  // Uses only the server-authenticated Operator UID. Never expose this
  // privileged census directly to a client.
  let query = db.collection('rides')
    .where('operatorId', '==', operatorId)
    .orderBy(FieldPath.documentId())
    .limit(pageSize);
  if (afterId) query = query.startAfter(afterId);
  const snapshot = await query.get();
  const docs = snapshot.docs || [];
  const tally = {
    not_payable_history: 0,
    transfer_recorded: 0,
    pending_reconciliation: 0,
    missing_transfer_identity: 0,
    legacy_unclassified: 0,
  };
  const candidates = [];
  for (const doc of docs) {
    const ride = doc.data() || {};
    // A malformed historical record cannot authorize payment to somebody else.
    if (ride.operatorId !== operatorId) throw new Error('Operator ownership mismatch');
    const status = classifyRecordedPayout(ride);
    tally[status] += 1;
    if (status === 'pending_reconciliation' || status === 'missing_transfer_identity' ||
        status === 'legacy_unclassified') {
      // Only identifiers needed to join Stripe and the canonical ride record.
      // A candidate is NOT itself proof that money is owed.
      candidates.push({ rideId: doc.id, status });
    }
  }
  return {
    examined: docs.length,
    counts: tally,
    candidates,
    nextCursor: docs.length ? docs[docs.length - 1].id : null,
    hasMore: docs.length === pageSize,
    requiresStripeReconciliation: candidates.length > 0,
    readOnly: true,
  };
}

module.exports = { classifyRecordedPayout, censusOperatorPage };
