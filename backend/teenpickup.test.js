const assert=require('node:assert/strict');
const path=require('node:path');
const {assignPaidTravel}=require('./booking');
const rows={};
const ref=(id)=>({id,get:async()=>({exists:!!rows[id],data:()=>structuredClone(rows[id])}),
  set:async(p)=>{rows[id]={...rows[id],...p};}});
const db={collection:()=>({doc:ref}),runTransaction:async(fn)=>fn({get:(r)=>r.get(),set:(r,p)=>r.set(p)})};
const file=require.resolve(path.join(__dirname,'firebase-admin.js'));
require.cache[file]={id:file,filename:file,loaded:true,exports:{adminDb:()=>db,adminStatus:()=>({reason:'db unavailable'})},children:[],paths:[]};
const {provisionTeenPin,verifyTeenPin,teenPinReady,teenMayBoard}=require('./teenpickup');
const before=process.env.TEEN_PIN_SECRET;
(async()=>{
 try{
  delete process.env.TEEN_PIN_SECRET;
  assert.equal(teenPinReady(),false);
  assert.equal((await verifyTeenPin({rideId:'r1',operatorUid:'op',pin:'1234'})).status,503);
  process.env.TEEN_PIN_SECRET='synthetic-private-teen-verification-secret-123456';
  assert.equal(teenPinReady(),true);
  const base={party:{teen:true},status:'accepted',operatorId:'op',travelerUid:'u',costCents:2500};
  rows.r1={...base};
  const first=await provisionTeenPin({rideRef:ref('r1'),rideId:'r1',party:base.party});
  assert(/^\d{4}$/.test(first.pin));
  const second=await provisionTeenPin({rideRef:ref('r1'),rideId:'r1',party:base.party});
  assert.equal(second.pin,first.pin);assert.equal(second.reused,true);
  assert(!teenMayBoard(rows.r1));
  for(const invalid of [null,0,false,'','123',Date.now()+60_000]){
    assert.equal(teenMayBoard({...rows.r1,teenPickup:{...rows.r1.teenPickup,verifiedAt:invalid}}),false,
      'unverified or forged Teen pickup timestamp must not permit boarding');
  }

  assert.equal((await verifyTeenPin({rideId:'r1',operatorUid:'stranger',pin:first.pin})).status,403);
  assert.equal((await verifyTeenPin({rideId:'r1',operatorUid:'op',pin:first.pin})).status,200);
  assert(teenMayBoard(rows.r1));
  rows.r1.operatorId='new-op';
  assert.equal(teenMayBoard(rows.r1),false,'former Operator approval cannot be reused after reassignment');
  assert.equal((await verifyTeenPin({rideId:'r1',operatorUid:'new-op',pin:first.pin})).status,200);
  assert.equal(teenMayBoard(rows.r1),true);
  rows.r2={...base};
  const locked=await provisionTeenPin({rideRef:ref('r2'),rideId:'r2',party:base.party});
  const wrong=locked.pin==='0000'?'0001':'0000';
  for(let i=0;i<5;i++)assert.equal((await verifyTeenPin({rideId:'r2',operatorUid:'op',pin:wrong})).status,403);
  assert.equal((await verifyTeenPin({rideId:'r2',operatorUid:'op',pin:locked.pin})).status,423);
  rows.r3={...base,status:'awaiting_payment',teenPickup:null,paymentIntentId:'pi',pickupLat:25.7617,pickupLng:-80.1918};
  const denied=await assignPaidTravel({db,uid:'u',rideId:'r3',payment:{id:'pi',status:'succeeded',amount_received:2500,currency:'usd',metadata:{uid:'u',rideId:'r3'}},candidate:null});
  assert.equal(denied.body.code,'teen_pin_unavailable');
  console.log('PASS Teen secret gate, stable keyed PIN, actual verification, five-attempt lockout and pre-offer refusal');
 }finally{if(before===undefined)delete process.env.TEEN_PIN_SECRET;else process.env.TEEN_PIN_SECRET=before;}
})().catch(e=>{console.error(e);process.exitCode=1;});
