// American Rider Family / Teen Travel — server-authoritative relationship and Travel policy.
const crypto = require('node:crypto');
const { adminDb, adminStatus } = require('./firebase-admin');

const COLLECTION='family_links';
const MIN_AGE=13, MAX_AGE=17;
const clean=(v,n=80)=>String(v||'').trim().replace(/\s+/g,' ').slice(0,n);
const code=()=>crypto.randomBytes(32).toString('hex');
const tokenHash=(v)=>crypto.createHash('sha256').update(String(v||'')).digest('hex');
const INVITE_TTL_MS=7*24*60*60*1000;

function ageOn(dob, now=Date.now()){
  const d=new Date(String(dob||'')+'T00:00:00Z'); if(!Number.isFinite(d.getTime())) return null;
  const n=new Date(now); let a=n.getUTCFullYear()-d.getUTCFullYear();
  if(n.getUTCMonth()<d.getUTCMonth() || (n.getUTCMonth()===d.getUTCMonth()&&n.getUTCDate()<d.getUTCDate())) a--;
  return a;
}
async function createFamilyInvite({guardianUid,guardianName,teenName,teenEmail,teenDob,now=Date.now()}){
 const db=adminDb(); if(!db)return {ok:false,reason:adminStatus().reason};
 const age=ageOn(teenDob,now); if(age===null||age<MIN_AGE||age>MAX_AGE)return {ok:false,reason:'Teen Traveler must be 13–17.'};
 const ref=db.collection(COLLECTION).doc();
 const inviteToken=code();
 await ref.set({guardianUid:String(guardianUid),guardianName:clean(guardianName),teenUid:null,teenName:clean(teenName),teenEmail:clean(teenEmail,160).toLowerCase(),teenDob:String(teenDob),status:'invited',inviteTokenHash:tokenHash(inviteToken),inviteExpiresAt:now+INVITE_TTL_MS,createdAt:now,updatedAt:now,revokedAt:null});
 return {ok:true,id:ref.id,inviteToken};
}
async function acceptFamilyInvite({id,inviteToken,teenUid,teenEmail,emailVerified=false,now=Date.now()}){
 const db=adminDb(); if(!db)return {ok:false,reason:adminStatus().reason};
 const ref=db.collection(COLLECTION).doc(String(id));
 return db.runTransaction(async tx=>{const s=await tx.get(ref);if(!s.exists)return {ok:false,reason:'invite not found'};const x=s.data()||{};
  if(x.status!=='invited'||x.inviteTokenHash!==tokenHash(inviteToken)||!teenUid||Number(x.inviteExpiresAt||0)<now)return {ok:false,reason:'invite invalid'};
  if(!emailVerified||!teenEmail||String(x.teenEmail||'').toLowerCase()!==String(teenEmail).trim().toLowerCase())return {ok:false,reason:'Invite must be accepted by the verified Teen account it was addressed to.'};
  if(String(x.guardianUid)===String(teenUid))return {ok:false,reason:'Guardian and Teen accounts must be different.'};
  if((ageOn(x.teenDob,now)||0)<MIN_AGE||(ageOn(x.teenDob,now)||99)>MAX_AGE)return {ok:false,reason:'Teen Traveler is not eligible.'};
  tx.set(ref,{teenUid:String(teenUid),status:'active',inviteTokenHash:null,inviteExpiresAt:null,acceptedAt:now,updatedAt:now},{merge:true});return {ok:true,id:ref.id};
 });
}
async function revokeFamilyLink({id,guardianUid,now=Date.now()}){
 const db=adminDb();if(!db)return {ok:false,reason:adminStatus().reason};const ref=db.collection(COLLECTION).doc(String(id));
 const revoked=await db.runTransaction(async tx=>{
  const s=await tx.get(ref);if(!s.exists||String(s.data()?.guardianUid)!==String(guardianUid))return false;
  tx.set(ref,{status:'revoked',revokedAt:now,updatedAt:now},{merge:true});return true;
 });
 if(!revoked)return {ok:false,reason:'not authorized'};
 // Revocation governs future Teen Travel. A Teen already onboard is never stranded by
 // administrative relationship changes; underway Travels retain their existing safety envelope.
 let cancelledScheduledTravels=0,pendingScheduledTravels=0;
 for(let page=0;page<20;page++){
  const q=await db.collection('scheduled_rides').where('party.familyLinkId','==',String(id)).where('status','==','reserved').limit(100).get();
  if(!q.docs.length)break;
  for(const d of q.docs){
   const disposition=await db.runTransaction(async tx=>{
    const current=await tx.get(d.ref);const row=current.exists?current.data():null;
    if(String(row?.party?.familyLinkId)!==String(id))return 'unchanged';
    if(row.status==='reserved'){
     tx.update(d.ref,{status:'cancelled',cancelledAt:now,closedReason:'Family authorization revoked.'});return 'cancelled';
    }
    if(row.status==='dispatching'){
     tx.update(d.ref,{cancelRequestedAt:now,closedReason:'Family authorization revoked during dispatch.'});return 'pending';
    }
    return 'unchanged';
   });
   if(disposition==='cancelled')cancelledScheduledTravels++;
   if(disposition==='pending')pendingScheduledTravels++;
  }
 }
 const active=await db.collection('scheduled_rides').where('party.familyLinkId','==',String(id)).where('status','==','dispatching').limit(100).get();
 for(const d of active.docs){
  const pending=await db.runTransaction(async tx=>{
   const s=await tx.get(d.ref);if(!s.exists||s.data().status!=='dispatching'||String(s.data().party?.familyLinkId)!==String(id)||s.data().cancelRequestedAt)return false;
   tx.update(d.ref,{cancelRequestedAt:now,closedReason:'Family authorization revoked during dispatch.'});return true;
  });
  if(pending)pendingScheduledTravels++;
 }
 const remaining=await db.collection('scheduled_rides').where('party.familyLinkId','==',String(id)).where('status','==','reserved').limit(1).get();
 const overCapacity=active.docs.length===100||remaining.docs.length>0;
 return {ok:!overCapacity,cancelledScheduledTravels,pendingScheduledTravels,
  ...(overCapacity?{reason:'Family authorization revoked, but scheduled reservations require Operations reconciliation'}:{})};
}
async function listFamilyLinks({uid,now=Date.now()}){const db=adminDb();if(!db)return {ok:false,reason:adminStatus().reason};const [g,t]=await Promise.all([db.collection(COLLECTION).where('guardianUid','==',String(uid)).get(),db.collection(COLLECTION).where('teenUid','==',String(uid)).get()]);const seen=new Map();for(const d of [...g.docs,...t.docs]){const x={id:d.id,...d.data()};seen.set(d.id,{id:d.id,status:x.status,role:String(x.guardianUid)===String(uid)?'guardian':'teen',guardianName:x.guardianName,teenName:x.teenName,eligible:x.status==='active'&&ageOn(x.teenDob,now)>=MIN_AGE&&ageOn(x.teenDob,now)<=MAX_AGE,inviteExpiresAt:x.status==='invited'?x.inviteExpiresAt:null});}return {ok:true,links:[...seen.values()]};}
async function activeFamilyLink({id,guardianUid=null,teenUid=null,now=Date.now()}){
 const db=adminDb();if(!db)return null;const s=await db.collection(COLLECTION).doc(String(id)).get();if(!s.exists)return null;const x={id:s.id,...s.data()};
 if(x.status!=='active'||ageOn(x.teenDob,now)<MIN_AGE||ageOn(x.teenDob,now)>MAX_AGE)return null;
 if(guardianUid&&String(x.guardianUid)!==String(guardianUid))return null;if(teenUid&&String(x.teenUid)!==String(teenUid))return null;return x;
}
async function normalizeTeenParty({familyLinkId,requesterUid,bookerUid,journeyNo=null,now=Date.now()}){
 const requester=String(requesterUid), db=adminDb();
 // Smart Travel is one journey with two car legs. Once leg 1 has completed, leg 2 inherits
 // the exact server-stamped Family party from leg 1. A guardian revocation or eighteenth
 // birthday blocks NEW Teen Travel, but cannot strand a Teen at a transit interchange in a
 // journey American Rider has already undertaken to complete.
 if(journeyNo&&db){
  const q=await db.collection('rides').where('travelerUid','==',requester).where('tripNo','==',String(journeyNo).slice(0,24)).limit(1).get();
  const first=q.docs[0]?.data();
  if(first&&first.status==='completed'&&first.paymentIntentId&&first.party?.teen===true&&!first.journeyNo&&String(first.party.familyLinkId)===String(familyLinkId)){
   const p=first.party;
   if(requester===String(p.guardianUid)||requester===String(p.teenUid))return {ok:true,party:{...p,continuedFromJourneyNo:String(journeyNo)}};
  }
 }
 const link=await activeFamilyLink({id:familyLinkId,now});if(!link)return {ok:false,code:'family_authorization_required',error:'An active Family authorization is required.'};
 const guardian=String(link.guardianUid), teen=String(link.teenUid);
 if(requester!==guardian&&requester!==teen)return {ok:false,code:'family_authorization_required',error:'This Family authorization does not belong to this account.'};
 if(String(bookerUid)!==guardian&&String(bookerUid)!==teen)return {ok:false,code:'family_authorization_required',error:'Invalid Family Booker.'};
 return {ok:true,party:{mode:'teen',travelerName:link.teenName,bookerName:link.guardianName,bookedForAnother:requester===guardian,teen:true,familyLinkId:link.id,guardianUid:guardian,teenUid:teen,guardianName:link.guardianName,pinRequired:true,guardianTracking:true,guardianMessaging:true}};
}


async function listGuardianActiveTravels({guardianUid}){
 const db=adminDb();if(!db)return {ok:false,reason:adminStatus().reason};
 const q=await db.collection('rides').where('party.guardianUid','==',String(guardianUid))
   .where('status','in',['assigned','accepted','arrived','onboard']).limit(100).get();
 const active=[];
 for(const d of q.docs){const r=d.data()||{};if(r.party?.teen===true&&String(r.party?.guardianUid)===String(guardianUid))active.push({id:d.id,tripNo:r.tripNo||d.id,status:r.status,travelerName:r.party?.travelerName||'Teen Traveler',operatorName:r.operatorName||'',operatorId:r.operatorId||'',travelerUid:r.travelerUid||'',dep:r.dep||'',dest:r.dest||'',createdAt:Number(r.createdAt)||0});}
 active.sort((a,b)=>b.createdAt-a.createdAt);return {ok:true,travels:active,overCapacity:q.docs.length>=100};
}
async function sweepFamilyAgeOut({now=Date.now()}={}){
 const db=adminDb();if(!db)return {ok:false,reason:adminStatus().reason};
 const q=await db.collection(COLLECTION).where('status','==','active').get();let agedOut=0,cancelledScheduledTravels=0;
 let incomplete=false;
 for(const d of q.docs){const x=d.data()||{},age=ageOn(x.teenDob,now);if(age!==null&&age>=MIN_AGE&&age<=MAX_AGE)continue;
  await d.ref.set({status:'aged_out',agedOutAt:now,updatedAt:now},{merge:true});agedOut++;
  // Query only this Family's reserved journeys. Reading EVERY reservation once per
  // aged-out Teen was unbounded in Firestore reads and could grow quadratically.
  // The existing compound index covers party.familyLinkId + status.
  let more=false;
  for(let page=0;page<20;page++){
   const reserved=await db.collection('scheduled_rides')
    .where('party.familyLinkId','==',String(d.id)).where('status','==','reserved').limit(100).get();
   if(!reserved.docs.length){more=false;break;}
   more=true;
   let changed=0;
   for(const r of reserved.docs){
    // A scheduler can claim a reserved journey after the query. Check again
    // inside a transaction; never cancel a Travel that has begun dispatch.
    const cancelled=await db.runTransaction(async tx=>{
     const latest=await tx.get(r.ref),v=latest.exists?latest.data():null;
     if(v?.status!=='reserved'||v.party?.teen!==true||
       String(v.party?.familyLinkId)!==String(d.id))return false;
     tx.update(r.ref,{status:'cancelled',cancelledAt:now,closedReason:'Teen Traveler is no longer age-eligible.'});
     return true;
    });
    if(cancelled){changed++;cancelledScheduledTravels++;}
   }
   // Invalid/non-Teen rows must not trap a scheduled sweep in an infinite retry.
   if(changed===0)break;
  }
  if(more)incomplete=true;
 }
 return {ok:!incomplete,agedOut,cancelledScheduledTravels,
   ...(incomplete?{reason:'Some age-out reservations need another bounded reconciliation pass.'}:{})};
}
function operatorTeenView(p={}){return p.teen===true?{travelerName:clean(p.travelerName),bookedForAnother:p.bookedForAnother===true,teen:true,guardianName:clean(p.guardianName),pinRequired:true}:{travelerName:clean(p.travelerName||'Traveler'),bookedForAnother:p.bookedForAnother===true,teen:false};}
module.exports={COLLECTION,MIN_AGE,MAX_AGE,ageOn,createFamilyInvite,acceptFamilyInvite,revokeFamilyLink,listFamilyLinks,activeFamilyLink,normalizeTeenParty,listGuardianActiveTravels,sweepFamilyAgeOut,operatorTeenView};
