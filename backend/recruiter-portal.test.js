'use strict';
const assert=require('node:assert/strict');
const {createInvitation,acceptInvitation,founderDecision,recruiterSummary,
  INVITE_MS,emailOf,normalizeRoles}=require('./recruiter-portal');
const NOW=Date.UTC(2026,9,24);
class Db {
  constructor(){this.rows=new Map();this.reads=[];}
  collection(name){return {
    doc:(id)=>{
      const path=name+'/'+id;
      return {path,
        create:async v=>{if(this.rows.has(path))throw Error('exists');this.rows.set(path,v);},
        get:async()=>{this.reads.push(path);const v=this.rows.get(path);
          return {exists:v!==undefined,data:()=>v};}
      };
    },
    where:(field,op,value)=>{assert.equal(op,'==');
      assert.equal(field,'inviterUid');
      return {where:(roleField,roleOp,role)=>{
        assert.equal(roleField,'role');assert.equal(roleOp,'==');
        return {count:()=>({get:async()=>({data:()=>({count:[...this.rows.entries()]
          .filter(([path,v])=>path.startsWith('referral_attributions/')&&
            v.inviterUid===value&&v.role===role).length})})})};}
      };
    },
  };}
  async runTransaction(fn){
    const writes=[];const tx={
      get:async ref=>{const v=this.rows.get(ref.path);
        return {exists:v!==undefined,data:()=>v};},
      create:(ref,val)=>writes.push({type:'create',ref,val}),
      update:(ref,val)=>writes.push({type:'update',ref,val}),
      set:(ref,val,options)=>writes.push({type:'set',ref,val,merge:options?.merge}),
    };
    const result=await fn(tx);
    for(const w of writes){
      if(w.type==='create'&&this.rows.has(w.ref.path))throw Error('duplicate');
      if(w.type==='update'&&!this.rows.has(w.ref.path))throw Error('missing');
      const old=this.rows.get(w.ref.path)||{};
      this.rows.set(w.ref.path,w.type==='create'||w.merge===false?
        w.val:{...old,...w.val});
    }
    return result;
  }
}
(async()=>{
  assert.equal(emailOf(' PERSON@Example.COM '),'person@example.com');
  assert.equal(emailOf('not-an-address'),null);
  assert.deepEqual(normalizeRoles(['operator','operator','traveler']),['operator','traveler']);
  const db=new Db();
  assert.equal((await createInvitation({db,email:'wrong',allowedRoles:['operator'],
    actor:'founder',now:NOW})).reason,'invalid_request');
  const invite=await createInvitation({db,email:'Recruiter@Example.com',
    allowedRoles:['operator','traveler'],actor:'founder',now:NOW});
  assert.equal(invite.ok,true);
  assert.equal(invite.expiresAt,NOW+INVITE_MS);
  assert.equal(db.rows.get('recruiter_invitations/'+invite.id).token,undefined,
    'must store ONLY token digest, never raw token');
  const wrong=await acceptInvitation({db,uid:'recruiter-001',
    verifiedEmail:'other@example.com',token:invite.token,now:NOW+10});
  assert.equal(wrong.reason,'wrong_verified_email');
  const accepted=await acceptInvitation({db,uid:'recruiter-001',
    verifiedEmail:'recruiter@example.com',token:invite.token,now:NOW+10});
  assert.equal(accepted.ok,true);assert.equal(accepted.status,'pending_review');
  const repeated=await acceptInvitation({db,uid:'recruiter-001',
    verifiedEmail:'recruiter@example.com',token:invite.token,now:NOW+20});
  assert.equal(repeated.reason,'already_accepted');
  const stolen=await acceptInvitation({db,uid:'attacker-001',
    verifiedEmail:'recruiter@example.com',token:invite.token,now:NOW+20});
  assert.equal(stolen.ok,false);
  const approved=await founderDecision({db,uid:'recruiter-001',actor:'founder',
    decision:'approve',now:NOW+40});
  assert.equal(approved.status,'approved');
  const approval=db.rows.get('recruiter_approvals/recruiter-001');
  assert.equal(approval.payoutEligibilityVerified,false);
  assert.equal(approval.agreementAccepted,false);
  assert.equal(approval.identityVerified,false);
  const duplicate=await founderDecision({db,uid:'recruiter-001',
    actor:'founder',decision:'approve',now:NOW+50});
  assert.equal(duplicate.reason,'incorrect_status');
  db.rows.set('referral_attributions/id_1',{inviterUid:'recruiter-001',role:'operator'});
  db.rows.set('referral_attributions/id_2',{inviterUid:'recruiter-001',role:'traveler'});
  db.rows.set('referral_attributions/id_3',{inviterUid:'someone-else',role:'operator'});
  const summary=await recruiterSummary({db,uid:'recruiter-001',now:NOW+50});
  assert.equal(summary.status,'approved');
  assert.equal(summary.counts.operatorIntroductions,1);
  assert.equal(summary.counts.travelerIntroductions,1);
  assert.equal(summary.linksAvailable,false);
  assert.equal(summary.verifiedOperators,null);
  assert.equal(summary.bankSetup,'not_commissioned');
  assert.equal(summary.compensation,'not_commissioned');
  assert.equal((await recruiterSummary({db,uid:'someone-else',now:NOW+50})).reason,'not_enrolled');
  const suspended=await founderDecision({db,uid:'recruiter-001',
    actor:'founder',decision:'suspend',now:NOW+70});
  assert.equal(suspended.status,'suspended');
  assert.equal(db.rows.get('recruiter_approvals/recruiter-001').suspended,true);
  const expired=await createInvitation({db,email:'late@example.com',
    allowedRoles:['operator'],actor:'founder',now:NOW});
  assert.equal((await acceptInvitation({db,uid:'late-account',
    verifiedEmail:'late@example.com',token:expired.token,now:NOW+INVITE_MS+1})).reason,
    'invalid_or_expired_invitation');
  console.log('PASS recruiter invitation token hashing, verified email binding, replay, Founder approval, private counts and payment-safe OFF');
})().catch(e=>{console.error(e);process.exitCode=1;});
