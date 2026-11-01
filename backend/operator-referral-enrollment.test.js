'use strict';
const assert=require('node:assert/strict');
const {ensureQualifiedOperatorRecruiter,mayShareUnpaidOperatorInvitation}=
  require('./operator-referral-enrollment');
const now=Date.UTC(2026,9,31);
function fixture({qualified=true,verified=true,seed={}}={}){
 const store=new Map(Object.entries(seed));
 const ref=(collection,id)=>({key:collection+'/'+id});
 const snap=r=>({exists:store.has(r.key),data:()=>store.get(r.key)});
 const db={
  collection:collection=>({doc:id=>({
   ...ref(collection,id),get:async()=>snap(ref(collection,id)),
  })}),
  runTransaction:async fn=>{
   const mutations=[];
   const tx={get:async r=>snap(r),create:(r,d)=>mutations.push([r.key,d])};
   const result=await fn(tx);
   for(const [key,value]of mutations){assert.equal(store.has(key),false);store.set(key,value);}
   return result;
  },
 };
 store.set('users/operator001',{legalName:'Demo Operator'});
 store.set('operators/operator001',{commissioned:true});
 return {db,store,opts:{db,uid:'operator001',verifiedEmail:'ops@example.com',now,
   identityLookup:async()=>({disabled:false,emailVerified:verified,email:'ops@example.com'}),
   evaluate:()=>({qualified})}};
}
(async()=>{
 const f=fixture();
 const first=await ensureQualifiedOperatorRecruiter(f.opts);
 assert.equal(first.created,true);
 assert.equal(f.store.get('recruiter_accounts/operator001').status,'approved');
 assert.equal(f.store.get('recruiter_accounts/operator001').agreementAccepted,false);
 assert.equal(f.store.get('recruiter_approvals/operator001').payoutEligibilityVerified,false);
 assert.equal(mayShareUnpaidOperatorInvitation(
   f.store.get('recruiter_accounts/operator001'),
   f.store.get('recruiter_approvals/operator001'),'traveler',now),true);
 assert.equal(mayShareUnpaidOperatorInvitation(
   f.store.get('recruiter_accounts/operator001'),
   {...f.store.get('recruiter_approvals/operator001'),suspended:true},
   'traveler',now),false);
 assert.equal((await ensureQualifiedOperatorRecruiter(f.opts)).existing,true);
 assert.equal(f.store.size,4,'idempotent enrollment');
 const noQualification=fixture({qualified:false});
 assert.equal((await ensureQualifiedOperatorRecruiter(noQualification.opts)).reason,'operator_not_qualified');
 assert.equal(noQualification.store.has('recruiter_accounts/operator001'),false);
 const noIdentity=fixture({verified:false});
 assert.equal((await ensureQualifiedOperatorRecruiter(noIdentity.opts)).reason,'operator_identity_not_verified');
 const suspended=fixture({seed:{
  'recruiter_accounts/operator001':{status:'suspended',enrollmentSource:'qualified_operator'},
  'recruiter_approvals/operator001':{status:'suspended',suspended:true},
 }});
 assert.equal((await ensureQualifiedOperatorRecruiter(suspended.opts)).existing,true);
 assert.equal(suspended.store.get('recruiter_accounts/operator001').status,'suspended');
 console.log('PASS qualified Operator auto-enrollment: idempotent, consent-gated, no Stripe duplicate, no suspended override');
})().catch(e=>{console.error(e);process.exitCode=1});
