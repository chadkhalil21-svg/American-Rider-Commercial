'use strict';
// Reserved Recruiter commission batches -> Stripe Connect transfer -> bank payout.
// Strictly OFF unless the signed founder/finance gates are commissioned.
// A transfer into Stripe is NOT a bank deposit, and an uncertain provider result
// is never blindly retried. Uses the existing authoritative #312 commission ledger.
const {stripeReady}=require('./recruiter-stripe-accounts');
const {recordRecruiterPayoutSubmission,reconcileRecruiterPayout}=require('./recruiter-commission-ledger');
const validId=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{8,128}$/.test(s);
const validAcct=s=>typeof s==='string'&&/^acct_[A-Za-z0-9]{8,}$/.test(s);
const validMoney=n=>Number.isSafeInteger(n)&&n>0;
const deny=reason=>({ok:false,reason});
function transferMatches(t,batch){
 return t?.currency==='usd'&&t?.destination===batch.recipientRef&&
  t?.amount===batch.netCents&&t?.transfer_group==='ar_rec_'+batch.id&&
  t?.metadata?.ar_recruiter_batch===batch.id&&t.reversed!==true&&
  Number(t.amount_reversed||0)===0;
}
function payoutMatches(po,batch){
 return po?.id&&po.currency==='usd'&&po.amount===batch.netCents&&
  po.metadata?.ar_recruiter_batch===batch.id&&
  ['pending','in_transit','paid','failed','canceled'].includes(po.status);
}
async function guard(db,batchId){
 const ref=db.collection('recruiter_commission_payouts').doc(batchId);
 const snap=await ref.get(),p=snap.exists?snap.data():null;
 if(!p||p.provider!=='stripe_connect'||!validAcct(p.recipientRef)||
   !validMoney(p.netCents)||!Number.isSafeInteger(p.feeCents)||
   p.feeCents<0||p.feeCents>200||
   !Number.isSafeInteger(p.amountCents)||p.amountCents!==p.netCents+p.feeCents||
   !['reserved','submitted'].includes(p.status)||!validId(p.uid))
   return deny('ineligible_reserved_payout');
 const [a,ap]=await Promise.all([
   db.collection('recruiter_accounts').doc(p.uid).get(),
   db.collection('recruiter_approvals').doc(p.uid).get(),
 ]);
 if(!a.exists||!ap.exists||a.data().status!=='approved'||
   ap.data().status!=='approved'||ap.data().suspended===true||
   a.data().providerRecipientRef!==p.recipientRef||
   a.data().bankProvider!=='stripe_connect'||
   a.data().connectFeeConsentVersion!==p.feeDisclosureVersion||
   a.data().taxReady!==true||a.data().bankVerified!==true||
   ap.data().payoutEligibilityVerified!==true)return deny('recruiter_verification_or_tax_hold');
 return {ok:true,ref,batch:{...p,id:batchId}};
}
async function immutableAttempt(db,collection,batchId,record){
 const ref=db.collection(collection).doc(batchId);
 return db.runTransaction(async tx=>{
  const snap=await tx.get(ref);
  if(snap.exists){
   const row=snap.data();
   if(row.uid!==record.uid||row.amountCents!==record.amountCents||
       row.connectedAccount!==record.connectedAccount)
    return deny('immutable_provider_attempt_conflict');
   return {ok:true,existing:true,record:row};
  }
  tx.create(ref,{...record,status:'provider_unconfirmed'});
  return {ok:true,existing:false,record};
 });
}
async function confirmTransfer(db,batchId,transfer){
 const ref=db.collection('recruiter_commission_payouts').doc(batchId);
 return db.runTransaction(async tx=>{
  const snap=await tx.get(ref),p=snap.exists?snap.data():null;
  if(!p||!['reserved','submitted'].includes(p.status)||
      p.providerTransferId&&p.providerTransferId!==transfer.id)
   return deny('transfer_ledger_conflict');
  tx.update(ref,{providerTransferId:transfer.id,transferConfirmedAt:Date.now()});
  return {ok:true};
 });
}
async function submitReservedRecruiterPayout({db,stripe,batchId,
  moneyAuthorized=false,legalApproved=false,providerApproved=false,
  now=Date.now()}={}){
 if(!moneyAuthorized||!legalApproved||!providerApproved)return deny('recruiter_money_off');
 if(!db||!stripe?.accounts?.retrieve||!stripe?.transfers?.list||
  !stripe?.transfers?.create||!stripe?.payouts?.list||
  !stripe?.payouts?.create||!stripe?.balance?.retrieve||
  !validId(batchId)||!Number.isSafeInteger(now))return deny('invalid_request');
 const prior=await guard(db,batchId);if(!prior.ok)return prior;
 const batch=prior.batch,conn=batch.recipientRef;
 // Fees correspond to the calendar month of the actual bank payout, not
 // a silently deferred payout months later. Rollover requires re-reservation.
 const actualMonth=new Date(now).toISOString().slice(0,7).replace('-','');
 if(batch.feeMonth!==actualMonth)return deny('payout_month_rollover_requires_review');
 let account;
 try{account=await stripe.accounts.retrieve(conn);}
 catch{return deny('stripe_account_unavailable');}
 if(!stripeReady(account,batch.uid))return deny('stripe_account_not_payable_or_manual_schedule_missing');
 // Exactly one Stripe transfer per batch. If the first API call timed out,
 // look up the provider's immutable transfer_group, never submit a second.
 const group='ar_rec_'+batchId;
 let listed;
 try{listed=await stripe.transfers.list({transfer_group:group,limit:2});}
 catch{return deny('stripe_transfer_reconciliation_unavailable');}
 if(!Array.isArray(listed?.data)||listed.has_more||listed.data.length>1)
  return deny('ambiguous_transfer_review_required');
 let transfer=listed.data[0]||null;
 if(transfer&&!transferMatches(transfer,batch))
  return deny('stripe_transfer_mismatch');
 if(!transfer){
  let sufficient=false;
  try{
   const balance=await stripe.balance.retrieve();
   const dollars=(balance?.available||[]).filter(x=>x.currency==='usd')
     .reduce((sum,x)=>sum+Number(x.amount||0),0);
   sufficient=Number.isSafeInteger(dollars)&&dollars>=batch.netCents;
  }catch{return deny('platform_balance_unavailable');}
  if(!sufficient)return {ok:true,status:'awaiting_platform_funds',bankPaid:false};
 }
 const attempt=await immutableAttempt(db,'recruiter_stripe_transfer_attempts',batchId,{
   uid:batch.uid,amountCents:batch.netCents,connectedAccount:conn,
   createdAt:now,group,
 });
 if(!attempt.ok)return attempt;
 if(!transfer&&attempt.existing)
  return deny('prior_unknown_transfer_requires_reconciliation');
 if(!transfer){
  try{
   transfer=await stripe.transfers.create({
     amount:batch.netCents,currency:'usd',destination:conn,transfer_group:group,
     metadata:{ar_recruiter_batch:batchId,ar_relationship:'recruiter'},
   },{idempotencyKey:group});
  }catch{return deny('stripe_transfer_unconfirmed_no_retry');}
  if(!transferMatches(transfer,batch))return deny('stripe_transfer_confirmation_mismatch');
 }
 const linked=await confirmTransfer(db,batchId,transfer);
 if(!linked.ok)return linked;
 if(batch.status==='submitted')return {ok:true,status:'bank_payout_submitted',transferId:transfer.id};
 // Source transfer can be pending even though Stripe accepted it. Only send
 // a bank payout when the connected balance actually contains available funds.
 let available;
 try{
  const balance=await stripe.balance.retrieve({stripeAccount:conn});
  available=(balance?.available||[]).filter(x=>x.currency==='usd')
    .reduce((sum,x)=>sum+Number(x.amount||0),0);
 }catch{return deny('connected_balance_unavailable');}
 if(!Number.isSafeInteger(available)||available<batch.netCents)
  return {ok:true,status:'awaiting_stripe_funds',transferId:transfer.id};
 // A single scheduled bank payout per batch, with its own immutable attempt.
 // Never send a second payout when the previous result is ambiguous.
 let seen;
 try{seen=await stripe.payouts.list({limit:100},{stripeAccount:conn});}
 catch{return deny('bank_payout_lookup_unavailable');}
 if(!Array.isArray(seen?.data))return deny('bank_payout_lookup_unavailable');
 if(seen.has_more)return deny('bank_payout_history_requires_review');
 const matches=seen.data.filter(po=>po?.metadata?.ar_recruiter_batch===batchId);
 if(matches.length>1)
  return deny('bank_payout_history_requires_review');
 if(matches.length===1&&!payoutMatches(matches[0],batch))
  return deny('bank_payout_mismatch');
 const first=await immutableAttempt(db,'recruiter_stripe_bank_attempts',batchId,{
   uid:batch.uid,amountCents:batch.netCents,connectedAccount:conn,createdAt:now,
 });
 if(!first.ok)return first;
 let payout=matches[0]||null;
 if(!payout&&first.existing)
  return deny('prior_unknown_bank_payout_requires_reconciliation');
 if(!payout){
  try{
   payout=await stripe.payouts.create({
     amount:batch.netCents,currency:'usd',method:'standard',
     metadata:{ar_recruiter_batch:batchId,ar_relationship:'recruiter'},
   },{stripeAccount:conn,idempotencyKey:'ar_rec_bank_'+batchId});
  }catch{return deny('bank_payout_unconfirmed_no_retry');}
  if(!payoutMatches(payout,batch))
   return deny('bank_payout_identity_unconfirmed');
 }
 // Submitted != money in the person's bank. Only a verified payout.paid
 // callback with this exact account and payout ID finalizes the ledger.
 const saved=await recordRecruiterPayoutSubmission({db,batchId,
   proof:{verified:true,providerPaymentId:payout.id,idempotencyKey:batchId},now});
 if(!saved.ok)return deny('bank_submission_requires_reconciliation');
 return {ok:true,status:'submitted_bank_pending',bankPaid:false,
   transferId:transfer.id,payoutId:payout.id,netCents:batch.netCents,feeCents:batch.feeCents};
}
async function handleRecruiterConnectPayoutEvent({db,event,now=Date.now()}={}){
 if(!db||!event||!['payout.paid','payout.failed','payout.canceled'].includes(event.type))
  return deny('not_a_recruiter_payout');
 const po=event.data?.object,account=event.account;
 const batchId=po?.metadata?.ar_recruiter_batch;
 if(!validId(batchId)||!validAcct(account)||typeof po?.id!=='string')
  return {ok:true,ignored:true};
 const snap=await db.collection('recruiter_commission_payouts').doc(batchId).get();
 const p=snap.exists?snap.data():null;
 if(!p||p.provider!=='stripe_connect'||p.recipientRef!==account||
    p.netCents!==po.amount||po.currency!=='usd'||
    p.providerPaymentId!==po.id)
  return deny('unmatched_signed_bank_payout');
 if(event.type==='payout.paid'&&po.status==='paid'){
  return reconcileRecruiterPayout({db,batchId,now,
   proof:{verified:true,status:'paid',providerPaymentId:po.id,eventId:event.id}});
 }
 // On failed/returned bank payout the transfer is still in the connected
 // Stripe balance. Never return the same wallet funds to AVAILABLE yet.
 // Founder exception remains until funds are recovered or safely reissued.
 const ref=db.collection('recruiter_commission_payouts').doc(batchId);
 return db.runTransaction(async tx=>{
  const latest=await tx.get(ref),row=latest.exists?latest.data():null;
  if(!row||row.providerPaymentId!==po.id)return deny('payout_state_changed');
  if(row.bankFailureEventId===event.id)return {ok:true,duplicate:true};
  tx.update(ref,{bankPayoutFailed:true,bankFailureEventId:event.id,
    bankFailureAt:now,bankFailureReason:String(po.failure_code||event.type).slice(0,90),
    bankPayoutReconciliationRequired:true});
  return {ok:true,status:'bank_reconciliation_required',bankPaid:false};
 });
}
// Existing leased Scheduler calls this at most hourly, only after explicit
// finance/provider/legal/funding approval. Indexed due events, never global
// ride scans or an additional timer. Failed attempts back off to avoid toil.
async function sweepReservedRecruiterPayouts({db,stripe,enabled=false,
 now=Date.now(),limit=10}={}){
 if(enabled!==true)return {ok:true,disabled:true};
 if(!db||!stripe||!Number.isSafeInteger(now)||limit<1||limit>20)
   return deny('invalid_sweep_request');
 try{
  const page=await db.collection('recruiter_commission_payouts')
    .where('status','==','reserved')
    .where('nextAttemptAt','<=',now).orderBy('nextAttemptAt')
    .limit(limit).get();
  let processed=0,submitted=0,blocked=0;
  for(const row of page.docs){
    const out=await submitReservedRecruiterPayout({
      db,stripe,batchId:row.id,now,moneyAuthorized:true,
      legalApproved:true,providerApproved:true,
    });
    processed++;
    if(out.status==='submitted_bank_pending'||out.status==='bank_payout_submitted')submitted++;
    if(!out.ok)blocked++;
    // The provider is still pending or requires an exception. Never rerun
    // a transfer/payout within the same provider/network ambiguity window.
    if(out.status!=='submitted_bank_pending'&&out.status!=='bank_payout_submitted'){
      const retryAt=now+(out.ok?60*60_000:24*60*60_000);
      const ref=db.collection('recruiter_commission_payouts').doc(row.id);
      await db.runTransaction(async tx=>{
        const snap=await tx.get(ref),p=snap.exists?snap.data():null;
        if(p?.status!=='reserved'||Number(p.nextAttemptAt||0)>now)return;
        tx.update(ref,{nextAttemptAt:retryAt,
          lastPayoutReviewReason:String(out.reason||out.status||'provider_pending').slice(0,120),
          lastPayoutCheckedAt:now});
      });
    }
  }
  return {ok:true,processed,submitted,blocked};
 }catch{return deny('recruiter_payout_queue_unavailable');}
}

module.exports={transferMatches,payoutMatches,submitReservedRecruiterPayout,
  handleRecruiterConnectPayoutEvent,sweepReservedRecruiterPayouts};
