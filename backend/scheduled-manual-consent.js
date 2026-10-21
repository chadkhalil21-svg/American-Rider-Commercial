'use strict';
// A future reservation is consent to request authorization near dispatch, not a
// multi-day hold. This policy is a server gate, never a client payment assertion.
function assessScheduledManualConsent({manualMode=false,consent=false,hasSavedCard=false}={}){
  if(!manualMode)return {ok:true};
  if(consent!==true)return {ok:false,code:'scheduled_payment_consent_required'};
  if(hasSavedCard!==true)return {ok:false,code:'scheduled_saved_card_required'};
  return {ok:true};
}
module.exports={assessScheduledManualConsent};
