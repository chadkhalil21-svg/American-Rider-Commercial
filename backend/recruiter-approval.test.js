'use strict';
const assert=require('node:assert/strict');
const {PROGRAM_ENABLED,eligibleApproval,approvedRecruiterLink}=require('./recruiter-approval');
const now=1792700000000;
class MemoryDb {
  constructor(){this.rows=new Map();this.reads=0;this.writes=0;}
  collection(name){return {doc:(id)=>({path:name+'/'+id,get:async()=>{
    this.reads++;const data=this.rows.get(name+'/'+id);
    return {exists:data!==undefined,data:()=>data};
  }})};}
  async runTransaction(fn){
    const writes=[];
    const tx={
      get:async ref=>{this.reads++;const d=this.rows.get(ref.path);
        return {exists:d!==undefined,data:()=>d};},
      create:(ref,v)=>writes.push([ref.path,v,false]),
      set:(ref,v,opts)=>writes.push([ref.path,v,!!opts?.merge]),
    };
    const out=await fn(tx);
    for(const [path,val,merge] of writes){
      if(!merge&&this.rows.has(path))throw Error('duplicate');
      this.rows.set(path,merge?{...(this.rows.get(path)||{}),...val}:val);this.writes++;
    }
    return out;
  }
}
(async()=>{
const db=new MemoryDb(),uid='recruiter-one';
const approved={status:'approved',suspended:false,identityVerified:true,
  agreementAccepted:true,payoutEligibilityVerified:true,
  allowedRoles:['operator','traveler'],approvedBy:'founder',
  approvedAt:now-5000,agreementAcceptedAt:now-4500,expiresAt:now+90*86400000};
assert.equal(PROGRAM_ENABLED,false);
assert.equal((await approvedRecruiterLink({db,uid,role:'operator',now,
  programEnabled:true})).reason,'app_links_not_verified');
assert.equal(eligibleApproval(approved,'operator',now),true);
const first=await approvedRecruiterLink({db,uid,role:'operator',now});
assert.equal(first.reason,'recruiter_program_off');
assert.equal(db.reads,0);
assert.equal(db.writes,0);
const unavailable=await approvedRecruiterLink({db,uid,role:'operator',now,programEnabled:true,linkVerified:true});
assert.equal(unavailable.reason,'not_approved');
db.rows.set('recruiter_approvals/'+uid,approved);
db.rows.set('recruiter_accounts/'+uid,{status:'approved',allowedRoles:['operator','traveler']});
const one=await approvedRecruiterLink({db,uid,role:'operator',now,programEnabled:true,linkVerified:true});
assert.equal(one.ok,true);
assert.match(one.url,/^https:\/\/americanrider\.tech\/join\?r=[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{12}&role=operator$/);
assert.equal(one.compensationActive,false);
const before=db.writes;
const other=await approvedRecruiterLink({db,uid,role:'traveler',now,programEnabled:true,linkVerified:true});
assert.equal(other.ok,true);
assert.equal(new URL(one.url).searchParams.get('r'),new URL(other.url).searchParams.get('r'),
  'one owned code for both destinations');
assert.equal(db.writes,before,'no database writes per repeated share');
assert.equal(db.rows.get('referral_codes/'+new URL(one.url).searchParams.get('r')).ownerUid,uid);
for(const variant of [
  {...approved,status:'pending'},
  {...approved,suspended:true},
  {...approved,payoutEligibilityVerified:false},
  {...approved,agreementAccepted:false},
  {...approved,identityVerified:false},
  {...approved,allowedRoles:['traveler']},
  {...approved,expiresAt:now},
  {...approved,approvedAt:now+1},
  {...approved,approvedBy:''},
]){
  const r=eligibleApproval(variant,'operator',now);
  assert.equal(r,false,'unapproved, expired or incomplete record must fail');
}
// Revoked/expired contract blocks sharing even when the Firebase uid is still approved.
db.rows.set('recruiter_approvals/'+uid,{...approved,agreementAccepted:false});
assert.equal((await approvedRecruiterLink({db,uid,role:'operator',now,
  programEnabled:true,linkVerified:true})).reason,'not_approved');
db.rows.set('recruiter_approvals/'+uid,{...approved,status:'suspended'});
const blocked=await approvedRecruiterLink({db,uid,role:'operator',now,programEnabled:true,linkVerified:true});
assert.equal(blocked.reason,'not_approved','existing link must not be reissued after suspension');
assert.equal(db.writes,before);
assert.equal((await approvedRecruiterLink({db,uid:'x/y',role:'traveler',now,programEnabled:true,linkVerified:true})).reason,'invalid_request');
console.log('PASS: approved recruiter personal identity, role scope, term expiry, suspended access, zero writes per share and OFF default');
})().catch(e=>{console.error(e);process.exitCode=1;});
