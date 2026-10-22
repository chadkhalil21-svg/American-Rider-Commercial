'use strict';
// Durable, event-driven Operations alert for an ambiguous scheduled dispatch.
// Reuse the existing support_tickets store, founder Ops case queue and Resend.
// No second database collection, background poller or emergency classification.
const { createHash } = require('node:crypto');

function scheduledExceptionIdempotencyKey(reservationId) {
  const id = String(reservationId || '');
  if (!id || id.includes('/')) throw new Error('Valid scheduled reservation ID required');
  return 'scheduled-review-' + createHash('sha256').update(id).digest('hex').slice(0, 32);
}

function scheduledExceptionTicket({ reservationId, reservation, rideId = null,
  paymentIntentId = null, reason = null } = {}) {
  const r = reservation || {};
  const uid = String(r.travelerUid || '');
  if (!uid) throw new Error('Scheduled reservation owner required for a durable case');
  const originalPayment = paymentIntentId || r.paymentIntentId || null;
  // Never assert that a bank charge or authorization was actually captured.
  // The payment reference is only an investigative lead for the operator.
  const paymentNote = originalPayment
    ? 'A provider payment reference exists; verify its actual held, captured, released or refunded state in Stripe.'
    : 'No provider payment reference was confirmed; do not invent a charge or refund.';
  return {
    uid, email: String(r.travelerEmail || ''),
    kind: 'support', category: 'scheduled-travel',
    reason: 'Scheduled Travel requires Operations review',
    idempotencyKey: scheduledExceptionIdempotencyKey(reservationId),
    trip: { no: String(r.tripNo || ''),
      dep: String(r.dep || ''), arr: String(r.dest || r.arr || '') },
    description: [
      'Scheduled Travel could not be safely dispatched.',
      'Reservation: ' + String(reservationId),
      'Travel: ' + String(rideId || 'not yet staged'),
      'Original payment reference: ' + String(originalPayment || 'none confirmed'),
      paymentNote,
      'Recorded reason: ' + String(reason || 'Unknown; inspect scheduled reservation').slice(0, 500),
      'Review the original reservation and provider state before capture, refund, release or closure.',
    ].join('\n'),
  };
}

async function alertScheduledException({ reservationId, reservation, rideId, paymentIntentId,
  reason, fileTicket } = {}) {
  if (typeof fileTicket !== 'function') throw new TypeError('Existing ticket writer required');
  const ticket = scheduledExceptionTicket({
    reservationId, reservation, rideId, paymentIntentId, reason,
  });
  return fileTicket(ticket);
}

module.exports = { scheduledExceptionIdempotencyKey, scheduledExceptionTicket,
  alertScheduledException };
