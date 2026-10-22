// Server-authoritative Operator progression through one Travel.
// A phone may REQUEST a transition; it never writes a payable Travel state itself.
const { distanceMiles } = require('./matching');

const TRANSITIONS = {
  declined: ['assigned'],
  arrived: ['accepted'],
  onboard: ['arrived'],
  completed: ['onboard'],
};
const STAMP = { declined: 'declinedAt', arrived: 'arrivedAt', onboard: 'onboardAt', completed: 'completedAt' };
const PICKUP_RADIUS_MI = 0.5;
const DESTINATION_RADIUS_MI = 1.0;

const fail = (status, error, code) => ({ status, body: { ok: false, error, ...(code ? { code } : {}) } });
const point = (lat, lng) => {
  const p = { lat: Number(lat), lng: Number(lng) };
  return Number.isFinite(p.lat) && Number.isFinite(p.lng) ? p : null;
};

async function progressTravel({ db, uid, rideId, status, now = Date.now() }) {
  const id = String(rideId || '');
  const next = String(status || '');
  if (!id) return fail(400, 'rideId is required');
  if (!TRANSITIONS[next]) return fail(400, 'Unsupported Travel status', 'bad_status');

  const ref = db.collection('rides').doc(id);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return fail(404, 'No such Travel');
    const ride = snap.data() || {};
    if (String(ride.operatorId || '') !== String(uid || '')) return fail(403, 'That Travel is assigned to another Operator');

    const current = String(ride.status || '');
    if (current === next) return { status: 200, body: { ok: true, status: next, unchanged: true } };
    if (!TRANSITIONS[next].includes(current)) return fail(409, `Travel cannot move from ${current || 'unknown'} to ${next}`, 'invalid_transition');

    // Teen pickup verification is server-stamped by /travel/teen-pickup/verify.
    const teenVerifiedAt = ride.teenPickup?.verifiedAt;
    if (next === 'onboard' && ride.party?.teen === true &&
        (!Number.isSafeInteger(teenVerifiedAt) || teenVerifiedAt <= 0 || teenVerifiedAt > now ||
         String(ride.teenPickup?.verifiedBy||'') !== String(uid||''))) {
      return fail(409, 'Verify the Teen pickup code before boarding.', 'teen_pickup_unverified');
    }

    // A protected adult code is mandatory ONLY if the Traveler opted in on
    // a supported client. The legacy TestFlight never enrolled an ordinary
    // Travel, so deploying this check cannot strand its Operators.
    if (next === 'onboard' && ride.adultPickup?.required === true &&
        ride.party?.teen !== true &&
        (!Number.isSafeInteger(ride.adultPickup?.verifiedAt) ||
         ride.adultPickup.verifiedAt <= 0 || ride.adultPickup.verifiedAt > now ||
         String(ride.adultPickup.verifiedBy||'') !== String(uid||''))) {
      return fail(409, 'Verify the Traveler pickup code before boarding.', 'adult_pickup_unverified');
    }

    // Arrival and completion require a fresh server-held Operator position near the relevant
    // endpoint. This does not pretend commodity GPS is tamper-proof; it prevents a status-only
    // API call from manufacturing physical progress and makes telemetry an independent input.
    if (next === 'arrived' || next === 'completed') {
      const fleetRef = db.collection('operators').doc(String(uid));
      const fleetSnap = await tx.get(fleetRef);
      const fleet = fleetSnap.exists ? fleetSnap.data() || {} : {};
      const at = Number(fleet.onlineAt || 0);
      if (!at || now - at > 5 * 60 * 1000 || at > now + 60 * 1000) {
        return fail(409, 'A current Operator position is required for this transition.', 'position_stale');
      }
      const here = point(fleet.lat, fleet.lng);
      const target = next === 'arrived'
        ? point(ride.pickupLat, ride.pickupLng)
        : point(ride.destinationLat, ride.destinationLng);
      if (!here || !target) return fail(409, 'Travel endpoint geometry is unavailable.', 'position_unverifiable');
      const radius = next === 'arrived' ? PICKUP_RADIUS_MI : DESTINATION_RADIUS_MI;
      if (distanceMiles(here, target) > radius) {
        return fail(409, next === 'arrived' ? 'You are not at the pickup yet.' : 'You are not at the destination yet.', 'outside_transition_radius');
      }
    }

    // A decline releases the SAME paid Travel for the sweep; it must never prompt the phone
    // to create or charge a second one. Completing also frees this Operator's one slot.
    if (next === 'declined' || next === 'completed') {
      const opRef = db.collection('operators').doc(String(uid));
      const opSnap = await tx.get(opRef);
      if (opSnap.exists) {
        const fleet = opSnap.data() || {};
        if (next === 'completed' && String(fleet.currentRideId || '') === id) {
          // Promote the already-reserved next Travel atomically. There is never a moment where
          // another dispatch can steal this Operator between passenger A completing and B becoming current.
          tx.update(opRef, fleet.nextRideId
            ? { currentRideId: String(fleet.nextRideId), reservedAt: fleet.nextReservedAt || now,
                nextRideId: null, nextReservedAt: null }
            : { currentRideId: null, reservedAt: null });
        } else if (String(fleet.currentRideId || '') === id) {
          tx.update(opRef, { currentRideId: null, reservedAt: null });
        } else if (String(fleet.nextRideId || '') === id) {
          tx.update(opRef, { nextRideId: null, nextReservedAt: null });
        }
      }
    }
    const patch = { status: next === 'declined' ? 'assigned' : next, statusAt: now, [STAMP[next]]: now };
    if (next === 'declined') {
      patch.releasedAt = now;
      patch.releasedReason = 'operator_declined';
      patch.declinedBy = [...new Set([...(Array.isArray(ride.declinedBy) ? ride.declinedBy : []), String(uid)])];
    }
    if (next === 'completed') patch.needsPayout = true;
    tx.update(ref, patch);
    return { status: 200, body: { ok: true, status: next } };
  });
}


/**
 * Exception before boarding: the accepted Operator cannot complete this pickup.
 * Atomically free their slot, mark them off duty and return the SAME Travel to the
 * existing server re-offer sweep. It retains the original provider payment,
 * quote and ride ID. The sweep automatically cancels + reconciles money after
 * its short replacement window if no qualified Operator can be found.
 *
 * No phone may rewrite fare, capture an authorization, issue a refund or
 * force this transition after the Traveler has boarded.
 */
async function withdrawAcceptedTravel({ db, uid, rideId, now = Date.now() }) {
  const id = String(rideId || '');
  const operatorId = String(uid || '');
  if (!id || !operatorId) return fail(400, 'Operator and Travel are required', 'missing_travel');
  const ref = db.collection('rides').doc(id);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) return fail(404, 'No such Travel', 'no_travel');
    const ride = snap.data() || {};
    if (String(ride.operatorId || '') !== operatorId)
      return fail(403, 'This Travel belongs to another Operator', 'not_yours');
    if (ride.status === 'assigned' && ride.releasedReason === 'operator_withdrawn' &&
        ride.withdrawnBy === operatorId && Number.isSafeInteger(ride.operatorWithdrawalAt))
      return { status: 200, body: { ok: true, unchanged: true, searchingReplacement: true } };
    if (!['accepted', 'arrived'].includes(ride.status))
      return fail(409, 'Travel cannot be withdrawn after boarding. Contact Support.', 'travel_underway');
    const fleetRef = db.collection('operators').doc(operatorId);
    const fleetSnap = await tx.get(fleetRef);
    if (fleetSnap.exists) {
      const fleet = fleetSnap.data() || {};
      const patch = { available: false, offlineAt: now, offDutyReason: 'operator_withdrawn' };
      if (String(fleet.currentRideId || '') === id) {
        patch.currentRideId = null;
        patch.reservedAt = null;
      } else if (String(fleet.nextRideId || '') === id) {
        patch.nextRideId = null;
        patch.nextReservedAt = null;
      }
      tx.update(fleetRef, patch);
    }
    tx.update(ref, {
      status: 'assigned', statusAt: now, offeredAt: now,
      releasedAt: now, releasedReason: 'operator_withdrawn',
      operatorWithdrawalAt: now, withdrawnBy: operatorId,
      declinedBy: [...new Set([...(Array.isArray(ride.declinedBy) ? ride.declinedBy : []), operatorId])],
      acceptedAt: null, arrivedAt: null,
      // Reassignment never inherits the prior Operator's proof of pickup.
      ...(ride.teenPickup ? { teenPickup: { ...ride.teenPickup, verifiedAt: null, verifiedBy: null } } : {}),
      ...(ride.adultPickup ? { adultPickup: { ...ride.adultPickup, verifiedAt: null, verifiedBy: null } } : {}),
    });
    return { status: 200, body: { ok: true, searchingReplacement: true } };
  });
}

module.exports = { progressTravel, withdrawAcceptedTravel, TRANSITIONS, PICKUP_RADIUS_MI, DESTINATION_RADIUS_MI };
