'use strict';
// Founder-approved INDEPENDENT recruiters, prelaunch source-only.
// The same Firebase uid owns the same opaque referral link. No second referral
// database, public self-registration, QR scan writes, recruitment app or payouts.
// This helper is deliberately NOT mounted in production routes. Approval records
// may only be written from an authenticated, separately audited Operations flow.
// Firebase client rules deny reads/writes to recruiter_approvals by default.
const {shareLink}=require('./referral-service');

const PROGRAM_ENABLED=false;
const {eligibleApproval,recruiterMayRefer}=require('./recruiter-eligibility');
const validRole=role=>role==='operator'||role==='traveler';
const ownUid=uid=>typeof uid==='string'&&uid.length>=4&&uid.length<=128&&!uid.includes('/');
async function approvedRecruiterLink({
  db,uid,role,now=Date.now(),programEnabled=PROGRAM_ENABLED,
  linkVerified=false,compensationEnabled=false,
}={}){
  if(programEnabled!==true)return {ok:false,reason:'recruiter_program_off'};
  if(linkVerified!==true)return {ok:false,reason:'app_links_not_verified'};
  if(compensationEnabled!==true)return {ok:false,reason:'recruiter_finance_not_ready'};
  if(!db||!ownUid(uid)||!validRole(role)||!Number.isSafeInteger(now))
    return {ok:false,reason:'invalid_request'};
  try{
    // Exactly one authoritative read per attempt, not a scan or live listener.
    const [snap,account]=await Promise.all([
      db.collection('recruiter_approvals').doc(uid).get(),
      db.collection('recruiter_accounts').doc(uid).get(),
    ]);
    if(!snap.exists||!account.exists||
       !recruiterMayRefer(account.data(),snap.data(),role,now))
      return {ok:false,reason:'not_approved'};
    const out=await shareLink({db,uid,role,now,
      origin:'https://americanrider.tech'});
    if(!out.ok)return out;
    // Same personal URL as the existing invitation system; a QR may encode it
    // after app links and paid recruiting are separately commissioned.
    return {ok:true,url:out.url,role,compensationActive:true};
  }catch{return {ok:false,reason:'approval_unavailable'};}
}
module.exports={PROGRAM_ENABLED,eligibleApproval,approvedRecruiterLink};
