'use strict';
// Card issuer country comes only from an authenticated Stripe card owned by
// this exact Traveler Customer. Billing address or client-supplied country
// is never a substitute. A missing/foreign card must not be called domestic.
const VALID_PM=/^pm_[A-Za-z0-9]+$/;
async function verifiedSelectedCard({stripe,customerId,paymentMethodId}={}){
 if(!VALID_PM.test(String(paymentMethodId||'')) ||
    !/^cus_[A-Za-z0-9]+$/.test(String(customerId||'')) ||
    !stripe?.paymentMethods?.retrieve)
   return {ok:false,reason:'selected_card_identity_invalid'};
 let pm;
 try{pm=await stripe.paymentMethods.retrieve(paymentMethodId);}
 catch{return {ok:false,reason:'selected_card_unavailable'};}
 if(pm?.id!==paymentMethodId||pm.customer!==customerId||pm.type!=='card')
   return {ok:false,reason:'selected_card_not_owned_by_traveler'};
 const issuer=String(pm.card?.country||'').toUpperCase();
 if(!/^[A-Z]{2}$/.test(issuer))
   return {ok:false,reason:'selected_card_issuer_unverified'};
 return {ok:true,paymentMethodId:pm.id,cardCountry:issuer};
}
module.exports={verifiedSelectedCard};
