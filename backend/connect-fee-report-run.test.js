'use strict';
const assert=require('node:assert/strict');
const {REPORT,FOUR_DAYS,verifyWindow,requestFeeReport,checkFeeReport}=require('./connect-fee-report-run');
const now=Date.UTC(2026,9,20);
const start=Math.floor(now/1000)-9*86400,end=start+3*86400;
assert.equal(FOUR_DAYS,345600);
assert.deepEqual(verifyWindow({start,end,now}),{interval_start:start,interval_end:end,currency:'usd'});
assert.throws(()=>verifyWindow({start:1,end:Math.floor(now/1000),now}),/mature interval/);
assert.throws(()=>verifyWindow({start,end:start+33*86400,now}),/mature interval/);
let created=0;
const client={reporting:{reportRuns:{
  create:async ({report_type,parameters})=>{
    created++;assert.equal(report_type,REPORT);assert.equal(parameters.currency,'usd');
    return {id:'frr_Confirmed',report_type:REPORT,livemode:true,status:'pending'};
  },
  retrieve:async id=>({id,report_type:REPORT,livemode:true,status:'succeeded',
    result:{id:'file_Validated'}}),
}}};
(async()=>{
 const a=await requestFeeReport({stripe:client,start,end,now});
 assert.equal(a.runId,'frr_Confirmed');assert.equal(a.ready,false);
 assert.equal(created,1);
 const b=await checkFeeReport({stripe:client,runId:a.runId});
 assert.equal(b.fileId,'file_Validated');assert.equal(b.authoritativeSource,'stripe_reporting_api');
 await assert.rejects(checkFeeReport({stripe:{reporting:{reportRuns:{
  retrieve:async id=>({id,report_type:REPORT,livemode:false,status:'succeeded',
    result:{id:'file_Validated'}})}}},runId:a.runId}),/identity not confirmed/);
 console.log('PASS: no Sigma subscription; authenticated live report identity, 96-hour maturity and fail-closed file metadata');
})().catch(e=>{console.error(e);process.exitCode=1;});
