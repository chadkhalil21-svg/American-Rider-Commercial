'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { marketFor, servesPoint } = require('./markets');
const read = (name) => fs.readFileSync(path.join(__dirname,name),'utf8');

for(const [label,point] of [
  ['Miami-Dade',{lat:25.775,lng:-80.191}],
  ['Broward',{lat:26.1224,lng:-80.1373}],
  ['Palm Beach',{lat:26.7153,lng:-80.0534}],
]) {
  const m=marketFor(point);
  assert.equal(m?.status,'active',label+' is geographically active');
  assert.equal(servesPoint(point),true,label+' serves pickups');
}
assert.equal(servesPoint({lat:28.5383,lng:-81.3792}),false,
  'unconfigured origin stays outside the service area');

const booking=read('booking.js'),server=read('server.js'),fleet=read('market-fleet.js');
assert.doesNotMatch(booking,/market_admission|readinessFor|regionAdmissionProblems/,
  'paid Travel cannot depend on extra county approval');
assert.doesNotMatch(server,/market_admission|requireAdmittedPickup|admittedMarket\(/,
  'booking, dispatch and onboarding must not depend on county approval');
assert.match(server,/requireServedPickup/);
assert.match(server,/requireServedTravel/);
assert.match(server,/requireOperationalReadiness/);
assert.match(server,/qualificationChecks\(/);
assert.match(server,/coverageUnsafeForNewTravel|coverageLapsed|insuranceExpiry/,
  'individual Operator coverage must remain enforced');
assert.match(server,/screeningCurrent|screeningCheckedAt/,
  'individual screening must remain enforced');
assert.match(booking,/paymentMatches\(/,
  'payment ownership and amount are still verified');
assert.match(fleet,/async function setGeographicFleetOnline\(/);
const geoDuty=fleet.split('async function setGeographicFleetOnline(')[1]
  ?.split('async function setFleetOnlineIfOpen(')[0] || '';
assert.doesNotMatch(geoDuty,/market_admission|readinessFor/);
assert.match(geoDuty,/stripeCheckedAt/,'a newer signed payout restriction still wins');
assert.match(geoDuty,/account_closures/,'closing accounts cannot return to duty');
assert.doesNotMatch(server,/sweepPausedMarketFleet\(/,
  'historic county review cannot offline eligible Operators');
console.log('PASS configured geography alone controls county availability, with individual and payment safeguards');
