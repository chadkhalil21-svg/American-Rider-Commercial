'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {previewPayoutFees,previewNetEarnings}=require('./stripe-payout-fee-preview');
const createdAt=Date.UTC(2026,9,20);
const pay=(id,method='standard',status='paid',amountCents=10000)=>({id,method,status,
  amountCents,createdAt,currency:'usd'});
assert.deepEqual(previewPayoutFees([]),[]);
assert.deepEqual(previewPayoutFees([pay('po_test', 'standard','failed')]),[]);
const standard=previewPayoutFees([pay('po_standard')])[0];
assert.equal(standard.monthlyActiveAccountCents,200);
assert.equal(standard.standardPayoutCents,50);
assert.equal(standard.fundsRoutingCents,25);
assert.equal(standard.instantAdditionalCents,0);
assert.equal(standard.estimatedTotalCents,275);
const instant=previewPayoutFees([pay('po_instant','instant')])[0];
assert.equal(instant.estimatedTotalCents,375);
const duplicate=previewPayoutFees([pay('po_standard'),pay('po_standard')])[0];
assert.equal(duplicate.payouts,1);
assert.equal(duplicate.estimatedTotalCents,275);
assert.equal(previewPayoutFees([pay('po_standard'),pay('po_second')])[0].estimatedTotalCents,350);
assert.equal(previewPayoutFees([pay('po_standard')],{pricing:'stripe_handles'})[0].estimatedTotalCents,0);
assert.equal(previewPayoutFees([pay('po_instant','instant')],{pricing:'stripe_handles'})[0].estimatedTotalCents,100);
assert.deepEqual(previewNetEarnings({grossOperatorEarningsCents:1000,authorizedDueCents:275}),
 {grossOperatorEarningsCents:1000,candidateDeductionCents:275,hypotheticalNetEarningsCents:725,
 unpaidFutureObligationCents:0,actualCollectionAuthorized:false});
assert.equal(previewNetEarnings({grossOperatorEarningsCents:100,authorizedDueCents:275}).unpaidFutureObligationCents,175);
assert.throws(()=>previewPayoutFees([pay('po_same'),{...pay('po_same'),amountCents:20000}]),/provider reconciliation required/);
assert.throws(()=>previewPayoutFees([pay('po_invalid','incorrect')]),/unknown payout/);
assert.throws(()=>previewPayoutFees([pay('po_same','standard','paid'),pay('po_same','standard','failed')]),/provider reconciliation required/);
const paymentSource=fs.readFileSync(require('node:path').join(__dirname,'payments.js'),'utf8');
const feeFn=paymentSource.split('async function chargeOperatorAccountFee(')[1].split('\nmodule.exports')[0];
assert.ok(feeFn.includes("operator_fee_earnings_recovery_pending"));
assert.ok(!feeFn.includes('stripe.paymentIntents.create'),'Never bill Operator from Traveler Wallet');
assert.ok(!feeFn.includes('savedPaymentMethodFor'),'Never use Traveler saved card');
const server=fs.readFileSync(require('node:path').join(__dirname,'server.js'),'utf8');
assert.ok(server.includes("process.env.OPERATOR_CONNECT_FEE_REVIEW_ENABLED === 'true'"),
  'Firestore fee review must be off by default until provider pricing and index are verified');
assert.ok(server.includes("maintenanceSweep('operatorFees', () => listDueFeeObligations({db:adminDb()}))"),
  'only explicitly commissioned bounded read-only due queue may run');
assert.ok(server.includes("fee_recovery_uncommissioned"), 'safe default does zero Firestore fee reads');
assert.ok(!server.includes("sweepOperatorAccountFees({"), 'no full previous-month account collection scan');
assert.ok(server.includes("sweepProviderEvents"),'Maintain payout provider event recovery');
const operatorScreen=fs.readFileSync(require('node:path').join(__dirname,'../app/operator/payouts.tsx'),'utf8');
const english=fs.readFileSync(require('node:path').join(__dirname,'../src/i18n/en.ts'),'utf8');
assert.ok(operatorScreen.includes("t('operator.payoutTruthBank')"));
assert.ok(operatorScreen.includes("t('operator.payoutTruthInstant')"));
assert.ok(!operatorScreen.includes('PayoutCalendar') && !operatorScreen.includes('payoutSchedulePicker'));
assert.match(english,/payoutTruthBank:\s*["']Standard payout:/);
assert.match(english,/payoutTruthInstant:\s*["']Instant payout:/);
assert.ok(!english.includes('weekly payday selection'));
for(const language of ['en','es','fr','it','de']) {
  const translations=fs.readFileSync(require('node:path').join(__dirname,'../src/i18n/'+language+'.ts'),'utf8');
  for(const key of ['payoutTruthBank','payoutTruthInstant','viewStripePayouts','activeAccountCostBody','nothingDeducted','econAccountCostNote']) {
    assert.ok(translations.includes(key+':'), language+' missing '+key);
  }
}
assert.ok(english.includes('Your gross share is 99%'), 'show gross vs net Operator earnings');
assert.ok(english.includes('no second') || english.includes('No second'), 'no added fee-card gate');
assert.ok(!operatorScreen.includes('payouts.create('), 'bank payout timing remains Stripe-owned');
assert.ok(operatorScreen.includes("onPress={showStripeDashboard}"),
  'payable Operator has a direct route to actual Stripe payout options');
assert.ok(operatorScreen.includes("await Linking.openURL(result.url)"),
  'Operator payout link opens returned provider URL');
assert.ok(english.includes('already included in a Standard bank payout'),
  'do not suggest in-transit Standard funds can be withdrawn twice');
const payoutRoute=server.split("app.post('/connect/dashboard'")[1]?.split("app.get('/connect/done'")[0];
assert.ok(payoutRoute && payoutRoute.includes('res.json({ url });'),
  'Express payout dashboard must return the URL string, not undefined link.url');
assert.ok(!payoutRoute.includes('res.json({ url: link.url })'),
  'prevent recurrence of Stripe dashboard link shape bug');
const payoutProvider=paymentSource.split('async function connectDashboardLink(')[1]?.split('// ---- PAYING THE OPERATOR')[0];
assert.ok(payoutProvider && payoutProvider.includes('return link.url;'),
  'Stripe provider function returns URL string, not login link object');

console.log('PASS: 0 payout, standard vs instant, exact once-month fee, duplicate events, authorized-net preview and no card debits');
