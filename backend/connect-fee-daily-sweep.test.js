'use strict';
const assert=require('node:assert/strict');
const {targetWindow,sweepConnectFeeEvidence}=require('./connect-fee-daily-sweep');
const now=Date.UTC(2026,9,31,12);
const w=targetWindow(now);
assert.equal(w.key,'2026-10-25');
assert.equal(w.end-w.start,86400);
class Doc{
 constructor(db,id){this.db=db;this.id=id;}
 async get(){const v=this.db.data.get(this.id);return {exists:!!v,data:()=>v};}
 async set(v,opt){this.db.data.set(this.id,opt?.merge?{...(this.db.data.get(this.id)||{}),...v}:v);}
}
const db={data:new Map(),collection(p){return {doc:k=>new Doc(this,p+'/'+k)}}};
let requests=0,checks=0,imports=0;
const args={db,stripe:{reporting:{reportRuns:{}}},now,
 request:async({start,end})=>{requests++;assert.equal(end-start,86400);return {runId:'frr_Safe',ready:false};},
 check:async()=>{checks++;return checks===1?{ready:false,status:'pending'}:
    {ready:true,status:'succeeded'};},
 importer:async()=>{imports++;return {ok:true,ready:true,inspected:1,created:1,quarantined:0};}};
(async()=>{
 const a=await sweepConnectFeeEvidence(args);assert.equal(a.requested,true);
 const b=await sweepConnectFeeEvidence(args);assert.equal(b.pending,true);
 const c=await sweepConnectFeeEvidence(args);assert.equal(c.complete,true);
 const d=await sweepConnectFeeEvidence(args);assert.equal(d.already,true);
 assert.equal(requests,1);assert.equal(imports,1);
 assert.equal(db.data.get('connect_fee_report_windows/2026-10-25').created,1);
 console.log('PASS one mature fee report per UTC date, pending recovery, one import and no repeated reads after completion');
})().catch(e=>{console.error(e);process.exitCode=1;});
