'use strict';
// Fee eligibility is evaluated once at the Operator's exceptional no-show action.
// A handset timer never makes a Traveler financially liable.
const { distanceMiles } = require('./matching');
const WAIT_MS = 5 * 60 * 1000;
const LOCATION_AGE_MS = 2 * 60 * 1000;
const MAX_PICKUP_MILES = 0.25;
const FEE_CENTS = 300;
const deny = (code, status=409) => ({ok:false,code,status});
const validPoint = (lat,lng) => Number.isFinite(lat) && Math.abs(lat)<=90 &&
  Number.isFinite(lng) && Math.abs(lng)<=180;
function noShowEligibility({ride,operator,rideId,uid,now=Date.now()}) {
  if (!ride || String(ride.operatorId || '') !== String(uid || '') || !uid)
    return deny('not_assigned_operator',403);
  if (ride.status !== 'arrived') return deny('travel_not_waiting');
  if (ride.party?.teen===true) return deny('teen_no_show_requires_review');
  // Scheduled arrivals can precede a scheduled pickup. Its separate policy must
  // be commissioned before charging based only on arrival time.
  if (ride.scheduledFor || ride.reservationId) return deny('scheduled_wait_requires_review');
  if (!Number.isSafeInteger(now) || !Number.isSafeInteger(ride.arrivedAt) ||
      ride.arrivedAt > now || now - ride.arrivedAt < WAIT_MS)
    return deny('waiting_period_not_finished');
  if (!Number.isSafeInteger(ride.pickupContactAt) ||
      ride.pickupContactAt < ride.arrivedAt || ride.pickupContactAt > now ||
      String(ride.pickupContactBy || '') !== String(uid))
    return deny('operator_contact_required');
  if (ride.operatorAtFault === true || ride.operatorLateFault === true)
    return deny('operator_at_fault');
  if (!operator || String(operator.currentRideId || '') !== String(rideId))
    return deny('operator_assignment_unverified');
  const time = Number(operator.onlineAt);
  if (!Number.isSafeInteger(time) || time > now+60_000 ||
      now-time > LOCATION_AGE_MS || time <= 0)
    return deny('operator_location_stale');
  const a={lat:Number(operator.lat),lng:Number(operator.lng)};
  const b={lat:Number(ride.pickupLat),lng:Number(ride.pickupLng)};
  if (!validPoint(a.lat,a.lng) || !validPoint(b.lat,b.lng) ||
      distanceMiles(a,b)>MAX_PICKUP_MILES)
    return deny('operator_not_near_pickup');
  return {ok:true,status:200,feeCents:FEE_CENTS};
}
module.exports={noShowEligibility,WAIT_MS,LOCATION_AGE_MS,MAX_PICKUP_MILES,FEE_CENTS};
