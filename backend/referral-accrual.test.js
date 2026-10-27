'use strict';
const assert=require('node:assert/strict');
const {PROGRAM,evidence,recordHeldAccrual}=require('./referral-accrual');
class Db{
  constructor(){this.rows=new Map();this.reads=0;this.writes=0;}
  collection(c){return {doc:(id)=>({path:c+'/'+id})};}
  async runTransaction(fn){
    const queued=[];
    const tx={
      get:async ref=>{this.reads++;const v=this.rows.get(ref.path);
        return {exists:v!==undefined,data:()=>v};},
      create:(ref,v)=>queued.push({type:'create',ref,v}),
      update:(ref,v)=>queued.push({type:'update',ref,v}),
    };
    const result=await fn(tx);
    for(const q of queued){
      if(q.type==='create'&&this.rows.has(q.ref.path))throw Error('duplicate');
      if(q.type==='update'&&!this.rows.has(q.ref.path))throw Error('missing');
      this.rows.set(q.ref.path,{...(this.rows.get(q.ref.path)||{}),...q.v});
      this.writes++;
    }
    return result;
  }
}
(async()=>{
const db=new Db(),rideId='travel-123456';
const ride={status:'completed',operatorId:'op-1',travelerUid:'trav-1',
  paymentIntentId:'pi_test_a',transferId:'tr_test_b',settledAt:1_000,
  paymentCapturePolicy:'manual_v1',authorizationState:'captured',
  capturedAt:998,capturedCents:2400,referralAvailableCents:30,
  referralProgramVersion:PROGRAM.version,referralAccrualPending:true};
db.rows.set('rides/'+rideId,ride);
const enabled={...PROGRAM,enabled:true};
for(const [uid,role] of [['op-1','operator'],['trav-1','traveler']]){
  db.rows.set('referral_attributions/'+uid+'_'+role,{
    role,inviteeUid:uid,inviterUid:'ref-'+role,rewardEnabled:true,
    programVersion:PROGRAM.version,qualifiedTravels:0,earnedCents:0});
}
assert.equal(evidence({...ride,authorizationState:'held'},rideId),null);
assert.equal(evidence({...ride,refundPending:true},rideId),null);
assert.equal(evidence({...ride,operatorDemo:true},rideId),null);
assert.equal(evidence({...ride,transferId:''},rideId),null);
assert.equal((await recordHeldAccrual({db,rideId})).reason,'program_off');
assert.equal(db.writes,0);
let x=await recordHeldAccrual({db,rideId,program:enabled,now:2000});
assert.deepEqual(x,{ok:true,events:2,heldCents:30});
const after=db.writes;
x=await recordHeldAccrual({db,rideId,program:enabled,now:3000});
assert.equal(x.events,0);
assert.equal(db.writes,after,'replay reads, no writes');
assert.equal(db.rows.get('referral_reward_events/'+rideId+'_operator').status,'held');
assert.equal(db.rows.get('referral_reward_events/'+rideId+'_traveler').amountCents,15);
assert.equal(db.rows.get('referral_attributions/op-1_operator').earnedCents,15);
assert.equal(db.rows.get('referral_attributions/trav-1_traveler').earnedCents,15);
assert.equal(db.rows.get('rides/'+rideId).referralAccrualPending,false);
assert.equal(db.rows.get('referral_reward_events/'+rideId+'_operator').nextReleaseAt,2000+PROGRAM.holdMs);
const ride2='travel-123457';
db.rows.set('rides/'+ride2,{...ride,referralAvailableCents:15});
x=await recordHeldAccrual({db,rideId:ride2,program:enabled});
assert.equal(x.events,1);
assert.equal(x.heldCents,15,'no more than one payment from $0.15 total budget');
const ride3='travel-123458';
db.rows.set('rides/'+ride3,{...ride,referralAvailableCents:undefined});
x=await recordHeldAccrual({db,rideId:ride3,program:enabled});
assert.equal(x.reason,'no_funded_budget');
const ride4='travel-123459';
db.rows.set('rides/'+ride4,{...ride});
db.rows.set('referral_attributions/op-1_operator',{
 ...db.rows.get('referral_attributions/op-1_operator'),
 qualifiedTravels:199,earnedCents:2985
});
x=await recordHeldAccrual({db,rideId:ride4,program:enabled});
assert.equal(x.events,2);
const ride5='travel-123460';db.rows.set('rides/'+ride5,{...ride});
x=await recordHeldAccrual({db,rideId:ride5,program:enabled});
assert.equal(x.events,1,'capped Operator may not receive a 201st Travel reward');
// Deterministic load test, NOT a physical-device/Stripe/provider stress proof:
 // 205 genuine-shaped settled Travels * 2 attributed roles, 3 retries per ride.
 // Each role earns exactly 200 qualifying $0.15 entries then must stop at $30.
 const stress=new Db(),traveler='stress-traveler',operator='stress-operator';
 for(const [uid,role] of [[traveler,'traveler'],[operator,'operator']]) {
   stress.rows.set('referral_attributions/'+uid+'_'+role,{
     role,inviteeUid:uid,inviterUid:'independent-recruiter-001',
     rewardEnabled:true,programVersion:PROGRAM.version,
     qualifiedTravels:0,earnedCents:0});
 }
 let total=0;
 for(let n=1;n<=205;n++){
   const id='travel-stress-'+String(n).padStart(5,'0');
   stress.rows.set('rides/'+id,{...ride,operatorId:operator,travelerUid:traveler,referralAvailableCents:30});
   const result=await recordHeldAccrual({db:stress,rideId:id,program:enabled,now:86400001+n});
   assert.equal(result.ok,true,'settled travel '+n);
   assert.equal(result.events,n<=200?2:0,'bounded role accrual on travel '+n);
   total+=result.heldCents;
   const writes=stress.writes;
   for(let repeat=0;repeat<3;repeat++){
     const again=await recordHeldAccrual({db:stress,rideId:id,program:enabled,now:86402000+n});
     assert.equal(again.events,0,'duplicate replay '+n);
     assert.equal(stress.writes,writes,'no duplicate writes '+n);
   }
 }
 assert.equal(total,6000,'200 x 15c x 2 roles = $60 total, never a 201st reward');
 for(const role of ['traveler','operator']){
   const uid=role==='traveler'?traveler:operator;
   const account=stress.rows.get('referral_attributions/'+uid+'_'+role);
   assert.equal(account.qualifiedTravels,200,role+' count');
   assert.equal(account.earnedCents,3000,role+' $30 cap');
   assert.equal(stress.rows.has('referral_reward_events/travel-stress-00201_'+role),false,
     role+' no 201st event');
 }
 assert.equal([...stress.rows.keys()].filter(k=>k.startsWith('referral_reward_events/')).length,400,
   'exactly 400 fixed-ID events, nothing for the 201st through 205th Travels');
 console.log('PASS referral-accrual 205x2-role cap/retry stress: 400 events, $60 max, 615 no-op retries');
 console.log('PASS referral-accrual: real ride fields, dual budgets, replay, cap, refund and program-off');
})().catch(e=>{console.error(e);process.exitCode=1;});
