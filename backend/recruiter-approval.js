'use strict';
// Founder-approved INDEPENDENT recruiters, prelaunch source-only.
// The same Firebase uid owns the same opaque referral link. No second referral
// database, public self-registration, QR scan writes, recruitment app or payouts.
// This helper is deliberately NOT mounted in production routes. Approval records
// may only be written from an authenticated, separately audited Operations flow.
// Firebase client rules deny reads/writes to recruiter_approvals by default.
const {shareLink}=require('./referral-service');

const PROGRAM_ENABLED=false;
const validRole=role=>role==='operator'||role==='traveler';
const ownUid=uid=>typeof uid==='string'&&uid.length>=4&&uid.length<=128&&!uid.includes('/');
function eligibleApproval(approval,role,now=Date.now()){
  if(!approval||typeof approval!=='object'||!validRole(role)||
     !Number.isSafeInteger(now)||now<=0)return false;
  if(approval.status!=='approved'||approval.suspended===true||
     approval.identityVerified!==true||approval.agreementAccepted!==true||
     approval.payoutEligibilityVerified!==true||
     !Array.isArray(approval.allowedRoles)||!approval.allowedRoles.includes(role))return false;
  if(typeof approval.approvedBy!=='string'||approval.approvedBy.length<2||
     !Number.isSafeInteger(approval.approvedAt)||approval.approvedAt<=0||
     approval.approvedAt>now||
     !Number.isSafeInteger(approval.agreementAcceptedAt)||
     approval.agreementAcceptedAt<=0||approval.agreementAcceptedAt>now)return false;
  if(!Number.isSafeInteger(approval.expiresAt)||approval.expiresAt<=now)return false;
  return true;
}
async function approvedRecruiterLink({
  db,uid,role,now=Date.now(),programEnabled=PROGRAM_ENABLED,
}={}){
  if(programEnabled!==true)return {ok:false,reason:'recruiter_program_off'};
  if(!db||!ownUid(uid)||!validRole(role)||!Number.isSafeInteger(now))
    return {ok:false,reason:'invalid_request'};
  try{
    // Exactly one authoritative read per attempt, not a scan or live listener.
    const snap=await db.collection('recruiter_approvals').doc(uid).get();
    if(!snap.exists||!eligibleApproval(snap.data(),role,now))
      return {ok:false,reason:'not_approved'};
    const out=await shareLink({db,uid,role,now});
    if(!out.ok)return out;
    // Same personal URL as the existing invitation system; a QR may encode it
    // after app links and paid recruiting are separately commissioned.
    return {ok:true,url:out.url,role,compensationActive:false};
  }catch{return {ok:false,reason:'approval_unavailable'};}
}
module.exports={PROGRAM_ENABLED,eligibleApproval,approvedRecruiterLink};
