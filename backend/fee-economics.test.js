'use strict';
const assert=require('node:assert/strict');
const {OPERATOR_NET_CENTS,STANDARD_CANCELLATION_GROSS_CENTS,feeBreakdown,cancellationCapturePlan}=require('./fee-economics');
assert.equal(OPERATOR_NET_CENTS,300);
assert.equal(STANDARD_CANCELLATION_GROSS_CENTS,400);
const x=feeBreakdown();assert.equal(x.grossCents,400);
assert.equal(x.operatorNetCents,300);
assert.equal(x.processingCents,42);
assert.equal(x.connectAllocationCents,26);
assert.equal(x.residualCents,32);
assert.equal(x.costCovered,true);
assert.equal(feeBreakdown({processingRate:.35}).costCovered,false,'do not claim one published fee always covers unusual card plans');
assert.equal(cancellationCapturePlan({authorizedCents:2500,feeEligible:false}).action,'void');
assert.deepEqual(cancellationCapturePlan({authorizedCents:2500,feeEligible:true,disclosureAccepted:true,operatorEligible:true}),
{action:'capture',captureCents:400,operatorCents:300,reason:'disclosed_verified_cancellation'});
for(const args of [
{authorizedCents:2500,feeEligible:true,disclosureAccepted:false,operatorEligible:true},
{authorizedCents:2500,feeEligible:true,disclosureAccepted:true,operatorEligible:false},
{authorizedCents:2500,feeEligible:true,disclosureAccepted:true,operatorEligible:true,feeCents:501},
{authorizedCents:350,feeEligible:true,disclosureAccepted:true,operatorEligible:true},
{authorizedCents:0,feeEligible:true,disclosureAccepted:true,operatorEligible:true},
])assert.equal(cancellationCapturePlan(args).action,'review');
console.log('PASS: uniform $4 service fee, exactly $3 Operator net, no hidden card surcharge and fail-closed fee checks');
