'use strict';
// Simultaneous activity is distinct from daily registered accounts. These
// envelopes are BASELINE document operations only, not actual throughput.
const assert=require('node:assert/strict');
const {estimate}=require('./duty-capacity-boundary');
for(const n of [100,300,500]){
  const before=estimate({operatorsOnDuty:0,travelsPerDay:n,travelMinutes:60,
    subscribedScreens:2,dispatchQueriesPerTravel:0,gpsPublicationSeconds:15});
  const after=estimate({operatorsOnDuty:0,travelsPerDay:n,travelMinutes:60,
    subscribedScreens:2,dispatchQueriesPerTravel:0,gpsPublicationSeconds:30});
  assert.equal(before.gpsWrites,240*n);
  assert.equal(after.gpsWrites,120*n);
  assert.equal(after.gpsListenerReads,240*n);
  const monitoringReadsMinimum=60*n; // One monitored ride read each minute
  // When a moving vehicle changes its server anchor, monitor.js can write its
  // monitorSeen checkpoint once per sweep. That also updates the same ride doc
  // and can trigger a read in each live Travel listener.
  const monitoringAnchorWritesUpperModel=60*n;
  const afterAllLocationWritesUpperModel=after.gpsWrites+monitoringAnchorWritesUpperModel;
  const afterTwoListenerReadsUpperModel=2*afterAllLocationWritesUpperModel;
  assert.equal(monitoringReadsMinimum,60*n);
  assert.equal(afterAllLocationWritesUpperModel,180*n);
  assert.equal(afterTwoListenerReadsUpperModel,360*n);
  assert.equal(before.gpsWrites,after.gpsWrites*2);
  assert.equal(after.gpsWritesPerTravel,120);
  console.log('MODEL '+n+' simultaneous 60min Travels: GPS writes '+before.gpsWrites+
    ' before / '+after.gpsWrites+' after; two listener reads '+after.gpsListenerReads+
    '; additional safety-monitor baseline '+monitoringReadsMinimum+' reads');
}
console.log('PASS concurrent operation envelopes; NO Render throughput or billing capacity certified');