'use strict';
const assert = require('node:assert/strict');
const {acceptanceEvidence,cancellationProgress} = require('./pickup-progress-fee');
const acceptedAt=2_000_000_000_000;
const pickup={lat:25.80,lng:-80.19};
const rideId='travel_one';
function seed(over={}){
 const base={lat:25.78,lng:-80.19,onlineAt:acceptedAt-10000,currentRideId:rideId};
 const start=acceptanceEvidence({operator:base,rideId,pickup,at:acceptedAt});
 assert(start && start.startDistanceMi>1.2);
 return {ride:{acceptedAt,status:'accepted',pickupLat:pickup.lat,pickupLng:pickup.lng,operatorEtaMin:8,
   pickupProgressStart:start,...(over.ride||{})},
   op:{...base,lat:25.786,onlineAt:acceptedAt+130000,...(over.op||{})},
   now:acceptedAt+150000,rideId};
}
const evaluate=(changes={})=>cancellationProgress(seed(changes));
const qualified=evaluate();
assert.equal(qualified.feeCents,300);
assert.equal(qualified.reason,'verified_enroute_progress');
assert(qualified.evidence.closingMiles>=0.3);
assert(qualified.evidence.directionalRatio>=0.55);
assert.equal(cancellationProgress({...seed(),now:acceptedAt+119999}).feeCents,0,'free within 2 minutes');
assert.equal(cancellationProgress({...seed(),now:acceptedAt+120000}).feeCents,300,'boundary at 2 minutes');
assert.equal(evaluate({op:{lat:25.78}}).feeCents,0,'no movement means no charge');
assert.equal(evaluate({op:{lat:25.7805}}).feeCents,0,'GPS jitter is not progress');
assert.equal(evaluate({op:{lat:25.77}}).feeCents,0,'moving away never earns a fee');
assert.equal(evaluate({op:{lat:25.782,lng:-80.16}}).feeCents,0,'large detour toward side is not directional progress');
assert.equal(evaluate({op:{currentRideId:'another'}}).feeCents,0,'no fee for another assigned Travel');
assert.equal(evaluate({op:{onlineAt:acceptedAt-50000}}).feeCents,0,'old GPS is not proof');
assert.equal(evaluate({op:{onlineAt:acceptedAt+149999}}).feeCents,0,'speed impossible in one second');
assert.equal(evaluate({op:{onlineAt:acceptedAt+90000}}).feeCents,0,'GPS older than two minutes must fail closed');
assert.equal(cancellationProgress({...seed(),now:acceptedAt+400000,operator:seed().op}).feeCents,0,'stale at cancellation');
assert.equal(evaluate({ride:{pickupProgressStart:null}}).feeCents,0,'legacy acceptance missing baseline');
assert.equal(evaluate({ride:{acceptedAt:null}}).feeCents,0,'unverified acceptance is free');
assert.equal(evaluate({ride:{operatorAtFault:true}}).feeCents,0);
assert.equal(evaluate({ride:{status:'onboard'}}).feeCents,0,'already onboard is never cancellation');
assert.equal(evaluate({ride:{operatorEtaMin:1}}).feeCents,0,'late Operator waiver');
assert.equal(evaluate({ride:{status:'arrived',arrivedAt:acceptedAt+70000}}).feeCents,300,'server arrival after free grace');
assert.equal(cancellationProgress({...seed({ride:{status:'arrived',arrivedAt:acceptedAt+70000}}),
  now:acceptedAt+100000}).feeCents,0,'arrival during free period still free');
const missing=acceptanceEvidence({operator:{currentRideId:rideId,lat:null,lng:null,onlineAt:acceptedAt},rideId,pickup,at:acceptedAt});
assert.equal(missing,null);
assert.equal(acceptanceEvidence({operator:{currentRideId:'another',lat:25.78,lng:-80.19,onlineAt:acceptedAt},rideId,pickup,at:acceptedAt}),null);
assert.equal(acceptanceEvidence({operator:{currentRideId:rideId,lat:25.78,lng:-80.19,onlineAt:acceptedAt-300000},rideId,pickup,at:acceptedAt}),null);
assert.equal(evaluate({op:{lat:Infinity}}).feeCents,0);
assert.equal(evaluate({ride:{pickupLat:999}}).feeCents,0);
console.log('PASS: automatic pickup progress evidence with no added location queries, grace, GPS freshness, movement, route direction, speed and safety exceptions');
