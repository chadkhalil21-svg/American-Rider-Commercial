const assert=require('node:assert/strict');
const path=require('node:path');
const rows={};
const ref=(id)=>({id,get:async()=>({exists:!!rows[id],data:()=>structuredClone(rows[id])}),
  set:async(p)=>{rows[id]={...rows[id],...p};}});
const db={collection:(name)=>{assert.equal(name,'rides');return{doc:ref};},
  runTransaction:async fn=>fn({get:r=>r.get(),set:(r,p)=>r.set(p)})};
const file=require.resolve(path.join(__dirname,'firebase-admin.js'));
require.cache[file]={id:file,filename:file,loaded:true,exports:{adminDb:()=>db,adminStatus:()=>({reason:'unavailable'})},children:[],paths:[]};
const {travelerCode,verifyOperatorCode,operatorStatus,ready}=require('./adultpickup');
const beforeSecret=process.env.TEEN_PIN_SECRET, beforeMode=process.env.ADULT_PICKUP_VERIFICATION;
(async()=>{
 try {
  process.env.TEEN_PIN_SECRET='synthetic-test-only-strong-private-pin-secret-12345';
  delete process.env.ADULT_PICKUP_VERIFICATION;
  const id='a'.repeat(40);
  rows[id]={status:'accepted',travelerUid:'traveler',operatorId:'op',party:{teen:false}};
  assert.equal((await travelerCode({rideId:id,travelerUid:'traveler'})).enabled,false);
  assert.equal(rows[id].adultPickup,undefined,'old app never automatically enters secure flow');
  process.env.ADULT_PICKUP_VERIFICATION='on';
  assert.equal(ready(),true);
  assert.equal((await travelerCode({rideId:id,travelerUid:'stranger'})).status,403);
  const r=await travelerCode({rideId:id,travelerUid:'traveler',now:100});
  assert.match(r.pin,/^\d{6}$/);
  assert.equal(rows[id].adultPickup.required,true);
  assert.equal(rows[id].adultPickup.hash.length,64);
  assert.equal((await operatorStatus({rideId:id,operatorUid:'stranger'})).status,403);
  assert.equal((await operatorStatus({rideId:id,operatorUid:'op'})).verified,false);
  assert.equal((await verifyOperatorCode({rideId:id,operatorUid:'stranger',pin:r.pin})).status,403);
  assert.equal((await verifyOperatorCode({rideId:id,operatorUid:'op',pin:r.pin,now:200})).verified,true);
  assert.equal((await operatorStatus({rideId:id,operatorUid:'op'})).verified,true);
  rows[id].operatorId='reassigned';
  assert.equal((await operatorStatus({rideId:id,operatorUid:'reassigned'})).verified,false,
    'old Operator cannot verify for a newly assigned Operator');
  assert.equal((await verifyOperatorCode({rideId:id,operatorUid:'reassigned',pin:r.pin,now:201})).verified,true);
  const lockedId='b'.repeat(40);
  rows[lockedId]={status:'arrived',travelerUid:'traveler',operatorId:'op',party:{teen:false}};
  const locked=await travelerCode({rideId:lockedId,travelerUid:'traveler'});
  const invalid=locked.pin==='000000'?'000001':'000000';
  for(let i=0;i<5;i++)assert.equal((await verifyOperatorCode({rideId:lockedId,operatorUid:'op',pin:invalid})).status,403);
  assert.equal((await verifyOperatorCode({rideId:lockedId,operatorUid:'op',pin:locked.pin})).status,423);
  rows[lockedId].status='completed';
  assert.equal((await travelerCode({rideId:lockedId,travelerUid:'traveler'})).status,409);
  const teenId='c'.repeat(40);
  rows[teenId]={status:'accepted',travelerUid:'teen',operatorId:'op',party:{teen:true}};
  assert.equal((await travelerCode({rideId:teenId,travelerUid:'teen'})).status,409);
  console.log('PASS Adult private pickup code: disabled-by-default rollout, traveler ownership, six digits, current Operator, five-attempt lockout, Teen separation');
 } finally {
  if(beforeSecret===undefined)delete process.env.TEEN_PIN_SECRET;else process.env.TEEN_PIN_SECRET=beforeSecret;
  if(beforeMode===undefined)delete process.env.ADULT_PICKUP_VERIFICATION;else process.env.ADULT_PICKUP_VERIFICATION=beforeMode;
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
