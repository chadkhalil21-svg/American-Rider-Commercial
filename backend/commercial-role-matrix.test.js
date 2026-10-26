'use strict';
// Cross-role commercial scenarios, explicitly SYNTHETIC and side-effect free.
// This tests actual referral decision/accrual/ACH-preview modules against a
// serializable in-memory database. It does not sign in to a mobile device,
// create production Operators, contact Stripe, or send funds.
const assert=require('node:assert/strict');
const {claimDecision,normalizedCode,inviteLink}=require('./referral-policy');
const {PROGRAM,evidence,recordHeldAccrual}=require('./referral-accrual');
const {planRecruiterAchBatch}=require('./recruiter-ach-batch');

class MemoryDb {
  constructor(){this.rows=new Map();this.writes=0;this.lock=Promise.resolve();}
  collection(c){return {doc:id=>({path:c+'/'+id})};}
  runTransaction(fn){
    const operation=this.lock.then(async()=>{
      const pending=[];
      const tx={
        get:async ref=>{
          const value=this.rows.get(ref.path);
          return {exists:value!==undefined,data:()=>structuredClone(value)};
        },
        create:(ref,value)=>pending.push({op:'create',ref,value}),
        update:(ref,value)=>pending.push({op:'update',ref,value}),
      };
      const result=await fn(tx);
      // Atomic commit: check all preconditions before applying any writes.
      for(const p of pending){
        if(p.op==='create'&&this.rows.has(p.ref.path))throw Error('duplicate');
        if(p.op==='update'&&!this.rows.has(p.ref.path))throw Error('missing');
      }
      for(const p of pending){
        this.rows.set(p.ref.path,p.op==='create'
          ?structuredClone(p.value):{...this.rows.get(p.ref.path),...structuredClone(p.value)});
        this.writes++;
      }
      return result;
    });
    this.lock=operation.catch(()=>{});
    return operation;
  }
}

const ROLES={operator:'op-1000',traveler:'trav-1000'};
const TIME=Date.parse('2026-10-26T00:00:00.000Z');
const enabled={...PROGRAM,enabled:true};
const baseRide=()=>({
  status:'completed',operatorId:ROLES.operator,travelerUid:ROLES.traveler,
  paymentIntentId:'pi_fixture_never_external',transferId:'tr_fixture_never_external',
  settledAt:TIME,paymentCapturePolicy:'manual_v1',authorizationState:'captured',
  capturedAt:TIME-5000,capturedCents:2200,
  referralProgramVersion:PROGRAM.version,referralAccrualPending:true,
  referralAvailableCents:30,
});
function context({roles=[],rewardEnabled=true,changes={},budget=30}={}){
  const db=new MemoryDb(),rideId='travel-fixture-101';
  const ride={...baseRide(),referralAvailableCents:budget,...changes};
  db.rows.set('rides/'+rideId,ride);
  for(const role of roles){
    assert.ok(Object.hasOwn(ROLES,role));
    const uid=ROLES[role];
    db.rows.set('referral_attributions/'+uid+'_'+role,{
      role,inviteeUid:uid,inviterUid:'recruiter-001',
      rewardEnabled,programVersion:PROGRAM.version,
      qualifiedTravels:0,earnedCents:0,
    });
  }
  return {db,rideId,ride};
}
function events(db){
  return [...db.rows].filter(([key])=>key.startsWith('referral_reward_events/'))
    .map(([,v])=>v);
}
let checks=0;
async function test(name,fn){
  try{await fn();checks++;console.log('PASS synthetic commercial matrix: '+name);}
  catch(e){console.error('FAIL synthetic commercial matrix: '+name);throw e;}
}
async function accrue(ctx,program=enabled){
  return recordHeldAccrual({...ctx,program,now:TIME+3600000});
}

(async()=>{
  await test('direct Traveler + Operator, production program OFF, no Recruiter',async()=>{
    assert.equal(PROGRAM.enabled,false,'production default must stay off');
    const c=context();
    const r=await accrue(c,PROGRAM);
    assert.equal(r.reason,'program_off');
    assert.equal(events(c.db).length,0);
    assert.equal(c.db.writes,0);
    assert.equal(c.db.rows.get('rides/'+c.rideId).status,'completed');
  });
  await test('direct Traveler + Operator without referral even in eligible sandbox',async()=>{
    const c=context();const r=await accrue(c);
    assert.equal(r.ok,true);assert.equal(r.events,0);
    assert.equal(events(c.db).length,0);
    assert.equal(c.db.rows.get('rides/'+c.rideId).status,'completed');
    assert.equal(c.db.rows.get('rides/'+c.rideId).referralAccrualPending,false);
  });
  for(const role of ['operator','traveler']){
    await test('qualified '+role+' referral alone earns exactly 15 HELD cents',async()=>{
      const c=context({roles:[role]});const r=await accrue(c);
      assert.deepEqual({events:r.events,held:r.heldCents},{events:1,held:15});
      assert.equal(events(c.db).length,1);
      assert.equal(events(c.db)[0].role,role);
      assert.equal(events(c.db)[0].status,'held');
      assert.equal(events(c.db)[0].nextReleaseAt,TIME+3600000+PROGRAM.holdMs);
      assert.equal(c.db.rows.get('rides/'+c.rideId).status,'completed');
    });
  }
  await test('independent Recruiter attributed on BOTH roles shares 30-cent budget',async()=>{
    const c=context({roles:['operator','traveler']});const r=await accrue(c);
    assert.equal(r.events,2);assert.equal(r.heldCents,30);
    assert.equal(events(c.db).reduce((s,e)=>s+e.amountCents,0),30);
  });
  await test('BOTH referrals with only 15-cent budget do not exceed it',async()=>{
    const c=context({roles:['operator','traveler'],budget:15});
    const r=await accrue(c);assert.equal(r.events,1);assert.equal(r.heldCents,15);
  });
  await test('BOTH referrals with zero funded margin earn zero',async()=>{
    const c=context({roles:['operator','traveler'],budget:0});
    const r=await accrue(c);assert.equal(r.events,0);assert.equal(r.heldCents,0);
  });
  await test('unverified or unapproved Recruiter creates no commission',async()=>{
    const c=context({roles:['operator','traveler'],rewardEnabled:false});
    const r=await accrue(c);assert.equal(r.events,0);assert.equal(events(c.db).length,0);
  });
  await test('no funded reward-budget evidence is rejected',async()=>{
    const c=context({roles:['operator'],budget:undefined});
    const r=await accrue(c);assert.equal(r.reason,'no_funded_budget');
    assert.equal(events(c.db).length,0);
  });
  await test('referral processing is idempotent under retries',async()=>{
    const c=context({roles:['operator','traveler']});
    const one=await accrue(c),before=c.db.writes;
    const two=await accrue(c);
    assert.equal(one.events,2);assert.equal(two.duplicate,true);
    assert.equal(two.events,0);assert.equal(c.db.writes,before);
  });
  await test('concurrent retry cannot generate duplicate rewards',async()=>{
    const c=context({roles:['operator','traveler']});
    const out=await Promise.all([accrue(c),accrue(c),accrue(c)]);
    assert.equal(out.filter(x=>x.events===2).length,1);
    assert.equal(events(c.db).length,2);
  });
  const blocked={
    'unpaid authorization':{authorizationState:'authorized'},
    'missing capture receipt':{capturedAt:null},
    'incomplete Travel':{status:'onboard'},
    'missing payment':{paymentIntentId:null},
    'missing Operator transfer':{transferId:null},
    'unconfirmed settlement':{settledAt:null},
    'refund pending':{refundPending:true},
    'already refunded':{refunded:true},
    'dispute pending':{disputePending:true},
    'already disputed':{disputed:true},
    'payment reconciliation hold':{payoutReconciliationNeeded:true},
    'demonstration Operator':{operatorDemo:true},
    'synthetic production record':{synthetic:true},
    'wrong program version':{referralProgramVersion:'old'},
  };
  for(const [name,changes] of Object.entries(blocked)){
    await test(name+' refuses paid Recruiter accrual',async()=>{
      const c=context({roles:['operator','traveler'],changes});
      const r=await accrue(c);
      assert.equal(r.events,0,name);
      assert.equal(events(c.db).length,0,name);
    });
  }
  const invalidClaims={
    'self invitation':{referrerUid:'person1',inviteeUid:'person1'},
    'shared identity':{sharedIdentity:true},
    'unapproved recruiter':{referrerEligible:false},
    'duplicate attribution':{alreadyClaimed:true},
    'already active role':{alreadyActivatedRole:true},
  };
  for(const [name,changes] of Object.entries(invalidClaims)){
    await test(name+' does not create valid attribution',async()=>{
      const r=claimDecision({referrerUid:'recruiter1',inviteeUid:'newtraveler',
        targetRole:'traveler',referrerEligible:true,...changes});
      assert.equal(r.ok,false);
    });
  }
  await test('optional Operator or Traveler referral code validates without requiring one',async()=>{
    assert.equal(normalizedCode(undefined),null);
    assert.equal(normalizedCode('abc12345'),'ABC12345');
    assert.equal(claimDecision({referrerUid:'recruiter1',inviteeUid:'operator1',
      targetRole:'operator',referrerEligible:true}).ok,true);
    assert.equal(claimDecision({referrerUid:'recruiter1',inviteeUid:'traveler1',
      targetRole:'traveler',referrerEligible:true}).ok,true);
    assert.equal(inviteLink('ABC12345','https://americanrider.tech'),
      'https://americanrider.tech/join?r=ABC12345');
  });
  const recipient={uid:'recruiter-001',availableCents:3400,
    approvalActive:true,bankVerified:true,taxReady:true,underReview:false,
    refundOrDisputeHold:false,settlementVerified:true,providerRecipientRef:'recipient_token_100'};
  const payoutArgs={date:'2026-10-26',recipients:[recipient],programEnabled:true,
    providerApproved:true,scheduleApproved:true,counselApproved:true,availableFundsCents:3400};
  await test('default Recruiter payout OFF sends nothing',async()=>{
    const r=planRecruiterAchBatch({...payoutArgs,programEnabled:false});
    assert.equal(r.reason,'program_off');assert.deepEqual(r.payments,[]);
  });
  await test('fully eligible Recruiter returns PREVIEW not a real payment',async()=>{
    const r=planRecruiterAchBatch(payoutArgs);
    assert.equal(r.reason,'preview_only_no_money_sent');
    assert.equal(r.requiresBankExecution,true);
    assert.equal(r.totalCents,3400);assert.equal(r.payments.length,1);
    assert.equal(r.payments[0].currency,'usd');
  });
  const rejected={
    'missing bank verification':{bankVerified:false},
    'missing tax verification':{taxReady:false},
    'suspended recruiter':{approvalActive:false},
    'refund or dispute':{refundOrDisputeHold:true},
    'unverified settlement':{settlementVerified:false},
    'under review':{underReview:true},
  };
  for(const [name,changes] of Object.entries(rejected)){
    await test(name+' blocks Recruiter payout candidate',async()=>{
      const r=planRecruiterAchBatch({...payoutArgs,recipients:[{...recipient,...changes}]});
      assert.equal(r.payments.length,0);
    });
  }
  await test('payout duplicate batch ID is never repeated',async()=>{
    const x=planRecruiterAchBatch(payoutArgs).payments[0].batchId;
    const r=planRecruiterAchBatch({...payoutArgs,previousBatchIds:[x]});
    assert.equal(r.payments.length,0);
  });
  await test('insufficient funding cannot be represented as a payout',async()=>{
    const r=planRecruiterAchBatch({...payoutArgs,availableFundsCents:3399});
    assert.equal(r.reason,'commissions_not_fully_funded');
  });
  await test('unapproved banking provider rejects payment planning',async()=>{
    const r=planRecruiterAchBatch({...payoutArgs,providerApproved:false});
    assert.equal(r.reason,'bank_provider_not_approved');
  });
  console.log('RESULT: '+checks+' synthetic role/referral/payment-boundary scenarios passed.');
  console.log('NOT TESTED HERE: actual iOS/Android taps, live user identity, GPS, notifications, real Stripe/bank payments, legally qualified Operators or production Travel.');
})().catch(error=>{console.error(error);process.exitCode=1;});
