'use strict';
// Checkpoints are an evidence index, NEVER a substitute for native Maestro,
// Firestore or Stripe TEST results. All marks come from the real QA job.
const fs=require('node:fs'), path=require('node:path'), assert=require('node:assert/strict');
const STAGES=[
  ['isolated-fixtures','Local Auth, Firestore, local API, Stripe TEST and fare preconditions'],
  ['authenticated-operator-eligibility','Operator Firebase session + qualified insurance evidence'],
  ['native-app-installed','Fingerprint-bound native app installed on simulator/emulator'],
  ['operator-in-service','Native Operator actually signed in and In Service'],
  ['traveler-device-installed','Independent Traveler device installed after Operator verified'],
  ['paid-travel-and-offer','Actual Traveler payment and real Operator offer/accept verified'],
  ['travel-completion','Native Operator completed the same Travel'],
  ['stripe-test-reconciliation','Same local Travel and actual Stripe TEST records reconciled'],
];
const KNOWN=new Set(STAGES.map(([id])=>id));
function platform(){
  const v=process.env.AR_NATIVE_PLATFORM;
  assert.ok(['ios','android'].includes(v),'AR_NATIVE_PLATFORM must be ios or android');
  return v;
}
function isolated(){
  assert.equal(process.env.AR_NATIVE_QA_LOCAL,'1','Only isolated native QA can mark a checkpoint');
  assert.equal(process.env.GOOGLE_CLOUD_PROJECT,'demo-american-rider-qa','QA-only Firebase project required');
  assert.equal(process.env.EXPO_PUBLIC_AR_NATIVE_QA,'1','QA-only native app required');
  assert.match(process.env.STRIPE_SECRET_KEY||'',/^sk_test_/,'Stripe TEST only');
  assert.ok(!process.env.K_SERVICE&&!process.env.STRIPE_LIVE_SECRET_KEY,'Production contexts forbidden');
}
function file(){return path.join('artifacts','native-commercial-'+platform(),'stage-ledger.json');}
function read(f){
  if(!fs.existsSync(f))return {schema:1,runId:process.env.GITHUB_RUN_ID||'local',sha:process.env.GITHUB_SHA||'local',platform:platform(),passed:{}};
  const v=JSON.parse(fs.readFileSync(f,'utf8'));
  assert.equal(v.schema,1);
  assert.equal(v.runId,process.env.GITHUB_RUN_ID||'local','Cannot mix separate workflow runs');
  assert.equal(v.platform,platform(),'Cannot merge Android and iOS evidence');
  return v;
}
function pass(stage){
  isolated();
  assert.ok(KNOWN.has(stage),'Unknown native QA checkpoint: '+stage);
  const f=file(),v=read(f);
  assert.ok(!v.passed[stage],'Duplicate evidence checkpoint: '+stage);
  v.passed[stage]={at:new Date().toISOString()};
  fs.mkdirSync(path.dirname(f),{recursive:true});
  fs.writeFileSync(f+'.tmp',JSON.stringify(v,null,2)+'\n');
  fs.renameSync(f+'.tmp',f);
  console.log('QA_NATIVE_CHECKPOINT_PASS='+stage);
}
function report(){
  const v=read(file());
  const count=STAGES.filter(([id])=>!!v.passed[id]).length;
  const certified=count===STAGES.length;
  const lines=[
    '### Native commercial acceptance: '+v.platform.toUpperCase(),
    '',
    'Run: '+v.runId+' | Source: '+v.sha,
    '',
    '| Verifiable checkpoint | Evidence |',
    '|---|---|',
    ...STAGES.map(([id,description])=>'| '+description+' | '+(v.passed[id]?'PASS':'NOT VERIFIED')+' |'),
    '',
    '**Verified checkpoints: '+count+'/'+STAGES.length+'. Native commercial acceptance: '+(certified?'ALL CHECKPOINTS MARKED; review device and provider artifacts':'NOT CERTIFIED')+'.**',
    '',
    'A skipped or blocked checkpoint is not an app regression; this status does not imply that downstream code failed. Screen interactions and payment authorization must be tied to the captured artifact evidence. Synthetic QA is never proof of live insurance, screening, bank payouts, or App Store approval.',
  ];
  const body=lines.join('\n')+'\n';
  console.log(body);
  if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,body);
}
function selftest(){
  const ids=STAGES.map(x=>x[0]);
  assert.equal(ids.length,8);
  assert.equal(new Set(ids).size,ids.length);
  assert.equal(ids[ids.length-1],'stripe-test-reconciliation');
  for(const x of ids) assert.match(x,/^[a-z0-9-]+$/);
  // The independent-device boundary must stay explicit. A backend fixture
  // with a commissioned flag alone is not a real Operator-in-service pass.
  assert.ok(KNOWN.has('operator-in-service')&&KNOWN.has('traveler-device-installed'));
  console.log('PASS: native stage evidence contract has eight independent, ordered gates');
}
const [action,stage]=process.argv.slice(2);
try{
  if(action==='selftest')selftest();
  else if(action==='pass')pass(stage);
  else if(action==='report')report();
  else throw Error('usage: node scripts/native-qa-stage-ledger.cjs selftest|pass <stage>|report');
}catch(e){console.error('NATIVE_STAGE_LEDGER_FAILED:',e.message);process.exitCode=1}
