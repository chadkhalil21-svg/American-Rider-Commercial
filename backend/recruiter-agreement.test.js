'use strict';
const assert=require('node:assert/strict');
const {termsConfig,acceptRecruiterAgreement}=require('./recruiter-agreement');
const NOW=Date.now()-10000, uid='recruiter_fixture_1';
class DB {
 constructor(){this.rows=new Map();this.writes=0;}
 collection(k){return {doc:id=>({path:k+'/'+id})};}
 async runTransaction(fn){
  const m=[];const tx={get:async r=>{const row=this.rows.get(r.path);
   return {exists:!!row,data:()=>row};},
   update:(r,v)=>m.push([r.path,v])};
  const result=await fn(tx);
  for(const [path,v] of m){this.rows.set(path,{...this.rows.get(path),...v});this.writes++;}
  return result;
 }
}
(async()=>{
 const db=new DB();
 db.rows.set('recruiter_accounts/'+uid,{status:'approved',verifiedEmail:'verified@example.com'});
 db.rows.set('recruiter_approvals/'+uid,{status:'approved',suspended:false});
 const text='Independent recruiter agreement reviewed by counsel, external terms required. '.repeat(5);
 assert.equal(termsConfig({text,version:'r2026-01',expiresAt:NOW+100000,legalApproved:false,now:NOW}),null);
 assert.equal(termsConfig({text:'short',version:'r2026-01',expiresAt:NOW+100000,legalApproved:true,now:NOW}),null);
 const terms=termsConfig({text,version:'r2026-01',expiresAt:NOW+100000,legalApproved:true,now:NOW});
 assert.ok(terms);assert.match(terms.sha256,/^[a-f0-9]{64}$/);
 const args={db,uid,verifiedEmail:'verified@example.com',terms,version:terms.version,accepted:true,now:NOW};
 assert.equal((await acceptRecruiterAgreement({...args,accepted:false})).ok,false);
 assert.equal((await acceptRecruiterAgreement({...args,verifiedEmail:'attacker@example.com'})).reason,'not_authorized');
 assert.equal((await acceptRecruiterAgreement({...args,version:'wrong-version'})).reason,'agreement_not_available');
 const x=await acceptRecruiterAgreement(args);
 assert.equal(x.ok,true);
 assert.equal(db.rows.get('recruiter_accounts/'+uid).agreementSha256,terms.sha256);
 assert.equal(db.rows.get('recruiter_approvals/'+uid).expiresAt,terms.expiresAt);
 const before=db.writes;
 assert.equal((await acceptRecruiterAgreement(args)).alreadyAccepted,true);
 assert.equal(db.writes,before,'idempotent agreement acceptance adds no writes');
 console.log('PASS approved exact-version recruiter terms, signed verified email, mismatch and replay protection');
})().catch(e=>{console.error(e);process.exitCode=1});
