'use strict';
const assert=require('node:assert/strict');
const {assessCapturedPayment,reviewDisputeClose,refundableChargeSafety}=require('./payment-exception-policy');
const base={travelerUid:'a',costCents:2500,status:'completed',
 paymentIntentId:'pi_one',paymentCapturePolicy:'manual_v1'};
const manual={id:'pi_one',capture_method:'manual',currency:'usd',amount:2500,
 amount_received:2500,metadata:{uid:'a',capturePolicy:'manual_v1'}};
assert.equal(assessCapturedPayment({ride:base,intent:manual}).kind,'completed_fare');
assert.equal(assessCapturedPayment({ride:{...base,status:'accepted'},intent:manual}).reason,'full_capture_before_verified_completion');
assert.equal(assessCapturedPayment({ride:base,intent:{...manual,amount_received:2600}}).reason,'completed_capture_amount_mismatch');
assert.equal(assessCapturedPayment({ride:base,intent:{...manual,id:'pi_second'}}).reason,'duplicate_or_foreign_payment_intent');
assert.equal(assessCapturedPayment({ride:base,intent:{...manual,metadata:{uid:'stranger',capturePolicy:'manual_v1'}}}).reason,'owner_mismatch');
assert.equal(assessCapturedPayment({ride:base,intent:{...manual,capture_method:'automatic'}}).reason,'manual_policy_mismatch');
const cancelled={...base,status:'cancelled',cancellationFeeCaptureCents:400};
assert.equal(assessCapturedPayment({ride:cancelled,intent:{...manual,amount_received:400}}).kind,'cancellation_fee');
assert.equal(assessCapturedPayment({ride:{...cancelled,cancellationFeeCaptureCents:0},intent:{...manual,amount_received:400}}).reason,'undisclosed_or_incorrect_cancellation_capture');
assert.equal(assessCapturedPayment({ride:cancelled,intent:manual}).reason,'undisclosed_or_incorrect_cancellation_capture');
const legacy={...base,status:'assigned',paymentCapturePolicy:'captured_legacy'};
const auto={id:'pi_one',currency:'usd',amount_received:2500,metadata:{uid:'a'}};
assert.equal(assessCapturedPayment({ride:legacy,intent:auto}).kind,'legacy_captured_fare');
assert.equal(assessCapturedPayment({ride:legacy,intent:{...auto,amount_received:2600}}).reason,'captured_fare_amount_mismatch');
assert.equal(assessCapturedPayment({ride:legacy,intent:{...auto,id:'pi_another'}}).reason,'duplicate_or_foreign_payment_intent');
const lost=reviewDisputeClose({status:'lost',amount:2500,hadOperatorTransfer:true});
assert.deepEqual(lost,{kind:'provider_loss',lossCents:2500,operatorTransferReview:true,automaticallyRefund:false});
assert.equal(reviewDisputeClose({status:'won',amount:2500}).lossCents,0);
assert.equal(reviewDisputeClose({status:'warning_closed',amount:2500}).kind,'review');
assert.equal(refundableChargeSafety({status:'succeeded',latest_charge:{disputed:true}}).ok,false);
assert.equal(refundableChargeSafety({status:'succeeded',latest_charge:{disputed:false}}).ok,true);
console.log('PASS: verified capture/duplicate/overcharge, $4 fee-only proof, no bank-double-refunds, won/lost dispute outcomes');
