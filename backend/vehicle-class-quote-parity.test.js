'use strict';
const assert = require('node:assert/strict');
const { TRAVEL_CLASSES, normalizeTravelClassKey, applyTravelClass } = require('./fares');
const { priceRoute } = require('./fareauthority');
const { verifiedOperatorClasses } = require('./vehicle-class-verification');
const { matchOperator } = require('./matching');
const { DISCLOSURE_VERSION } = require('./disclosure');
const pickup = { lat: 25.75, lng: -80.26 }, dest = { lat:25.80, lng:-80.20 };
const route = { distanceMeters: 10_000, durationSec: 1200, provider: 'synthetic' };
const now = 2_000_000_000_000;
function run() {
  for(const [key, cls] of Object.entries(TRAVEL_CLASSES)) {
    assert.equal(normalizeTravelClassKey(cls.label), key);
    assert.equal(normalizeTravelClassKey(key.toUpperCase()), key);
    assert.equal(applyTravelClass(2345,key),applyTravelClass(2345,cls.label),
      `quote/prepare Fare differs for ${cls.label}`);
    const quote=priceRoute({pickup,dest,travelClass:key},route);
    const prepare=priceRoute({pickup,dest,travelClass:cls.label},route);
    assert.equal(quote.travelCostCents,prepare.travelCostCents,
      `pre-payment repricing falsely rejects ${cls.label}`);
  }
  assert.equal(applyTravelClass(2000,'UNKNOWN'),applyTravelClass(2000,'standard'));
  assert.equal(applyTravelClass(2000,'Large Vehicle'),3100);
  assert.equal(applyTravelClass(2000,'Pet Friendly'),2300);
  const op={ id:'synthetic', lat:pickup.lat, lng:pickup.lng, available:true,
    onlineAt:now, commissioned:true, disclosureVersion:DISCLOSURE_VERSION,
    screeningCheckedAt:now, insuranceExpiry:'2099-01-01',
    classes:['Standard','Large Vehicle','Pet Friendly'], car:'Verified car', plate:'TEST123' };
  assert.equal(matchOperator([op],pickup,'Large Vehicle',{now}),null,
    'old/client-entered classes alone must not qualify a six-passenger car');
  assert.equal(matchOperator([op],pickup,'Pet Friendly',{now}),null,
    'Pet Friendly must not be a self-asserted flag');
  assert.ok(matchOperator([op],pickup,'Standard',{now}),
    'ordinary eligible Standard Operators remain dispatchable');
  const good = { status:'approved', reviewedBy:'authorized-reviewer',
    verifiedAt:now-1234,car:'Verified car',plate:'TEST-123',
    classes:['Large Vehicle','Pet Friendly'] };
  assert.deepEqual(verifiedOperatorClasses({vehicleClassApproval:good},op),
    ['Standard','Large Vehicle','Pet Friendly']);
  assert.deepEqual(verifiedOperatorClasses({vehicleClassApproval:good},{...op,plate:'CHANGED'}),
    ['Standard'],'changing vehicles invalidates specialized approval');
  assert.deepEqual(verifiedOperatorClasses({vehicleClassApproval:{...good,reviewedBy:''}},op),
    ['Standard'],'no approved reviewer means no certification');
  const verified={...op,verifiedVehicleClasses:verifiedOperatorClasses({vehicleClassApproval:good},op)};
  assert.ok(matchOperator([verified],pickup,'Large Vehicle',{now}));
  assert.ok(matchOperator([verified],pickup,'Pet Friendly',{now}));
  assert.equal(matchOperator([verified],pickup,'Premium',{now}),null);
  assert.equal(matchOperator([verified],pickup,'Accessible',{now}),null);
}
run();run();
console.log('PASS twice: all quote/prepare class names align; unverified six-seat and pet offers remain denied.');
