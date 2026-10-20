'use strict';
// Idempotent refusal: an already-unavailable Operator with the SAME server reason
// must not be rewritten on every unsuccessful 90-second presence renewal.
// New/reclassified denials remain immediate fail-closed writes.
function shouldMarkOffDuty(previous, reason) {
  const row = previous && typeof previous === 'object' ? previous : {};
  return row.available !== false || row.offDutyReason !== reason;
}
module.exports = { shouldMarkOffDuty };
