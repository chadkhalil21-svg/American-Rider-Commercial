'use strict';
// Source-based cost sensitivity, NOT a measured Firebase/Render capacity certification.
// Future financial decisions must replace the assumptions with invoice + Query Explain.
const FREE_READS=50000,FREE_WRITES=20000;
function estimate({
  operatorsOnDuty=0,hoursOnDuty=8,travelsPerDay=0,travelMinutes=25,
  subscribedScreens=2,renewalReads=7,renewalWrites=1,
  renewedEverySeconds=90,dispatchQueriesPerTravel=2,
  dispatchReadsPerQuery=36,gpsPublicationSeconds=30,
}) {
  for(const [k,v] of Object.entries({operatorsOnDuty,hoursOnDuty,travelsPerDay,travelMinutes,
    subscribedScreens,renewalReads,renewalWrites,renewedEverySeconds,
    dispatchQueriesPerTravel,dispatchReadsPerQuery,gpsPublicationSeconds})){
    if(!Number.isFinite(v)||v<0)throw new RangeError(k+' must be nonnegative and finite');
  }
  if(!(renewedEverySeconds>0&&gpsPublicationSeconds>0))throw new RangeError('intervals');
  const renewals=Math.ceil(hoursOnDuty*3600/renewedEverySeconds)*operatorsOnDuty;
  const gpsWritesPerTravel=Math.ceil(travelMinutes*60/gpsPublicationSeconds);
  const dutyReads=renewals*renewalReads,dutyWrites=renewals*renewalWrites;
  const gpsWrites=travelsPerDay*gpsWritesPerTravel;
  const gpsListenerReads=gpsWrites*subscribedScreens;
  const candidateReads=travelsPerDay*dispatchQueriesPerTravel*dispatchReadsPerQuery;
  const knownLowerBoundReads=dutyReads+gpsListenerReads+candidateReads;
  const knownLowerBoundWrites=dutyWrites+gpsWrites;
  return Object.freeze({renewals,dutyReads,dutyWrites,gpsWritesPerTravel,gpsWrites,
    gpsListenerReads,candidateReads,knownLowerBoundReads,knownLowerBoundWrites,
    withinSparkReadAllowance:knownLowerBoundReads<=FREE_READS,
    withinSparkWriteAllowance:knownLowerBoundWrites<=FREE_WRITES,
    excluded:'Other Firestore operations, index-entry billing, offline reconnects, other clients, '+
      'monitoring, routing, Stripe, cancellations, payment and server concurrency.',
    confidence:'illustrative source-based sensitivity only, not measured billing or launch capacity',
  });
}
module.exports={estimate,FREE_READS,FREE_WRITES};