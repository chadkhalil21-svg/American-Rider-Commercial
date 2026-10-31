'use strict';
// Convert Stripe's independently verified, itemised Connect payout fee evidence
// into the existing once-only Operator obligation ledger. Never bill a price-table
// estimate, card processing, another connected account, or an ambiguous aggregate.
const {createHash}=require('node:crypto');
const {parseCsv,cents}=require('./connect-fee-reconciliation');
const {checkFeeReport}=require('./connect-fee-report-run');
const {downloadReportCsv}=require('./connect-fee-report-download');
const {documentIdFor}=require('./operator-payout-event-ledger');
const {currentConnectFeeConsent}=require('./connect-fee-consent');
const MAX_ROWS=150; // bounded rows per existing scheduler tick
function candidate(row){
  if(String(row.suite||'').toLowerCase()!=='connect'&&
     String(row.product||'').toLowerCase()!=='connect')return null;
  if(row.currency?.toLowerCase()!=='usd'||!['balance','v2_balance'].includes(row.settled_via))return null;
  if(row.incurred_by_type&&row.incurred_by_type!=='payout')return null;
  if(!/^po_[A-Za-z0-9]+$/.test(row.incurred_by||''))return null;
  if(!/^txn_[A-Za-z0-9]+$/.test(row.balance_transaction_id||''))return null;
  if(!/^[A-Za-z0-9_]+$/.test(row.fee_transaction_id||''))return null;
  const classification=(row.feature_name+' '+row.fee_description).toLowerCase();
  const kind=/funds? routing/.test(classification)?'funds_routing':
    /payout/.test(classification)?'bank_payout':null;
  if(!kind)return null;
  let amountCents;
  try{amountCents=cents(row.amount)+cents(row.tax);}catch{return null;}
  if(!Number.isSafeInteger(amountCents)||amountCents<=0)return null;
  return {kind,amountCents};
}
function idFor(row){return createHash('sha256').update(
  row.balance_transaction_id+'|'+row.fee_transaction_id+'|'+row.incurred_by).digest('hex');}
async function importPayoutFeeReport({db,stripe,runId,csv:testingCsv=null,now=Date.now(),startRow=0,maxRows=MAX_ROWS}={}){
  if(!db?.collection||!db?.runTransaction||!stripe?.balanceTransactions?.retrieve)
    throw Error('authenticated Stripe and database required');
  if(!Number.isInteger(maxRows)||maxRows<1||maxRows>MAX_ROWS||!Number.isSafeInteger(startRow)||startRow<0)throw Error('invalid report import batch');
  const run=await checkFeeReport({stripe,runId});
  if(!run.ready)return {ok:true,ready:false,status:run.status,created:0};
  const fileCsv=testingCsv===null?await downloadReportCsv({stripe,fileId:run.fileId}):testingCsv;
  const rows=parseCsv(fileCsv);
  if(startRow>rows.length)throw Error('invalid report cursor');
  const batch=rows.slice(startRow,startRow+maxRows);
  let created=0,existing=0,quarantined=0;
  for(const row of batch){
    const item=candidate(row);
    if(!item){quarantined++;continue;}
    const payouts=await db.collection('operator_connect_payouts')
      .where('payoutId','==',row.incurred_by).limit(2).get();
    if(payouts.docs.length!==1){quarantined++;continue;}
    const payout=payouts.docs[0].data();
    if(payout.status!=='paid'||payout.payoutId!==row.incurred_by||
       !/^acct_[A-Za-z0-9]+$/.test(payout.accountId||'')||!payout.uid){
      quarantined++;continue;
    }
    const userSnap=await db.collection('users').doc(payout.uid).get();
    const user=userSnap.exists?userSnap.data():{};
    if(user.stripeAccountId!==payout.accountId||
       !currentConnectFeeConsent(user.stripeFeeConsent,now)||
       user.stripeFeeConsent.acceptedAt>payout.eventAt){
      quarantined++;continue;
    }
    // Payment fees are paid by our platform only when the authenticated
    // PLATFORM balance transaction confirms an exact debit.
    const bt=await stripe.balanceTransactions.retrieve(row.balance_transaction_id);
    if(bt.id!==row.balance_transaction_id||bt.livemode!==true||
       bt.currency!=='usd'||bt.type!=='stripe_fee'||
       !['fee','stripe_fee'].includes(bt.reporting_category)||
       !Number.isSafeInteger(bt.net)||bt.net!==-item.amountCents||
       !Number.isSafeInteger(bt.created)||bt.created*1000<=user.stripeFeeConsent.acceptedAt){
      quarantined++;continue;
    }
    const ref=db.collection('operator_connect_fee_obligations').doc(idFor(row));
    const value={
      uid:payout.uid,accountId:payout.accountId,status:'due',currency:'usd',
      kind:item.kind,source:'stripe_authenticated_balance_transaction',
      providerBalanceTransactionId:bt.id,providerFeeTransactionId:row.fee_transaction_id,
      providerFeeConfirmed:true,providerFeePayer:'application',pricingOwnerConfirmed:true,
      feePaidDirectlyByOperator:false,amountCents:item.amountCents,recoveredCents:0,
      incurredAt:bt.created*1000,reportRunId:runId,payoutId:payout.payoutId,
      nextReviewAt:now
    };
    const result=await db.runTransaction(async tx=>{
      const seen=await tx.get(ref);
      if(seen.exists){
        const old=seen.data();
        if(old.uid!==value.uid||old.accountId!==value.accountId||
           old.amountCents!==value.amountCents||old.providerBalanceTransactionId!==value.providerBalanceTransactionId)
          throw Error('immutable Stripe fee identity conflict');
        return 'existing';
      }
      tx.create(ref,value);
      return 'created';
    });
    if(result==='created')created++;else existing++;
  }
  return {ok:true,ready:true,inspected:batch.length,totalRows:rows.length,
    nextRow:Math.min(rows.length,startRow+batch.length),
    hasMore:startRow+batch.length<rows.length,created,existing,quarantined,
    // Most importantly: do NOT claim monthly account fees were recovered from
    // this payout-only report. Aggregated or invoiced fees remain quarantined.
    monthlyAccountFeesImported:0};
}
module.exports={MAX_ROWS,candidate,idFor,importPayoutFeeReport};
