'use strict';
// Stripe Express recruiter-only account and KYC. NEVER used for Operator earnings.
// $2 monthly active payout fee is retained by the platform from recruiter earnings,
// not charged automatically for opening an account.
// Recruiter payout rails. These do not assert that a Stripe transfer is a bank
// deposit. Every external API call uses an injected Stripe SDK and explicit
// program/legal authority. Missing proof means no money moves.
const crypto=require('node:crypto');
const {emailOf,validUid}=require('./recruiter-portal');
const validAcct=id=>typeof id==='string'&&/^acct_[A-Za-z0-9]{8,}$/.test(id);
const validEvent=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{8,128}$/.test(id);
const REVIEW='reconciliation_required';
const FEE_CENTS=200;
const FEE_VERSION='recruiter_connect_2026_10_v1';
const FEE_DISCLOSURE='Stripe Connect administration: A $2.00 fee is deducted from earned recruiter commissions only in a calendar month when a bank payout is made. No $2 fee applies merely for opening an account, signing in, or accumulating unpaid earnings. American Rider covers the standard per-payout processing fee unless separately agreed. No amount is deducted from the Operator Travel Fare share.';
async function acceptRecruiterConnectFee({db,uid,verifiedEmail,accepted,version,now=Date.now()}={}){
 if(!db||!validUid(uid)||!emailOf(verifiedEmail)||accepted!==true||
     version!==FEE_VERSION||!Number.isSafeInteger(now)||now<=0)
   return {ok:false,reason:'fee_consent_required'};
 try{return await db.runTransaction(async tx=>{
   const ar=db.collection('recruiter_accounts').doc(uid);
   const ap=db.collection('recruiter_approvals').doc(uid);
   const [a,p]=await Promise.all([tx.get(ar),tx.get(ap)]);
   if(!a.exists||!p.exists||a.data().status!=='approved'||
     p.data().status!=='approved'||p.data().suspended===true||
     emailOf(a.data().verifiedEmail)!==emailOf(verifiedEmail)||
     a.data().agreementAccepted!==true||p.data().agreementAccepted!==true)
     return {ok:false,reason:'not_authorized'};
   if(a.data().connectFeeConsentVersion===FEE_VERSION&&
      p.data().connectFeeConsentVersion===FEE_VERSION)
      return {ok:true,duplicate:true,version:FEE_VERSION};
   tx.update(ar,{connectFeeConsentVersion:FEE_VERSION,connectFeeConsentAt:now});
   tx.update(ap,{connectFeeConsentVersion:FEE_VERSION,connectFeeConsentAt:now});
   return {ok:true,version:FEE_VERSION};
 });}catch{return {ok:false,reason:'consent_unavailable'};}
}
function approved(account,approval,now){
 return account?.status==='approved'&&approval?.status==='approved'&&
   approval.suspended!==true&&account.agreementAccepted===true&&
   approval.agreementAccepted===true&&
   account.connectFeeConsentVersion===FEE_VERSION&&
   approval.connectFeeConsentVersion===FEE_VERSION&&
   Number.isSafeInteger(approval.agreementAcceptedAt)&&approval.agreementAcceptedAt>0&&
   approval.agreementAcceptedAt<=now;
}
function stripeReady(account,uid){
 return validAcct(account?.id)&&account.metadata?.ar_recruiter_uid===uid&&
   account.type==='express'&&account.payouts_enabled===true&&
   account.details_submitted===true&&account.capabilities?.transfers==='active'&&
   (!Array.isArray(account.requirements?.currently_due)||account.requirements.currently_due.length===0)&&
   (!Array.isArray(account.requirements?.past_due)||account.requirements.past_due.length===0);
}
function launchApproved({programEnabled,legalApproved}){
 return programEnabled===true&&legalApproved===true;
}
async function ensureRecruiterAccount({db,stripe,uid,verifiedEmail,programEnabled=false,legalApproved=false,now=Date.now()}={}){
 const email=emailOf(verifiedEmail);
 if(!launchApproved({programEnabled,legalApproved}))return {ok:false,reason:'program_or_legal_off'};
 if(!db||!stripe?.accounts?.create||!validUid(uid)||!email)
   return {ok:false,reason:'invalid_request'};
 const ref=db.collection('recruiter_accounts').doc(uid),apRef=db.collection('recruiter_approvals').doc(uid);
 let reserved;
 try{
  reserved=await db.runTransaction(async tx=>{
   const [a,b]=await Promise.all([tx.get(ref),tx.get(apRef)]);
   if(!a.exists||!b.exists||emailOf(a.data()?.verifiedEmail)!==email||
      !approved(a.data(),b.data(),now))return {ok:false,reason:'not_authorized'};
   const account=a.data();
   if(validAcct(account.stripeRecruiterAccountId))
     return {ok:true,id:account.stripeRecruiterAccountId,newAttempt:false};
   // A prior attempt with uncertain provider result must be reconciled by
   // account search/support. An old idempotency key is not a safe retry.
   if(account.stripeRecruiterCreateStartedAt)
     return {ok:false,reason:REVIEW};
   tx.update(ref,{stripeRecruiterCreateStartedAt:now});
   return {ok:true,newAttempt:true};
  });
 }catch{return {ok:false,reason:'database_unavailable'};}
 if(!reserved.ok||reserved.id)return reserved;
 const key='ar_recruiter_connect_'+crypto.createHash('sha256').update(uid).digest('hex');
 let provider;
 try{
  provider=await stripe.accounts.create({
   type:'express',country:'US',email,
   capabilities:{transfers:{requested:true}},
   metadata:{ar_recruiter_uid:uid,ar_relationship:'independent_recruiter'},
  },{idempotencyKey:key});
 }catch{return {ok:false,reason:REVIEW};}
 if(!validAcct(provider?.id))return {ok:false,reason:REVIEW};
 try{
  const saved=await db.runTransaction(async tx=>{
   const [a,b]=await Promise.all([tx.get(ref),tx.get(apRef)]);
   if(!a.exists||!b.exists||!approved(a.data(),b.data(),Date.now())||
      emailOf(a.data().verifiedEmail)!==email ||
      !a.data().stripeRecruiterCreateStartedAt)return false;
   if(a.data().stripeRecruiterAccountId&&a.data().stripeRecruiterAccountId!==provider.id)return false;
   tx.update(ref,{stripeRecruiterAccountId:provider.id,stripeRecruiterAccountCreatedAt:Date.now()});
   return true;
  });
  return saved?{ok:true,id:provider.id,created:true}:{ok:false,reason:REVIEW};
 }catch{return {ok:false,reason:REVIEW};}
}
async function hostedRecruiterOnboarding({db,stripe,uid,verifiedEmail,origin='https://americanrider.tech',
  programEnabled=false,legalApproved=false,now=Date.now()}={}){
 if(origin!=='https://americanrider.tech')return {ok:false,reason:'invalid_return_origin'};
 const account=await ensureRecruiterAccount({db,stripe,uid,verifiedEmail,programEnabled,legalApproved,now});
 if(!account.ok)return account;
 try{
  const link=await stripe.accountLinks.create({
   account:account.id,type:'account_onboarding',
   return_url:origin+'/recruitment?connect=returned',
   refresh_url:origin+'/recruitment?connect=refresh',
  });
  if(typeof link?.url!=='string'||!/^https:\/\//.test(link.url))
    return {ok:false,reason:'hosted_link_unavailable'};
  return {ok:true,url:link.url,bankDetailsCollectedBy:'stripe',status:'onboarding'};
 }catch{return {ok:false,reason:'hosted_link_unavailable'};}
}
async function verifyRecruiterBank({db,stripe,uid,verifiedEmail,now=Date.now()}={}){
 if(!db||!stripe?.accounts?.retrieve||!validUid(uid)||!emailOf(verifiedEmail))
   return {ok:false,reason:'invalid_request'};
 const ref=db.collection('recruiter_accounts').doc(uid),approvalRef=db.collection('recruiter_approvals').doc(uid);
 try{
  const profile=await ref.get();
  if(!profile.exists||emailOf(profile.data().verifiedEmail)!==emailOf(verifiedEmail))
   return {ok:false,reason:'not_authorized'};
  if(!validAcct(profile.data().stripeRecruiterAccountId))
   return {ok:true,status:'needs_hosted_onboarding',ready:false};
  const provider=await stripe.accounts.retrieve(profile.data().stripeRecruiterAccountId);
  const ready=stripeReady(provider,uid);
  if(!ready)return {ok:true,status:'provider_verification_pending',ready:false};
  const saved=await db.runTransaction(async tx=>{
   const [a,b]=await Promise.all([tx.get(ref),tx.get(approvalRef)]);
   if(!a.exists||!b.exists||!approved(a.data(),b.data(),now)||
      a.data().stripeRecruiterAccountId!==provider.id||
      emailOf(a.data().verifiedEmail)!==emailOf(verifiedEmail))return false;
   tx.update(ref,{identityVerified:true,payoutEligibilityVerified:true,
     bankVerifiedAt:now,providerRecipientRef:provider.id,providerRecipientStatus:'active',
     bankVerified:true,bankProvider:'stripe_connect'});
   tx.update(approvalRef,{identityVerified:true,payoutEligibilityVerified:true,updatedAt:now});
   return true;
  });
  return saved?{ok:true,status:'bank_verified',ready:true,taxStatus:'separate_verification_required'}:{ok:false,reason:'authorization_changed'};
 }catch{return {ok:false,reason:'provider_verification_unavailable'};}
}

module.exports={FEE_CENTS,FEE_VERSION,FEE_DISCLOSURE,approved,stripeReady,
  acceptRecruiterConnectFee,ensureRecruiterAccount,hostedRecruiterOnboarding,verifyRecruiterBank};
