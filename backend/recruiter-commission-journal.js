'use strict';
// Monotonic commission record: HELD from provider-verified Travel -> AVAILABLE
// after a reserve period, or REVERSED. Do not confuse AVAILABLE with bank-paid.
const VALID=/^[A-Za-z0-9_-]{8,128}$/;
const HOLD_MS=96*60*60*1000;
const {validUid}=require('./recruiter-portal');
const {approved}=require('./recruiter-connect-finance');
const acceptableReason=new Set(['refund','dispute','fraud']);
function safeCents(value){return Number.isSafeInteger(value)&&value>=0;}
async function matureCommission({db,eventId,programVersion,now=Date.now(),holdMs=HOLD_MS}={}){
 if(!db||!VALID.test(String(eventId))||!VALID.test(String(programVersion))||
  !Number.isSafeInteger(now)||!Number.isSafeInteger(holdMs)||holdMs<86400000)
  return {ok:false,reason:'invalid_request'};
 try{
  return await db.runTransaction(async tx=>{
   const ev=db.collection('referral_reward_events').doc(eventId);
   const pay=db.collection('recruiter_payables').doc(eventId);
   const journal=db.collection('recruiter_commission_journal').doc(eventId+'_available');
   const [e,p,j]=await Promise.all([tx.get(ev),tx.get(pay),tx.get(journal)]);
   if(j.exists&&p.exists)return {ok:true,alreadyAvailable:true};
   if(!e.exists||p.exists||j.exists)return {ok:false,reason:'event_conflict'};
   const v=e.data()||{};
   if(v.status!=='held'||v.programVersion!==programVersion||
      !VALID.test(v.travelId)||!validUid(v.inviterUid)||
      !safeCents(v.amountCents)||v.amountCents<1||v.amountCents>30||
      !Number.isSafeInteger(v.createdAt)||now<v.createdAt+holdMs)
     return {ok:false,reason:'not_mature_or_not_authorized'};
   const rideRef=db.collection('rides').doc(v.travelId);
   const accountRef=db.collection('recruiter_accounts').doc(v.inviterUid);
   const approvalRef=db.collection('recruiter_approvals').doc(v.inviterUid);
   const summaryRef=db.collection('recruiter_finance_summaries').doc(v.inviterUid);
   const [ride,acct,ap,sum]=await Promise.all([
    tx.get(rideRef),tx.get(accountRef),tx.get(approvalRef),tx.get(summaryRef)]);
   const rr=ride.exists?ride.data():null;
   if(!acct.exists||!ap.exists||!approved(acct.data(),ap.data(),now)||
      acct.data().payoutEligibilityVerified!==true||
      ap.data().payoutEligibilityVerified!==true||
      acct.data().payoutsFrozen===true||
      !/^acct_[A-Za-z0-9]{8,}$/.test(acct.data().stripeRecruiterAccountId||'')||
      !rr||rr.status!=='completed'||rr.refunded===true||
      rr.refundPending===true||rr.disputed===true||
      rr.disputePending===true||rr.payoutReconciliationNeeded===true||
      !rr.paymentIntentId||!rr.transferId||!Number.isFinite(rr.settledAt)||
      now<rr.settledAt+holdMs||
      !safeCents(rr.referralAvailableCents)||
      rr.referralAvailableCents<v.amountCents)
      return {ok:false,reason:'settlement_or_recruiter_not_ready'};
   const prior=sum.exists?sum.data():{};
   if(!safeCents(prior.availableCents??0))return {ok:false,reason:'summary_unavailable'};
   const newAvailable=(prior.availableCents||0)+v.amountCents;
   if(!safeCents(newAvailable))return {ok:false,reason:'summary_overflow'};
   tx.create(pay,{id:eventId,sourceEventId:eventId,travelId:v.travelId,
     recruiterUid:v.inviterUid,role:v.role,programVersion:v.programVersion,
     stripeRecruiterAccountId:acct.data().stripeRecruiterAccountId,
     amountCents:v.amountCents,fundedCents:v.amountCents,
     status:'available',availableAt:now,refundRiskClear:true,
     bankPayoutStatus:'not_sent',createdAt:now});
   tx.create(journal,{id:eventId+'_available',kind:'available',eventId,
     recruiterUid:v.inviterUid,amountCents:v.amountCents,createdAt:now,version:1});
   tx.update(ev,{status:'available',availableAt:now});
   tx.set(summaryRef,{availableCents:newAvailable,updatedAt:now},{merge:true});
   return {ok:true,status:'available',amountCents:v.amountCents};
  });
 }catch{return {ok:false,reason:'journal_unavailable'};}
}
async function reverseCommission({db,eventId,reason,now=Date.now()}={}){
 if(!db||!VALID.test(String(eventId))||!acceptableReason.has(reason)||
   !Number.isSafeInteger(now))return {ok:false,reason:'invalid_request'};
 try{
  return await db.runTransaction(async tx=>{
   const ev=db.collection('referral_reward_events').doc(eventId);
   const payable=db.collection('recruiter_payables').doc(eventId);
   const journal=db.collection('recruiter_commission_journal').doc(eventId+'_reversed');
   const [e,p,j]=await Promise.all([tx.get(ev),tx.get(payable),tx.get(journal)]);
   if(j.exists)return {ok:true,alreadyReversed:true};
   if(!e.exists)return {ok:false,reason:'unknown_event'};
   const v=e.data(),status=p.exists?p.data().status:v.status;
   if(!['held','available','transferred_to_provider'].includes(status))
    return {ok:false,reason:'invalid_status'};
   const summary=db.collection('recruiter_finance_summaries').doc(v.inviterUid);
   const account=db.collection('recruiter_accounts').doc(v.inviterUid);
   const [s,a]=await Promise.all([tx.get(summary),tx.get(account)]);
   const isTransfer=status==='transferred_to_provider',amount=v.amountCents;
   if(!safeCents(amount)||!validUid(v.inviterUid))return {ok:false,reason:'invalid_ledger'};
   if(status==='available'&&(!s.exists||!safeCents(s.data().availableCents)||
      s.data().availableCents<amount))
      return {ok:false,reason:'summary_inconsistent'};
   tx.create(journal,{kind:isTransfer?'recovery_required':'reversed',eventId,
     amountCents:amount,recruiterUid:v.inviterUid,reason,createdAt:now,version:1});
   tx.update(ev,{status:isTransfer?'recovery_required':'reversed',reversalReason:reason,updatedAt:now});
   if(p.exists)tx.update(payable,{status:isTransfer?'recovery_required':'reversed',
     refundRiskClear:false,bankPayoutStatus:isTransfer?'recovery_required':'not_sent',
     reversalReason:reason,updatedAt:now});
   if(status==='available')tx.update(summary,{availableCents:s.data().availableCents-amount,updatedAt:now});
   if(isTransfer&&a.exists)tx.update(account,{payoutsFrozen:true,payoutRecoveryRequiredAt:now});
   return {ok:true,status:isTransfer?'recovery_required':'reversed'};
  });
 }catch{return {ok:false,reason:'reversal_unavailable'};}
}
async function sweepMaturedCommissions({db,programVersion,limit=20,now=Date.now(),enabled=false}={}){
 if(enabled!==true)return {ok:true,disabled:true,processed:0};
 if(!db||!VALID.test(String(programVersion))||!Number.isSafeInteger(limit)||limit<1||limit>50)
  return {ok:false,reason:'invalid_request'};
 try{
  const page=await db.collection('referral_reward_events').where('status','==','held')
    .where('createdAt','<=',now-HOLD_MS).limit(limit).get();
  let available=0,blocked=0;
  for(const row of page.docs||[]){
   const x=await matureCommission({db,eventId:row.id,programVersion,now});
   if(x.ok)available+=x.alreadyAvailable?0:1;else blocked++;
  }
  return {ok:true,processed:(page.docs||[]).length,available,blocked};
 }catch{return {ok:false,reason:'sweep_unavailable'};}
}
module.exports={HOLD_MS,matureCommission,reverseCommission,sweepMaturedCommissions};
