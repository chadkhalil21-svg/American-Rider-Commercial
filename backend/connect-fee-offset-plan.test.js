'use strict';
const assert=require('node:assert/strict');
const {planVerifiedConnectOffsets}=require('./connect-fee-offset-plan');
const {FEE_CONSENT_VERSION}=require('./connect-fee-consent');
const now=Date.UTC(2026,9,20);
const consent={version:FEE_CONSENT_VERSION,approvedSeparatelyBilledFees:true,
  accountMonthlyUsd:2,acceptedAt:now-86400000};
const base={grossShareCents:10000,operatorId:'op_valid',accountId:'acct_Test',consent,now};
const fee=(id,amt=200)=>({id,uid:'op_valid',accountId:'acct_Test',status:'due',currency:'usd',
  kind:'monthly_active_account',source:'stripe_authenticated_balance_transaction',
  providerBalanceTransactionId:'txn_'+id,providerFeeConfirmed:true,
  providerFeePayer:'application',pricingOwnerConfirmed:true,feePaidDirectlyByOperator:false,
  amountCents:amt,recoveredCents:0,incurredAt:now-1000});
const plan=(list,more={})=>planVerifiedConnectOffsets({...base,obligations:list,...more});
assert.deepEqual(plan([]).allocations,[]);
assert.equal(plan([fee('first')]).withheldCents,200);
assert.equal(plan([fee('first')]).transferCents,9800);
assert.equal(plan([fee('one'),fee('two')]).withheldCents,400);
assert.equal(plan([fee('one'),{...fee('repeat'),providerBalanceTransactionId:'txn_one'}]).withheldCents,200);
assert.equal(plan([fee('first',300),{...fee('second'),recoveredCents:150}]).withheldCents,350);
assert.equal(plan([fee('huge',20000)]).withheldCents,9999);
assert.equal(plan([fee('huge',20000)]).transferCents,1);
assert.equal(plan([fee('first')],{consent:null}).withheldCents,0);
assert.equal(plan([fee('first')],{consent:{...consent,acceptedAt:now}}).withheldCents,0);
for(const invalid of [
 {...fee('x'),uid:'op_other'},
 {...fee('x'),source:'public_pricing_page'},
 {...fee('x'),providerFeeConfirmed:false},
 {...fee('x'),pricingOwnerConfirmed:false},
 {...fee('x'),providerFeePayer:'account'},
 {...fee('x'),feePaidDirectlyByOperator:true},
 {...fee('x'),status:'collected'},
 {...fee('x'),providerBalanceTransactionId:'invented'},
 {...fee('x'),incurredAt:now+1000},
 {...fee('x'),amountCents:0},
 {...fee('x'),kind:'traveler_card_processing'},
])assert.equal(plan([invalid]).withheldCents,0,'unverified or mismatched fees are never deducted');
assert.equal(plan([fee('first')]).collectionAuthorizedByThisPlan,false,
 'pure plan is not the money transfer authority');
console.log('PASS: verified-only Connect fee preview, 99% gross accounting, consent, exact fee deduplication, partial balance, zero real debits');
