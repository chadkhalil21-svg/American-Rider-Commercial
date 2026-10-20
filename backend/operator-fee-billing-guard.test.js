const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {operatorBillingReady,monthlyFeeKey}=require('./operator-fee-billing-guard');
const {FEE_CONSENT_VERSION}=require('./connect-fee-consent');
const now=Date.now();
const operator={
  stripeFeeConsent:{version:FEE_CONSENT_VERSION,approvedSeparatelyBilledFees:true,
    accountMonthlyUsd:2,acceptedAt:now-10000},
  stripeOperatorFeeBilling:{customerId:'cus_ABC123',paymentMethodId:'pm_DEF456',
    setupIntentId:'seti_GHI789',feeConsentVersion:FEE_CONSENT_VERSION,
    operatorOnly:true,authorizedAt:now-5000}
};
assert.equal(operatorBillingReady(operator,now),true);
assert.equal(operatorBillingReady({...operator,stripeOperatorFeeBilling:null},now),false);
assert.equal(operatorBillingReady({...operator,stripeOperatorFeeBilling:{...operator.stripeOperatorFeeBilling,operatorOnly:false}},now),false);
assert.equal(operatorBillingReady({...operator,stripeOperatorFeeBilling:{...operator.stripeOperatorFeeBilling,
  authorizedAt:now-15000}},now),false);
assert.equal(operatorBillingReady({...operator,stripeFeeConsent:null},now),false);
assert.equal(monthlyFeeKey('uid_123','2026-10'),'connect-account:uid_123:2026-10');
assert.throws(()=>monthlyFeeKey('uid','2026-13'));
const payments=fs.readFileSync(path.join(__dirname,'payments.js'),'utf8');
const charge=payments.split('async function chargeOperatorAccountFee(')[1].split('\nmodule.exports')[0];
assert.ok(charge.includes('operatorBillingReady'));
assert.ok(charge.includes('paymentIntents.search'));
assert.ok(charge.includes('operator_fee_obligation'));
assert.ok(!charge.includes('savedPaymentMethodFor('),'Operator monthly fee cannot use Traveler payment method');
assert.ok(!charge.includes('customerForTraveler('),'Operator monthly fee must have a separate Stripe customer');
const server=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
assert.ok(server.includes("app.post('/connect/fees/setup'"));
assert.ok(server.includes("app.post('/connect/fees/confirm'"));
assert.ok(server.includes('operatorBillingReady(operator)'));
assert.ok(server.includes('feeBillingReady:'));
assert.ok(server.includes("app.post('/connect/fees/setup', requireAuth, LIMITS.connect, requireActiveOperatingMarket"));
assert.ok(server.includes("app.post('/connect/fees/confirm', requireAuth, LIMITS.connect, requireActiveOperatingMarket"));
console.log('PASS Operator-only fee card, versioned consent, same-month reconciliation, no Traveler wallet billing');