'use strict';
const assert=require('node:assert/strict');
const {createFounderCommandServices,founderAuthorized}=require('./founder-command-services');
process.env.AR_RECRUITER_FOUNDER_USERS='chad';
assert.equal(founderAuthorized('chad'),true);
for(const other of ['stranger','chad ','chad,staff',''])assert.equal(founderAuthorized(other),false);
const calls=[];
const mkSnap=(id,data)=>({id,exists:true,data:()=>data});
const database={
 collection(name){
  calls.push(name);
  return {
   where(field,op,value){
    assert.equal(name,'recruiter_accounts');
    assert.equal(field,'verifiedEmail');assert.equal(op,'==');
    assert.equal(value,'a@example.com');
    return {limit(n){assert.equal(n,1);return {get:async()=>({empty:false,docs:[mkSnap('rec_uid_123',{status:'approved',allowedRoles:['traveler'],reviewedAt:123})]})}}};
   },
   doc(id){
    return {get:async()=>({
      exists:true,
      data:()=>name==='users'?
       {suspension:{active:true},screening:{decision:'awaiting_agency'},insuranceMonitoring:{status:'pending'}}:
       {available:true},
    })};
   }
  };
 }
};
const svc=createFounderCommandServices(()=>database);
(async()=>{
 const rec=await svc.recruiterStatus({email:'A@EXAMPLE.COM'});
 assert.equal(rec.ok,true);assert.equal(rec.status,'approved');
 assert.equal(rec.uid,'rec_uid_123');
 assert.equal(Object.prototype.hasOwnProperty.call(rec,'bankAccount'),false);
 assert.equal((await svc.recruiterStatus({email:'not an email'})).ok,false);
 const op=await svc.operatorStatus({uid:'Operator_123'});
 assert.equal(op.ok,true);assert.equal(op.suspended,true);
 assert.equal(op.selfReportedAvailable,true);
 assert.equal(op.screeningStatus,'awaiting_agency');
 assert.equal(Object.prototype.hasOwnProperty.call(op,'consumerReport'),false);
 assert.equal((await svc.operatorStatus({uid:'../../secrets'})).ok,false);
 assert.equal(calls.filter(v=>v==='recruiter_accounts').length,1,'bounded exact lookup');
 console.log('PASS Founder role allowlist, private Recruiter lookup, safe Operator status and invalid UID refusal');
})().catch(e=>{console.error(e);process.exitCode=1;});
