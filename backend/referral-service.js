'use strict';
// Verified referral attribution ONLY. Does not calculate or move cash/credits.
// This module is dormant unless server REFERRALS_ENABLED is explicitly enabled.
// One immutable attribution per invited identity and target role, independent of
// clicks, installations, QR views, or subsequent legitimate purchases.
const crypto=require('node:crypto');
const {normalizedCode,inviteLink,claimDecision}=require('./referral-policy');
const CLAIM_WINDOW_MS=72*60*60*1000;
const validRole=role=>role==='traveler'||role==='operator';

function formatLink(code,role,origin){
  const base=inviteLink(code,origin);
  return base&&validRole(role)?base+'&role='+role:null;
}
async function shareLink({db,uid,role,now=Date.now(),origin}){
  if(!db||!uid||!validRole(role))return {ok:false,reason:'invalid_request'};
  const ownerRef=db.collection('users').doc(uid);
  try {
    const code=await db.runTransaction(async tx=>{
      const owner=await tx.get(ownerRef);
      const existing=owner.exists?normalizedCode(owner.data()?.referralCode):null;
      // A cached profile code is not proof that the server-owned registry
      // still belongs to this account. Never share another person's link.
      if(existing){
        const registered=await tx.get(db.collection('referral_codes').doc(existing));
        if(registered.exists&&registered.data()?.ownerUid===uid&&
           registered.data()?.status==='active')return existing;
      }
      // 12 human-readable Crockford-style base32 characters (60 bits).
      // Public attribution identifier, not an authorization or payment secret.
      // Existing longer hex codes remain accepted by normalizedCode.
      const alphabet='23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
      const bytes=crypto.randomBytes(12);
      const fresh=Array.from(bytes,b=>alphabet[b&31]).join('');
      const ref=db.collection('referral_codes').doc(fresh);
      const check=await tx.get(ref);
      if(check.exists)throw Error('referral_code_collision');
      tx.create(ref,{ownerUid:uid,createdAt:now,status:'active'});
      tx.set(ownerRef,{referralCode:fresh},{merge:true});
      return fresh;
    });
    return {ok:true,url:formatLink(code,role,origin)};
  }catch{return {ok:false,reason:'share_unavailable'};}
}
// Firebase Auth creation time must come from the ADMIN provider and cannot be
// supplied by the phone. Existing Travelers do NOT become new Travelers by a
// new link. Existing Travelers becoming Operators have distinct new role intent.
// A qualified Operator cannot be attributed to another new recruiting partner.
async function claim({db,uid,code,role,authCreatedAtMs,now=Date.now()}){
  const token=normalizedCode(code);
  if(!db||!uid||!token||!validRole(role))return {ok:false,reason:'invalid_request'};
  if(!Number.isFinite(authCreatedAtMs)||authCreatedAtMs>now||
     authCreatedAtMs<=0)return {ok:false,reason:'creation_unverified'};
  if(role==='traveler'&&now-authCreatedAtMs>CLAIM_WINDOW_MS)
    return {ok:false,reason:'existing_traveler'};
  try{
    return await db.runTransaction(async tx=>{
      const codeRef=db.collection('referral_codes').doc(token);
      const invitedRef=db.collection('users').doc(uid);
      const claimRef=db.collection('referral_attributions').doc(uid+'_'+role);
      const fleetRef=db.collection('operators').doc(uid);
      // Read before any write; idempotent fixed document ID avoids duplicates.
      const [codeSnap,claimSnap,userSnap,fleetSnap]=await Promise.all([
        tx.get(codeRef),tx.get(claimRef),tx.get(invitedRef),
        role==='operator'?tx.get(fleetRef):Promise.resolve(null),
      ]);
      const entry=codeSnap.exists?codeSnap.data():{};
      if(!entry?.ownerUid||entry.status!=='active')return {ok:false,reason:'invalid_invite'};
      // Recruiter suspension must also stop claims from a previously shared link.
      // Ordinary Operator and Traveler inviters have no recruiter account.
      // A single named-document read on an actual claim avoids fleet-wide scans.
      const recruiterSnap=await tx.get(db.collection('recruiter_accounts').doc(entry.ownerUid));
      if(recruiterSnap.exists && recruiterSnap.data()?.status!=='approved')
        return {ok:false,reason:'referrer_not_eligible'};
      if(claimSnap.exists)return {ok:false,reason:'already_attributed'};
      // Do not reassign an already-qualified or formerly active Operator.
      const fleet=fleetSnap?.exists?fleetSnap.data():null;
      const qualified=userSnap.exists?userSnap.data()?.qualification?.qualifiedAt:null;
      const isActive=Boolean(fleet?.commissionedAt||fleet?.commissioned===true||
        fleet?.everCommissioned===true||qualified);
      const decision=claimDecision({
        referrerUid:entry.ownerUid,inviteeUid:uid,targetRole:role,
        alreadyClaimed:false,
        // A draft Operator record exists before qualification. Only a previously
        // commissioned or qualified role is ineligible for first attribution.
        alreadyActivatedRole:role==='operator'&&isActive,
        referrerEligible:entry.status==='active',
      });
      if(!decision.ok)return decision;
      tx.create(claimRef,{
        inviterUid:entry.ownerUid,inviteeUid:uid,role,
        claimedAt:now,program:'pending',rewardEnabled:false,
        // Never change this from a client or subsequent shared link.
        referralVersion:1,
      });
      return {ok:true,role,recorded:true,rewardEnabled:false};
    });
  }catch{return {ok:false,reason:'claim_unavailable'};}
}
module.exports={CLAIM_WINDOW_MS,formatLink,shareLink,claim};
