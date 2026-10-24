'use strict';
// Recruiter financial state machine. Not a payment provider, not mounted in
// public routes, and NEVER issues money. All operations are idempotent, scoped
// to known document IDs and disabled without separately approved terms.
const {evidence}=require('./referral-accrual');
const {validUid}=require('./recruiter-portal');
const {nextRecruiterCandidateAt,residualCloseoutDue}=require('./recruiter-payout-policy');
const validId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{8,128}$/.test(x);
const validMoney=n=>Number.isSafeInteger(n)&&n>=0;
const defaults=()=>({availableCents:0,reservedCents:0,paidCents:0,reversedCents:0,recoveryDueCents:0});
const walletOf=snap=>({...defaults(),...(snap.exists?snap.data():{})});
function walletValid(w){return ['availableCents','reservedCents','paidCents','reversedCents','recoveryDueCents'].every(k=>validMoney(w[k]));}
function state(result,reason){return {ok:false,reason,...result};}

async function releaseCommission({db,eventId,terms,now=Date.now()}={}){
 if(!db||!validId(eventId)||!Number.isSafeInteger(now)||now<=0)return state({},'invalid_request');
 if(terms?.approved!==true||terms?.enabled!==true||
    typeof terms.version!=='string'||!Number.isSafeInteger(terms.holdMs)||
    terms.holdMs<86400000||terms.holdMs>120*86400000)return state({},'terms_not_approved');
 try{return await db.runTransaction(async tx=>{
  const ref=db.collection('referral_reward_events').doc(eventId);
  const snap=await tx.get(ref),e=snap.exists?snap.data():null;
  if(!e)return state({},'reward_not_found');
  if(e.status==='available'||e.status==='reserved'||e.status==='paid')return {ok:true,duplicate:true,status:e.status};
  if(e.status!=='held'||e.programVersion!==terms.version||!validUid(e.inviterUid)||
     !validId(e.travelId)||!['operator','traveler'].includes(e.role)||
     !validMoney(e.amountCents)||e.amountCents===0||
     !Number.isSafeInteger(e.createdAt)||now<e.createdAt+terms.holdMs)
    return state({},'unmatured_or_ineligible');
  const walletRef=db.collection('recruiter_commission_wallets').doc(e.inviterUid);
  const rideRef=db.collection('rides').doc(e.travelId);
  const approvalRef=db.collection('recruiter_approvals').doc(e.inviterUid);
  const [rideSnap,approvalSnap,walletSnap]=await Promise.all([
    tx.get(rideRef),tx.get(approvalRef),tx.get(walletRef)]);
  const ride=rideSnap.exists?rideSnap.data():null;
  const approval=approvalSnap.exists?approvalSnap.data():null;
  if(!evidence(ride,e.travelId)||approval?.status!=='approved'||
     approval.suspended===true||approval.identityVerified!==true||
     approval.agreementAccepted!==true||approval.payoutEligibilityVerified!==true||
     approval.programVersion!==terms.version)
    return state({},'settlement_or_approval_not_verified');
  const w=walletOf(walletSnap);
  if(!walletValid(w)||!Number.isSafeInteger(w.availableCents+e.amountCents))
    return state({},'wallet_requires_review');
  const journalRef=db.collection('recruiter_commission_journal').doc(eventId+'_available');
  const min=terms.minimumCents;
  const candidateRef=Number.isSafeInteger(min)&&min>200&&min<=3000?
    db.collection('recruiter_payout_candidates').doc(e.inviterUid):null;
  // Firestore transactions require all reads before the first staged write.
  const [journalSnap,candidateSnap]=await Promise.all([
    tx.get(journalRef),candidateRef?tx.get(candidateRef):Promise.resolve(null)]);
  if(journalSnap.exists)return state({},'journal_conflict');
  tx.create(journalRef,{kind:'available',rewardEventId:eventId,uid:e.inviterUid,
    amountCents:e.amountCents,createdAt:now});
  const nextAvailable=w.availableCents+e.amountCents;
  tx.set(walletRef,{...w,availableCents:nextAvailable},{merge:true});
  // One known-recipient due document, not a recurring wallet scan:
  // monthly >= $25; otherwise due for 90-day residual closeout.
  // Candidate timing never itself authorizes a bank transfer.
  if(candidateRef){
    const before=candidateSnap?.exists?candidateSnap.data():null;
    const lastEligibleRewardAt=Math.max(e.createdAt,
      Number.isSafeInteger(before?.lastEligibleRewardAt)?before.lastEligibleRewardAt:0);
    let due=nextRecruiterCandidateAt({now:nextAvailable>=min?now:lastEligibleRewardAt,
      grossCents:nextAvailable,minimumCents:min});
    // A scheduled monthly payout that already came due must not be delayed
    // into another month because another commission just matured.
    if(nextAvailable>=min&&Number.isSafeInteger(before?.nextAttemptAt)&&
       before.nextAttemptAt>0&&before.nextAttemptAt<due&&
       before.nextAttemptAt<=now)due=before.nextAttemptAt;
    tx.set(candidateRef,{uid:e.inviterUid,nextAttemptAt:due,
      lastEligibleRewardAt,queuedAt:before?.queuedAt||now,lastError:null},
      {merge:true});
  }
  tx.update(ref,{status:'available',availableAt:now,nextReleaseAt:null});
  return {ok:true,status:'available',amountCents:e.amountCents};
 });}catch{return state({},'release_unavailable');}
}
// Only call from an authenticated handler of verified refund/dispute/chargeback
// evidence. Already-sent money is never silently treated as clawed back.
async function reverseCommission({db,eventId,proof,now=Date.now()}={}){
 if(!db||!validId(eventId)||!Number.isSafeInteger(now)||now<=0||
    proof?.verified!==true||!['refund','dispute','fraud'].includes(proof?.reason)||
    !validId(proof?.eventId))return state({},'unverified_reversal');
 try{return await db.runTransaction(async tx=>{
  const ref=db.collection('referral_reward_events').doc(eventId),snap=await tx.get(ref);
  const e=snap.exists?snap.data():null;
  if(!e||!validUid(e.inviterUid)||!validMoney(e.amountCents)||e.amountCents<=0)
    return state({},'reward_not_found');
  const journalRef=db.collection('recruiter_commission_journal').doc(eventId+'_reversed');
  const prior=await tx.get(journalRef);
  if(prior.exists)return {ok:true,duplicate:true,status:e.status,recoveryRequired:e.requiresRecovery===true};
  if(!['held','available','reserved','paid'].includes(e.status))
    return state({},'unsupported_reward_state');
  let next=e.status,recovery=false;
  if(e.status==='available'){
    const walletRef=db.collection('recruiter_commission_wallets').doc(e.inviterUid);
    const ws=await tx.get(walletRef),w=walletOf(ws);
    if(!walletValid(w)||w.availableCents<e.amountCents||
       !Number.isSafeInteger(w.reversedCents+e.amountCents))
      return state({},'wallet_requires_review');
    tx.set(walletRef,{...w,availableCents:w.availableCents-e.amountCents,
      reversedCents:w.reversedCents+e.amountCents},{merge:true});
    next='reversed';
  }else if(e.status==='held'){next='reversed';}
  else if(e.status==='paid'){
    const walletRef=db.collection('recruiter_commission_wallets').doc(e.inviterUid);
    const ws=await tx.get(walletRef),w=walletOf(ws);
    if(!walletValid(w)||!Number.isSafeInteger(w.recoveryDueCents+e.amountCents))
      return state({},'wallet_requires_review');
    tx.set(walletRef,{...w,recoveryDueCents:w.recoveryDueCents+e.amountCents},{merge:true});
    recovery=true;
  }else{recovery=true;}
  tx.create(journalRef,{kind:recovery?'recovery_required':'reversed',
    rewardEventId:eventId,uid:e.inviterUid,amountCents:e.amountCents,
    reason:proof.reason,providerEventId:proof.eventId,createdAt:now});
  tx.update(ref,{status:next,requiresRecovery:recovery,reversalAt:now,
    reversalProviderEventId:proof.eventId});
  return {ok:true,status:next,recoveryRequired:recovery};
 });}catch{return state({},'reversal_unavailable');}
}
// Reserve exact named commission events, never a whole-collection scan.
// The selected events are moved in the same transaction as the wallet.
async function reserveRecruiterPayout({db,uid,batchId,eventIds,authorization,
  now=Date.now()}={}){
 if(!db||!validUid(uid)||!validId(batchId)||!Number.isSafeInteger(now)||now<=0||
    !Array.isArray(eventIds)||eventIds.length<1||eventIds.length>240||
    eventIds.some(x=>!validId(x))||new Set(eventIds).size!==eventIds.length)
    return state({},'invalid_request');
 if(authorization?.programEnabled!==true||authorization?.providerApproved!==true||
    authorization?.counselApproved!==true||authorization?.scheduleApproved!==true||
    authorization?.provider!=='stripe_connect'||authorization?.activeMonthlyFeeCents!==200||
    !Number.isSafeInteger(authorization?.minimumCents)||authorization.minimumCents<1)
    return state({},'commission_program_not_approved');
 try{return await db.runTransaction(async tx=>{
  const payoutRef=db.collection('recruiter_commission_payouts').doc(batchId);
  const old=await tx.get(payoutRef);
  if(old.exists){const p=old.data();
    return p.uid===uid&&JSON.stringify(p.eventIds)===JSON.stringify(eventIds)?
      {ok:true,duplicate:true,status:p.status,amountCents:p.amountCents}:
      state({},'batch_identity_conflict');}
  const walletRef=db.collection('recruiter_commission_wallets').doc(uid);
  const accountRef=db.collection('recruiter_accounts').doc(uid);
  const candidateRef=db.collection('recruiter_payout_candidates').doc(uid);
  const month=new Date(now).toISOString().slice(0,7).replace('-','');
  const feeRef=db.collection('recruiter_connect_fee_months').doc(uid+'_'+month);
  const userRef=db.collection('users').doc(uid);
  const [ws,acct,feeSnap,userSnap,candidateSnap,...rewardSnaps]=await Promise.all([
    tx.get(walletRef),tx.get(accountRef),tx.get(feeRef),tx.get(userRef),
    tx.get(candidateRef),
    ...eventIds.map(id=>tx.get(db.collection('referral_reward_events').doc(id)))]);
  const a=acct.exists?acct.data():{},w=walletOf(ws);
  const shared=a.payoutMode==='existing_operator_connect';
  if(shared&&(!userSnap.exists||userSnap.data().stripeAccountId!==a.providerRecipientRef))
    return state({},'operator_connected_account_changed');
  if(a.status!=='approved'||a.agreementAccepted!==true||
     a.identityVerified!==true||a.payoutEligibilityVerified!==true||
     a.bankVerified!==true||a.taxReady!==true||
     (!shared&&a.connectFeeConsentVersion!=='recruiter_connect_2026_10_v1')||
     a.bankProvider!=='stripe_connect'||
     a.providerRecipientStatus!=='active'||!/^acct_[A-Za-z0-9]{8,}$/.test(a.providerRecipientRef||'')||
     !walletValid(w))return state({},'recipient_not_verified');
  let amount=0;
  for(let i=0;i<rewardSnaps.length;i++){
    const s=rewardSnaps[i],e=s.exists?s.data():null;
    if(!e||e.inviterUid!==uid||e.status!=='available'||
       e.requiresRecovery===true||!validMoney(e.amountCents)||e.amountCents===0)
      return state({},'ineligible_reward_event');
    amount+=e.amountCents;
    if(!Number.isSafeInteger(amount))return state({},'amount_overflow');
  }
  // Residual payouts below the normal monthly minimum are strictly limited
  // to a due 90-day closeout recorded in this Recruiter's own immutable queue.
  const candidate=candidateSnap.exists?candidateSnap.data():null;
  const closeout=authorization.closeout===true;
  if(closeout&&(!residualCloseoutDue({candidate,now,grossCents:amount,
       minimumCents:authorization.standardMinimumCents})||
       !Number.isSafeInteger(authorization.standardMinimumCents)||
       authorization.standardMinimumCents<=200||
       authorization.minimumCents!==1))
    return state({},'residual_closeout_not_due');
  if(amount<authorization.minimumCents||w.availableCents<amount||
     !Number.isSafeInteger(w.reservedCents+amount))
    return state({},'insufficient_available_commissions');
  const fee=feeSnap.exists?feeSnap.data():null;
  // Charge $2 only in a month in which an actual bank payout can occur.
  // A concurrent reserved first payout prevents a second batch evading
  // or double-paying the fee. No fee while simply enrolled or earning.
  if(fee&&fee.status==='reserved')return state({},'prior_monthly_payout_pending');
  const feeCents=shared||closeout?0:fee?.status==='collected'?0:200;
  if(amount<=feeCents)return state({},'bank_payout_less_than_active_fee');
  const netCents=amount-feeCents;
  if(!Number.isSafeInteger(netCents)||netCents<1)
    return state({},'invalid_net_payout');
  // US Stripe Connect bank payouts generally require at least $1. A 15c
  // final balance remains owed and needs an alternative lawful settlement;
  // never transfer it to a stand-alone Stripe account it cannot pay out.
  // Existing Operators receive commissions in an aggregate existing balance.
  if(!shared&&netCents<100)
    return state({},'bank_provider_minimum_not_met');
  for(let i=0;i<eventIds.length;i++)
    tx.update(db.collection('referral_reward_events').doc(eventIds[i]),
      {status:'reserved',payoutBatchId:batchId});
  tx.create(payoutRef,{uid,eventIds,amountCents:amount,
    grossCents:amount,feeCents,netCents,feeMonth:month,
    feeDisclosureVersion:a.connectFeeConsentVersion,
    provider:'stripe_connect',currency:'usd',
    payoutMode:shared?'existing_operator_connect':'independent_recruiter',
    residualFeeWaived:closeout,recipientRef:a.providerRecipientRef,
    status:'reserved',createdAt:now,
    nextAttemptAt:now,
    // These are commitments, not proof of a connected transfer or bank deposit.
    providerPaymentId:null,providerTransferId:null});
  if(feeCents){
    if(feeSnap.exists)tx.update(feeRef,{status:'reserved',batchId,amountCents:200,updatedAt:now});
    else tx.create(feeRef,{uid,month,status:'reserved',batchId,amountCents:200,
      createdAt:now,version:1});
  }
  tx.set(walletRef,{...w,availableCents:w.availableCents-amount,
    reservedCents:w.reservedCents+amount},{merge:true});
  return {ok:true,status:'reserved',amountCents:amount,grossCents:amount,netCents,feeCents,batchId};
 });}catch{return state({},'reservation_unavailable');}
}
async function recordRecruiterPayoutSubmission({db,batchId,proof,now=Date.now()}={}){
 if(!db||!validId(batchId)||proof?.verified!==true||
    !validId(proof?.providerPaymentId)||proof?.idempotencyKey!==batchId)
    return state({},'unverified_submission');
 try{return await db.runTransaction(async tx=>{
  const ref=db.collection('recruiter_commission_payouts').doc(batchId),s=await tx.get(ref);
  const p=s.exists?s.data():null;
  if(!p)return state({},'batch_not_found');
  if(p.status==='submitted'&&p.providerPaymentId===proof.providerPaymentId)
    return {ok:true,duplicate:true};
  if(p.status!=='reserved'&&
      !(p.payoutMode==='existing_operator_connect'&&p.status==='operator_balance_pending'))
    return state({},'batch_state_conflict');
  tx.update(ref,{status:'submitted',providerPaymentId:proof.providerPaymentId,
    nextAttemptAt:null,submittedAt:now});
  return {ok:true,status:'submitted'};
 });}catch{return state({},'submission_record_unavailable');}
}
async function reconcileRecruiterPayout({db,batchId,proof,now=Date.now()}={}){
 if(!db||!validId(batchId)||proof?.verified!==true||
    !['paid','failed'].includes(proof?.status)||
    !validId(proof?.providerPaymentId)||!validId(proof?.eventId))
   return state({},'unverified_provider_event');
 try{return await db.runTransaction(async tx=>{
  const ref=db.collection('recruiter_commission_payouts').doc(batchId);
  const s=await tx.get(ref),p=s.exists?s.data():null;
  if(!p||!validUid(p.uid)||!Array.isArray(p.eventIds)||
     p.providerPaymentId!==proof.providerPaymentId)return state({},'provider_payment_mismatch');
  if(p.status===proof.status)return {ok:true,duplicate:true,status:p.status};
  // A failed bank deposit returns funds to the Connected Stripe account,
  // not to the American Rider platform. Do NOT release this Recruiter's
  // wallet for a second transfer until authenticated provider evidence
  // confirms an actual reversal back to the platform balance.
  if(p.provider==='stripe_connect'&&proof.status==='failed'&&
     proof.fundsReturnedToPlatform!==true)
    return state({},'bank_return_requires_platform_fund_recovery');
  if(p.status!=='submitted')return state({},'payout_not_submitted');
  const walletRef=db.collection('recruiter_commission_wallets').doc(p.uid);
  const ws=await tx.get(walletRef),w=walletOf(ws);
  const events=await Promise.all(p.eventIds.map(id=>
    tx.get(db.collection('referral_reward_events').doc(id))));
  const feeRef=p.provider==='stripe_connect'
    ?db.collection('recruiter_connect_fee_months').doc(p.uid+'_'+p.feeMonth):null;
  const feeSnap=feeRef?await tx.get(feeRef):null;
  let full=0,restored=0,reversed=0,recoveryDue=0;
  for(let i=0;i<events.length;i++){
    const e=events[i].exists?events[i].data():null;
    if(!e||e.inviterUid!==p.uid||e.payoutBatchId!==batchId||
       e.status!=='reserved'||!validMoney(e.amountCents))
      return state({},'payout_event_conflict');
    full+=e.amountCents;
    if(proof.status==='failed'){
      if(e.requiresRecovery===true)reversed+=e.amountCents;
      else restored+=e.amountCents;
    }else if(e.requiresRecovery===true)recoveryDue+=e.amountCents;
  }
  if(full!==p.amountCents||!walletValid(w)||w.reservedCents<full)
    return state({},'payout_wallet_conflict');
  const updated={...w,reservedCents:w.reservedCents-full};
  if(proof.status==='paid'){
    updated.paidCents+=full;
    updated.recoveryDueCents+=recoveryDue;
  }
  else{updated.availableCents+=restored;updated.reversedCents+=reversed;}
  if(!walletValid(updated))return state({},'wallet_amount_overflow');
  for(let i=0;i<p.eventIds.length;i++){
    const event=events[i].data();
    tx.update(db.collection('referral_reward_events').doc(p.eventIds[i]),
      {status:proof.status==='paid'?'paid':event.requiresRecovery?'reversed':'available',
       payoutReconciledAt:now});
  }
  if(p.provider==='stripe_connect'){
    if(p.feeCents===200){
      if(!feeSnap.exists||feeSnap.data().batchId!==batchId||
         feeSnap.data().status!=='reserved')return state({},'fee_record_conflict');
      tx.update(feeRef,{status:proof.status==='paid'?'collected':'released',
        payoutId:proof.providerPaymentId,reconciledAt:now});
      if(proof.status==='paid'){
        updated.connectFeesPaidCents=Number(w.connectFeesPaidCents||0)+200;
        updated.netPaidCents=Number(w.netPaidCents||0)+p.netCents;
      }
    }else if(proof.status==='paid')
      updated.netPaidCents=Number(w.netPaidCents||0)+p.netCents;
    if(!validMoney(Number(updated.netPaidCents||0))||
       !validMoney(Number(updated.connectFeesPaidCents||0)))
       return state({},'wallet_fee_overflow');
  }
  tx.set(walletRef,updated,{merge:true});
  tx.update(ref,{status:proof.status,providerEventId:proof.eventId,
    reconciledAt:now});
  return {ok:true,status:proof.status,amountCents:full,recoveryRequired:recoveryDue>0||reversed>0};
 });}catch{return state({},'payout_reconciliation_unavailable');}
}
module.exports={releaseCommission,reverseCommission,reserveRecruiterPayout,
  recordRecruiterPayoutSubmission,reconcileRecruiterPayout};