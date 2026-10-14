'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { readinessForRoute } = require('./booking-readiness');
const unrelated = ['screening_provider','toll_provider','scheduler_token',
  'market_reference_store','ops_auth'];
const bookingRoutes = ['/fare-quote','/smart-quote','/smart-revalidate',
  '/travel/prepare','/create-payment-intent','/travel/dispatch','/travel/accept',
  '/charge-ride','/operator/online','/travel/progress'];
for (let pass = 1; pass <= 2; pass++) {
  for (const route of bookingRoutes) {
    const result = readinessForRoute({path:route,missing:unrelated,production:true});
    assert.equal(result.ready,true,route+' cannot require unrelated platform approvals');
    assert.deepEqual(result.missing,[]);
  }
  assert.deepEqual(readinessForRoute({path:'/travel/schedule',
    missing:unrelated,production:true}).missing,['scheduler_token'],
    'scheduled travel needs a functioning dispatch scheduler');
  for (const route of ['/create-payment-intent','/travel/prepare','/travel/dispatch']) {
    assert.equal(readinessForRoute({path:route,
      missing:['stripe_live_key'],production:true}).ready,false,
      route+' cannot charge without the real payment service');
    assert.equal(readinessForRoute({path:route,
      missing:['stripe_webhook_secret'],production:true}).ready,false,
      route+' requires secure payment confirmation');
  }
  assert.equal(readinessForRoute({path:'/fare-quote',
    missing:['stripe_live_key'],production:true}).ready,true,
    'a traveler can see a fare when the payment provider is down');
  assert.equal(readinessForRoute({path:'/travel/progress',
    missing:['stripe_live_key'],production:true}).ready,true,
    'an ongoing Travel must not be frozen by an unrelated payment outage');
  assert.equal(readinessForRoute({path:'/operator/online',
    missing:['stripe_live_key'],production:true}).ready,false,
    'on-duty eligibility still needs its authenticated payout service');
  assert.equal(readinessForRoute({path:'/create-payment-intent',
    missing:['firebase_admin'],production:true}).ready,false,
    'payment never proceeds without durable account and booking records');
  assert.equal(readinessForRoute({path:'/create-payment-intent',
    missing:['stripe_live_key'],production:false}).ready,true,
    'development mode remains independent of production configuration');
}
const server=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
assert.match(server,/readinessForRoute\(\{ path: req\.path/, 'middleware checks each route');
assert.match(server,/canTakePayment: readiness\.ready/, 'app payment switch shares checkout readiness');
assert.match(server,/requireServedPickup/, 'geography remains the county service authority');
assert.match(server,/screeningCurrent\(/, 'individual screening remains in Operator duty');
assert.match(server,/coverageUnsafeForNewTravel|coverageLapsed/, 'insurance status is checked separately');
console.log('PASS twice: no county or unrelated-service booking veto; individual and payment checks remain');
