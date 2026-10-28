'use strict';
// Cheap deterministic tests of native QA stage reporting, no devices,
// credentials, Firebase, payments, or real Travel IDs.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const cp=require('node:child_process');
const dir=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'ar-native-stage-')),'native-commercial-android');
fs.mkdirSync(dir);
const report=path.join(__dirname,'native-qa-stage-report.cjs');
const write=(name,txt)=>fs.writeFileSync(path.join(dir,name),txt);
const snap=(status,acceptedAt)=>'LOCAL QA TWO-DEVICE FAILURE SNAPSHOT\n'+
  JSON.stringify({rides:[{id:'isolated-qa-only',travelerUid:'native-qa-traveler',
    operatorId:'native-qa-operator',status,acceptedAt,paymentIntentPresent:true,
    transferPresent:status==='completed'}]});
function run(){
  const p=cp.spawnSync(process.execPath,[report,dir],{encoding:'utf8'});
  assert.equal(p.status,0,p.stderr||p.stdout);
  return JSON.parse(fs.readFileSync(path.join(dir,'stage-report.json'),'utf8'));
}
const stage=(r,id)=>r.stages.find(x=>x.stage===id)?.confirmed;
try{
  // Maestro can say "tap COMPLETED" even if the server remained assigned.
  write('operator.log',
    'Assert that id: operator-accept-traveler is visible... COMPLETED\n'+
    'Tap on id: operator-accept-traveler... COMPLETED\n'+
    'Assert that id: operator-confirm-arrival is visible... FAILED\n');
  write('traveler.log',
    'Assert that id: traveler-quote-ready is visible... COMPLETED\n'+
    'Assert that "Awaiting Operator confirmation" is visible... COMPLETED\n');
  write('failure-local-dispatch.json',snap('assigned',null));
  let r=run();
  assert.equal(stage(r,'travel_assigned_server'),true);
  assert.equal(stage(r,'operator_acceptance_server'),false,
    'UI tap cannot certify actual acceptance');
  assert.equal(stage(r,'stripe_test_captured_and_transferred'),false);
  assert.equal(r.providerCertified,false);
  // A backend accepted state alone does not certify TEST payout.
  write('failure-local-dispatch.json',snap('accepted','2026-10-28T15:00:00Z'));
  r=run();
  assert.equal(stage(r,'operator_acceptance_server'),true);
  assert.equal(r.providerCertified,false);
  // Final provider milestone requires the independent reconciliation log.
  write('failure-local-dispatch.json',snap('completed','2026-10-28T15:00:00Z'));
  write('reconciliation.log',
    'PASS: one mobile-booked, native-Operator-completed, Stripe TEST captured and transferred Travel\n');
  r=run();
  assert.equal(stage(r,'operator_completion_server'),true);
  assert.equal(r.providerCertified,true);
  // Reconciliation text without local completion MUST NOT assert certification.
  write('failure-local-dispatch.json',snap('assigned',null));
  r=run();
  assert.equal(stage(r,'operator_completion_server'),false);
  assert.equal(r.providerCertified,false,
    'inconsistent provider text and local ride must never certify the run');
  console.log('PASS: stage reporting rejects false UI-acceptance, partial settlement, and inconsistent backend evidence');
}finally{
  fs.rmSync(path.dirname(dir),{recursive:true,force:true});
}