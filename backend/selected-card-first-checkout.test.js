'use strict';
// Source + synthetic provider boundary acceptance. No live charges or device.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {verifyHold}=require('./payment-hold-policy');
const {paymentMatches}=require('./booking');
const {minimumPlatformFeeCents,economicsFor}=require('./economics');
const now=Date.UTC(2026,9,25,12);
const uid='traveler-card-test',rideId='trip-card-test';
const card='pm_VerifiedCard1234567';
const base={id:'pi_CardFirst123',status:'requires_capture',currency:'usd',
  amount:2000,amount_capturable:2000,capture_method:'manual',payment_method:card,
  metadata:{uid,rideId,capturePolicy:'manual_v1',selectedPaymentMethodId:card},
  latest_charge:{payment_method_details:{card:{capture_before:Math.ceil((now+3*86400000)/1000)}}}};
const ride={paymentIntentId:base.id,costCents:2000,routedMinutes:60,
  selectedPaymentMethodId:card};
const consent=pi=>verifyHold({intent:pi,uid,rideId,totalCents:2000,
  now,requiredUntil:now+60*60000,minCaptureHeadroomMs:30000});
assert.equal(consent(base).ok,true);
assert.equal(paymentMatches(ride,base,uid,rideId,now),true);
for(const pm of ['pm_ChangedForeignCard','',null]){
 const modified={...base,payment_method:pm};
 assert.equal(consent(modified).ok,false,'foreign selected card can never use earlier domestic quote');
 assert.equal(paymentMatches(ride,modified,uid,rideId,now),false);
}
assert.equal(paymentMatches({...ride,selectedPaymentMethodId:'pm_ChangedForeignCard'},base,uid,rideId,now),false);
const feeUS=minimumPlatformFeeCents({travelCostCents:5000,cardCountry:'US'});
const feeGB=minimumPlatformFeeCents({travelCostCents:5000,cardCountry:'GB'});
assert(feeUS<feeGB,'Stripe actual domestic issuer can lower the sufficient fee');
for(const cc of ['US','GB']){
 const fee=minimumPlatformFeeCents({travelCostCents:5000,cardCountry:cc});
 assert(economicsFor({travelCostCents:5000,platformFeeCents:fee,cardCountry:cc})
   .platformContributionCents>=75);
}
const read=p=>fs.readFileSync(path.join(__dirname,p),'utf8');
const back=read('server.js'),fa=read('fareauthority.js');
assert(back.includes('selectedPaymentMethodId:ride.selectedPaymentMethodId'));
assert(back.includes('paymentMethodId: b.paymentMethodId'));
assert(back.includes('selectedPaymentMethodId:priced.selectedPaymentMethodId'));
assert(fa.includes('await cardCountryFor({uid,email,paymentMethodId:body.paymentMethodId})'));
const app=read('../src/backend/payments.ts'),quote=read('../src/backend/fares.ts');
assert(app.includes('confirmPayment(intent.clientSecret'),
 'native saved-card path must authorize same card selected before fare quote');
assert(quote.includes('preferSavedCard:args.preferSavedCard===true'),
 'wallet path must remain separate from saved-card issuer-based pricing');
console.log('PASS issuer-first saved card: authenticated source, signed quote-to-hold binding, safe wallet fallback, foreign switch rejected before dispatch/capture; no real money');
