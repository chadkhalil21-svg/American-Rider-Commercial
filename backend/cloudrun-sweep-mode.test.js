'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {externalSweepMode}=require('./cloudrun-sweep-mode');
const server=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
const admin=fs.readFileSync(path.join(__dirname,'firebase-admin.js'),'utf8');
for(let pass=0;pass<2;pass++){
  assert.equal(externalSweepMode({}),false,'on regular Render, keep the in-process minute clock');
  assert.equal(externalSweepMode({K_SERVICE:'ar-test',AR_EXTERNAL_SCHEDULER:'1',SCHEDULER_TOKEN:'dummy-test-secret'}),true);
  assert.equal(externalSweepMode({AR_EXTERNAL_SCHEDULER:'1',SCHEDULER_TOKEN:'dummy-test-secret'}),true);
  assert.throws(()=>externalSweepMode({K_SERVICE:'ar-test'}),/requires AR_EXTERNAL_SCHEDULER/);
  assert.throws(()=>externalSweepMode({K_SERVICE:'ar-test',AR_EXTERNAL_SCHEDULER:'1'}),/requires SCHEDULER_TOKEN/);
  assert.throws(()=>externalSweepMode({AR_EXTERNAL_SCHEDULER:'1'}),/requires SCHEDULER_TOKEN/);
  const privateCandidate={K_SERVICE:'american-rider-api-production-candidate',
    AR_PRIVATE_CANDIDATE_NO_SCHEDULER:'1',DEPLOYMENT_MODE:'test',AR_EXTERNAL_SCHEDULER:'1'};
  assert.equal(externalSweepMode(privateCandidate),true,
    'exact no-money private candidate can start without a scheduler token');
  assert.throws(()=>externalSweepMode({...privateCandidate,K_SERVICE:'american-rider-api-live'}),/requires SCHEDULER_TOKEN/);
  assert.throws(()=>externalSweepMode({...privateCandidate,DEPLOYMENT_MODE:'production'}),/requires SCHEDULER_TOKEN/);
  assert.throws(()=>externalSweepMode({...privateCandidate,STRIPE_SECRET_KEY:'sk_live_dummy'}),/requires SCHEDULER_TOKEN/);
  assert.throws(()=>externalSweepMode({...privateCandidate,STRIPE_SECRET_KEY:'sk_test_dummy'}),/requires SCHEDULER_TOKEN/);
  assert.throws(()=>externalSweepMode({...privateCandidate,AR_PRIVATE_CANDIDATE_NO_SCHEDULER:'0'}),/requires SCHEDULER_TOKEN/);
  assert.match(server,/if \(!want \|\| got !== want\)/,
    'without any token, /scheduled/sweep must reject every request');

  assert.match(server,/const EXTERNAL_SWEEPS = externalSweepMode\(\)/,
    'execution mode checked before HTTP startup');
  assert.match(server,/if \(EXTERNAL_SWEEPS\) \{[\s\S]{0,180}return;/,
    'Cloud Run must not silently activate duplicate in-process timers');
  assert.match(server,/runLeasedSweeps\(\)/,'external trigger must retain the Firestore lease');
  assert.match(server,/const want = readKey\('SCHEDULER_TOKEN'\)/,'external trigger is authenticated');
  assert.match(server,/const got = process\.env\.K_SERVICE[\s\S]{0,90}req\.get\('x-scheduler-token'\)/,
    'Cloud Run accepts scheduler secret only in a protected header, never URL query');
  assert.match(admin,/else if \(process\.env\.K_SERVICE\)/,'Cloud Run uses instance identity');
  assert.match(admin,/credential: appMod\.applicationDefault\(\)/,'no exported private Firebase key required');
  assert.match(server,/app\.get\('\/live', \(req, res\) => res\.json\(\{ ok: true, service: 'american-rider-server' \}\)\)/,
    'Cloud Run-safe liveness endpoint must be cheap and synchronous');
  assert.match(server,/app\.get\('\/healthz', \(req, res\) => res\.json\(\{ ok: true, service: 'american-rider-server' \}\)\)/,
    'Render existing liveness route remains compatible');
}
console.log('PASS twice: Cloud Run timer fail-closed, authenticated leased scheduler and Google-native Firebase identity');
