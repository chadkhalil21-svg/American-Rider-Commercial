'use strict';
const assert=require('node:assert/strict');
const {estimate}=require('./duty-capacity-boundary');
const before=estimate({operatorsOnDuty:20,travelsPerDay:100,gpsPublicationSeconds:15,
 dispatchReadsPerQuery:2880});
const after=estimate({operatorsOnDuty:20,travelsPerDay:100,gpsPublicationSeconds:30,
 dispatchReadsPerQuery:2160});
assert.equal(before.renewals,6400);
assert.equal(before.dutyReads,44800);
assert.equal(after.dutyReads,44800,'GPS optimization does not reduce duty eligibility reads');
assert.equal(before.gpsWritesPerTravel,100);
assert.equal(after.gpsWritesPerTravel,50);
assert.equal(before.gpsListenerReads,20000);
assert.equal(after.gpsListenerReads,10000);
assert.equal(before.candidateReads-after.candidateReads,144000,'100 saturations save 1440 reads each');
assert.equal(estimate({operatorsOnDuty:50,travelsPerDay:0}).dutyReads,112000);
assert.equal(estimate({operatorsOnDuty:50,travelsPerDay:0}).withinSparkReadAllowance,false);
assert.equal(estimate({operatorsOnDuty:0,travelsPerDay:1,travelMinutes:60,gpsPublicationSeconds:15}).gpsWritesPerTravel,240);
assert.equal(estimate({operatorsOnDuty:0,travelsPerDay:1,travelMinutes:60,gpsPublicationSeconds:30}).gpsWritesPerTravel,120);
assert.match(after.excluded,/index-entry/);
assert.match(after.confidence,/not measured/);
console.log('PASS duty + dispatch + GPS model; scenarios are sensitivity bounds, not capacity guarantees');
