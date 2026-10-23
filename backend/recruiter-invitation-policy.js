'use strict';
// Source-only identity boundary for future Founder-approved recruiter activation.
// NO email delivery, no approval writes, no signup route, and no payout.
// Tokens must be stored as digests in private server-only storage.
const crypto=require('node:crypto');
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function normalizedEmail(value){
  if(typeof value!=='string')return null;
  const email=value.trim().toLowerCase();
  return email.length<=254&&email.length>=5&&EMAIL.test(email)?email:null;
}
function tokenDigest(token){
  if(typeof token!=='string'||!/^[A-Za-z0-9_-]{40,160}$/.test(token))return null;
  return crypto.createHash('sha256').update(token,'utf8').digest('hex');
}
function issueDraft({email,approvedBy,now=Date.now(),ttlMs=24*60*60*1000}={}){
  const recipient=normalizedEmail(email);
  if(!recipient||typeof approvedBy!=='string'||approvedBy.length<3||
     !Number.isSafeInteger(now)||now<=0||
     !Number.isSafeInteger(ttlMs)||ttlMs<15*60*1000||ttlMs>7*24*60*60*1000)
    return {ok:false,reason:'invalid_request'};
  const token=crypto.randomBytes(32).toString('base64url');
  return {ok:true,secretForOneEmail:token,record:{
    status:'pending',recipientEmail:recipient,tokenHash:tokenDigest(token),
    authorizedBy:approvedBy,authorizedAt:now,expiresAt:now+ttlMs,consumedAt:null,
  }};
}
function activationDecision({invite,token,signedInEmail,emailVerified=false,
  now=Date.now()}={}){
  const fail=reason=>({ok:false,reason});
  if(!invite||invite.status!=='pending'||invite.consumedAt!=null||
     !Number.isSafeInteger(invite.expiresAt)||invite.expiresAt<=now||
     !Number.isSafeInteger(invite.authorizedAt)||invite.authorizedAt>now)
    return fail('invitation_inactive');
  const intended=normalizedEmail(invite.recipientEmail);
  if(!intended||!normalizedEmail(signedInEmail)||emailVerified!==true||
     normalizedEmail(signedInEmail)!==intended)
    return fail('approved_email_required');
  const proposed=tokenDigest(token);
  if(!proposed||typeof invite.tokenHash!=='string'||!/^[0-9a-f]{64}$/.test(invite.tokenHash))
    return fail('invalid_invitation');
  if(!crypto.timingSafeEqual(Buffer.from(proposed,'hex'),Buffer.from(invite.tokenHash,'hex')))
    return fail('invalid_invitation');
  return {ok:true,reason:'eligible_for_atomic_single_use_activation'};
}
module.exports={normalizedEmail,tokenDigest,issueDraft,activationDecision};
