'use strict';
/**
 * Turn native QA artifacts into auditable journey milestones.
 *
 * NOT a certification engine: a Maestro tap is never evidence of backend
 * acceptance, and a TEST card entered is never a captured Stripe payment.
 * Called on BOTH success and failure, retaining progress across flaky runs.
 */
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const dir=path.resolve(process.argv[2]||'artifacts/native-commercial-android');
assert.match(dir,/[/\\]native-commercial-(android|ios)$/,
  'Only isolated native commercial QA artifacts may be summarized');
fs.mkdirSync(dir,{recursive:true});
const read=(name)=>{try{return fs.readFileSync(path.join(dir,name),'utf8');}catch{return '';}};
const traveler=read('traveler-retry.log')||read('traveler.log');
const operatorStart=read('operator-start.log');
const operator=read('operator.log');
const reconciliation=read('reconciliation.log');
const recordFiles=['success-local-dispatch.json','failure-local-dispatch.json','dispatch-after-traveler.json'];
let snapshot=null,snapshotFile=null;
for(const name of recordFiles){
  const raw=read(name);if(!raw)continue;
  const start=raw.indexOf('LOCAL QA TWO-DEVICE FAILURE SNAPSHOT');
  const brace=raw.indexOf('{',Math.max(start,0));
  if(brace<0)continue;
  try{snapshot=JSON.parse(raw.slice(brace));snapshotFile=name;break;}catch{}
}
const rides=Array.isArray(snapshot?.rides)?snapshot.rides:[];
const ride=rides.length===1&&rides[0].travelerUid==='native-qa-traveler'?rides[0]:null;
const observed=(log,pattern)=>pattern.test(log);
const evidence=[];
function stage(id,confirmed,source,level='ui'){
  evidence.push({stage:id,confirmed:!!confirmed,evidence:source,level});
}
const android=dir.endsWith('native-commercial-android');
if(android){
  const one=read('health-emulator-5554-last-hierarchy.xml');
  const two=read('health-emulator-5556-last-hierarchy.xml');
  stage('both_emulators_have_app_hierarchy',one.includes('AMERICAN RIDER')&&two.includes('AMERICAN RIDER'),
    'health-emulator-5554-last-hierarchy.xml + health-emulator-5556-last-hierarchy.xml','infrastructure');
}
stage('operator_duty_ui',observed(operatorStart,/Tap on id: operator-commence-operations\.\.\. COMPLETED/),
  'operator-start.log','ui');
stage('traveler_quote_ui',observed(traveler,/Assert that id: traveler-quote-ready is visible\.\.\. COMPLETED/),
  'traveler.log','ui');
stage('test_card_entry_ui',observed(traveler,/Card number.*visible\.\.\. COMPLETED/)&&
  observed(traveler,/Input text 4242424242424242\.\.\. COMPLETED/),
  'traveler.log (TEST only, not authorization)','ui');
stage('traveler_awaiting_operator_ui',
  observed(traveler,/Awaiting Operator confirmation.*visible\.\.\. COMPLETED/),
  'traveler.log','ui');
stage('travel_assigned_server',
  !!ride&&ride.operatorId==='native-qa-operator'&&
  ['assigned','accepted','arrived','in_progress','completed'].includes(ride.status)&&!!ride.paymentIntentPresent,
  snapshotFile||'missing local Firestore snapshot','backend');
stage('operator_offer_seen_ui',
  observed(operator,/operator-accept-traveler is visible\.\.\. COMPLETED/),
  'operator.log','ui');
stage('operator_acceptance_server',
  !!ride&&!!ride.acceptedAt&&
  ['accepted','arrived','in_progress','completed'].includes(ride.status),
  snapshotFile||'missing local Firestore snapshot','backend');
stage('operator_arrival_control_ui',
  observed(operator,/operator-confirm-arrival is visible\.\.\. COMPLETED/),
  'operator.log','ui');
stage('operator_completion_server',
  !!ride&&ride.status==='completed'&&!!ride.acceptedAt,
  snapshotFile||'missing local Firestore snapshot','backend');
stage('stripe_test_captured_and_transferred',
  observed(reconciliation,/^PASS: one mobile-booked, native-Operator-completed, Stripe TEST captured and transferred Travel/m),
  'reconciliation.log (Stripe TEST independent fetch)','provider');
const logs=[operatorStart,traveler,operator,read('traveler-emulator.log')].join('\n');
const indicators=logs.match(/(?:Assert that|Tap on|Launch app|QA_INFRA_[A-Z_]+|Assertion is false|Element not found)[^\r\n]*(?:FAILED|offline|responding|not found)?/g)||[];
const classification=/QA_INFRA_|Pixel Launcher isn.t responding|device offline/.test(logs)
  ?'emulator_infrastructure'
  :/Assertion is false|Element not found|\.{3} FAILED/.test(logs)
    ?'native_ui_or_test_unresolved'
    :'not_classified';
const output={
  schema:'american-rider-native-qa-stage-evidence-v1',
  platform:android?'android':'ios',
  createdAt:new Date().toISOString(),
  source:'isolated native QA artifacts, not production',
  stages:evidence,
  highestConfirmedUiStage:evidence.filter(x=>x.level==='ui'&&x.confirmed).map(x=>x.stage).at(-1)||null,
  confirmedBackendStages:evidence.filter(x=>x.level==='backend'&&x.confirmed).map(x=>x.stage),
  providerCertified:evidence.some(x=>x.stage==='stripe_test_captured_and_transferred'&&x.confirmed),
  classification,
  lastObservedError:indicators.filter(x=>/FAILED|not found|offline|responding/.test(x)).at(-1)?.slice(0,200)||null,
  localRideStatus:ride?.status||null,
  snapshotAvailable:!!snapshot,
  note:'Independent stages are diagnostic only. Full journey requires one actual Travel and TEST capture/transfer; successful screen taps never override backend truth.'
};
const destination=path.join(dir,'stage-report.json');
fs.writeFileSync(destination,JSON.stringify(output,null,2)+'\n');
console.log('QA STAGE REPORT: '+JSON.stringify({platform:output.platform,highestUi:output.highestConfirmedUiStage,backend:output.confirmedBackendStages,providerCertified:output.providerCertified,classification}));
