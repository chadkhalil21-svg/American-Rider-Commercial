'use strict';
const assert=require('node:assert/strict');
const {formatLink,shareLink,claim,CLAIM_WINDOW_MS}=require('./referral-service');
class MemoryDb {
  constructor(){this.rows=new Map();this.reads=0;this.writes=0;}
  collection(collection){
    return {doc:(key)=>({path:collection+'/'+key})};
  }
  async runTransaction(fn){
    const writes=[];
    const tx={
      get:async ref=>{
        this.reads++;
        const val=this.rows.get(ref.path);
        return {exists:val!==undefined,data:()=>val};
      },
      create:(ref,val)=>writes.push({ref,val,create:true}),
      set:(ref,val,opts)=>writes.push({ref,val,merge:!!opts?.merge}),
    };
    const result=await fn(tx);
    for(const w of writes){
      if(w.create&&this.rows.has(w.ref.path))throw Error('duplicate');
      const prior=this.rows.get(w.ref.path)||{};
      this.rows.set(w.ref.path,w.merge?{...prior,...w.val}:w.val);
      this.writes++;
    }
    return result;
  }
}
(async()=>{
  const db=new MemoryDb(),now=Date.now(),uid='inviter';
  assert.equal(formatLink('abc12345','traveler'),
    'https://americanrider.app/join?r=ABC12345&role=traveler');
  assert.equal(formatLink('abc12345','unknown'),null);
  const first=await shareLink({db,uid,role:'traveler',now});
  assert.equal(first.ok,true);
  assert.match(first.url,/^https:\/\/americanrider\.app\/join\?r=[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{12}&role=traveler$/);
  const afterFirst=db.writes;
  const second=await shareLink({db,uid,role:'operator',now});
  assert.equal(second.ok,true);
  assert.equal(db.writes,afterFirst,'same inviter must not write per share');
  const code=first.url.match(/r=([^&]+)/)[1];
  assert.match(code,/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{12}$/,
    'new referral codes must be short, unambiguous and suitable for spoken use');
  // A tampered/stale profile code must never allow sharing another inviter's URL.
  db.rows.set('users/spoofed',{referralCode:code});
  const corrected=await shareLink({db,uid:'spoofed',role:'traveler',now});
  assert.equal(corrected.ok,true);
  assert.notEqual(corrected.url,first.url);
  const correctedCode=corrected.url.match(/r=([^&]+)/)[1];
  assert.equal(db.rows.get('referral_codes/'+correctedCode).ownerUid,'spoofed');
  assert.equal((await claim({db,uid:'inviter',code,role:'traveler',authCreatedAtMs:now,now})).ok,false);
  const newTravel=await claim({db,uid:'new-traveler',code,role:'traveler',authCreatedAtMs:now-2000,now});
  assert.deepEqual(newTravel,{ok:true,role:'traveler',recorded:true,rewardEnabled:false});
  assert.equal((await claim({db,uid:'new-traveler',code,role:'traveler',authCreatedAtMs:now-2000,now})).reason,'already_attributed');
  assert.equal((await claim({db,uid:'old-traveler',code,role:'traveler',
    authCreatedAtMs:now-CLAIM_WINDOW_MS-1,now})).reason,'existing_traveler');
  assert.equal((await claim({db,uid:'new-user',code:'INVALID?',role:'operator',authCreatedAtMs:now,now})).ok,false);
  db.rows.set('operators/old-operator',{commissioned:true});
  assert.equal((await claim({db,uid:'old-operator',code,role:'operator',
    authCreatedAtMs:now-365*24*3600_000,now})).reason,'role_already_active');
  // Normal Operator onboarding creates a draft record before this field is shown.
  // A draft cannot block a genuine first referral.
  db.rows.set('operators/operator-in-progress',{verification:'draft',documentStatus:'pending'});
  const firstOperator=await claim({db,uid:'operator-in-progress',code,role:'operator',
    authCreatedAtMs:now-3600_000,now});
  assert.equal(firstOperator.ok,true,'draft Operator is new to qualified role');
  assert.equal((await claim({db,uid:'operator-in-progress',code,role:'operator',
    authCreatedAtMs:now-3600_000,now})).reason,'already_attributed');
  // A previously distributed recruiter URL may never bypass Founder suspension.
  db.rows.set('recruiter_accounts/inviter',{status:'suspended'});
  const blocked=await claim({db,uid:'new-after-suspension',code,role:'operator',
    authCreatedAtMs:now,now});
  assert.equal(blocked.reason,'referrer_not_eligible');
  assert.equal(db.rows.has('referral_attributions/new-after-suspension_operator'),false);
  db.rows.set('recruiter_accounts/inviter',{status:'approved',allowedRoles:['operator','traveler']});
  // A founder approval WITHOUT independent identity, agreement and bank review
  // must never authorize a previously issued QR code or spoken referral.
  db.rows.set('recruiter_approvals/inviter',{status:'approved',
    identityVerified:false,agreementAccepted:false,payoutEligibilityVerified:false});
  const blockedUnsigned=await claim({db,uid:'new-unsigned',code,role:'operator',
    authCreatedAtMs:now,now});
  assert.equal(blockedUnsigned.reason,'referrer_not_eligible');
  assert.equal(db.rows.has('referral_attributions/new-unsigned_operator'),false);
  const approval={status:'approved',suspended:false,identityVerified:true,
    agreementAccepted:true,payoutEligibilityVerified:true,
    approvedBy:'founder',approvedAt:now-100,agreementAcceptedAt:now-90,
    expiresAt:now+24*3600_000,allowedRoles:['operator','traveler']};
  db.rows.set('recruiter_approvals/inviter',approval);
  const paidTraveler=await claim({db,uid:'paid-traveler-001',code,role:'traveler',
    authCreatedAtMs:now-2000,now,
    paidRecruiterProgram:{enabled:true,version:'recruiter-15c-20261024-v1'}});
  assert.equal(paidTraveler.rewardEnabled,true);
  const paidClaim=db.rows.get('referral_attributions/paid-traveler-001_traveler');
  assert.equal(paidClaim.rewardEnabled,true);
  assert.equal(paidClaim.programVersion,'recruiter-15c-20261024-v1');
  const direct=await claim({db,uid:'ordinary-unpaid',code,role:'traveler',
    authCreatedAtMs:now,now});
  assert.equal(direct.rewardEnabled,false,'default remains unpaid');
  const transfer=await claim({db,uid:'new-traveler',code,role:'operator',
    authCreatedAtMs:now-2000,now});
  assert.equal(transfer.ok,true,'existing Traveler can later join as new Operator');
  const blockedRole=await claim({db,uid:'traveler-role-denied',code,role:'traveler',
    authCreatedAtMs:now,now});
  assert.equal(blockedRole.ok,true);
  db.rows.set('recruiter_approvals/inviter',{...approval,allowedRoles:['operator']});
  assert.equal((await claim({db,uid:'traveler-role-new',code,role:'traveler',
    authCreatedAtMs:now,now})).reason,'referrer_not_eligible');
  db.rows.set('recruiter_approvals/inviter',{...approval,expiresAt:now});
  assert.equal((await claim({db,uid:'expired-recruiter',code,role:'operator',
    authCreatedAtMs:now,now})).reason,'referrer_not_eligible');
  // A direct user share cannot bypass the recruiter controls after expiry.
  const writeCount=db.writes;
  assert.equal((await shareLink({db,uid:'inviter',role:'operator',now,
    origin:'https://americanrider.tech'})).ok,false);
  assert.equal(db.writes,writeCount);
  assert.equal(db.rows.get('referral_attributions/new-traveler_operator').role,'operator');
  assert.equal(db.rows.get('referral_attributions/new-traveler_operator').rewardEnabled,false);
  assert.equal(db.rows.get('referral_attributions/new-traveler_traveler').rewardEnabled,false);
  console.log('PASS referral-service: fixed claims, roles, no share-click writes, no money');
})().catch(e=>{console.error(e);process.exitCode=1;});
