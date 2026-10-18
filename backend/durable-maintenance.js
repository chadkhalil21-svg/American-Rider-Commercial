'use strict';
// Cloud Run may replace its instance between ticks. The cadence of optional
// maintenance MUST be shared, not just held in a process-local Map.
// Main safety/booking/settlement/recovery tasks are NOT throttled here.
const {PERIOD_MS}=require('./sweepcadence');
const COLLECTION='system_maintenance_cadence';
async function durableMaintenance({db,name,work,now=Date.now()}){
  const period=PERIOD_MS[name];
  if(!db || typeof db.runTransaction!=='function')
    throw new Error('Database unavailable for durable maintenance');
  if(!Number.isSafeInteger(now)||!Number.isFinite(period)||period<60_000
    ||typeof work!=='function') throw new Error('Invalid durable maintenance task');
  const ref=db.collection(COLLECTION).doc(name);
  const result=await db.runTransaction(async tx=>{
    const snap=await tx.get(ref);
    const previous=Number(snap.exists?snap.data()?.lastClaimedAt:0);
    if(Number.isFinite(previous)&&previous>0&&now>=previous&&now-previous<period)
      return {due:false,nextDueAt:previous+period};
    tx.set(ref,{lastClaimedAt:now},{merge:true});
    return {due:true};
  });
  if(!result.due)return {ok:true,skipped:'cadence',nextDueAt:result.nextDueAt};
  return work();
}
module.exports={durableMaintenance,COLLECTION};
