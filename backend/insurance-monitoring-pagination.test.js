'use strict';
const assert=require('node:assert/strict');
const { sweepInsuranceMonitoring }=require('./insurance-monitoring');

const DAY=24*3600*1000,NOW=Date.parse('2026-10-10T18:00:00Z');
const operators = Array.from({length:620},(_,i)=>({
 id:'op'+String(i).padStart(4,'0'),
 data:{legalName:'Sample Operator',email:'sample@example.test',
   insuranceMonitoring:{
     status:'verified_active',lastVerifiedAt:NOW-57*DAY,
     nextVerificationDueAt:NOW+2*DAY,verificationRequestCount:0,
     contact:{email:'verified@example.test',type:'broker'},
     policyNumber:'POL'+i,
   },
 },
}));
const cursors=new Map();
const db={
 collection(name) {
  if(name==='insurance_monitor_cursor') return {
   doc(id){return{
    get:async()=>({exists:cursors.has(id),data:()=>cursors.get(id)}),
    set:async value=>{cursors.set(id,value)},
   }},
  };
  assert.equal(name,'users');
  return {
   where(field,op,value) {
    assert.equal(field,'insuranceMonitoring.nextVerificationDueAt');
    assert.equal(op,'<=');
    const query={
      _cutoff:value,_lastDue:null,_lastId:null,_size:null,_sort:[],
      orderBy(key){this._sort.push(key);return this;},
      startAfter(due,id){this._lastDue=due;this._lastId=id;return this;},
      limit(n){this._size=n;return this;},
      async get(){
        assert.deepEqual(this._sort,['insuranceMonitoring.nextVerificationDueAt','__name__']);
        const subset=operators.filter(o=>o.data.insuranceMonitoring.nextVerificationDueAt<=this._cutoff)
          .sort((a,b)=>
            a.data.insuranceMonitoring.nextVerificationDueAt-b.data.insuranceMonitoring.nextVerificationDueAt||
            a.id.localeCompare(b.id))
          .filter(o=>this._lastId===null ||
            o.data.insuranceMonitoring.nextVerificationDueAt>this._lastDue ||
            (o.data.insuranceMonitoring.nextVerificationDueAt===this._lastDue && o.id>this._lastId))
          .slice(0,this._size);
        return {docs:subset.map(o=>({id:o.id,data:()=>o.data}))};
      },
    };
    return query;
   }
  };
 },
};
const requested=[];
(async()=>{
  for(let i=0;i<3;i++) {
    const report=await sweepInsuranceMonitoring({
      db, now:NOW+i,limit:250,
      requestConfirmation:async({uid})=>{
        requested.push(uid);
        operators.find(o=>o.id===uid).data.insuranceMonitoring.verificationRequestedAt=NOW+i;
        return {ok:true};
      },
      notify:async()=>{},
    });
    assert.equal(report.ok,true,JSON.stringify(report.failed));
  }
  assert.equal(requested.length,620,'all 620 eligible Operators considered without endlessly re-reading oldest 250');
  assert.equal(new Set(requested).size,620,'no starvation or repeat before cursor cycle');
  assert.ok(cursors.get('v1').lastUserId);
  // Force the page to wrap; recent requests suppress duplicate email sends.
  const wrap=await sweepInsuranceMonitoring({
    db,now:NOW+4,limit:250,
    requestConfirmation:async()=>{throw new Error('unexpected second email')},
    notify:async()=>{},
  });
  assert.equal(wrap.ok,true);
  assert.equal(wrap.requested,0);
  assert.equal(wrap.considered,250);
  console.log('PASS: 620-insurance-operator sweep rotates, persists and wraps without losing or duplicating requests');
})().catch(e=>{console.error(e);process.exitCode=1});
