// Adversarial tests for server-authoritative Operator Travel progression.
const assert = require('node:assert');
const { progressTravel } = require('./travelprogress');
const now = 1_790_390_000_000;
function dbFor(ride, operator) {
  const data={rides:{r1:{...ride}},operators:{op1:{...operator}}};
  const ref=(c,id)=>({get:async()=>({exists:!!data[c]?.[id],data:()=>({...data[c][id]})}),update:async p=>{data[c][id]={...data[c][id],...p}}});
  const db={collection:c=>({doc:id=>ref(c,id)})};
  db.runTransaction=async fn=>fn({get:r=>r.get(),update:(r,p)=>r.update(p)});
  return {db,data};
}
const base={operatorId:'op1',status:'accepted',pickupLat:25.7617,pickupLng:-80.1918,destinationLat:25.7907,destinationLng:-80.1300};
const atPickup={lat:25.7617,lng:-80.1918,onlineAt:now};
const atDest={lat:25.7907,lng:-80.1300,onlineAt:now};
const R=[];const check=(l,c,d)=>R.push({l,ok:!!c,d});
(async()=>{
 {const h=dbFor(base,atPickup);const o=await progressTravel({db:h.db,uid:'evil',rideId:'r1',status:'arrived',now});check('another Operator cannot progress the Travel',o.status===403&&h.data.rides.r1.status==='accepted');}
 {const h=dbFor(base,{...atPickup,onlineAt:now-6*60*1000});const o=await progressTravel({db:h.db,uid:'op1',rideId:'r1',status:'arrived',now});check('stale presence cannot manufacture arrival',o.body.code==='position_stale'&&h.data.rides.r1.status==='accepted');}
 {const h=dbFor(base,atDest);const o=await progressTravel({db:h.db,uid:'op1',rideId:'r1',status:'arrived',now});check('being at the destination cannot manufacture arrival at pickup',o.body.code==='outside_transition_radius');}
 {const h=dbFor(base,atPickup);const o=await progressTravel({db:h.db,uid:'op1',rideId:'r1',status:'arrived',now});check('current Operator at pickup can mark arrived',o.status===200&&h.data.rides.r1.status==='arrived'&&h.data.rides.r1.arrivedAt===now);}
 {const h=dbFor({...base,status:'arrived',party:{teen:true},teenPickup:{}},atPickup);const o=await progressTravel({db:h.db,uid:'op1',rideId:'r1',status:'onboard',now});check('Teen cannot board before server PIN verification',o.body.code==='teen_pickup_unverified');}
 // Real PIN provisioning explicitly stores verifiedAt:null; null must NEVER mean verified.
 for(const [name,verifiedAt] of [
   ['null',null],['zero',0],['false',false],['empty text',''],
   ['numeric text',String(now-1)],['future',now+60_000],['NaN',Number.NaN],
 ]){
   const h=dbFor({...base,status:'arrived',party:{teen:true},
     teenPickup:{required:true,hash:'synthetic-hash',verifiedAt}},atPickup);
   const o=await progressTravel({db:h.db,uid:'op1',rideId:'r1',status:'onboard',now});
   check('Teen PIN: '+name+' is not verified',o.status===409&&
     o.body.code==='teen_pickup_unverified'&&h.data.rides.r1.status==='arrived');
 }
 {const h=dbFor({...base,status:'arrived',party:{teen:true},teenPickup:{verifiedAt:now-1,verifiedBy:'op1'}},atPickup);const o=await progressTravel({db:h.db,uid:'op1',rideId:'r1',status:'onboard',now});check('verified Teen can board',o.status===200&&h.data.rides.r1.status==='onboard');}
 {const h=dbFor({...base,status:'arrived',party:{teen:false},adultPickup:{required:true,verifiedAt:null}},atPickup);const o=await progressTravel({db:h.db,uid:'op1',rideId:'r1',status:'onboard',now});check('enrolled adult requires verified pickup',o.body.code==='adult_pickup_unverified');}
 {const h=dbFor({...base,status:'arrived',party:{teen:false},adultPickup:{required:true,verifiedAt:now-100,verifiedBy:'previous-operator'}},atPickup);const o=await progressTravel({db:h.db,uid:'op1',rideId:'r1',status:'onboard',now});check('previous Operator cannot verify new assignment',o.body.code==='adult_pickup_unverified');}
 {const h=dbFor({...base,status:'arrived',party:{teen:false},adultPickup:{required:true,verifiedAt:now-100,verifiedBy:'op1'}},atPickup);const o=await progressTravel({db:h.db,uid:'op1',rideId:'r1',status:'onboard',now});check('current verified Operator can board adult',o.status===200);}
 {const h=dbFor({...base,status:'arrived',party:{teen:false}},atPickup);const o=await progressTravel({db:h.db,uid:'op1',rideId:'r1',status:'onboard',now});check('legacy TestFlight adult Travel continues normally',o.status===200);}
 {const h=dbFor({...base,status:'onboard'},atPickup);const o=await progressTravel({db:h.db,uid:'op1',rideId:'r1',status:'completed',now});check('pickup position cannot manufacture completion',o.body.code==='outside_transition_radius'&&!h.data.rides.r1.needsPayout);}
 {const h=dbFor({...base,status:'onboard'},atDest);const o=await progressTravel({db:h.db,uid:'op1',rideId:'r1',status:'completed',now});check('completion at destination queues payout server-side',o.status===200&&h.data.rides.r1.status==='completed'&&h.data.rides.r1.needsPayout===true);}
 {const h=dbFor({...base,status:'assigned'}, {...atPickup,currentRideId:'r1'});const o=await progressTravel({db:h.db,uid:'op1',rideId:'r1',status:'declined',now});check('decline releases the same paid Travel for reoffer and frees Operator capacity',o.status===200&&h.data.rides.r1.status==='assigned'&&h.data.rides.r1.releasedAt===now&&h.data.operators.op1.currentRideId===null);}
 {const h=dbFor({...base,status:'onboard'}, {...atDest,currentRideId:'r1'});const o=await progressTravel({db:h.db,uid:'op1',rideId:'r1',status:'completed',now});check('completion frees the Operator reservation',o.status===200&&h.data.operators.op1.currentRideId===null);}
 {const h=dbFor({...base,status:'onboard'}, {...atDest,currentRideId:'r1',nextRideId:'r2',nextReservedAt:now-1000});const o=await progressTravel({db:h.db,uid:'op1',rideId:'r1',status:'completed',now});check('completion atomically promotes queued Travel',o.status===200&&h.data.operators.op1.currentRideId==='r2'&&h.data.operators.op1.nextRideId===null);}
 {const h=dbFor({...base,status:'accepted'},atPickup);const o=await progressTravel({db:h.db,uid:'op1',rideId:'r1',status:'completed',now});check('Operator cannot jump accepted directly to completed',o.body.code==='invalid_transition'&&!h.data.rides.r1.needsPayout);}
 for(const r of R)console.log(`${r.ok?'PASS':'FAIL'}  ${r.l}${r.d?' — '+r.d:''}`);const bad=R.filter(x=>!x.ok);console.log(`\n${R.length-bad.length}/${R.length} passed`);assert.strictEqual(bad.length,0);
})();
