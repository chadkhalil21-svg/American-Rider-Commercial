'use strict';
// Transparent WHAT-IF capacity calculation for Firebase Spark. Do not mistake
// this for real billed reads, real Operator cadence or production throughput.
// Source: https://firebase.google.com/docs/firestore/pricing.
const DEFAULTS = Object.freeze({reads:50000,writes:20000});
function sparkEnvelope({
  operators=0, hoursPerOperator=8, renewalSeconds=90,
  readsPerRenewal=5, writesPerRenewal=1,
  readsPerTravel=100, writesPerTravel=40,
  idleReads=0, idleWrites=0,
}={}) {
  const fields=[operators,hoursPerOperator,renewalSeconds,readsPerRenewal,writesPerRenewal,
    readsPerTravel,writesPerTravel,idleReads,idleWrites];
  if (fields.some(x=>!Number.isFinite(x)||x<0)||renewalSeconds===0||
      readsPerTravel===0||writesPerTravel===0) throw Error('Invalid nonnegative workload assumptions');
  const renewals = Math.ceil(hoursPerOperator*3600/renewalSeconds)*operators;
  const readBase=idleReads+renewals*readsPerRenewal;
  const writeBase=idleWrites+renewals*writesPerRenewal;
  const readHeadroom=Math.max(0,DEFAULTS.reads-readBase);
  const writeHeadroom=Math.max(0,DEFAULTS.writes-writeBase);
  return Object.freeze({
    operatorRenewals:renewals,
    baselineReads:readBase,
    baselineWrites:writeBase,
    baseExceedsSpark:readBase>DEFAULTS.reads||writeBase>DEFAULTS.writes,
    // The completed-Travels envelope has no authoritative bound until measured.
    hypotheticalTravels:Math.floor(Math.min(readHeadroom/readsPerTravel,writeHeadroom/writesPerTravel)),
    limitingDimension:readHeadroom/readsPerTravel<=writeHeadroom/writesPerTravel?'reads':'writes',
  });
}
module.exports={sparkEnvelope,SPARK_LIMITS:DEFAULTS};
