'use strict';
// Zero Stripe calls, zero Firestore mutations. Validate BOTH payout consent and
// the distinct new-work lifecycle on synthetic Operator records.
const assert=require('node:assert/strict');
const {currentConnectFeeConsent,FEE_CONSENT_VERSION}=require('./connect-fee-consent');
const {assessOperator}=require('./qualification');
const {matchOperator}=require('./matching');
const {DISCLOSURE_VERSION}=require('./disclosure');
const fs=require('node:fs');
const path=require('node:path');
const now=Date.UTC(2026,9,20);
const accepted={version:FEE_CONSENT_VERSION,approvedSeparatelyBilledFees:true,
  accountMonthlyUsd:2,acceptedAt:now-3600000};
for(let pass=0;pass<2;pass++){
  assert.equal(currentConnectFeeConsent(accepted,now),true);
  for(const x of [null,{...accepted,version:'old'},
      {...accepted,approvedSeparatelyBilledFees:false},
      {...accepted,accountMonthlyUsd:3},
      {...accepted,acceptedAt:now+3600000},
      {...accepted,acceptedAt:null}]){
    assert.equal(currentConnectFeeConsent(x,now),false,'invalid or future consent rejected');
  }
  const base={stripeAccountId:'acct_SYNTHETIC_ONLY',name:'Operator',
    documents:{},screening:null};
  function check(consent, liveMoney=true, context='online'){
    return assessOperator({user:{...base,stripeFeeConsent:consent},
      fleet:null,context,liveMoney,account:{disabled:false},
      payouts:{enabled:true},now}).blockers.map(x=>x.code);
  }
  assert(check(null).includes('payout_fee_consent_required'));
  assert(!check(accepted).includes('payout_fee_consent_required'));
  assert(check({...accepted,version:'prior'}).includes('payout_fee_consent_required'));
  assert(check(null,true,'accept').includes('payout_fee_consent_required'));
  assert(!check(null,false,'accept').includes('payout_fee_consent_required'),
    'demonstration does not silently certify live payout policy');
  assert(!check(null,true,'qualify').includes('payout_fee_consent_required'),
    'qualification remains available without Stripe terms');
  const operator={id:'operator',available:true,lat:25.76,lng:-80.20,
    onlineAt:now,commissioned:true,disclosureVersion:DISCLOSURE_VERSION,
    screeningCheckedAt:now,insuranceExpiry:'2099-12-31',stripeAccountId:'acct_SYNTHETIC_ONLY',
    classes:['Standard']};
  const origin={lat:25.76,lng:-80.20};
  assert.equal(matchOperator([operator],origin,'Standard',{requireScreening:true,now}),null,
    'pre-consent legacy connected Operator must not be offered a new paid Travel');
  const allow={...operator,feeConsentVersion:FEE_CONSENT_VERSION};
  assert.equal(matchOperator([allow],origin,'Standard',{requireScreening:true,now})?.operator.id,'operator');
  assert.equal(matchOperator([operator],origin,'Standard',{requireScreening:false,now})?.operator.id,'operator',
    'synthetic non-money match remains independently configurable');
  const server=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
  assert.match(server,/app\\.post\\('\\/connect\\/dashboard'/,
    'connected account dashboard remains available without new-Travel consent');
  assert.match(server,/app\\.post\\('\\/operator\\/settle-pending'/,
    'existing payable funds remain separately recoverable');
}
console.log('PASS twice: legacy/declined Operator blocked for new live Travel, Stripe payout access and owed earnings left untouched, qualified demos unchanged.');
