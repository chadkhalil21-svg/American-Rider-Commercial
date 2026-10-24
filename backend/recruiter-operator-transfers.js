'use strict';
// Operator Recruiters share the SAME Stripe Express account used for ordinary
// Operator earnings. Transfer commission once; NEVER change their automatic
// payout schedule or create a second bank payout. A transfer is NOT a bank
// deposit. Bank proof requires Stripe's payout-inclusion balance transactions.
// This module is fail-closed until a verified separate, explicit financial gate.
const {recordRecruiterPayoutSubmission,reconcileRecruiterPayout}=require('./recruiter-commission-ledger');
const acct=id=>typeof id==='string'&&/^acct_[A-Za-z0-9]{8,}$/.test(id);
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{8,128}$/.test(x);
const validMoney=n=>Number.isSafeInteger(n)&&n>0;
const deny=reason=>({ok:false,reason});
function transferMatches(t,batch){
 return t?.destination===batch.recipientRef&&t.currency==='usd'&&
  t.amount===batch.netCents&&t.transfer_group==='ar_rec_'+batch.id&&
  t.metadata?.ar_recruiter_batch===batch.id&&t.reversed!==true&&
  Number(t.amount_reversed||0)===0&&
  typeof t.id==='string'&&/^tr_[A-Za-z0-9_]+$/.test(t.id)&&
  typeof t.destination_payment==='string'&&/^py_[A-Za-z0-9_]+$/.test(t.destination_payment);
}
async function operatorBatch(db,batchId){
 const snap=await db.collection('recruiter_commission_payouts').doc(batchId).get();
 const batch=snap.exists?snap.data():null;
 if(!batch||batch.provider!=='stripe_connect'||
    batch.payoutMode!=='existing_operator_connect'||batch.feeCents!==0||
    !acct(batch.recipientRef)||!id(batch.uid)||!validMoney(batch.netCents)||
    batch.netCents!==batch.amountCents||
    !['reserved','operator_balance_pending','submitted','paid'].includes(batch.status))
  return deny('not_operator_recruiter_payout');
 const [u,ar,ap]=await Promise.all([
  db.collection('users').doc(batch.uid).get(),
  db.collection('recruiter_accounts').doc(batch.uid).get(),
  db.collection('recruiter_approvals').doc(batch.uid).get()]);
 const a=ar.exists?ar.data():null,p=ap.exists?ap.data():null;
 if(!u.exists||u.data().stripeAccountId!==batch.recipientRef||
   a?.providerRecipientRef!==batch.recipientRef||a?.payoutMode!=='existing_operator_connect'||
   a?.bankVerified!==true||a?.taxReady!==true||a?.agreementAccepted!==true||
   a?.status!=='approved'||p?.status!=='approved'||p?.suspended===true||
   p?.payoutEligibilityVerified!==true||p?.agreementAccepted!==true)
  return deny('operator_recipient_not_approved');
 return {ok:true,batch:{...batch,id:batchId}};
}
async function submitOperatorReferralTransfer({db,stripe,batchId,
 moneyAuthorized=false,providerApproved=false,
 operatorSharedApproved=false,now=Date.now()}={}){
 if(!moneyAuthorized||!providerApproved||!operatorSharedApproved)
  return deny('operator_recruiter_money_off');
 if(!db||!stripe?.accounts?.retrieve||!stripe?.transfers?.list||
    !stripe?.transfers?.create||!stripe?.balance?.retrieve||!id(batchId)||
    !Number.isSafeInteger(now)||now<=0)return deny('invalid_request');
 const check=await operatorBatch(db,batchId);if(!check.ok)return check;
 const b=check.batch;
 if(b.status==='paid')return {ok:true,status:'paid',duplicate:true};
 let account;
 try{account=await stripe.accounts.retrieve(b.recipientRef);}
 catch{return deny('provider_recipient_unavailable');}
 if(account?.id!==b.recipientRef||account?.type!=='express'||
    account?.country!=='US'||account.metadata?.uid!==b.uid||
    account.payouts_enabled!==true||account.details_submitted!==true||
    account.capabilities?.transfers!=='active'||
    (account.requirements?.currently_due||[]).length>0||
    (account.requirements?.past_due||[]).length>0)
  return deny('operator_connect_identity_or_bank_hold');
 // This path only deposits money into the existing Stripe balance.
 // Stripe's existing Operator payout cadence transfers it to the bank.
 if(b.status==='operator_balance_pending'||b.status==='submitted')
  return {ok:true,status:'awaiting_operator_automatic_bank_payout',bankPaid:false,
    transferId:b.providerTransferId};
 const group='ar_rec_'+batchId;
 let listed;
 try{listed=await stripe.transfers.list({transfer_group:group,limit:2});}
 catch{return deny('stripe_transfer_lookup_unavailable');}
 if(!Array.isArray(listed?.data)||listed.has_more||listed.data.length>1)
  return deny('ambiguous_transfer_requires_review');
 let transfer=listed.data[0]||null;
 if(transfer&&!transferMatches(transfer,b))return deny('provider_transfer_mismatch');
 if(!transfer){
  const balance=await stripe.balance.retrieve().catch(()=>null);
  if(!balance)return deny('platform_balance_unavailable');
  const usd=(balance.available||[]).filter(x=>x.currency==='usd')
   .reduce((sum,x)=>sum+Number(x.amount||0),0);
  if(!Number.isSafeInteger(usd)||usd<b.netCents)
   return {ok:true,status:'awaiting_platform_funds',bankPaid:false};
 }
 const attemptRef=db.collection('recruiter_stripe_transfer_attempts').doc(batchId);
 const claim=await db.runTransaction(async tx=>{
  const previous=await tx.get(attemptRef);
  if(previous.exists){
   const old=previous.data();
   return old.uid===b.uid&&old.connectedAccount===b.recipientRef&&
     old.amountCents===b.netCents?{ok:true,prior:true}:deny('provider_attempt_conflict');
  }
  tx.create(attemptRef,{uid:b.uid,connectedAccount:b.recipientRef,
   amountCents:b.netCents,group,createdAt:now,status:'provider_unconfirmed'});
  return {ok:true,prior:false};
 });
 if(!claim.ok)return claim;
 if(!transfer&&claim.prior)return deny('prior_uncertain_transfer_needs_reconciliation');
 if(!transfer){
  try{transfer=await stripe.transfers.create({
   amount:b.netCents,currency:'usd',destination:b.recipientRef,
   transfer_group:group,
   metadata:{ar_recruiter_batch:batchId,ar_relationship:'operator_referrer'},
  },{idempotencyKey:group});}
  catch{return deny('provider_transfer_unknown_no_duplicate_retry');}
  if(!transferMatches(transfer,b))return deny('provider_transfer_confirmation_mismatch');
 }
 return db.runTransaction(async tx=>{
  const ref=db.collection('recruiter_commission_payouts').doc(batchId);
  const latest=await tx.get(ref),p=latest.exists?latest.data():null;
  if(!p||p.uid!==b.uid||p.recipientRef!==b.recipientRef||
     !['reserved','operator_balance_pending'].includes(p.status)||
     (p.providerTransferId&&p.providerTransferId!==transfer.id))
   return deny('ledger_transfer_conflict');
  tx.update(ref,{status:'operator_balance_pending',providerTransferId:transfer.id,
   operatorDestinationPaymentId:transfer.destination_payment,
   transferConfirmedAt:now,nextAttemptAt:null,bankPaid:false});
  return {ok:true,status:'awaiting_operator_automatic_bank_payout',bankPaid:false,
   transferId:transfer.id,netCents:b.netCents,feeCents:0};
 });
}
// Stripe's payout.paid concerns an aggregate bank payout. It never proves
// a specific commission paid unless the connected-account balance transaction
// for that EXACT Transfer.destination_payment is included in the payout.
// This function DOES NOT make payouts, fetch bank numbers, or change cadence.
async function reconcileOperatorReferralBankPayout({db,stripe,event,
 enabled=false,now=Date.now(),limit=20}={}){
 if(enabled!==true)return {ok:true,disabled:true};
 const po=event?.data?.object,connected=event?.account;
 if(!db||!stripe?.balanceTransactions?.list||!acct(connected)||
   !id(event?.id)||!po?.id||!/^po_[A-Za-z0-9_]+$/.test(po.id)||
   !['payout.paid','payout.reconciliation_completed'].includes(event.type)||
   po.status!=='paid'||po.automatic!==true||
   po.currency!=='usd'||limit<1||limit>20)
  return deny('not_verified_automatic_bank_payout');
 if(po.reconciliation_status!=='completed')return deny('automatic_payout_reconciliation_pending');
 let page;
 try{page=await db.collection('recruiter_commission_payouts')
   .where('recipientRef','==',connected)
   .where('status','==','operator_balance_pending').limit(limit).get();}
 catch{return deny('operator_pending_ledger_unavailable');}
 if(!page.docs?.length)return {ok:true,matched:0,bankPaid:false};
 // Bounded payout history. If it exceeds this limit, defer to independent
 // reconciliation rather than declaring a bank payment from incomplete proof.
 const included=new Map();
 let after,completed=false;
 for(let i=0;i<5;i++){
  let r;
  try{r=await stripe.balanceTransactions.list(
    {payout:po.id,limit:100,...(after?{starting_after:after}:{})},
    {stripeAccount:connected});}
  catch{return deny('connected_payout_reconciliation_unavailable');}
  if(!Array.isArray(r?.data))return deny('unverifiable_payout_transactions');
  for(const t of r.data){
   if(t.currency==='usd'&&t.net>0&&typeof t.source==='string')
    included.set(t.source,(included.get(t.source)||0)+t.net);
  }
  if(!r.has_more){completed=true;break;}
  if(!r.data.length)return deny('payout_history_pagination_inconsistent');
  after=r.data[r.data.length-1].id;
 }
 if(!completed)return deny('payout_history_requires_bounded_review');
 let matched=0;
 for(const doc of page.docs){
  const p=doc.data();
  if(!id(p.uid)||!p.operatorDestinationPaymentId||
     (included.get(p.operatorDestinationPaymentId)||0)<p.netCents)continue;
  const check=await operatorBatch(db,doc.id);
  if(!check.ok)continue;
  // No separate Stripe payout is created. Use existing ledger's two-stage
  // idempotent provider proof to finalize only this exact included commission.
  const submitted=await recordRecruiterPayoutSubmission({db,batchId:doc.id,
   proof:{verified:true,providerPaymentId:po.id,idempotencyKey:doc.id},now});
  if(!submitted.ok)return submitted;
  const confirmed=await reconcileRecruiterPayout({db,batchId:doc.id,
   proof:{verified:true,status:'paid',providerPaymentId:po.id,eventId:event.id},now});
  if(!confirmed.ok)return confirmed;
  matched++;
 }
 return {ok:true,status:'operator_automatic_payout_reconciled',matched,bankPaid:matched>0};
}
// Automatic payout failure notifications can arrive after earlier successful
// notifications. Keep the earned commission ledger frozen for reconciliation;
// never reclaim unrelated 99%-of-Fare Operator earnings.
async function flagOperatorAutomaticBankReturn({db,event,enabled=false,now=Date.now()}={}){
 if(enabled!==true)return {ok:true,disabled:true};
 const po=event?.data?.object,connected=event?.account;
 if(!db||!acct(connected)||!po?.id||
   !['payout.failed','payout.canceled'].includes(event?.type)||
   !id(event?.id))return deny('unverified_operator_bank_failure');
 let page;
 try{page=await db.collection('recruiter_commission_payouts')
   .where('recipientRef','==',connected)
   .where('providerPaymentId','==',po.id).limit(20).get();}
 catch{return deny('operator_bank_return_lookup_unavailable');}
 let flagged=0;
 for(const doc of page.docs||[]){
  const current=doc.data();
  if(current.payoutMode!=='existing_operator_connect'||current.providerPaymentId!==po.id)
   continue;
  const ref=db.collection('recruiter_commission_payouts').doc(doc.id);
  const result=await db.runTransaction(async tx=>{
   const snap=await tx.get(ref),p=snap.exists?snap.data():null;
   if(!p||p.recipientRef!==connected||p.providerPaymentId!==po.id)
    return deny('bank_return_identity_changed');
   if(p.bankFailureEventId===event.id)return {ok:true,duplicate:true};
   tx.update(ref,{bankPayoutFailed:true,bankPayoutReconciliationRequired:true,
    bankFailureEventId:event.id,bankFailureAt:now,
    bankFailureReason:String(po.failure_code||event.type).slice(0,100)});
   return {ok:true};
  });
  if(!result.ok)return result;
  flagged++;
 }
 return {ok:true,status:'operator_bank_return_requires_review',flagged};
}
module.exports={transferMatches,submitOperatorReferralTransfer,
 reconcileOperatorReferralBankPayout,flagOperatorAutomaticBankReturn};
