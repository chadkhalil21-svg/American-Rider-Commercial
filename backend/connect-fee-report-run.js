'use strict';
// Low-cost, Stripe-native All Fees reports, no Sigma subscription required.
// The reporting API returns a completed result file asynchronously.
// The returned file must be fetched through authenticated Stripe access,
// then processed by connect-fee-reconciliation.js. No fees are assessed here.
const REPORT='all_fees.balance_transaction_created.itemized.2';
const FOUR_DAYS=4*24*60*60;
function verifyWindow({start,end,now=Date.now()}){
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end) ||
    start<=0||end<=start||end-start>32*86400 ||
    end>Math.floor(now/1000)-FOUR_DAYS)
    throw Error('Stripe fee report requires a fully mature interval (96-hour delay)');
  return {interval_start:start,interval_end:end,currency:'usd'};
}
async function requestFeeReport({stripe,start,end,now}){
  if(typeof stripe?.reporting?.reportRuns?.create!=='function')
    throw Error('Stripe report client unavailable');
  const parameters={...verifyWindow({start,end,now}),
    // The exact provider fee and its payout origin MUST both be present.
    // Stripe Report Runs supports explicit columns; defaults vary by report.
    columns:['fee_transaction_id','balance_transaction_id','incurred_by',
      'incurred_by_type','fee_description','amount','tax','currency',
      'suite','product','feature_name','settled_via']};
  const run=await stripe.reporting.reportRuns.create({report_type:REPORT,parameters});
  if(!/^frr_[A-Za-z0-9]+$/.test(String(run?.id||''))||
    run.report_type!==REPORT||run.livemode!==true)
    throw Error('Stripe live fee-report creation unconfirmed');
  return {runId:run.id,status:run.status,ready:run.status==='succeeded'};
}
async function checkFeeReport({stripe,runId}){
  if(typeof stripe?.reporting?.reportRuns?.retrieve!=='function'||
    !/^frr_[A-Za-z0-9]+$/.test(String(runId||'')))
    throw Error('Stripe fee report lookup invalid');
  const run=await stripe.reporting.reportRuns.retrieve(runId);
  if(run?.id!==runId||run.report_type!==REPORT||run.livemode!==true)
    throw Error('Stripe fee report identity not confirmed');
  if(run.status==='failed')return {status:'failed',ready:false};
  if(run.status!=='succeeded')return {status:'pending',ready:false};
  if(!/^file_[A-Za-z0-9]+$/.test(String(run.result?.id||'')))
    throw Error('Stripe report file not verified');
  return {status:'succeeded',ready:true,fileId:run.result.id,
    reportRunId:runId,authoritativeSource:'stripe_reporting_api'};
}
module.exports={REPORT,FOUR_DAYS,verifyWindow,requestFeeReport,checkFeeReport};
