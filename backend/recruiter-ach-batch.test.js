'use strict';
const assert=require('node:assert/strict');
const {DEFAULT_MINIMUM_CENTS,planRecruiterAchBatch}=require('./recruiter-ach-batch');
const date='2026-10-23';
const recipient={uid:'recruiter-001',availableCents:3400,
  approvalActive:true,bankVerified:true,taxReady:true,underReview:false,
  refundOrDisputeHold:false,settlementVerified:true,providerRecipientRef:'bank_token_001'};
const authorized={date,programEnabled:true,providerApproved:true,counselApproved:true,
  scheduleApproved:true,
  availableFundsCents:10000,recipients:[recipient]};
assert.equal(DEFAULT_MINIMUM_CENTS,2500);
const off=planRecruiterAchBatch({...authorized,programEnabled:false});
assert.equal(off.reason,'program_off');assert.equal(off.payments.length,0);
assert.equal(planRecruiterAchBatch({...authorized,providerApproved:false}).reason,'bank_provider_not_approved');
assert.equal(planRecruiterAchBatch({...authorized,counselApproved:false}).reason,'legal_review_not_complete');
assert.equal(planRecruiterAchBatch({...authorized,scheduleApproved:false}).reason,'payout_schedule_not_approved');
assert.equal(planRecruiterAchBatch({...authorized,date:'2026-02-30'}).reason,'invalid_payout_date');
assert.equal(planRecruiterAchBatch({...authorized,date:'not-a-date'}).reason,'invalid_payout_date');
assert.equal(planRecruiterAchBatch({...authorized,date:'2026-10-22'}).ok,true,
  'approved payout date must not be forced to Friday');
assert.equal(planRecruiterAchBatch({...authorized,availableFundsCents:3399}).reason,'commissions_not_fully_funded');
const ok=planRecruiterAchBatch(authorized);
assert.equal(ok.ok,true);assert.equal(ok.totalCents,3400);
assert.equal(ok.reason,'preview_only_no_money_sent');
assert.deepEqual(ok.payments,[{batchId:'recruiter-ach-2026-10-23-recruiter-001',
  uid:'recruiter-001',recipientRef:'bank_token_001',cents:3400,currency:'usd'}]);
assert.equal(planRecruiterAchBatch({...authorized,previousBatchIds:[ok.payments[0].batchId]}).payments.length,0);
assert.equal(planRecruiterAchBatch({...authorized,recipients:[recipient,recipient]}).reason,'invalid_recipient');
assert.equal(planRecruiterAchBatch({...authorized,recipients:[{...recipient,providerRecipientRef:'123456789/9876'}]}).payments.length,0);
for(const change of [
  {approvalActive:false},{bankVerified:false},{taxReady:false},
  {underReview:true},{refundOrDisputeHold:true},{settlementVerified:false},
]){
  const result=planRecruiterAchBatch({...authorized,recipients:[{...recipient,...change}]});
  assert.equal(result.ok,true);assert.equal(result.payments.length,0);
}
const small={...recipient,availableCents:1500};
assert.equal(planRecruiterAchBatch({...authorized,recipients:[small]}).payments.length,0);
const closing=planRecruiterAchBatch({...authorized,recipients:[{...small,finalSettlementApproved:true}]});
assert.equal(closing.totalCents,1500);
const noBankDetails=JSON.stringify(ok);
assert.equal(noBankDetails.includes('accountNumber'),false);
assert.equal(noBankDetails.includes('routingNumber'),false);
console.log('PASS: no forced payout weekday, approved schedule/bank/legal/funding gates, $25 batching, no duplicates, held funds and no transfers');
