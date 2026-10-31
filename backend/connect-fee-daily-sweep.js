'use strict';
// One existing leased scheduler, one report/day, provider-confirmed fees only.
// Financial deductions remain separately guarded; this process never calls
// Stripe charges, transfers, account debits or bank payouts.
const {requestFeeReport,checkFeeReport}=require('./connect-fee-report-run');
const {importPayoutFeeReport}=require('./connect-fee-importer');
const DAY=86400000;
function targetWindow(now){
  const day=Math.floor(now/DAY)*DAY;
  const start=day-6*DAY,end=start+DAY;
  return {key:new Date(start).toISOString().slice(0,10),
    start:Math.floor(start/1000),end:Math.floor(end/1000)};
}
async function sweepConnectFeeEvidence({db,stripe,now=Date.now(),
  request=requestFeeReport,check=checkFeeReport,importer=importPayoutFeeReport}={}){
  if(!db?.collection||!stripe?.reporting?.reportRuns)
    return {ok:false,reason:'provider_or_database_unavailable'};
  const w=targetWindow(now);
  const ref=db.collection('connect_fee_report_windows').doc(w.key);
  const snap=await ref.get(),prior=snap.exists?snap.data():null;
  if(prior?.state==='complete')return {ok:true,window:w.key,complete:true,already:true};
  if(prior?.state==='failed')return {ok:false,window:w.key,reason:'provider_report_failed'};
  if(!prior?.runId){
    // The leased scheduler guarantees a single simultaneous worker. A crash
    // between provider creation and storage can only repeat a report request,
    // not duplicate any fee obligation, because the importer is idempotent.
    const result=await request({stripe,start:w.start,end:w.end,now});
    await ref.set({state:'pending',runId:result.runId,
      windowStart:w.start,windowEnd:w.end,createdAt:now},{merge:true});
    return {ok:true,window:w.key,requested:true,ready:result.ready};
  }
  const status=await check({stripe,runId:prior.runId});
  if(status.status==='failed'){
    await ref.set({state:'failed',failedAt:now},{merge:true});
    return {ok:false,window:w.key,reason:'provider_report_failed'};
  }
  if(!status.ready)return {ok:true,window:w.key,pending:true};
  const report=await importer({db,stripe,runId:prior.runId,now});
  if(!report.ok||!report.ready)return {ok:false,window:w.key,reason:'import_not_confirmed'};
  await ref.set({state:'complete',completedAt:now,
    inspected:report.inspected,created:report.created,
    quarantined:report.quarantined},{merge:true});
  return {ok:true,window:w.key,complete:true,created:report.created,
    quarantined:report.quarantined};
}
module.exports={DAY,targetWindow,sweepConnectFeeEvidence};
