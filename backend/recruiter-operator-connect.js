'use strict';
// Existing Operators MUST retain one Stripe account and the established
// Operator bank-payout schedule. This is read-only verification, never approval
// to submit referral money or proof a bank has received a commission.
const validAcct=s=>typeof s==='string'&&/^acct_[A-Za-z0-9]{8,}$/.test(s);
const {emailOf,validUid}=require('./recruiter-portal');
const deny=reason=>({applicable:true,ok:false,ready:false,reason});
async function inspectExistingOperatorRecruiterConnect({
 db,stripe,uid,verifiedEmail,account,now=Date.now(),
}={}){
 if(!db||!stripe?.accounts?.retrieve||!validUid(uid)||
    !emailOf(verifiedEmail)||!Number.isSafeInteger(now)||now<=0)
   return {applicable:false,ok:false,reason:'invalid_request'};
 let user;
 try{user=await db.collection('users').doc(uid).get();}
 catch{return {applicable:false,ok:false,reason:'operator_account_lookup_unavailable'};}
 const id=user.exists?user.data()?.stripeAccountId:null;
 if(id===undefined||id===null||id==='')return {applicable:false};
 if(!validAcct(id))return deny('operator_account_id_requires_review');
 if(!account||account.status!=='approved'||
    emailOf(account.verifiedEmail)!==emailOf(verifiedEmail)||
    account.agreementAccepted!==true)
   return deny('recruiter_agreement_required');
 if(validAcct(account.stripeRecruiterAccountId))
   return deny('multiple_connected_accounts_require_reconciliation');
 let approval;
 try{approval=await db.collection('recruiter_approvals').doc(uid).get();}
 catch{return deny('approval_lookup_unavailable');}
 const a=approval.exists?approval.data():null;
 if(!a||a.status!=='approved'||a.suspended===true||
   a.agreementAccepted!==true||!Number.isSafeInteger(a.agreementAcceptedAt)||
   a.agreementAcceptedAt<=0||a.agreementAcceptedAt>now||
   !Number.isSafeInteger(a.expiresAt)||a.expiresAt<=now)
  return deny('recruiter_approval_required');
 let provider;
 try{provider=await stripe.accounts.retrieve(id);}
 catch{return deny('operator_stripe_unavailable');}
 if(provider?.id!==id||provider?.metadata?.uid!==uid||
   provider.type!=='express'||provider.country!=='US')
   return deny('operator_stripe_identity_mismatch');
 if(provider.details_submitted!==true||provider.payouts_enabled!==true||
    provider.capabilities?.transfers!=='active'||
    (Array.isArray(provider.requirements?.currently_due)&&provider.requirements.currently_due.length>0)||
    (Array.isArray(provider.requirements?.past_due)&&provider.requirements.past_due.length>0))
   return deny('operator_stripe_onboarding_incomplete');
 return {applicable:true,ok:true,existingOperatorConnect:true,
   status:'existing_operator_bank_verified',bankVerified:true,
   ready:false, // Referral transfer/ledger and taxation remain separate gates.
   commissionsEnabled:false,requiresSeparateAccount:false,
   taxStatus:'separate_verification_required',
   payoutRoutingStatus:'requires_single_account_commission_settlement',
 };
}
module.exports={inspectExistingOperatorRecruiterConnect};
