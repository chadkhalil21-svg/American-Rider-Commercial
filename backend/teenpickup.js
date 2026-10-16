// Teen pickup verification is independent of a provider's push delivery and is never entrusted
// to a four-digit unkeyed hash readable from a Firestore ride snapshot.
const crypto=require('node:crypto');
const {adminDb,adminStatus}=require('./firebase-admin');
const {readKey}=require('./env');
const pinSecret=()=>String(readKey('TEEN_PIN_SECRET')||'');
const teenPinReady=()=>pinSecret().length>=32;
const mac=(value)=>crypto.createHmac('sha256',pinSecret()).update(value).digest();
function pinForRide(rideId,expectedHash=null){
 if(!teenPinReady())throw new Error('Teen pickup security is not configured');
 const pin=String(mac(`pin:${rideId}`).readUInt32BE(0)%10000).padStart(4,'0');
 if(expectedHash && digest(rideId,pin)!==expectedHash)throw new Error('Teen pickup code requires a secure reset');
 return pin;
}
const digest=(rideId,pin)=>mac(`verify:${rideId}:${pin}`).toString('hex');
async function provisionTeenPin({rideRef,rideId,party,now=Date.now()}){
 if(party?.teen!==true)return {ok:true,required:false};
 if(!teenPinReady())throw new Error('Teen pickup security is not configured');
 const pin=pinForRide(rideId);const hash=digest(rideId,pin);
 const prior=await rideRef.get();
 if(!prior.exists)throw new Error('Teen Travel is not staged');
 const existing=prior.data()?.teenPickup;
 if(existing?.hash){
   if(existing.hash!==hash)throw new Error('Existing Teen code cannot be safely recovered; human reset required');
   return {ok:true,required:true,pin,reused:true};
 }
 await rideRef.set({teenPickup:{required:true,hash,verifiedAt:null,failedAttempts:0,createdAt:now}},{merge:true});
 return {ok:true,required:true,pin};
}
async function verifyTeenPin({rideId,operatorUid,pin,now=Date.now()}){
 if(!teenPinReady())return {ok:false,status:503,error:'Teen pickup security is unavailable',code:'teen_pin_unavailable'};
 const db=adminDb();if(!db)return {ok:false,status:503,error:adminStatus().reason};
 const ref=db.collection('rides').doc(String(rideId));
 return db.runTransaction(async tx=>{const s=await tx.get(ref);if(!s.exists)return {ok:false,status:404,error:'No such Travel'};const r=s.data()||{};
  if(String(r.operatorId)!==String(operatorUid))return {ok:false,status:403,error:'That Travel is not assigned to this Operator'};
  if(r.party?.teen!==true)return {ok:true,status:200,required:false};
  if(!['accepted','arrived'].includes(String(r.status)))return {ok:false,status:409,error:'Pickup verification is not available in this Travel state'};
  if(r.teenPickup?.verifiedAt && String(r.teenPickup.verifiedBy||'')===String(operatorUid))return {ok:true,status:200,required:true,verified:true};
  if(!r.teenPickup?.required||!/^[0-9a-f]{64}$/.test(String(r.teenPickup.hash||'')))return {ok:false,status:409,error:'Pickup code was not securely provisioned',code:'teen_pin_unavailable'};
  if(Number(r.teenPickup.failedAttempts||0)>=5)return {ok:false,status:423,error:'Pickup code is locked. Contact Patron Support.',code:'teen_pin_locked'};
  const entered=/^\d{4}$/.test(String(pin||'')) ? digest(rideId,pin) : '';
  if(!entered||!crypto.timingSafeEqual(Buffer.from(entered,'hex'),Buffer.from(r.teenPickup.hash,'hex'))){
    tx.set(ref,{teenPickup:{...r.teenPickup,failedAttempts:Number(r.teenPickup.failedAttempts||0)+1,lastFailedAt:now}},{merge:true});
    return {ok:false,status:403,error:'The pickup code is not correct',code:'teen_pin_invalid'};
  }
  tx.set(ref,{teenPickup:{...r.teenPickup,verifiedAt:now,verifiedBy:String(operatorUid)}},{merge:true});return {ok:true,status:200,required:true,verified:true};
 });
}
function teenMayBoard(ride, now = Date.now()){
 if(ride?.party?.teen!==true)return true;
 const verifiedAt=ride?.teenPickup?.verifiedAt;
 // The unverified state is explicitly null. Only a genuine server-stamped time is proof.
 return Number.isSafeInteger(verifiedAt)&&verifiedAt>0&&verifiedAt<=now&&
  !!ride.operatorId&&String(ride.teenPickup?.verifiedBy||'')===String(ride.operatorId);
}
module.exports={provisionTeenPin,verifyTeenPin,teenMayBoard,teenPinReady,pinForRide};
