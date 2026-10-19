'use strict';
// Cloud Run instances can sleep or multiply; production requires an external,
// authenticated minute scheduler and the existing cross-instance lease.
// Exception: the exact isolated PRIVATE production PROJECT candidate can start
// with NO scheduler credentials, but only in test mode, without any Stripe key.
// This candidate cannot invoke /scheduled/sweep: the route returns HTTP 401
// whenever SCHEDULER_TOKEN is absent. It is NOT production-ready.
function isolatedPrivateCandidate(env=process.env) {
  return env.K_SERVICE === 'american-rider-api-production-candidate'
    && env.AR_PRIVATE_CANDIDATE_NO_SCHEDULER === '1'
    && env.DEPLOYMENT_MODE === 'test'
    && env.AR_EXTERNAL_SCHEDULER === '1'
    && !String(env.SCHEDULER_TOKEN || '').trim()
    && !String(env.STRIPE_SECRET_KEY || '').trim();
}
function externalSweepMode(env=process.env){
  const cloudRun=!!String(env.K_SERVICE||'').trim();
  const external=env.AR_EXTERNAL_SCHEDULER==='1';
  if(cloudRun && !external)
    throw new Error('Cloud Run requires AR_EXTERNAL_SCHEDULER=1 and a commissioned Cloud Scheduler job');
  if(external && !String(env.SCHEDULER_TOKEN||'').trim() && !isolatedPrivateCandidate(env))
    throw new Error('An external scheduler requires SCHEDULER_TOKEN');
  return external;
}
module.exports={externalSweepMode,isolatedPrivateCandidate};
