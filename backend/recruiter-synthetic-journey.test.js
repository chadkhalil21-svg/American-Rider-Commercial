'use strict';
// Founder-requested SYNTHETIC full Recruiter invitation-to-attribution exercise.
// Uses the actual production modules on an isolated in-memory Firestore model.
// NO production Firebase account, secret, outbound email, fee, transfer or payout.
// Real OAuth, mail delivery, Stripe, web deployment and payout remain separate proofs.
const assert=require('node:assert/strict');
const {sendRecruiterInvitation}=require('./recruiter-invite-service');
const {acceptInvitation,recruiterSummary}=require('./recruiter-portal');
const {CURRENT_TERMS}=require('./recruiter-commercial-terms');
const {termsConfig,acceptRecruiterAgreement}=require('./recruiter-agreement');
const {shareLink,claim}=require('./referral-service');
const {founderDecision}=require('./recruiter-portal');
const NOW=Date.UTC(2026,10,3,12,0,0);
const VERSION=CURRENT_TERMS.version;
const TERMS=termsConfig({...CURRENT_TERMS,now:NOW});
assert.ok(TERMS,'Current contractual terms must be usable');
class MemoryDb {
  constructor(){this.rows=new Map();}
  snapshot(path) {
    const data=this.rows.get(path);
    return {exists:data!==undefined,data:()=>data===undefined?undefined:structuredClone(data)};
  }
  collection(col){
    const db=this;
    return {
      doc(id){
        const path=col+'/'+id;
        return {
          path,
          get:async()=>db.snapshot(path),
          create:async value=>{
            if(db.rows.has(path))throw Error('already_exists');
            db.rows.set(path,structuredClone(value));
          },
          set:async(value,opts)=>{
            const prior=opts?.merge?db.rows.get(path)||{}:{};
            db.rows.set(path,{...prior,...structuredClone(value)});
          },
          update:async value=>{
            if(!db.rows.has(path))throw Error('not_found');
            db.rows.set(path,{...db.rows.get(path),...structuredClone(value)});
          },
        };
      },
      where(key,op,value){
        assert.equal(op,'==');
        const filters=[[key,value]];
        const chain={
          where(nextKey,nextOp,nextValue){
            assert.equal(nextOp,'==');
            filters.push([nextKey,nextValue]);
            return chain;
          },
          count(){
            return {get:async()=>({data:()=>({count:[...db.rows.entries()].filter(([path,v])=>
              path.startsWith(col+'/')&&filters.every(([field,expected])=>v[field]===expected)).length})})};
          },
        };
        return chain;
      },
    };
  }
  async runTransaction(fn){
    const writes=[];
    const tx={
      get:ref=>this.snapshot(ref.path),
      create:(ref,value)=>writes.push(['create',ref.path,value,false]),
      set:(ref,value,opts)=>writes.push(['set',ref.path,value,!!opts?.merge]),
      update:(ref,value)=>writes.push(['update',ref.path,value,true]),
    };
    const result=await fn(tx);
    for(const [kind,path] of writes){
      if(kind==='create'&&this.rows.has(path))throw Error('transaction_duplicate');
      if(kind==='update'&&!this.rows.has(path))throw Error('transaction_missing');
    }
    for(const [kind,path,value,merge] of writes){
      const prior=(kind==='update'||merge)?this.rows.get(path)||{}:{};
      this.rows.set(path,{...prior,...structuredClone(value)});
    }
    return result;
  }
  record(path){return this.rows.get(path);}
  patch(path,fields){
    assert.ok(this.rows.has(path),'existing record required: '+path);
    this.rows.set(path,{...this.rows.get(path),...fields});
  }
}
(async()=>{
  const db=new MemoryDb();
  const delivered=[];
  const send=async message=>{
    assert.match(message.from,/relations@americanrider\.tech/);
    assert.match(message.text,/https:\/\/americanrider\.tech\/recruitment\/accept\?token=/);
    delivered.push(message);
    return {ok:true,id:'synthetic-provider-'+delivered.length};
  };
  const issuedCodes=new Set();
  let accepted=0,links=0,claims=0,firstInvite=null;
  for(let i=1;i<=25;i++){
    const email='synthetic-recruiter-'+i+'@example.test';
    const uid='synthetic-recruiter-id-'+i;
    const invited=await sendRecruiterInvitation({
      db,send,email,allowedRoles:['operator','traveler'],actor:'founder',now:NOW+i,
    });
    assert.equal(invited.ok,true,'private invitation '+i);
    const message=delivered.at(-1);
    assert.equal(message.to,email);
    const match=message.text.match(/https:\/\/americanrider\.tech\/recruitment\/accept\?token=([A-Za-z0-9_-]{43})/);
    assert.ok(match,'unique private email invitation link');
    const token=match[1];
    if(i===1){
      firstInvite=token;
      const wrong=await acceptInvitation({db,uid,verifiedEmail:'wrong@example.test',token,now:NOW+200});
      assert.equal(wrong.reason,'wrong_verified_email','cross-mailbox hijack rejected');
    }
    const acceptance=await acceptInvitation({db,uid,verifiedEmail:email,token,now:NOW+300});
    assert.equal(acceptance.ok,true,'verified email acceptance');
    assert.equal(acceptance.status,'approved','Founder invitation replaces second approval');
    accepted++;
    assert.equal(db.record('recruiter_accounts/'+uid).agreementAccepted,false);
    let summary=await recruiterSummary({
      db,uid,verifiedEmail:email,now:NOW+400,programEnabled:true,linkVerified:true,
    });
    assert.equal(summary.linksAvailable,false,'links withheld prior to agreement/identity');
    const noConsent=await acceptRecruiterAgreement({
      db,uid,verifiedEmail:email,version:VERSION,terms:TERMS,accepted:false,now:NOW+500,
    });
    assert.equal(noConsent.ok,false,'consent cannot be inferred');
    const consent=await acceptRecruiterAgreement({
      db,uid,verifiedEmail:email,version:VERSION,terms:TERMS,accepted:true,now:NOW+600,
    });
    assert.equal(consent.ok,true,'individual signed commercial agreement');
    // External identity verification intentionally simulated, never forged in production.
    db.patch('recruiter_approvals/'+uid,{
      identityVerified:true,expiresAt:NOW+30*86400000,
    });
    db.patch('recruiter_accounts/'+uid,{identityVerified:true});
    summary=await recruiterSummary({
      db,uid,verifiedEmail:email,now:NOW+700,programEnabled:true,linkVerified:true,
    });
    assert.equal(summary.linksAvailable,true,'verified recruiter portal unlocks links');
    const roles=['operator','traveler'];
    let code=null;
    for(const role of roles){
      const link=await shareLink({
        db,uid,role,now:NOW+800,
        origin:'https://americanrider.tech',paidRecruiterProgramEnabled:true,
      });
      assert.equal(link.ok,true,'role link from real referral service');
      assert.equal(link.compensationActive,true,'authorized compensation only');
      assert.match(link.url,new RegExp('^https://americanrider[.]tech/join[?]r=[A-Z0-9]{8,32}&role='+role+'$'));
      const nextCode=new URL(link.url).searchParams.get('r');
      if(code)assert.equal(nextCode,code,'one owner and reusable attribution code');
      code=nextCode;
      links++;
      const newUser='synthetic-participant-'+i+'-'+role;
      const attributed=await claim({
        db,uid:newUser,code,role,authCreatedAtMs:NOW-2000,now:NOW+900,
        paidRecruiterProgram:{enabled:true,version:VERSION},
      });
      assert.equal(attributed.ok,true,'new participant attributed to eligible recruiter');
      assert.equal(attributed.rewardEnabled,true,'only eligible claims marked reward-capable');
      claims++;
      const replay=await claim({
        db,uid:newUser,code,role,authCreatedAtMs:NOW-2000,now:NOW+1000,
        paidRecruiterProgram:{enabled:true,version:VERSION},
      });
      assert.equal(replay.reason,'already_attributed','repeat claim rejected');
    }
    assert.ok(!issuedCodes.has(code),'25 Recruiters have distinct private codes');
    issuedCodes.add(code);
    summary=await recruiterSummary({
      db,uid,verifiedEmail:email,now:NOW+1200,programEnabled:true,linkVerified:true,
    });
    assert.equal(summary.counts.operatorIntroductions,1);
    assert.equal(summary.counts.travelerIntroductions,1);
    if(i===1){
      const stopped=await founderDecision({db,uid,actor:'founder',decision:'suspend',now:NOW+1300});
      assert.equal(stopped.status,'suspended');
      const oldLink=await claim({
        db,uid:'synthetic-post-suspension',code,role:'traveler',
        authCreatedAtMs:NOW-1000,now:NOW+1400,
        paidRecruiterProgram:{enabled:true,version:VERSION},
      });
      assert.equal(oldLink.reason,'referrer_not_eligible','revocation checked at redemption');
      const unauthorized=await recruiterSummary({
        db,uid,verifiedEmail:email,now:NOW+1500,programEnabled:true,linkVerified:true,
      });
      assert.equal(unauthorized.reason,'account_inactive');
    }
  }
  const wrongOwner=await acceptInvitation({
    db,uid:'synthetic-attacker',verifiedEmail:'synthetic-recruiter-1@example.test',
    token:firstInvite,now:NOW+1600,
  });
  assert.equal(wrongOwner.ok,false,'a different user cannot steal accepted invitation');
  assert.equal(delivered.length,25);
  assert.equal(accepted,25);
  assert.equal(links,50);
  assert.equal(claims,50);
  assert.equal(db.rows.size>=200,true);
  console.log('PASS isolated end-to-end synthetic Recruiter journey: 25 individual invitations, 25 accepted verified-email identities, 25 contracts, 50 scoped role links and 50 role attributions.');
  console.log('PASS security: wrong-mailbox, pre-agreement link, no-consent, replay, invitation theft, suspension and post-suspension referral rejected.');
  console.log('ZERO live emails, Firebase users, real identities, Stripe accounts, commissions or bank payouts created.');
})().catch(e=>{console.error('FAIL synthetic Recruiter journey:',e.message);process.exitCode=1;});
