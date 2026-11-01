'use strict';
// Security-critical preflight for a future card-first native checkout.
// Never trust cardCountry, card BIN or paymentMethodId offered by a device
// without independently retrieving the exact Stripe object and its owner.
// Read-only: NO charge, SetupIntent, authorization, recipient, or payout.
const PM_RE=/^pm_[A-Za-z0-9]{6,}$/;
const CUS_RE=/^cus_[A-Za-z0-9]{6,}$/;
function selectedCardMatch({paymentMethod,customerId,paymentMethodId}={}){
 if(!CUS_RE.test(String(customerId||''))||!PM_RE.test(String(paymentMethodId||''))||
  !paymentMethod||paymentMethod.id!==paymentMethodId||
  paymentMethod.customer!==customerId||paymentMethod.type!=='card')
  return {ok:false,reason:'selected_card_ownership_unverified'};
 const issuer=String(paymentMethod.card?.country||'').toUpperCase();
 if(!/^[A-Z]{2}$/.test(issuer))return {ok:false,reason:'selected_card_issuer_unavailable'};
 return {ok:true,paymentMethodId,country:issuer,domestic:issuer==='US'};
}
async function verifySelectedCard({stripe,customerId,paymentMethodId}={}){
 if(!stripe?.paymentMethods?.retrieve||!CUS_RE.test(String(customerId||''))||
    !PM_RE.test(String(paymentMethodId||'')))
  return {ok:false,reason:'selected_card_input_invalid'};
 let pm;
 try{pm=await stripe.paymentMethods.retrieve(paymentMethodId);}
 catch{return {ok:false,reason:'selected_card_stripe_unavailable'};}
 return selectedCardMatch({paymentMethod:pm,customerId,paymentMethodId});
}
function exactChargedCardMatch({intent,paymentMethodId,country}={}){
 if(!PM_RE.test(String(paymentMethodId||''))||
  !/^[A-Z]{2}$/.test(String(country||'')))return false;
 const p=intent?.payment_method;
 const paidId=typeof p==='string'?p:p?.id;
 const charge=intent?.latest_charge;
 const details=charge&&typeof charge==='object'?charge.payment_method_details:null;
 const actualCountry=details?.type==='card'?details?.card?.country:null;
 return paidId===paymentMethodId&&actualCountry===country&&
  ['requires_capture','succeeded'].includes(intent?.status);
}
module.exports={verifySelectedCard,selectedCardMatch,exactChargedCardMatch};
