'use strict';
// Adult pickup verification: unlike the legacy code derived from the visible
// Travel Number, only the authenticated Traveler receives this keyed code.
// Activation is held behind an explicit rollout switch until BOTH mobile roles
// ship the updated screens; old TestFlight Operators must not be stranded.
const crypto = require('node:crypto');
const { readKey } = require('./env');
const { adminDb, adminStatus } = require('./firebase-admin');

const enabled = () => String(readKey('ADULT_PICKUP_VERIFICATION') || '').toLowerCase() === 'on';
const secret = () => String(readKey('TEEN_PIN_SECRET') || '');
const ready = () => enabled() && secret().length >= 32;
const mac = (message) => crypto.createHmac('sha256', secret()).update(message).digest();
const codeFor = (id) => String(mac('adult-pickup:code:' + id).readUInt32BE(0) % 1_000_000).padStart(6, '0');
const digest = (id, code) => mac('adult-pickup:verify:' + id + ':' + code).toString('hex');
const denied = (status, code) => ({ok:false,status,code});
const state = (ride) => ({enabled:enabled(),required:ride?.adultPickup?.required === true,
  verified: Number.isSafeInteger(ride?.adultPickup?.verifiedAt) && ride.adultPickup.verifiedAt > 0});

async function travelerCode({db=adminDb(),rideId,travelerUid,now=Date.now()}) {
  if(!enabled())return {ok:true,status:200,enabled:false};
  if(!ready())return denied(503,'pickup_verification_unavailable');
  if(!db)return denied(503,'database_unavailable');
  const ref=db.collection('rides').doc(String(rideId||''));
  return db.runTransaction(async(tx)=>{
    const snap=await tx.get(ref);
    if(!snap.exists)return denied(404,'travel_not_found');
    const ride=snap.data()||{};
    if(String(ride.travelerUid||'')!==String(travelerUid||'')||!travelerUid) return denied(403,'not_your_travel');
    if(ride.party?.teen===true)return denied(409,'teen_has_separate_verification');
    if(!['accepted','arrived'].includes(String(ride.status)))return denied(409,'pickup_not_ready');
    const code=codeFor(String(rideId));
    const hash=digest(String(rideId),code);
    const prior=ride.adultPickup;
    if(prior?.verifiedAt)return {ok:true,status:200,enabled:true,required:true,verified:true};
    if(prior?.required===true){
      if(prior.hash!==hash)return denied(409,'pickup_security_reset_required');
      if(Number(prior.failedAttempts||0)>=5)return denied(423,'pickup_code_locked');
    }else{
      // A previous TestFlight version never enrolls itself. Enrollment is only
      // by the Traveler's authenticated new client once rollout is enabled.
      tx.set(ref,{adultPickup:{required:true,hash,failedAttempts:0,
        verifiedAt:null,createdAt:now}},{merge:true});
    }
    return {ok:true,status:200,enabled:true,required:true,verified:false,pin:code};
  });
}

async function operatorStatus({db=adminDb(),rideId,operatorUid}){
  if(!db)return denied(503,'database_unavailable');
  const snap=await db.collection('rides').doc(String(rideId||'')).get();
  if(!snap.exists)return denied(404,'travel_not_found');
  const ride=snap.data()||{};
  if(!operatorUid||String(ride.operatorId||'')!==String(operatorUid))return denied(403,'not_your_travel');
  return {ok:true,status:200,...state(ride)};
}
async function verifyOperatorCode({db=adminDb(),rideId,operatorUid,pin,now=Date.now()}){
  if(!db)return denied(503,'database_unavailable');
  const ref=db.collection('rides').doc(String(rideId||''));
  return db.runTransaction(async tx=>{
    const snap=await tx.get(ref);
    if(!snap.exists)return denied(404,'travel_not_found');
    const ride=snap.data()||{};
    if(!operatorUid||String(ride.operatorId||'')!==String(operatorUid))return denied(403,'not_your_travel');
    if(ride.party?.teen===true)return denied(409,'teen_has_separate_verification');
    if(ride.adultPickup?.required!==true)return {ok:true,status:200,required:false};
    if(!['accepted','arrived'].includes(String(ride.status)))return denied(409,'pickup_not_ready');
    if(!ready())return denied(503,'pickup_verification_unavailable');
    if(ride.adultPickup.verifiedAt)return {ok:true,status:200,required:true,verified:true};
    if(Number(ride.adultPickup.failedAttempts||0)>=5)return denied(423,'pickup_code_locked');
    const given=String(pin||'');
    const attempt=/^\d{6}$/.test(given)?digest(String(rideId),given):'';
    const expected=String(ride.adultPickup.hash||'');
    if(!attempt||!/^[a-f0-9]{64}$/.test(expected)||
      !crypto.timingSafeEqual(Buffer.from(attempt,'hex'),Buffer.from(expected,'hex'))){
      tx.set(ref,{adultPickup:{...ride.adultPickup,
        failedAttempts:Number(ride.adultPickup.failedAttempts||0)+1,
        lastFailedAt:now}},{merge:true});
      return denied(403,'pickup_code_incorrect');
    }
    tx.set(ref,{adultPickup:{...ride.adultPickup,verifiedAt:now,
      verifiedBy:String(operatorUid)}},{merge:true});
    return {ok:true,status:200,required:true,verified:true};
  });
}
module.exports={enabled,ready,codeFor,travelerCode,operatorStatus,verifyOperatorCode};
