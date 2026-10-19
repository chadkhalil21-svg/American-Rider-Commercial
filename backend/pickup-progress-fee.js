'use strict';
// Conservative, no-network pickup progress evaluator. No new Firestore reads or writes.
// Only server-held fleet locations and acceptance/cancellation transaction snapshots.
// Feature must remain OFF until disclosures, Stripe refunds/payouts and legal review pass.
const { distanceMiles } = require('./matching');
const FREE_WINDOW_MS = 2*60*1000;
const MAX_POSITION_AGE_MS = 2*60*1000;
const MAX_ACCEPTANCE_POSITION_AGE_MS = 2*60*1000;
const MIN_OBSERVATION_GAP_MS = 30*1000;
const MIN_CLOSING_MI = 0.20; // well beyond normal GPS jitter
const MIN_CLOSING_FRACTION = 0.15;
const MIN_DIRECTION_RATIO = 0.55; // closing distance / overall displacement
const MAX_PLAUSIBLE_MPH = 75;
const CANCELLATION_FEE_CENTS = 300;
function coordinate(lat,lng){
 if(lat===null||lat===undefined||lng===null||lng===undefined)return null;
 const a=Number(lat),b=Number(lng);
 return Number.isFinite(a)&&Number.isFinite(b)&&a>=-90&&a<=90&&b>=-180&&b<=180
   ? {lat:a,lng:b} : null;
}
function acceptanceEvidence({operator,rideId,pickup,at}){
 const fleet=operator||{},o=coordinate(fleet.lat,fleet.lng),p=coordinate(pickup?.lat,pickup?.lng);
 const positionAt=Number(fleet.onlineAt);
 if(!o||!p||String(fleet.currentRideId||'')!==String(rideId)||
   !Number.isSafeInteger(positionAt)||positionAt>at||positionAt<at-MAX_ACCEPTANCE_POSITION_AGE_MS)
   return null;
 const startDistanceMi=distanceMiles(o,p);
 if(!Number.isFinite(startDistanceMi))return null;
 return {lat:o.lat,lng:o.lng,positionAt,startDistanceMi};
}
function cancellationProgress({ride,operator,rideId,now}){
 const zero=(reason)=>({feeCents:0,reason});
 if(!Number.isSafeInteger(now)||!ride||!Number.isSafeInteger(ride.acceptedAt)||
   now<ride.acceptedAt)return zero('acceptance_unverified');
 if(now-ride.acceptedAt<FREE_WINDOW_MS)return zero('free_cancellation_window');
 if(ride.operatorAtFault===true || ride.operatorLateFault===true)
   return zero('operator_at_fault');
 const eta=Number(ride.operatorEtaMin);
 if(ride.status!=='arrived'&&Number.isFinite(eta)&&eta>0&&
   now-ride.acceptedAt>(eta+5)*60*1000)return zero('operator_excessively_late');
 // A server-accepted arrival has already independently checked a recent position
 // near pickup. Never apply it inside the two-minute no-fee period.
 if(ride.status==='arrived'&&Number.isSafeInteger(ride.arrivedAt)&&
   ride.arrivedAt>=ride.acceptedAt&&ride.arrivedAt<=now)
   return {feeCents:CANCELLATION_FEE_CENTS,reason:'server_verified_arrival'};
 if(ride.status!=='accepted')return zero('not_accepted');
 const baseline=ride.pickupProgressStart || {};
 const start=coordinate(baseline.lat,baseline.lng);
 const here=coordinate(operator?.lat,operator?.lng);
 const pickup=coordinate(ride.pickupLat,ride.pickupLng);
 const previousAt=Number(baseline.positionAt),latestAt=Number(operator?.onlineAt);
 if(!start||!here||!pickup||String(operator?.currentRideId||'')!==String(rideId))
   return zero('missing_or_wrong_operator_location');
 if(!Number.isSafeInteger(previousAt)||!Number.isSafeInteger(latestAt)||
   previousAt>ride.acceptedAt||previousAt<ride.acceptedAt-MAX_ACCEPTANCE_POSITION_AGE_MS||
   latestAt<=ride.acceptedAt||latestAt<=previousAt+MIN_OBSERVATION_GAP_MS||
   latestAt>now||latestAt<now-MAX_POSITION_AGE_MS)
   return zero('position_expired_or_insufficient');
 const startDistance=distanceMiles(start,pickup);
 const remainingDistance=distanceMiles(here,pickup);
 const displacement=distanceMiles(start,here);
 const progress=startDistance-remainingDistance;
 const seconds=(latestAt-previousAt)/1000;
 const speed=displacement/(seconds/3600);
 if(![startDistance,remainingDistance,displacement,progress,speed].every(Number.isFinite))
   return zero('invalid_geometry');
 if(speed>MAX_PLAUSIBLE_MPH)return zero('implausible_speed');
 if(progress<MIN_CLOSING_MI||
    progress/startDistance<MIN_CLOSING_FRACTION||
    progress/Math.max(displacement,0.00001)<MIN_DIRECTION_RATIO)
   return zero('insufficient_verified_progress');
 return {
   feeCents:CANCELLATION_FEE_CENTS,reason:'verified_enroute_progress',
   // Store compact evidence in the already-required cancellation record, not
   // an extra history series or recurring location writes.
   evidence:{
     fromAt:previousAt,toAt:latestAt,
     originalMiles:+startDistance.toFixed(2),
     remainingMiles:+remainingDistance.toFixed(2),
     closingMiles:+progress.toFixed(2),
     directionalRatio:+(progress/displacement).toFixed(2),
   },
 };
}
module.exports={acceptanceEvidence,cancellationProgress,FREE_WINDOW_MS,CANCELLATION_FEE_CENTS};
