'use strict';
const assert=require('node:assert/strict');
const {CURRENT_TERMS}=require('./recruiter-commercial-terms');
const {termsConfig,acceptRecruiterAgreement}=require('./recruiter-agreement');
const now=Date.UTC(2026,9,24);
const cfg=termsConfig({...CURRENT_TERMS,now});
assert.ok(cfg,'Founder-approved contract must be available without attorney-signoff flag');
assert.equal(cfg.version,'recruiter-15c-20261024-v1');
for(const phrase of ['$0.15','200 qualifying Travels','$25','24 hours','90 consecutive days','$2.00','Stripe Connect']){
 assert.ok(cfg.text.includes(phrase),'contract missing '+phrase);
}
assert.equal(termsConfig({...CURRENT_TERMS,expiresAt:now-1,now}),null,
 'expired contract must fail closed');
assert.equal(termsConfig({...CURRENT_TERMS,text:'test',now}),null,
 'invalid contract must fail closed');
assert.match(cfg.sha256,/^[a-f0-9]{64}$/);
const uid='recruiter-confirmed-01',email='recruiter@sample.com';
const rows=new Map([
 ['recruiter_accounts/'+uid,{status:'approved',verifiedEmail:email}],
 ['recruiter_approvals/'+uid,{status:'approved',suspended:false}],
]);
const db={collection:name=>({doc:id=>({id,name,path:name+'/'+id})}),
 async runTransaction(fn){
  const operations=[];
  const tx={get:async ref=>{const x=rows.get(ref.path);return {exists:!!x,data:()=>x};},
    update:(ref,changes)=>operations.push([ref.path,changes])};
  const outcome=await fn(tx);
  for(const [key,changes] of operations)rows.set(key,{...rows.get(key),...changes});
  return outcome;
 }};
(async()=>{
 const args={db,uid,verifiedEmail:email,version:cfg.version,terms:cfg,now};
 assert.equal((await acceptRecruiterAgreement({...args,accepted:false})).ok,false);
 assert.equal((await acceptRecruiterAgreement({...args,accepted:true,verifiedEmail:'wrong@example.com'})).reason,'not_authorized');
 assert.equal((await acceptRecruiterAgreement({...args,accepted:true})).ok,true);
 assert.equal(rows.get('recruiter_accounts/'+uid).agreementAccepted,true);
 assert.equal(rows.get('recruiter_approvals/'+uid).agreementSha256,cfg.sha256);
 assert.equal((await acceptRecruiterAgreement({...args,accepted:true})).alreadyAccepted,true);
 console.log('PASS signed versioned commercial Recruiter contract; real individual affirmative consent, no attorney checkbox');
})().catch(e=>{console.error(e);process.exitCode=1});
