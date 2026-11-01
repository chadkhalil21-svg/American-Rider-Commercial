'use strict';
// Synthetic-only founder verification: no Stripe keys, HTTP, Firestore or payouts.
// This checks that a manual payout cannot be commissioned before the two
// conditions are verified, monthly account fee happens only once, and that
// fee offsets cannot be charged twice or charged to the wrong connected account.
const assert=require('node:assert/strict');
const {desiredAutomaticSchedule,applyAutomaticSchedule}=require('./connect-payout-schedule');
const {previewPayoutFees}=require('./stripe-payout-fee-preview');
const {planVerifiedConnectOffsets}=require('./connect-fee-offset-plan');
const {FEE_CONSENT_VERSION}=require('./connect-fee-consent');
(async()=>{
  assert.deepEqual(desiredAutomaticSchedule({}),{interval:'weekly',weekly_anchor:'friday'},
    'do not silently change existing production payout schedule');
  assert.throws(()=>desiredAutomaticSchedule({
    CONNECT_STANDARD_PAYOUT_INTERVAL:'manual'
  }),/independently verified/);
  assert.throws(()=>desiredAutomaticSchedule({
    CONNECT_STANDARD_PAYOUT_INTERVAL:'manual',CONNECT_OPERATOR_CHOICE_PAYOUTS_VERIFIED:'1'
  }),/referral bank reconciliation/);
  const env={CONNECT_STANDARD_PAYOUT_INTERVAL:'manual',
    CONNECT_OPERATOR_CHOICE_PAYOUTS_VERIFIED:'1',CONNECT_MANUAL_REFERRAL_RECONCILIATION_VERIFIED:'1'};
  let writes=0;
  const stripe={accounts:{update:async(id,request)=>{
    writes++;assert.equal(id,'acct_OperatorTest1234');
    assert.equal(request.settings.payouts.schedule.interval,'manual');
    return {id,settings:{payouts:{schedule:{interval:'manual'}}}};
  }}};
  const account={id:'acct_OperatorTest1234',settings:{payouts:{schedule:{interval:'weekly',weekly_anchor:'friday'}}}};
  const updated=await applyAutomaticSchedule({stripe,account,env});
  assert.equal(updated.changed,true);assert.equal(writes,1);
  assert.equal((await applyAutomaticSchedule({stripe,account:updated.account,env})).changed,false);
  assert.equal(writes,1,'no repeated provider update on already-manual account');

  const first=Date.UTC(2026,9,10);
  const payouts=[
    {id:'po_S1',amountCents:10000,currency:'usd',method:'standard',createdAt:first,status:'paid'},
    {id:'po_S2',amountCents:20000,currency:'usd',method:'instant',createdAt:first+86400000,status:'paid'},
    {id:'po_S3',amountCents:9000,currency:'usd',method:'standard',createdAt:first+86400000,status:'failed'},
  ];
  const month=previewPayoutFees([...payouts,payouts[0]]);
  assert.equal(month.length,1);
  assert.equal(month[0].payouts,2);
  assert.equal(month[0].monthlyActiveAccountCents,200,
    '$2 is once per connected account in an active month, NOT once per payout');
  assert.equal(month[0].instantAdditionalCents,200,
    'Instant payout pricing is attributed only to instant payout');
  assert.equal(month[0].providerInvoiceVerified,false,
    'estimated fees never masquerade as actual provider invoice');
  assert.equal(month[0].earningsDebitAuthorized,false,
    'preview cannot create a second account fee');

  const now=Date.UTC(2026,9,22);
  const consent={version:FEE_CONSENT_VERSION,approvedSeparatelyBilledFees:true,
    accountMonthlyUsd:2,acceptedAt:now-86400000};
  const mk=(id,kind,amount)=>({id,uid:'op_certified',accountId:'acct_OperatorTest1234',
    status:'due',currency:'usd',kind,
    source:'stripe_authenticated_balance_transaction',
    providerBalanceTransactionId:'txn_'+id,providerFeeConfirmed:true,
    providerFeePayer:'application',pricingOwnerConfirmed:true,
    feePaidDirectlyByOperator:false,amountCents:amount,recoveredCents:0,
    incurredAt:now-1000});
  const due=[mk('monthlyfee','monthly_active_account',200),mk('bankfee','bank_payout',30),
    mk('routingfee','funds_routing',25)];
  const base={grossShareCents:10000,operatorId:'op_certified',
    accountId:'acct_OperatorTest1234',consent,now};
  const plan=(list,overrides={})=>planVerifiedConnectOffsets({...base,obligations:list,...overrides});
  assert.equal(plan(due).withheldCents,255,'recover exactly actual documented fees');
  assert.equal(plan([...due,due[0]]).withheldCents,255,
    'duplicate Stripe charge cannot deduct twice');
  assert.equal(plan(due.map(x=>({...x,recoveredCents:x.amountCents}))).withheldCents,0,
    'fully recovered provider charges cannot be collected again');
  assert.equal(plan(due,{consent:null}).withheldCents,0);
  assert.equal(plan([{...due[0],uid:'another_operator'}]).withheldCents,0);
  assert.equal(plan([{...due[0],feePaidDirectlyByOperator:true}]).withheldCents,0);
  assert.equal(plan(due).collectionAuthorizedByThisPlan,false,
    'money movement still requires the separate transfer ledger');
  console.log('PASS synthetic on-demand/Instant choice gates, exactly one $2 monthly fee, paid/failed payouts, fee matching/consent/dedupe; NO live money');
})().catch(e=>{console.error(e);process.exitCode=1;});
