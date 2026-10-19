'use strict';
// Offline contract tests ONLY: protect against accidentally treating an uncaptured
// card hold as a completed payment. No real Stripe accounts, cards or funds.
const assert=require('node:assert/strict');
const {scheduledPaymentAction,dispatchEligibility,cancellationFeeDecision}=require('./payment-hold-policy');
const now=Date.UTC(2026,9,19,12);
assert.equal(scheduledPaymentAction({now,scheduledAt:now+30*86400000,hasSavedCard:false}).action,'collect_payment_method_consent');
assert.equal(scheduledPaymentAction({now,scheduledAt:now+30*86400000,hasSavedCard:true}).action,'wait_for_authorization_window');
assert.equal(scheduledPaymentAction({now,scheduledAt:now+12*3600000,hasSavedCard:true}).action,'authorize_card_and_verify_requires_capture');
assert.equal(dispatchEligibility({paymentStatus:'succeeded',now,authorizationExpiresAt:now+36000000,consentConfirmed:true}).dispatch,false);
assert.equal(dispatchEligibility({paymentStatus:'requires_capture',now,authorizationExpiresAt:now+36000000,consentConfirmed:false}).dispatch,false);
assert.equal(dispatchEligibility({paymentStatus:'requires_capture',now,authorizationExpiresAt:now+36000000,consentConfirmed:true}).dispatch,true);
assert.equal(dispatchEligibility({paymentStatus:'requires_capture',now,authorizationExpiresAt:now-1,consentConfirmed:true}).dispatch,false);
assert.equal(dispatchEligibility({paymentStatus:'requires_capture',now,authorizationExpiresAt:now+120000,consentConfirmed:true}).dispatch,false);
assert.deepEqual(cancellationFeeDecision({acceptedAt:now,now:now+120000,verifiedProgress:false}),{feeCents:0,reason:'progress_not_proven'});
assert.equal(cancellationFeeDecision({acceptedAt:now,now:now+119999,verifiedProgress:true}).feeCents,0);
assert.equal(cancellationFeeDecision({acceptedAt:now,now:now+120001,verifiedProgress:true}).feeCents,300);
assert.equal(cancellationFeeDecision({acceptedAt:now,now:now+120001,verifiedProgress:true,operatorAtFault:true}).feeCents,0);
assert.equal(cancellationFeeDecision({acceptedAt:now,now:now+120001,arrivedAt:now+100000}).feeCents,300);
assert.equal(cancellationFeeDecision({now:now+120000,verifiedProgress:true}).feeCents,0);
console.log('PASS proposed capture and cancellation design: 24h late auth, server-verified funds/progress, grace, no double charges, exception');