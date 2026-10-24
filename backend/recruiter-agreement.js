'use strict';
// An authenticated, affirmative acceptance of the exact approved agreement.
// The Founder ratified these business terms; each Recruiter must accept the
// exact immutable text individually. No fictitious lawyer signature is needed.
const crypto=require('node:crypto');
const {validUid,emailOf}=require('./recruiter-portal');
function termsConfig({text,version,expiresAt,now=Date.now()}={}){
 if(typeof text!=='string'||text.trim().length<200||
  text.length>30000||typeof version!=='string'||
  !/^[A-Za-z0-9._-]{4,64}$/.test(version)||
  !Number.isSafeInteger(expiresAt)||expiresAt<=now)
  return null;
 return {text,version,expiresAt,
  sha256:crypto.createHash('sha256').update(text).digest('hex')};
}
async function acceptRecruiterAgreement({db,uid,verifiedEmail,version,accepted=false,
 terms,now=Date.now()}={}){
 if(!db||!validUid(uid)||!emailOf(verifiedEmail)||accepted!==true||
  !terms||version!==terms.version||terms.expiresAt<=now)
  return {ok:false,reason:'agreement_not_available'};
 try{
  return await db.runTransaction(async tx=>{
   const ref=db.collection('recruiter_accounts').doc(uid);
   const apRef=db.collection('recruiter_approvals').doc(uid);
   const [a,p]=await Promise.all([tx.get(ref),tx.get(apRef)]);
   if(!a.exists||!p.exists||a.data().status!=='approved'||
    p.data().status!=='approved'||p.data().suspended===true||
    emailOf(a.data().verifiedEmail)!==emailOf(verifiedEmail))
     return {ok:false,reason:'not_authorized'};
   if(a.data().agreementVersion===version&&a.data().agreementSha256===terms.sha256&&
     a.data().agreementAccepted===true)return {ok:true,alreadyAccepted:true,version};
   tx.update(ref,{agreementVersion:version,agreementSha256:terms.sha256,
     agreementAccepted:true,agreementAcceptedAt:now,
     programVersion:require('./referral-accrual').PROGRAM.version});
   tx.update(apRef,{agreementVersion:version,agreementSha256:terms.sha256,
     agreementAccepted:true,agreementAcceptedAt:now,
     programVersion:require('./referral-accrual').PROGRAM.version,
     expiresAt:terms.expiresAt,updatedAt:now});
   return {ok:true,version};
  });
 }catch{return {ok:false,reason:'agreement_unavailable'};}
}
module.exports={termsConfig,acceptRecruiterAgreement};
