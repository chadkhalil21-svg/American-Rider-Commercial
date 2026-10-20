'use strict';
const assert=require('node:assert/strict');
const {recordOperatorPayoutEvent,decodePayoutEvent,listDueFeeObligations}=require('./operator-payout-event-ledger');
const {FEE_CONSENT_VERSION}=require('./connect-fee-consent');
class DB {
  constructor(){this.store=new Map();this.reads=0;this.writes=0;}
  collection(name){return new Col(this,name);}
  async runTransaction(fn){return fn({
    get:async ref=>ref.get(),set:(ref,data,opts)=>ref.set(data,opts)
  });}
}
class Col{
  constructor(db,path){this.db=db;this.path=path;this.filters=[];this.max=Infinity;this.start=null;this.sort=null;}
  doc(id){return new Doc(this.db,this.path+'/'+id,id);}
  where(field,op,value){if(op!=='=='&&op!=='<=')throw Error('invalid filter');this.filters.push({field,op,value});return this;}
  limit(n){this.max=n;return this;}
  orderBy(field){this.sort=field;return this;}
  startAfter(cursor){this.start=cursor.path;return this;}
  async get(){
    this.db.reads++;
    let rows=[...this.db.store.entries()].filter(([k])=>k.startsWith(this.path+'/')&&
      k.slice(this.path.length+1).indexOf('/')===-1).map(([path,data])=>
      ({id:path.slice(this.path.length+1),path,data:()=>data}));
    for(const f of this.filters) rows=rows.filter(d=>f.op==='=='?d.data()[f.field]===f.value:d.data()[f.field]<=f.value);
    if(this.sort) rows.sort((a,b)=>(a.data()[this.sort]-b.data()[this.sort])||a.path.localeCompare(b.path));
    if(this.start) rows=rows.slice(rows.findIndex(d=>d.path===this.start)+1);
    return {docs:rows.slice(0,this.max),size:Math.min(rows.length,this.max)};
  }
}
class Doc{
  constructor(db,path,id){this.db=db;this.path=path;this.id=id;}
  collection(name){return new Col(this.db,this.path+'/'+name);}
  async get(){this.db.reads++;const x=this.db.store.get(this.path);return {exists:!!x,id:this.id,data:()=>x};}
  set(data,options={}){this.db.writes++;this.db.store.set(this.path,
    options.merge?{...(this.db.store.get(this.path)||{}),...data}:data);}
}
const t=Date.UTC(2026,9,20)/1000;
function event(id,type='payout.paid',seconds=t,amount=10000){
  return {id:'evt_'+id+'_'+seconds,type,created:seconds,account:'acct_One',
    data:{object:{id:'po_'+id,object:'payout',created:t,amount,currency:'usd',
      method:'standard',status:type==='payout.paid'?'paid':'failed'}}};
}
(async()=>{
  const db=new DB();
  const u=db.collection('users').doc('op_1');
  u.set({stripeAccountId:'acct_One',stripeFeeConsent:{
    version:FEE_CONSENT_VERSION,approvedSeparatelyBilledFees:true,
    accountMonthlyUsd:2,acceptedAt:(t-1000)*1000}});
  const first=await recordOperatorPayoutEvent({db,event:event('first')});
  assert.equal(first.count,1);
  assert.equal(first.activityOnly,true);
  let month=await db.collection('operator_months').doc('2026-10').collection('accounts').doc('op_1').get();
  assert.equal(month.data().verifiedPayoutCount,1);
  assert.equal(month.data().feeAssessmentState,'awaiting_provider_fee_evidence');
  const count=db.writes;
  const dup=await recordOperatorPayoutEvent({db,event:event('first')});
  assert.equal(dup.duplicate,true);
  assert.equal(db.writes,count,'repeat event must cost ZERO writes');
  const second=await recordOperatorPayoutEvent({db,event:event('second','payout.paid',t+1)});
  assert.equal(second.count,2);
  const failed=await recordOperatorPayoutEvent({db,event:event('first','payout.failed',t+2)});
  assert.equal(failed.count,1,'one active payout still exists');
  const stale=await recordOperatorPayoutEvent({db,event:event('first')});
  assert.equal(stale.stale,true);
  const failedOther=await recordOperatorPayoutEvent({db,event:event('second','payout.failed',t+3)});
  assert.equal(failedOther.count,0);
  month=await db.collection('operator_months').doc('2026-10').collection('accounts').doc('op_1').get();
  assert.equal(month.data().payoutSeen,false);
  assert.equal(month.data().feeAssessmentState,'no_paid_payout');
  const writes=db.writes;
  await assert.rejects(recordOperatorPayoutEvent({db,event:{
    ...event('broken'),account:undefined
  }}),/missing connected/);
  assert.equal(db.writes,writes,'invalid account must not write');
  const notUs=await recordOperatorPayoutEvent({db,event:{...event('foreign'),account:'acct_Another'}});
  assert.equal(notUs.ignored,true);
  assert.throws(()=>decodePayoutEvent({...event('wrong'),data:{object:{...event('wrong').data.object,currency:'eur'}}}),/invalid USD/);
  for(let i=0;i<230;i++){
    db.collection('operator_connect_fee_obligations').doc('ob_'+String(i).padStart(4,'0')).set({
      status:i<181?'due':'paid',nextReviewAt:1000+i,amountCents:200});
  }
  const countBefore=db.writes;
  const result=await listDueFeeObligations({db,now:Date.now(),pageSize:80,maxPages:2});
  assert.equal(result.scanned,160);
  assert.equal(result.morePossible,true);
  assert.equal(result.due.length,160);
  assert.equal(result.collectionEnabled,false);
  assert.equal(db.writes,countBefore,'query is read-only');
  assert.equal(result.due.every(d=>d.amountCents===200),true);
  const small=await listDueFeeObligations({db,now:Date.now(),pageSize:80,maxPages:1});
  assert.equal(small.scanned,80);
  console.log('PASS: distinct Stripe payout activity; bank failure reverses month; duplicate skips writes; bounded indexed due queue; no money movement');
})().catch(e=>{console.error(e);process.exitCode=1;});
