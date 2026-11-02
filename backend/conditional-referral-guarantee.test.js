'use strict';
// Zero, one, or two legitimate referrals. No real payments or database.
const assert=require('node:assert/strict');
const {PROGRAM,recordHeldAccrual}=require('./referral-accrual');
const {fundedRecruiterSnapshot}=require('./recruiter-reward-budget');
const {quote}=require('./payments');
class Db {
  constructor(roles,version=PROGRAM.version) {
    this.docs=new Map(); this.writes=0;
    const rideId='travel-conditional-123456';
    this.rideId=rideId;
    this.docs.set('rides/'+rideId,{
      status:'completed',operatorId:'operator-good',travelerUid:'traveler-good',
      paymentIntentId:'pi_valid',transferId:'tr_valid',settledAt:200,
      paymentCapturePolicy:'manual_v1',authorizationState:'captured',
      capturedAt:150,capturedCents:2500,referralAvailableCents:30,
      referralProgramVersion:version,referralAccrualPending:true
    });
    for(const role of roles){
      const uid=role==='operator'?'operator-good':'traveler-good';
      this.docs.set('referral_attributions/'+uid+'_'+role,{
        role,inviteeUid:uid,inviterUid:'recruiter-'+role,
        rewardEnabled:true,programVersion:version,
        qualifiedTravels:0,earnedCents:0
      });
    }
  }
  collection(collection){return{doc:id=>({path:collection+'/'+id})};}
  async runTransaction(cb){
    const changes=[];
    const tx={
      get:async ref=>({exists:this.docs.has(ref.path),
        data:()=>this.docs.get(ref.path)}),
      create:(ref,v)=>changes.push({op:'create',key:ref.path,value:v}),
      update:(ref,v)=>changes.push({op:'update',key:ref.path,value:v})
    };
    const output=await cb(tx);
    for(const row of changes){
      if(row.op==='create')assert.equal(this.docs.has(row.key),false,'no double commission');
      if(row.op==='update')assert.equal(this.docs.has(row.key),true);
      this.docs.set(row.key,{...(this.docs.get(row.key)||{}),...row.value});
      this.writes++;
    }
    return output;
  }
}
(async()=>{
  const previous=process.env.AR_RECRUITER_MARGIN_GUARANTEE_ENABLED;
  try{
    delete process.env.AR_RECRUITER_MARGIN_GUARANTEE_ENABLED;
    const price=quote(5000,null,[],'US',0);
    assert.equal(price.appFee,290,'ordinary Travel must not incur speculative 30c surcharge');
    assert.equal(price.operatorGets,4950,'Operator retains 99% of Fare');
    assert.equal(fundedRecruiterSnapshot({travelCostCents:1750,travelerPays:2000,
      governmentFeeCents:0,tollCents:0,cardCountry:null},{enabled:true}).referralAvailableCents,30,
      'platform aggregate budget guarantees both legitimate roles');
    for(const [roles,expected] of [[[],0],[['operator'],15],[['traveler'],15],
      [['operator','traveler'],30]]){
      const db=new Db(roles);
      const result=await recordHeldAccrual({db,rideId:db.rideId,
        program:{...PROGRAM,enabled:true},now:1000});
      assert.equal(result.ok,true);
      assert.equal(result.heldCents,expected);
      assert.equal(result.events,roles.length);
      const events=[...db.docs.keys()].filter(x=>x.startsWith('referral_reward_events/'));
      assert.equal(events.length,roles.length);
      const before=db.writes;
      const replay=await recordHeldAccrual({db,rideId:db.rideId,
        program:{...PROGRAM,enabled:true},now:2000});
      assert.equal(replay.events,0,'no duplicate reward on retry');
      assert.equal(db.writes,before,'no duplicate writes');
    }
    const old='recruiter-15c-20261024-v1';
    const legacy=new Db(['operator'],old);
    const oldOutcome=await recordHeldAccrual({db:legacy,rideId:legacy.rideId,
      program:{...PROGRAM,version:old,enabled:true},now:1000});
    assert.equal(oldOutcome.heldCents,15,'existing v1 commitments still payable');
    console.log('PASS conditional 0/15/30c referrals, no universal pricing surcharge, 99% fare, legacy v1, idempotency');
  }finally{
    if(previous===undefined)delete process.env.AR_RECRUITER_MARGIN_GUARANTEE_ENABLED;
    else process.env.AR_RECRUITER_MARGIN_GUARANTEE_ENABLED=previous;
  }
})().catch(e=>{console.error(e);process.exitCode=1});
