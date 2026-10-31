'use strict';
// Bounded, independent recovery attempts for safety/money-critical work.
// When Firestore is unavailable even the shared lease fails, and no task runs.
// If it recovers, resume critical queues first and defer discretionary work.
const NAMES=Object.freeze([
 'scheduled','monitor','pushReceipts','assignments','screening','settlements','bookingRecovery',
 'providerEvents','operatorFees','operatorFeeEvidence','operatorMonthlyFeeEvidence',
 'familyAgeOut','insuranceMonitoring',
 'marketReference','marketFleet','accountDeletion',
]);
const OPTIONAL=Object.freeze(['pushReceipts','operatorFees','operatorFeeEvidence',
 'operatorMonthlyFeeEvidence','marketReference','marketFleet','accountDeletion']);
const OPTIONAL_SET=new Set(OPTIONAL);
async function settleSweepJobs(jobs,{criticalOnly=false}={}){
 if(!jobs||typeof jobs!=='object')throw new TypeError('jobs required');
 const outcomes=await Promise.allSettled(NAMES.map(name=>{
   if(criticalOnly&&OPTIONAL_SET.has(name))
     return Promise.resolve({ok:true,skipped:'optional_paused_during_quota_recovery'});
   const work=jobs[name];
   if(typeof work!=='function')throw new TypeError('missing '+name);
   return Promise.resolve().then(work);
 }));
 return Object.fromEntries(NAMES.map((name,i)=>[name,
   outcomes[i].status==='fulfilled'?outcomes[i].value:{ok:false,reason:String(outcomes[i].reason)},
 ]));
}
function createCriticalRecoveryGate({intervalMs=60_000}={}){
 if(!Number.isSafeInteger(intervalMs)||intervalMs<60_000||intervalMs>5*60_000)
   throw new RangeError('invalid recovery interval');
 let last=null;
 return {
   mode({blocked=false,now=Date.now()}={}){
     if(!Number.isFinite(now))throw new TypeError('invalid time');
     if(!blocked){last=null;return 'normal';}
     if(last!==null&&now>=last&&now-last<intervalMs)return 'wait';
     last=now;
     return 'critical';
   },
 };
}
module.exports={NAMES,OPTIONAL,settleSweepJobs,createCriticalRecoveryGate};
