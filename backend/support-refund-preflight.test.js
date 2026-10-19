'use strict';
// Purely synthetic Stripe fake. No real refunds, transfers or network activity.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'payments.js'),'utf8');
const start=source.indexOf('async function refundTravel(');
const end=source.indexOf('// ---- OPERATOR PAYOUTS',start);
assert(start>0&&end>start,'real payment refund routine found');
const raw=source.slice(start,end);
const attempts=[];
const fake={
  paymentIntents:{retrieve:async()=>({
    status:'succeeded',id:'pi_SYNTHETIC',metadata:{uid:'owner',platformTake:'267'},
  })},
  refunds:{create:async(values)=>{
    attempts.push(values);
    return {id:'re_SYNTHETIC',status:'succeeded',amount:values.amount};
  }}
};
const refund=vm.runInNewContext(raw+'; refundTravel',{
  getStripe:()=>fake,
  refundBalanceFromVerifiedIntent:()=>({ok:true,cents:5000,alreadyRefunded:0}),
  String,Number,Math,
});
(async()=>{
  let x=await refund({paymentIntentId:'pi_SYNTHETIC',amountCents:3000,expectUid:'owner',maxOutOfPocketCents:2500});
  assert.equal(x.ok,false);
  assert.equal(x.code,'refund_exposure_review_required');
  assert.equal(x.outOfPocketCents,2733);
  assert.equal(attempts.length,0,'provider refunds NEVER called before approval');
  x=await refund({paymentIntentId:'pi_SYNTHETIC',amountCents:500,expectUid:'owner',maxOutOfPocketCents:2500,idempotencyKey:'case1'});
  assert.equal(x.ok,true);
  assert.equal(x.outOfPocketCents,233);
  assert.equal(attempts.length,1);
  x=await refund({paymentIntentId:'pi_SYNTHETIC',amountCents:3000,expectUid:'owner'});
  assert.equal(x.ok,true,'ordinary cancellation refunds are unaffected by discretionary support cap');
  assert.equal(attempts.length,2);
  x=await refund({paymentIntentId:'pi_SYNTHETIC',amountCents:100,expectUid:'owner',maxOutOfPocketCents:-1});
  assert.equal(x.ok,false);
  assert.equal(attempts.length,2);
  const server=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
  assert.match(server,/idempotencyKey: `ar_support_refund_\$\{rideId\}`,\s*maxOutOfPocketCents: MAX_OUT_OF_POCKET_CENTS/);
  console.log('PASS: automatic support refund cap enforced BEFORE Stripe mutation; cancellation refund remains unaffected; no real money touched');
})().catch(e=>{console.error(e);process.exitCode=1});
