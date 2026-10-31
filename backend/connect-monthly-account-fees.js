'use strict';
// Stripe's Connected Account Platform Earnings report attributes MONTHLY fees
// to an exact connected account. It excludes charges Stripe bills directly
// to that account. We never invent a $2 charge from payout activity alone.
// Only an authenticated *completed* Stripe report run may create an obligation.
const {createHash}=require('node:crypto');
const {parseCsv,cents}=require('./connect-fee-reconciliation');
const {currentConnectFeeConsent}=require('./connect-fee-consent');
const {downloadReportCsv}=require('./connect-fee-report-download');
const MAX_ROWS=200;
function monthBounds(month){
  if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(String(month)))throw Error('bad billing month');
  const [year,mon]=month.split('-').map(Number);
  return {start:Date.UTC(year,mon-1,1),end:Date.UTC(year,mon,1)};
}
function obligationId(accountId,month){
  return createHash('sha256').update('monthly-connect-v1:'+accountId+':'+month).digest('hex');
}
function validatedReport(run,month,now){
  const {start,end}=monthBounds(month);
  if(!/^frr_[A-Za-z0-9]+$/.test(String(run?.id||'')) ||
     !run.livemode||run.status!=='succeeded'||
     !/^file_[A-Za-z0-9]+$/.test(String(run.result?.id||''))||
     !/^platform[._-]earnings[._-]/i.test(String(run.report_type||''))||
     Number(run.parameters?.interval_start)!==start/1000||
     Number(run.parameters?.interval_end)!==end/1000||
     now<end+7*86400000) throw Error('verified mature Stripe platform earnings report required');
  return {start,end,fileId:run.result.id};
}
function accountFeeRow(row){
  const accountId=String(row.connected_account_id||'');
  if(!/^acct_[A-Za-z0-9]+$/.test(accountId) ||
     String(row.currency||'').toLowerCase()!=='usd')return null;
  const value=String(row.connect_monthly_active_account_fee_subtotal_amount||'').trim();
  if(!value)return null;
  let cost;try{cost=Math.abs(cents(value));}catch{return null;}
  // This is a simple fee only, not an aggregate or net processing expense.
  if(cost<=0||cost>200)return null;
  return {accountId,amountCents:cost};
}
async function importMonthlyAccountFees({db,stripe,runId,month,
  now=Date.now(),csv=null,maxRows=MAX_ROWS}={}){
  if(!db?.collection||!db?.runTransaction||!stripe?.reporting?.reportRuns?.retrieve||
     !Number.isSafeInteger(maxRows)||maxRows<1||maxRows>MAX_ROWS)
    throw Error('validated database and Stripe reporting required');
  const run=await stripe.reporting.reportRuns.retrieve(runId);
  if(run.id!==runId)throw Error('Stripe report ID mismatch');
  const {start,end,fileId}=validatedReport(run,month,now);
  const text=csv===null?await downloadReportCsv({stripe,fileId}):csv;
  const rows=parseCsv(text);
  if(rows.length>maxRows)throw Error('paginate Stripe monthly report before import');
  if(!rows.length)return {ok:true,month,created:0,existing:0,quarantined:0};
  if(!Object.prototype.hasOwnProperty.call(rows[0],'connected_account_id') ||
     !Object.prototype.hasOwnProperty.call(rows[0],'connect_monthly_active_account_fee_subtotal_amount'))
    throw Error('report missing connected account monthly fees');
  let created=0,existing=0,quarantined=0;
  const processed=new Set();
  for(const row of rows){
    const fee=accountFeeRow(row);
    if(!fee||processed.has(fee.accountId)){quarantined++;continue;}
    processed.add(fee.accountId);
    const users=await db.collection('users').where('stripeAccountId','==',fee.accountId).limit(2).get();
    if(users.docs.length!==1){quarantined++;continue;}
    const user=users.docs[0],profile=user.data()||{},uid=user.id;
    const consent=profile.stripeFeeConsent;
    const summaryRef=db.collection('operator_months').doc(month).collection('accounts').doc(uid);
    const sumSnap=await summaryRef.get(),summary=sumSnap.exists?sumSnap.data()||{}:{};
    const first=summary.firstPayoutAt;
    if(!currentConnectFeeConsent(consent,now)||!Number.isSafeInteger(first)||
       first<start||first>=end||first<consent.acceptedAt||
       !Number.isSafeInteger(summary.verifiedPayoutCount)||summary.verifiedPayoutCount<1 ||
       summary.payoutSeen!==true){quarantined++;continue;}
    const payoutRef=db.collection('operator_connect_fee_obligations').doc(obligationId(fee.accountId,month));
    const entry={
      uid,accountId:fee.accountId,kind:'monthly_active_account',status:'due',
      currency:'usd',source:'stripe_authenticated_platform_earnings_report',
      providerReportRunId:runId,providerReportType:run.report_type,
      providerFeeConfirmed:true,providerFeePayer:'application',
      pricingOwnerConfirmed:true,feePaidDirectlyByOperator:false,
      billingMonth:month,amountCents:fee.amountCents,recoveredCents:0,
      incurredAt:first,firstPayoutAt:first,nextReviewAt:now,
    };
    const status=await db.runTransaction(async tx=>{
      const snapshot=await tx.get(payoutRef);
      if(snapshot.exists){
        const old=snapshot.data()||{};
        if(old.uid!==uid||old.accountId!==fee.accountId||
           old.amountCents!==entry.amountCents||old.kind!==entry.kind||
           old.billingMonth!==month)
          throw Error('Monthly Stripe fee changed: requires financial reconciliation, never rebill');
        return 'existing';
      }
      tx.create(payoutRef,entry);
      return 'created';
    });
    if(status==='created')created++;else existing++;
  }
  return {ok:true,month,created,existing,quarantined};
}
module.exports={monthBounds,obligationId,validatedReport,accountFeeRow,importMonthlyAccountFees};
