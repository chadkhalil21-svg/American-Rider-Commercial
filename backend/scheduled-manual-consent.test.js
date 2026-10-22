'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {assessScheduledManualConsent}=require('./scheduled-manual-consent');
for(let i=0;i<2;i++){
 assert.equal(assessScheduledManualConsent({manualMode:false}).ok,true);
 assert.equal(assessScheduledManualConsent({manualMode:true,consent:false,hasSavedCard:true}).code,
  'scheduled_payment_consent_required');
 assert.equal(assessScheduledManualConsent({manualMode:true,consent:true,hasSavedCard:false}).code,
  'scheduled_saved_card_required');
 assert.equal(assessScheduledManualConsent({manualMode:true,consent:true,hasSavedCard:true}).ok,true);
 const server=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
 assert(server.includes("b.offSessionPaymentConsent===true"));
 assert(server.includes("offSessionPaymentConsentVersion:'manual-scheduled-v1'"));
 assert(server.includes('await listPaymentMethods({uid:req.uid,email:req.email})'));
 const dispatch=fs.readFileSync(path.join(__dirname,'scheduler.js'),'utf8');
 const payments=fs.readFileSync(path.join(__dirname,'payments.js'),'utf8');
 assert(dispatch.includes('offSessionPaymentConsentVersion===\'manual-scheduled-v1\''),
   'Existing reservation must carry current consent version before off-session Stripe request');
 assert(dispatch.indexOf("offSessionPaymentConsentVersion==='manual-scheduled-v1'")<
   dispatch.indexOf('chargeScheduledTravel({'),
   'Consent guard must run before Stripe authorization');
 assert(dispatch.includes("await close(db,id,'payment_failed'"),
   'Unconsented old appointment must be closed without charging, with Traveler notice');
 assert(dispatch.includes('chargeScheduledTravel({')&&dispatch.includes('assignPaidTravel({'));
 assert(payments.includes("off_session: true")&&payments.includes("capture_method:'manual'"),
  'scheduled Travel must authorize off-session in new mode; old mode unchanged');
 assert(dispatch.indexOf('matchOperator(')<dispatch.indexOf('chargeScheduledTravel({'),
  'Do not request an authorization before a qualified operator is matched');
 // A held scheduled card is not paid. Preserve separate amounts in both
 // dispatched and failed scheduling outcomes and avoid a false refund claim.
 assert(dispatch.includes("chargedCents:heldOnly?0:paid.chargedCents"),
   'new scheduled manual holds cannot be reported as charged funds');
 assert(dispatch.includes("authorizedCents:paid.chargedCents"),
   'record the separate amount reserved at the bank');
 assert(dispatch.includes('RELEASE ORIGINAL HOLD; NO CAPTURED REFUND IS OWED.'),
   'failed dispatch support must release the hold, not promise a cash refund');
 const upcoming=fs.readFileSync(path.join(__dirname,'../app/upcoming.tsx'),'utf8');
 assert(upcoming.includes("case 'needs_attention': return t('traveler.schedNeedsReview');"),
   'scheduled reviews must not falsely claim a captured charge');
 const screen=fs.readFileSync(path.join(__dirname,'../app/schedule.tsx'),'utf8');
 const context=fs.readFileSync(path.join(__dirname,'../src/state/RideContext.tsx'),'utf8');
 assert(screen.includes('futurePaymentConsent')&&screen.includes('offSessionPaymentConsent:futurePaymentConsent'));
 assert(context.includes('offSessionPaymentConsent: info.offSessionPaymentConsent === true'));
}
console.log('PASS twice: scheduled card authorization requires stored card, positive consent, late off-session capture-only policy and zero upfront hold');
