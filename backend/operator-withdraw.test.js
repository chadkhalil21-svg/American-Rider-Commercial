'use strict';
// Provider-free synthetic acceptance of one original Travel and one original
// payment. No credentials, no Firestore writes, no new customer or Stripe charge.
const assert=require('node:assert/strict');
const {withdrawAcceptedTravel}=require('./travelprogress');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const NOW=2_000_000_000_000;
function fixture(status='accepted',extras={}) {
  const data={
    rides:{r1:{operatorId:'op1',travelerUid:'traveler',status,tripNo:'AR-1-MIA',
      paymentIntentId:'pi_same',costCents:2575,travelCostCents:1900,createdAt:NOW-60_000,
      party:{teen:true},teenPickup:{hash:'one-pin',verifiedAt:NOW-2000,verifiedBy:'op1'},
      ...extras}},
    operators:{op1:{currentRideId:'r1',available:true,onlineAt:NOW}},
  };
  const ref=(c,id)=>({c,id});
  const db={collection:c=>({doc:id=>ref(c,id)}),
    async runTransaction(fn){
      const writes=[];
      const tx={
        get:async r=>({exists:Object.hasOwn(data[r.c]||{},r.id),
          data:()=>structuredClone(data[r.c][r.id])}),
        update:(r,p)=>writes.push([r,structuredClone(p)]),
      };
      const result=await fn(tx);
      for(const [r,p] of writes)Object.assign(data[r.c][r.id],p);
      return result;
    }};
  return {db,data};
}
async function main(){
  const h=fixture();
  const first=await withdrawAcceptedTravel({db:h.db,uid:'op1',rideId:'r1',now:NOW});
  assert.equal(first.status,200);
  assert.equal(first.body.searchingReplacement,true);
  assert.equal(h.data.rides.r1.status,'assigned');
  assert.equal(h.data.rides.r1.releasedReason,'operator_withdrawn');
  assert.equal(h.data.rides.r1.releasedAt,NOW);
  assert.equal(h.data.rides.r1.operatorWithdrawalAt,NOW);
  assert.deepEqual(h.data.rides.r1.declinedBy,['op1']);
  assert.equal(h.data.rides.r1.paymentIntentId,'pi_same');
  assert.equal(h.data.rides.r1.costCents,2575);
  assert.equal(h.data.rides.r1.travelCostCents,1900);
  assert.equal(h.data.rides.r1.tripNo,'AR-1-MIA');
  assert.equal(h.data.rides.r1.teenPickup.hash,'one-pin');
  assert.equal(h.data.rides.r1.teenPickup.verifiedAt,null);
  assert.equal(h.data.operators.op1.available,false);
  assert.equal(h.data.operators.op1.currentRideId,null);

  const after=JSON.stringify(h.data);
  const duplicate=await withdrawAcceptedTravel({db:h.db,uid:'op1',rideId:'r1',now:NOW+1000});
  assert.equal(duplicate.status,200);
  assert.equal(duplicate.body.unchanged,true);
  assert.equal(JSON.stringify(h.data),after,'retry cannot reprice or extend deadline');

  for(const s of ['accepted','arrived']){
    const x=fixture(s,{party:{teen:false},teenPickup:undefined});
    const denied=await withdrawAcceptedTravel({db:x.db,uid:'intruder',rideId:'r1',now:NOW});
    assert.equal(denied.status,403);
    assert.equal(x.data.rides.r1.status,s);
    const ok=await withdrawAcceptedTravel({db:x.db,uid:'op1',rideId:'r1',now:NOW});
    assert.equal(ok.status,200,'both preboarding stages allow a safe exception');
    assert.equal(x.data.rides.r1.status,'assigned');
  }
  for(const s of ['onboard','completed','cancelled']){
    const x=fixture(s);
    const denied=await withdrawAcceptedTravel({db:x.db,uid:'op1',rideId:'r1',now:NOW});
    assert.equal(denied.status,409,'never fake cancellation of a boarded or finished Travel');
    assert.equal(x.data.rides.r1.status,s);
    assert.equal(x.data.operators.op1.available,true);
  }
  assert.equal((await withdrawAcceptedTravel({db:h.db,uid:'op1',rideId:'missing'})).status,404);

  const server=read('backend/server.js');
  const route=server.slice(server.indexOf("app.post('/travel/operator-withdraw'"),
    server.indexOf("app.post('/travel/progress'"));
  assert.match(route,/requireAuth, requireFreshAuth, LIMITS\.dispatch/);
  assert.doesNotMatch(route,/requireOperationalReadiness/,'coverage lapse cannot block safe withdrawal');
  assert.match(route,/notify\(/,'notify Traveler and guardian');
  assert.match(route,/res\.status\(out\.status\)\.json\(out\.body\)/);
  const front=read('app/operator/pickup.tsx');
  assert.match(front,/withdrawAcceptedOp\(\)/);
  assert.match(front,/Alert\.alert\(/,'destructive action requires explicit confirmation');
  assert.match(read('src/state/OperatorContext.tsx'),/if \(!result\.ok\) return result/);
  assert.match(read('backend/monitor.js'),/WITHDRAWN_REPLACEMENT_MS/);
  assert.match(read('backend/push.js'),/operator_withdrawn: \{ pref: null, required: true/);
  assert.match(read('backend/push.js'),/operator_unavailable: \{ pref: null, required: true/);
  for(const lang of ['en','es','fr','it','de']){
    const locale=read('src/i18n/'+lang+'.ts');
    for(const key of ['withdrawTravel','withdrawExplanation','withdrawFailed'])
      assert.match(locale,new RegExp('^\\s*'+key+':','m'),lang+' missing '+key);
  }
  console.log('PASS accepted Operator withdrawal: identity, idempotency, same money/ride, Teen reset, lifecycle, alerts and five locales');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
