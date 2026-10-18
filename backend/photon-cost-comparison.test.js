'use strict';
const assert=require('node:assert/strict');
const {estimate,report}=require('../scripts/photon-cost-comparison.cjs');

const baseline=estimate({});
assert.ok(baseline.vm>48&&baseline.vm<50,'us-east1 published e2 standard 2 compute');
assert.ok(baseline.disk>14&&baseline.disk<16,'150 GiB balanced persistent disk');
assert.ok(baseline.total>63&&baseline.total<66);
assert.equal(baseline.hereCost,null,'never invent an account-specific HERE rate');
assert.equal(baseline.bestKnown,'unverified','cannot claim Photon saves money without HERE invoice');
assert.equal(baseline.perTravel,null);
assert.match(report(baseline),/UNKNOWN/);
assert.match(report(baseline),/bandwidth\/egress/);
const modest=estimate({COMPLETED_TRAVELS_MONTH:'1000',SEARCH_REQUESTS_PER_TRAVEL:'5'});
assert.equal(modest.searches,5000);
assert.ok(modest.perTravel>.06 && modest.perTravel<.07);
assert.equal(modest.budget,250,'25-cent operating provision shared among ALL infra');
const high=estimate({COMPLETED_TRAVELS_MONTH:'100000',SEARCH_REQUESTS_PER_TRAVEL:'5',
  NONBOOKING_SEARCH_REQUESTS_MONTH:'100000'});
assert.equal(high.searches,600000,'include travelers who search but do not book');
assert.ok(high.impliedPhotonPer1000<0.12);
const costlierHere=estimate({COMPLETED_TRAVELS_MONTH:'100000',
  HERE_AUTOSUGGEST_USD_PER_1000:'1',SEARCH_REQUESTS_PER_TRAVEL:'5'});
assert.equal(costlierHere.bestKnown,'photon');
assert.equal(costlierHere.hereCost,500);
const freeHere=estimate({COMPLETED_TRAVELS_MONTH:'100000',
  HERE_AUTOSUGGEST_USD_PER_1000:'1',HERE_FREE_MONTHLY_REQUESTS:'600000'});
assert.equal(freeHere.bestKnown,'here','do not add paid VM when verified free HERE suffices');
assert.equal(freeHere.hereCost,0);
const smallerTraffic=estimate({COMPLETED_TRAVELS_MONTH:'1000',
  HERE_AUTOSUGGEST_USD_PER_1000:'1'});
assert.equal(smallerTraffic.bestKnown,'here','small volumes can favor existing HERE account');
const paused=estimate({PHOTON_RUNNING_HOURS_PER_MONTH:'0'});
assert.equal(paused.vm,0);
assert.ok(paused.disk>14,'storage billed even if VM stopped');
assert.throws(()=>estimate({PHOTON_RUNNING_HOURS_PER_MONTH:'748'}),/cannot exceed/);
assert.throws(()=>estimate({COMPLETED_TRAVELS_MONTH:'NaN'}),/nonnegative/);
assert.throws(()=>estimate({COMPLETED_TRAVELS_MONTH:'-1'}),/nonnegative/);
assert.throws(()=>estimate({NONBOOKING_SEARCH_REQUESTS_MONTH:'0.5'}),/integer/);
console.log('PASS: true Photon fixed costs and unknown HERE contract, monthly break-even, no invented free service');
