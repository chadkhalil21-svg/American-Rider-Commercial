'use strict';
// Exactly-one committed Recruiter payout batch, two Stripe stages:
// platform transfer of NET commissions -> connected Express bank payout.
// Hard OFF unless Founder/provider/tax/program approvals are present.
// Never reaches Operator settlement. Provider uncertainty requires reconciliation,
// not a blind second transfer or a second bank payout.
const crypto=require('node:crypto');
const {stripeReady}=require('./recruiter-stripe-accounts');
const {recordRecruiterPayoutSubmission,reconcileRecruiterPayout}=require('./recruiter-commission-ledger');
const validId=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{8,128}$/.test(x);
const validAccount=x=>typeof x==='string'&&/^acct_[a-zA-Z0-9]{8,}$/.test(x);
const GROUP=batch=>'ar_rec_'+crypto.createHash('sha256').update(batch).digest('hex').slice(0,42);
const transferMatches=(x,account,amount,group,batch)=>
  x?.destination===account&&x.amount===amount&&x.currency==='usd'&&
  x.transfer_group===group&&x.metadata?.recruiterBatchId===batch&&
  Number(x.amount_reversed||0)===0;
const payoutMatches=(x,amount,batch)=>
  typeof x?.id==='string'&&/^po_[a-zA-Z0-9]+$/.test(x.id)&&
  x.amount===amount&&x.currency==='usd'&&
  (x.method==='standard'||x.method==null)&&
  x.metadata?.recruiterBatchId===batch;
async function sendRecruiterStripeBatch({db,stripe,batchId,enabled=false,
  providerApproved=false,counselApproved=false,taxApproved=false,now=Date.now()}={}){
 const no=reason=>({ok:false,reason,bankPaid:false});
 if(!enabled||!providerApproved||!counselApproved||!taxApproved)
   return no('recruiter_payments_not_commissioned');
 if(!db||!stripe?.accounts?.retrieve||!stripe?.transfers?.list||
    !stripe?.transfers?.create||!stripe?.payouts?.list||!stripe?.payouts?.create||
    !validId(batchId)||!Number.isSafeInteger(now)||now<=0)
   return no('invalid_request');
 const batchRef=db.collection('recruiter_commission_payouts').doc(batchId);
 const attemptRef=db.collection('recruiter_stripe_bank_attempts').doc(batchId);
 let claim;
 try{
   claim=await db.runTransaction(async tx=>{
     const [b,a]=await Promise.all([tx.get(batchRef),tx.get(attemptRef)]);
     if(!b.exists)return no('unknown_batch');
     const item=b.data();
     if(item.status==='submitted'&&item.providerPaymentId)
       return {ok:true,submitted:true,providerPaymentId:item.providerPaymentId,bankPaid:false};
     if(item.status!=='reserved'||item.provider!=='stripe_connect'||
       !validAccount(item.recipientRef)||!validId(item.uid)||
       !Array.isArray(item.eventIds)||item.eventIds.length===0||
       !Number.isSafeInteger(item.netCents)||item.netCents<=0||
       !Number.isSafeInteger(item.grossCents)||item.grossCents<=item.netCents||
       ![0,200].includes(item.feeCents)||
       item.netCents+item.feeCents!==item.grossCents)
       return no('not_approved_batch');
     const userRef=db.collection('recruiter_accounts').doc(item.uid);
     const approvalRef=db.collection('recruiter_approvals').doc(item.uid);
     const [user,approval]=await Promise.all([tx.get(userRef),tx.get(approvalRef)]);
     if(!user.exists||!approval.exists||
       user.data().status!=='approved'||approval.data().status!=='approved'||
       approval.data().suspended===true||
       user.data().taxReady!==true||user.data().payoutEligibilityVerified!==true||
       approval.data().payoutEligibilityVerified!==true||
       user.data().connectFeeConsentVersion!=='recruiter_connect_2026_10_v1'||
       user.data().providerRecipientRef!==item.recipientRef||
       user.data().payoutsFrozen===true)
       return no('recruiter_eligibility_changed');
     if(!a.exists){
       tx.create(attemptRef,{batchId,uid:item.uid,accountId:item.recipientRef,
         netCents:item.netCents,group:GROUP(batchId),
         transferId:null,bankPayoutId:null,transferAttemptStartedAt:now,
         status:'transfer_unconfirmed',createdAt:now});
       return {ok:true,item,firstTransferAttempt:true};
     }
     const prior=a.data();
     if(prior.accountId!==item.recipientRef||prior.netCents!==item.netCents||
        prior.uid!==item.uid||prior.group!==GROUP(batchId))
       return no('immutable_provider_attempt_conflict');
     return {ok:true,item,attempt:prior,firstTransferAttempt:false};
   });
 }catch{return no('batch_claim_unavailable');}
 if(!claim.ok||claim.submitted)return claim;
 const {item}=claim;
 let account;
 try{account=await stripe.accounts.retrieve(item.recipientRef);}
 catch{return no('provider_account_unavailable');}
 if(!stripeReady(account,item.uid))return no('recruiter_stripe_not_ready');
 const group=GROUP(batchId),opts={stripeAccount:item.recipientRef};
 let transfer;
 try{
   const list=await stripe.transfers.list({transfer_group:group,limit:2});
   if(!Array.isArray(list?.data)||list.has_more||list.data.length>1)
     return no('transfer_provider_ambiguous');
   transfer=list.data[0]||null;
 }catch{return no('transfer_provider_unavailable');}
 if(transfer&&!transferMatches(transfer,item.recipientRef,item.netCents,group,batchId))
   return no('transfer_provider_mismatch');
 if(!transfer&&!claim.firstTransferAttempt)
   return no('transfer_uncertain_review_required');
 if(!transfer){
   try{
     transfer=await stripe.transfers.create({
       amount:item.netCents,currency:'usd',destination:item.recipientRef,
       transfer_group:group,
       metadata:{recruiterBatchId:batchId,relationship:'independent_recruiter'},
     },{idempotencyKey:group});
   }catch{return no('transfer_uncertain_review_required');}
   if(!transferMatches(transfer,item.recipientRef,item.netCents,group,batchId))
     return no('transfer_provider_mismatch');
 }
 try{
   await db.runTransaction(async tx=>{
     const x=await tx.get(attemptRef),b=await tx.get(batchRef);
     if(!x.exists||!b.exists||
        x.data().accountId!==item.recipientRef||
        !['reserved','submitted'].includes(b.data().status))
       throw Error('conflicting attempt');
     tx.update(attemptRef,{transferId:transfer.id,status:'transferred_to_connected'});
     tx.update(batchRef,{providerTransferId:transfer.id,
       bankPayoutStatus:'awaiting_bank_submission'});
   });
 }catch{return no('transfer_saved_status_uncertain');}
 let priorAttempt;
 try{
   priorAttempt=await db.runTransaction(async tx=>{
     const snap=await tx.get(attemptRef),b=await tx.get(batchRef);
     if(!snap.exists||!b.exists||b.data().status!=='reserved'||
        snap.data().transferId!==transfer.id)
       return {ok:false};
     if(snap.data().payoutAttemptStartedAt)
       return {ok:true,alreadyAttempted:true,startedAt:snap.data().payoutAttemptStartedAt};
     tx.update(attemptRef,{payoutAttemptStartedAt:now,status:'bank_payout_unconfirmed'});
     return {ok:true,alreadyAttempted:false,startedAt:now};
   });
 }catch{return no('bank_payout_claim_unavailable');}
 if(!priorAttempt.ok)return no('bank_payout_claim_conflict');
 let payout;
 try{
   const list=await stripe.payouts.list({limit:100,
     created:{gte:Math.max(0,Math.floor(priorAttempt.startedAt/1000)-300)}},opts);
   if(!Array.isArray(list?.data)||list.has_more)
     return no('bank_payout_history_requires_reconciliation');
   const matches=list.data.filter(x=>x.metadata?.recruiterBatchId===batchId);
   if(matches.length>1)return no('duplicate_bank_payout_review_required');
   payout=matches[0]||null;
 }catch{return no('bank_payout_lookup_unavailable');}
 if(payout&&!payoutMatches(payout,item.netCents,batchId))
   return no('bank_payout_provider_mismatch');
 if(!payout&&priorAttempt.alreadyAttempted)
   return no('bank_payout_uncertain_review_required');
 if(!payout){
   try{
     payout=await stripe.payouts.create({
       amount:item.netCents,currency:'usd',method:'standard',
       metadata:{recruiterBatchId:batchId,relationship:'independent_recruiter'},
     },{...opts,idempotencyKey:'ar_rec_bank_'+GROUP(batchId)});
   }catch{return no('bank_payout_uncertain_review_required');}
   if(!payoutMatches(payout,item.netCents,batchId))
     return no('bank_payout_provider_mismatch');
 }
 // Stripe accepted a bank payout, NOT proof of final bank arrival.
 const recorded=await recordRecruiterPayoutSubmission({
   db,batchId,proof:{verified:true,providerPaymentId:payout.id,idempotencyKey:batchId},now});
 if(!recorded.ok)return no('payout_sent_but_ledger_requires_reconciliation');
 try{await attemptRef.set({bankPayoutId:payout.id,status:'bank_submitted',updatedAt:now},{merge:true});}
 catch{return no('payout_sent_but_ledger_requires_reconciliation');}
 return {ok:true,status:'submitted_to_stripe',bankPaid:false,payoutId:payout.id,
   amountCents:item.netCents,feeCents:item.feeCents};
}
async function reconcileRecruiterStripeBankEvent({db,event,now=Date.now()}={}){
 const obj=event?.data?.object||{},batchId=obj.metadata?.recruiterBatchId;
 if(!db||!['payout.paid','payout.failed','payout.canceled'].includes(event?.type)||
    !validId(batchId)||!validAccount(event?.account)||!payoutMatches(obj,obj.amount,batchId))
   return {ok:true,ignored:true};
 const ref=db.collection('recruiter_commission_payouts').doc(batchId);
 const row=await ref.get();
 const item=row.exists?row.data():null;
 if(!item||item.provider!=='stripe_connect'||item.recipientRef!==event.account||
    item.providerPaymentId!==obj.id||item.netCents!==obj.amount)
   return {ok:false,reason:'bank_event_binding_unverified'};
 if(event.type==='payout.paid')
   return reconcileRecruiterPayout({db,batchId,
      proof:{verified:true,status:'paid',providerPaymentId:obj.id,eventId:event.id},now});
 // Stripe can mark paid before a delayed bank return. NEVER restore on-platform
 // commissions while bank funds still sit at the Recruiter's connected account.
 // Any reversal of the original transfer must be verified first.
 try{
   return await db.runTransaction(async tx=>{
     const snap=await tx.get(ref);
     if(!snap.exists||snap.data().providerPaymentId!==obj.id)
       return {ok:false,reason:'bank_event_batch_changed'};
     const state=snap.data().status;
     if(state==='bank_return_review')return {ok:true,duplicate:true};
     if(!['submitted','paid'].includes(state))
       return {ok:false,reason:'bank_return_state_conflict'};
     tx.update(ref,{status:'bank_return_review',bankPayoutStatus:'failed',
       bankReturnEventId:event.id,bankReturnedAt:now,
       needsFundReconciliation:true});
     return {ok:true,bankReturnReview:true,bankPaid:false};
   });
 }catch{return {ok:false,reason:'bank_return_update_unavailable'};}
}
module.exports={sendRecruiterStripeBatch,reconcileRecruiterStripeBankEvent,
  GROUP,transferMatches,payoutMatches};
