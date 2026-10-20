'use strict';
// One durable status marker is enough for an assigned Travel awaiting a
// replacement. Rechecking for a nearby, qualified Operator still happens on
// EVERY sweep; this policy affects only a redundant Firestore write.
function shouldRecordUnanswered(ride) {
  if (!ride || ride.unanswered !== true) return true;
  // Repair incomplete legacy documents once; never erase a valid first timestamp.
  return !Number.isSafeInteger(ride.unansweredAt) || ride.unansweredAt <= 0;
}
module.exports = { shouldRecordUnanswered };
