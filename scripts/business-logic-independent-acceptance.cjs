'use strict';
// Independent source/business-logic tests; never authenticates a real customer,
// creates a live payment, or declares physical-device/third-party approval.
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const suites={
  "traveler": [
    "accountauth",
    "auth",
    "authconfiguration",
    "authstatemachine",
    "booking",
    "booking-readiness",
    "bookingrecovery",
    "faremodel",
    "quote-view-contract",
    "payment-user-journey",
    "travel-receipt-delivery",
    "travel-receipt-outbox",
    "accountdeletion",
    "traveler-quote-recovery"
  ],
  "operator": [
    "operator-onboarding-start",
    "operator-first-class-onboarding",
    "operator-qualification-restart",
    "operator-document-review",
    "insurance-monitoring",
    "external-screening",
    "qualification",
    "operator-duty-coverage",
    "connect-onboard-atomic",
    "operator-payout-records",
    "connect-payout-schedule",
    "insurance-horizon"
  ],
  "dispatch": [
    "dispatchgate",
    "dispatchfailure",
    "acceptance",
    "assignment-write-policy",
    "travelprogress",
    "travelmoney",
    "synthetic-travel-lifecycle",
    "operator-completion-money-truth",
    "idempotency",
    "manual-capture",
    "geooperators",
    "noshow"
  ],
  "payments": [
    "payments",
    "paymentarchitecture",
    "payment-hold-policy",
    "manual-capture",
    "manual-hold-webhook",
    "authorized-hold-recovery",
    "payout-transfer-guard",
    "payments-refund-charge",
    "refund-webhook-recovery",
    "payout-status-outage-truth",
    "connect-fee-reconciliation",
    "stripe-test-key-policy",
    "payout-recovery-census",
    "travel-receipt-outbox"
  ],
  "referrals": [
    "referral-service",
    "referral-policy",
    "referral-accrual",
    "referral-link-recovery-contract",
    "referral-source-contract",
    "recruiter-approval",
    "recruiter-invite-service",
    "recruiter-travel-activity",
    "recruiter-commission-ledger",
    "recruiter-accrual-sweep",
    "recruiter-reward-budget",
    "recruiter-reversal-sweep",
    "recruiter-stripe-payout",
    "recruiter-payout-policy",
    "recruiter-stripe-accounts",
    "recruiter-operator-transfers",
    "recruiter-commercial-terms",
    "recruiter-crosschannel-source",
    "recruiter-native-share-reporting",
    "recruiter-portal",
    "recruiter-qr-source",
    "recruiter-tax-readiness",
    "recruiter-roster",
    "recruiter-payout-reserve-sweep",
    "recruiter-operator-connect",
    "commercial-role-matrix"
  ],
  "shared": [
    "nativeauthbootstrap",
    "auth-sso-visual-parity",
    "google-signin-brand",
    "apple-account-deletion-apple-brand",
    "navigationstate",
    "pickup-map-geolocation",
    "push-acceptance",
    "push-route-parity",
    "travel-message-policy",
    "travel-cancel-uncertain-outcome",
    "operatorsupport",
    "accountclosure",
    "operator-inbox-listener-recovery",
    "payment-method-journey"
  ]
};
const category=process.argv[2];
if(!Object.hasOwn(suites,category)) {
 console.error('Unknown acceptance category:',category);
 process.exit(2);
}
const safeEnv={...process.env,NODE_ENV:'test',CI:'true',AR_SYNTHETIC_ONLY:'1'};
for(const key of Object.keys(safeEnv)) {
 if(/^(STRIPE_|FIREBASE_|GOOGLE_APPLICATION_CREDENTIALS$|RESEND_|CLOUD_RUN_|GCP_)/.test(key)) delete safeEnv[key];
}
const result={schema:1,category,sourceSha:process.env.GITHUB_SHA||null,
 mode:'OFFLINE_OR_SYNTHETIC_ONLY',money:'NO_STRIPE_API_CALLS_OR_LIVE_CHARGES',
 externalProviderVerification:'NOT_PERFORMED',physicalDevice:'NOT_PERFORMED',
 cases:[]};
function check(label,command,args,timeout=120000) {
 const start=Date.now();
 const proc=spawnSync(command,args,{cwd:process.cwd(),env:safeEnv,encoding:'utf8',timeout,maxBuffer:8*1024*1024});
 const ok=proc.status===0&&!proc.error;
 const item={name:label,status:ok?'PASS':'FAIL',exitCode:proc.status,elapsedMs:Date.now()-start,
    error:proc.error?.code||null};
 result.cases.push(item);
 console.log((ok?'PASS':'FAIL')+' '+category+' '+label+' '+item.elapsedMs+'ms');
 if(!ok) {
  // Diagnose a failed assertion without exposing credentials or test fixtures.
  for(const line of (String(proc.stderr||'')+'\n'+String(proc.stdout||'')).split('\n').slice(-25)) {
   console.error(line.slice(0,250));
  }
 }
}
for(const name of suites[category]) {
 const filename=path.join('backend',name+'.test.js');
 if(!fs.existsSync(filename)) {
  result.cases.push({name:filename,status:'FAIL',error:'SUITE_MISSING'});
  console.error('FAIL required suite missing',filename);
  continue;
 }
 check(filename,process.execPath,[filename]);
}
if(category==='dispatch')check('prelaunch-synthetic-acceptance',process.execPath,['scripts/prelaunch-synthetic-acceptance.cjs'],180000);
if(category==='payments')check('deterministic-commissioning',process.execPath,['scripts/run-deterministic-commissioning.mjs'],240000);
const destination=path.join('artifacts','business-logic-acceptance');
fs.mkdirSync(destination,{recursive:true});
const passed=result.cases.filter(x=>x.status==='PASS').length;
result.summary={passed,total:result.cases.length,failed:result.cases.length-passed,overall:passed===result.cases.length?'PASS':'FAIL'};
fs.writeFileSync(path.join(destination,category+'.json'),JSON.stringify(result,null,2)+'\n');
console.log('RESULT',category,result.summary.overall,passed+'/'+result.cases.length,
  'source-only/synthetic; NO actual Stripe TEST reconciliation, UI or live-provider certification');
if(result.summary.failed)process.exitCode=1;
