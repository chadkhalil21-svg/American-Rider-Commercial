'use strict';
// Evidence taxonomy for native QA incident #399. Classification is NOT proof
// that an application bug exists and never certifies a paid Travel.
const fs=require('node:fs'), assert=require('node:assert/strict');
const rules=[
 ['IOS_DRIVER_STARTUP','test-infrastructure',[/IOSDriverTimeoutException/i,/iOS driver not ready in time/i,/Failed to connect to \/127\.0\.0\.1:\d+/i]],
 ['SECOND_SIMULATOR_BOOT','test-infrastructure',[/QA_IOS_TRAVELER_BLOCKED stage=/,/QA_IOS_TRAVELER_SELECT_FAILED/,/QA_IOS_SIMULATOR_BOOT_TIMEOUT/]],
 ['OPERATOR_ROLE_ROW_MISSING','ui-navigation-or-automation',[/Assertion is false: id: traveler-switch-to-operator is visible/i,/id: traveler-switch-to-operator is visible[\s\S]{0,120}FAILED/i]],
 ['AUTH_SCREEN_HEADING_MISSING','ui-navigation-or-automation',[/Assert that "(?:Welcome back|Sign in to your account\.)" is visible[\s\S]{0,100}FAILED/i]],
 ['OPERATOR_EMAIL_VERIFICATION_FAILED','pre-auth-text-entry',[/Assertion is false: false is true/i,/QA_IOS_OPERATOR_EMAIL_MISMATCH/]],
 ['NO_OPERATOR_AVAILABLE','matching-or-fixture',[/No operator was available/i,/NO_OPERATOR_AVAILABLE/]],
 ['STRIPE_TEST_ACCOUNT_MISMATCH','provider-config',[/resource_missing[\s\S]{0,100}PaymentIntent/i,/TEST_ACCOUNT_PAIR_MISMATCH/]],
];
function classify(log){
 assert.equal(typeof log,'string');
 const matched=rules.filter(([, ,p])=>p.some(re=>re.test(log)));
 const codes=matched.map(([code])=>code);
 return {schema:1,status:codes.length?'classified-observations':'unclassified-needs-artifact-review',
 observed_codes:codes,classes:[...new Set(matched.map(([,cls])=>cls))],
 required_evidence:['Exact run ID and commit','Failed assertion and screenshot/hierarchy',
 'Driver and simulator logs when relevant','Native binary fingerprint and fixture',
 'One small targeted proof before any paid journey rerun'],
 certification:'NOT_CERTIFIED',
 warning:'A workflow failure or automation action alone is not an app failure or proof of an accepted Travel'};
}
function selftest(){
 const samples=[
 ['Assertion is false: id: traveler-switch-to-operator is visible','OPERATOR_ROLE_ROW_MISSING'],
 ['Assert that "Welcome back" is visible... FAILED','AUTH_SCREEN_HEADING_MISSING'],
 ['QA_IOS_OPERATOR_LOGIN_CHECKPOINT_FAILED 1\nAssertion is false: false is true','OPERATOR_EMAIL_VERIFICATION_FAILED'],
 ['IOSDriverTimeoutException: iOS driver not ready in time','IOS_DRIVER_STARTUP'],
 ['QA_IOS_TRAVELER_BLOCKED stage=bootstatus reason=timeout_420s','SECOND_SIMULATOR_BOOT'],
 ['No operator was available. No charge was made.','NO_OPERATOR_AVAILABLE'],
 ['resource_missing: PaymentIntent','STRIPE_TEST_ACCOUNT_MISMATCH']
 ];
 for(const [log,code] of samples){const r=classify(log);assert.ok(r.observed_codes.includes(code));assert.equal(r.certification,'NOT_CERTIFIED');}
 const generic=classify('Step 31 Operator sign-in: failure');
 assert.equal(generic.status,'unclassified-needs-artifact-review');
 assert.deepEqual(generic.observed_codes,[]);
 console.log('PASS: seven evidence-based failure signatures; ambiguous Step 31 remains unclassified');
}
if(require.main===module){
 if(process.argv[2]==='--selftest')selftest();
 else if(process.argv[2]==='--log'&&process.argv[3]){
  const file=process.argv[3],s=fs.statSync(file);
  assert.ok(s.size<15000000,'Log too large');
  console.log(JSON.stringify(classify(fs.readFileSync(file,'utf8')),null,2));
 } else {console.error('Usage: --selftest | --log <job-log.txt>');process.exitCode=2;}
}
module.exports={classify};
