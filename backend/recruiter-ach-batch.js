'use strict';
// Founder-reviewed recruiting: SOURCE-ONLY ACH batch preview, never a payment.
// No bank APIs, no Stripe, no customer account numbers, and no route imports.
// All balances come from a future authoritative settled commission ledger.
// Calling this function never sends money or creates a payable.
const DEFAULT_MINIMUM_CENTS=2500;
function validPayoutDate(date){
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;
  const parsed=new Date(date+'T12:00:00Z');
  return !Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===date;
}
function planRecruiterAchBatch({
  date,recipients=[],programEnabled=false,providerApproved=false,
  scheduleApproved=false,
  counselApproved=false,availableFundsCents=0,
  minimumCents=DEFAULT_MINIMUM_CENTS,previousBatchIds=[],
}={}){
  const fail=reason=>({ok:false,reason,payments:[],totalCents:0});
  if(programEnabled!==true)return fail('program_off');
  if(providerApproved!==true)return fail('bank_provider_not_approved');
  if(counselApproved!==true)return fail('legal_review_not_complete');
  // Do not encode Friday or any payout cadence before the Founder ratifies it.
  if(scheduleApproved!==true)return fail('payout_schedule_not_approved');
  if(!validPayoutDate(date))return fail('invalid_payout_date');
  if(!Array.isArray(recipients)||!Array.isArray(previousBatchIds)||
     !Number.isSafeInteger(availableFundsCents)||availableFundsCents<0||
     !Number.isSafeInteger(minimumCents)||minimumCents<1)
    return fail('invalid_request');
  const prior=new Set(previousBatchIds),ids=new Set(),payments=[];
  for(const rec of recipients){
    if(!rec||typeof rec.uid!=='string'||!/^[A-Za-z0-9_-]{4,128}$/.test(rec.uid)||
       ids.has(rec.uid)||!Number.isSafeInteger(rec.availableCents)||rec.availableCents<0)
      return fail('invalid_recipient');
    ids.add(rec.uid);
    // A provider token is needed; raw routing and account numbers are forbidden.
    if(rec.availableCents===0)continue;
    if(rec.approvalActive!==true||rec.bankVerified!==true||
       rec.taxReady!==true||rec.underReview===true||
       rec.refundOrDisputeHold===true||rec.settlementVerified!==true||
       typeof rec.providerRecipientRef!=='string'||
       !/^[A-Za-z0-9:_-]{4,128}$/.test(rec.providerRecipientRef))
      continue; // Held earnings remain unpaid and are not lost.
    if(rec.availableCents<minimumCents&&rec.finalSettlementApproved!==true)
      continue; // Carry small earnings forward; no expensive micro-payout.
    const batchId='recruiter-ach-'+date+'-'+rec.uid;
    if(prior.has(batchId))continue; // Existing batch requires bank reconciliation.
    payments.push({batchId,uid:rec.uid,recipientRef:rec.providerRecipientRef,
      cents:rec.availableCents,currency:'usd'});
  }
  const totalCents=payments.reduce((s,p)=>s+p.cents,0);
  if(!Number.isSafeInteger(totalCents)||totalCents>availableFundsCents)
    return fail('commissions_not_fully_funded');
  // Return preview only. An independent authorized bank adapter must reserve
  // funds, atomically record batch IDs, initiate payments exactly once, reconcile
  // accepted/rejected/returned ACH items, and send remittance notices.
  return {ok:true,reason:'preview_only_no_money_sent',
    payments,totalCents,requiresBankExecution:true};
}
module.exports={DEFAULT_MINIMUM_CENTS,planRecruiterAchBatch};
