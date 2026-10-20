'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const feePath=path.join(__dirname,'operatorfees.js');
const fakeDB={consent:null,records:[],payoutAt:Date.UTC(2026,8,10)};
const stub=(relative,obj)=>{
 const full=require.resolve(path.join(__dirname,relative));
 require.cache[full]={id:full,filename:full,loaded:true,exports:obj};
};
stub('firebase-admin.js',{adminDb:()=>fakeDB,adminStatus:()=>({reason:'offline-test'})});
stub('push.js',{notify:async()=>{}});
stub('platforminbox.js',{postPlatformMessage:async()=>{}});
const {accountFeeQuote,sweepOperatorAccountFees,FEE_CONSENT_VERSION}=require(feePath);
assert.equal(accountFeeQuote(0,true,'US').costCents,200);
assert.equal(accountFeeQuote(19,true,'US').costCents,200);
assert.equal(accountFeeQuote(20,true,'US').costCents,200);
assert.equal(accountFeeQuote(100,true,'US').costCents,200);
assert.equal(accountFeeQuote(100,false,'US').totalCents,0);
const feeRef={set:async v=>{fakeDB.records.push(v);}};
fakeDB.collection=(name)=>{
 if(name==='operator_months')return {doc:()=>({collection:()=>({get:async()=>({docs:[{
    id:'operator_synthetic',ref:feeRef,data:()=>({
      payoutSeen:true,firstPayoutAt:fakeDB.payoutAt,lastPayoutAt:fakeDB.payoutAt,feeStatus:null,
    }),
 }]})})})};
 if(name==='users')return {doc:()=>({get:async()=>({exists:!!fakeDB.consent,
   data:()=>({email:'synthetic@example.invalid',stripeFeeConsent:fakeDB.consent})})})};
 if(name==='rides')throw Error('no lifetime / waived month rides query permitted');
 throw Error('unexpected collection '+name);
};
const now=Date.UTC(2026,9,15);
(async()=>{
 let charged=0;
 const charge=async ({amountCents})=>{charged++;assert.equal(amountCents,237);return {ok:true,paymentIntentId:'pi_SYNTHETIC'};};
 let x=await sweepOperatorAccountFees({now,charge,cardCountryFor:async()=> 'US'});
 assert.equal(charged,0,'no payout fee billed without documented consent');
 assert.equal(x.due,1);
 assert.equal(fakeDB.records[0].feeStatus,'consent_required');
 fakeDB.records.length=0;
 fakeDB.consent={version:FEE_CONSENT_VERSION,acceptedAt:fakeDB.payoutAt+1000,accountMonthlyUsd:2,approvedSeparatelyBilledFees:true};
 x=await sweepOperatorAccountFees({now,charge,cardCountryFor:async()=> 'US'});
 assert.equal(charged,0,'never retroactively bill a payout occurring before consent');
 fakeDB.consent={version:FEE_CONSENT_VERSION,acceptedAt:fakeDB.payoutAt-1000,accountMonthlyUsd:2,approvedSeparatelyBilledFees:true};
 x=await sweepOperatorAccountFees({now,charge,cardCountryFor:async()=> 'US'});
 assert.equal(charged,1,'one synthetic Operator with informed consent is billable');
 assert.equal(x.charged,1);
 assert.equal(fakeDB.records.at(-1).feeStatus,'paid');
 console.log('PASS synthetic Connect account: no waiver 0/19/20/100, no charge before consent or retroactive charge, single consented $2 recovery');
})().catch(e=>{console.error(e);process.exitCode=1;});
