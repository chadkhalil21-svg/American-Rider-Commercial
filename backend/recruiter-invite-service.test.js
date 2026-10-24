'use strict';
const assert=require('node:assert/strict');
const {sendRecruiterInvitation}=require('./recruiter-invite-service');
class Db{
  constructor(){this.rows=new Map();}
  collection(c){return {doc:id=>{
    const key=c+'/'+id, db=this;
    return {
      key,
      async get(){return {exists:db.rows.has(key),data:()=>db.rows.get(key)};},
      async create(v){if(db.rows.has(key))throw Error('exists');db.rows.set(key,v);},
      async set(v,opt){db.rows.set(key,opt?.merge?{...db.rows.get(key),...v}:v);},
    };
  }};}
  async runTransaction(fn){
    const writes=[];
    const tx={
      get:ref=>ref.get(),
      create:(ref,v)=>writes.push(()=>{if(this.rows.has(ref.key))throw Error('collision');this.rows.set(ref.key,v);}),
      set:(ref,v,opt)=>writes.push(()=>this.rows.set(ref.key,opt?.merge?{...this.rows.get(ref.key),...v}:v)),
    };
    const value=await fn(tx);writes.forEach(w=>w());return value;
  }
}
(async()=>{
 const db=new Db(),messages=[],send=async m=>{messages.push(m);return {ok:true,id:'resend_test'};};
 const input={db,send,email:'Recruiter@Example.com',allowedRoles:['operator','traveler'],actor:'founder',now:1000000};
 assert.equal((await sendRecruiterInvitation({...input,email:'bad'})).code,'invalid_invitation');
 let out=await sendRecruiterInvitation(input);
 assert.equal(out.ok,true);assert.equal(out.delivery,'submitted');
 assert.equal(out.email,'recruiter@example.com');
 assert.equal(messages.length,1);
 assert.match(messages[0].text,/recruitment\/accept\?token=/);
 assert.ok(messages[0].idempotencyKey.startsWith('recruiter-invite/'));
 assert.ok(!JSON.stringify(out).includes('token'));
 assert.equal((await sendRecruiterInvitation({...input,now:1000001})).code,'invitation_already_requested');
 assert.equal(messages.length,1);
 const once=[...db.rows.keys()].filter(k=>k.startsWith('recruiter_invitations/'));
 assert.equal(once.length,1);
 const stored=db.rows.get(once[0]);
 assert.equal(stored.status,'issued');
 assert.ok(!stored.token&&!stored.url,'no plain invitation secrets in database');
 const after=await sendRecruiterInvitation({...input,now:1000000+48*60*60*1000+1});
 assert.equal(after.ok,true);
 assert.equal(messages.length,2,'new invitation permitted only once expiry ends');
 const unavailable=new Db();
 const noSend=await sendRecruiterInvitation({...input,db:unavailable,send:async()=>({ok:false})});
 assert.equal(noSend.code,'invitation_delivery_unconfirmed');
 assert.equal((await sendRecruiterInvitation({...input,db:unavailable,send})).code,'invitation_already_requested',
   'uncertain delivery may not cause an automated duplicate email');
 console.log('PASS recruiter Founder invitation: role/email validation, duplicate protection, 48h expiry, no leaked token, no uncertain resend');
})().catch(e=>{console.error(e);process.exitCode=1;});
