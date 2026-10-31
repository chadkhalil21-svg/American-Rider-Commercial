'use strict';
const assert=require('node:assert/strict');
const {COLUMNS,previousMonth,reportType,sweepMonthlyConnectFees}=require('./connect-monthly-sweep');
const t=Date.UTC(2026,9,31);
assert.equal(previousMonth(t),'2026-09');
assert.ok(COLUMNS.includes('connected_account_id'));
const type={id:'platform_earnings.connected_accounts.1',
  name:'Platform earnings: Connected accounts',livemode:true};
const store=new Map();
const db={collection:c=>({doc:id=>({
 async get(){const v=store.get(c+'/'+id);return {exists:v!==undefined,data:()=>v};},
 async set(v,{merge}={}){const k=c+'/'+id;store.set(k,merge?{...(store.get(k)||{}),...v}:v);}
})})};
let calls=0,imports=0,checks=0;
const stripe={reporting:{
  reportTypes:{list:async()=>({has_more:false,data:[type]})},
  reportRuns:{create:async ({report_type,parameters})=>{
    calls++;assert.equal(report_type,type.id);
    assert.deepEqual(parameters.columns,COLUMNS);
    return {id:'frr_Monthly',report_type:type.id,livemode:true,status:'pending'};
  },retrieve:async()=>{checks++;return {status:checks>1?'succeeded':'pending'};}}
}};
(async()=>{
 assert.equal(await reportType(stripe),type.id);
 const deps={db,stripe,now:t,importer:async ({startRow})=>{
   imports++;return startRow===0
      ? {ok:true,hasMore:true,nextRow:150,created:150,quarantined:0}
      : {ok:true,hasMore:false,nextRow:151,created:1,quarantined:0};
 }};
 const one=await sweepMonthlyConnectFees(deps);assert.equal(one.requested,true);
 const two=await sweepMonthlyConnectFees(deps);assert.equal(two.pending,true);
 const three=await sweepMonthlyConnectFees(deps);assert.equal(three.nextRow,150);
 const four=await sweepMonthlyConnectFees(deps);assert.equal(four.complete,true);
 const five=await sweepMonthlyConnectFees(deps);assert.equal(five.already,true);
 assert.equal(calls,1);assert.equal(imports,2);
 const unavailable=await reportType({reporting:{reportTypes:{list:async()=>({data:[],has_more:false})}}});
 assert.equal(unavailable,null);
 const early=await sweepMonthlyConnectFees({...deps,now:Date.UTC(2026,9,2)});
 assert.equal(early.reason,'monthly_report_not_mature');
 console.log('PASS: monthly Stripe billing report discovery, seven-day maturity, safe pause, continuation, once-only settlement');
})().catch(e=>{console.error(e);process.exitCode=1;});
