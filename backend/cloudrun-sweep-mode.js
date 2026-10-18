'use strict';
// Cloud Run request-based instances can sleep or multiply. Never entrust
// time-critical Travel, screening, settlements or emergency sweeps to an
// in-process setInterval there. An authenticated once-per-minute external
// scheduler must invoke /scheduled/sweep and the existing Firestore lease
// permits only one worker to execute each tick.
// Deploy Cloud Run ONLY AFTER configuring a separate, verified scheduler.
function externalSweepMode(env=process.env){
  const cloudRun=!!String(env.K_SERVICE||'').trim();
  const external=env.AR_EXTERNAL_SCHEDULER==='1';
  if(cloudRun && !external)
    throw new Error('Cloud Run requires AR_EXTERNAL_SCHEDULER=1 and a commissioned Cloud Scheduler job');
  if(external && !String(env.SCHEDULER_TOKEN||'').trim())
    throw new Error('An external scheduler requires SCHEDULER_TOKEN');
  return external;
}
module.exports={externalSweepMode};
