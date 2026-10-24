'use strict';
// Recruiter payout rails. These do not assert that a Stripe transfer is a bank
// deposit. Every external API call uses an injected Stripe SDK and explicit
// program/legal authority. Missing proof means no money moves.
const crypto=require('node:crypto');
const {emailOf,validUid}=require('./recruiter-portal');
const validAcct=id=>typeof id==='string'&&/^acct_[A-Za-z0-9]{8,}$/.test(id);
const validEvent=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{8,128}$/.test(id);
const REVIEW='reconciliation_required';
function approved(account,approval,now){
 return account?.status==='approved'&&approval?.status==='approved'&&
   approval.suspended!==true&&account.agreementAccepted===true&&
   approval.agreementAccepted===true&&
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
   tx.update(ref,{identityVerified:true,payoutEligibilityVerified:true,bankVerifiedAt:now});
   tx.update(approvalRef,{identityVerified:true,payoutEligibilityVerified:true,updatedAt:now});
   return true;
  });
  return saved?{ok:true,status:'bank_verified',ready:true}:{ok:false,reason:'authorization_changed'};
 }catch{return {ok:false,reason:'provider_verification_unavailable'};}
}
function matchingTransfer(t,payable,group){
 return t&&typeof t.id==='string'&&t.transfer_group===group&&
 t.destination===payable.stripeRecruiterAccountId&&
 t.amount===payable.amountCents&&t.currency==='usd'&&
 t.metadata?.payableId===payable.id&&t.reversed!==true&&Number(t.amount_reversed||0)===0;
}
async function transferRecruiterCommission({db,stripe,payableId,programEnabled=false,
 legalApproved=false,now=Date.now()}={}){
 if(!launchApproved({programEnabled,legalApproved}))return {ok:false,reason:'program_or_legal_off'};
 if(!db||!stripe?.transfers?.list||!stripe?.transfers?.create||
 !stripe?.accounts?.retrieve||!validEvent(payableId))
  return {ok:false,reason:'invalid_request'};
 const payRef=db.collection('recruiter_payables').doc(payableId);
 const attemptRef=db.collection('recruiter_transfer_attempts').doc(payableId);
 const group='ar_recruiter_'+payableId;
 let state;
 try{
  state=await db.runTransaction(async tx=>{
   const [p,existing]=await Promise.all([tx.get(payRef),tx.get(attemptRef)]);
   if(!p.exists)return {ok:false,reason:'unknown_payable'};
   const payable={...p.data(),id:payableId};
   if(existing.exists){
    const x=existing.data();
    if(x.uid!==payable.recruiterUid||x.amountCents!==payable.amountCents||
       x.accountId!==payable.stripeRecruiterAccountId)
      return {ok:false,reason:'immutable_transfer_conflict'};
    if(payable.status==='transferred_to_provider' &&
       x.state==='provider_transferred' && payable.stripeTransferId===x.transferId)
      return {ok:true,alreadyConfirmed:true,transferId:x.transferId};
    return {ok:true,payable,newAttempt:false};
   }
   if(payable.status!=='available'||!validUid(payable.recruiterUid)||
      !validAcct(payable.stripeRecruiterAccountId)||
      !Number.isSafeInteger(payable.amountCents)||payable.amountCents<=0||
      !Number.isSafeInteger(payable.availableAt)||payable.availableAt>now||
      payable.fundedCents<payable.amountCents||
      payable.refundRiskClear!==true||!validEvent(payable.travelId)||
      payable.refundPending===true||payable.disputePending===true)
    return {ok:false,reason:'not_verified_payable'};
   const [a,ap,r]=await Promise.all([
     tx.get(db.collection('recruiter_accounts').doc(payable.recruiterUid)),
     tx.get(db.collection('recruiter_approvals').doc(payable.recruiterUid)),
     tx.get(db.collection('rides').doc(payable.travelId)),
   ]);
   if(!a.exists||!ap.exists||!r.exists||
      !approved(a.data(),ap.data(),now)||
      a.data().payoutEligibilityVerified!==true||a.data().payoutsFrozen===true||
      a.data().stripeRecruiterAccountId!==payable.stripeRecruiterAccountId||
      ap.data().payoutEligibilityVerified!==true||
      r.data().status!=='completed'||r.data().refunded===true||
      r.data().refundPending===true||r.data().disputed===true||
      r.data().disputePending===true||
      !r.data().transferId||!r.data().settledAt)
     return {ok:false,reason:'eligibility_or_settlement_changed'};
   tx.create(attemptRef,{uid:payable.recruiterUid,amountCents:payable.amountCents,
      accountId:payable.stripeRecruiterAccountId,group,state:'unconfirmed',
      startedAt:now,version:1});
   return {ok:true,payable,newAttempt:true};
  });
 }catch{return {ok:false,reason:'ledger_unavailable'};}
 if(!state.ok)return state;
 if(state.alreadyConfirmed)return {ok:true,status:'transferred_to_provider',
   transferId:state.transferId,bankPaid:false,alreadyTransferred:true};
 const p=state.payable;
 // Confirm the same Stripe hosted account before transferring any platform funds.
 let account;
 try{account=await stripe.accounts.retrieve(p.stripeRecruiterAccountId);}
 catch{return {ok:false,reason:'provider_account_unavailable',unconfirmed:true};}
 if(!stripeReady(account,p.recruiterUid))
  return {ok:false,reason:'provider_account_not_ready',unconfirmed:true};
 let result;
 try{
  const list=await stripe.transfers.list({transfer_group:group,limit:2});
  if(!list||!Array.isArray(list.data)||list.has_more||list.data.length>1)
   return {ok:false,reason:'provider_transfer_ambiguous',unconfirmed:true};
  result=list.data[0]||null;
 }catch{return {ok:false,reason:'provider_transfer_lookup_failed',unconfirmed:true};}
 if(result&&!matchingTransfer(result,p,group))
  return {ok:false,reason:'provider_transfer_mismatch',unconfirmed:true};
 if(!result&&!state.newAttempt)
  return {ok:false,reason:REVIEW,unconfirmed:true};
 if(!result){
  try{
   result=await stripe.transfers.create({
     amount:p.amountCents,currency:'usd',destination:p.stripeRecruiterAccountId,
     transfer_group:group,metadata:{payableId},
   },{idempotencyKey:group});
  }catch{return {ok:false,reason:'transfer_result_unconfirmed',unconfirmed:true};}
  if(!matchingTransfer(result,p,group))
   return {ok:false,reason:'provider_transfer_identity_unconfirmed',unconfirmed:true};
 }
 try{
  const ok=await db.runTransaction(async tx=>{
   const summaryRef=db.collection('recruiter_finance_summaries').doc(p.recruiterUid);
   const journalRef=db.collection('recruiter_commission_journal').doc(payableId+'_provider_transferred');
   const [pay,attempt,acct,summary,journal]=await Promise.all([
    tx.get(payRef),tx.get(attemptRef),
    tx.get(db.collection('recruiter_accounts').doc(p.recruiterUid)),
    tx.get(summaryRef),tx.get(journalRef),
   ]);
   if(!pay.exists||!attempt.exists||!acct.exists||
     pay.data().status!=='available'||pay.data().amountCents!==p.amountCents||
     pay.data().stripeRecruiterAccountId!==p.stripeRecruiterAccountId||
     attempt.data().accountId!==p.stripeRecruiterAccountId||
     acct.data().status!=='approved'||acct.data().payoutsFrozen===true||
     !summary.exists||!Number.isSafeInteger(summary.data().availableCents)||
     summary.data().availableCents<p.amountCents||journal.exists)
      return false;
   tx.update(payRef,{status:'transferred_to_provider',
     stripeTransferId:result.id,providerTransferredAt:Date.now(),
     // Not bank-paid. Stripe's bank payout requires separate reconciliation.
     bankPayoutStatus:'pending_provider_confirmation'});
   tx.update(attemptRef,{state:'provider_transferred',
     transferId:result.id,confirmedAt:Date.now()});
   tx.update(summaryRef,{availableCents:summary.data().availableCents-p.amountCents,
     transferredCents:Number(summary.data().transferredCents||0)+p.amountCents,
     updatedAt:Date.now()});
   tx.create(journalRef,{kind:'transferred_to_provider',eventId:payableId,
     recruiterUid:p.recruiterUid,amountCents:p.amountCents,transferId:result.id,
     createdAt:Date.now(),version:1});
   return true;
  });
  return ok?{ok:true,status:'transferred_to_provider',transferId:result.id,
    bankPaid:false,reconciled:!state.newAttempt}:
   {ok:false,reason:REVIEW,unconfirmed:true};
 }catch{return {ok:false,reason:REVIEW,unconfirmed:true};}
}
module.exports={approved,stripeReady,ensureRecruiterAccount,
 hostedRecruiterOnboarding,verifyRecruiterBank,transferRecruiterCommission,
 matchingTransfer};
