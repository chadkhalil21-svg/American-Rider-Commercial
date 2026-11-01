'use strict';
// Qualified Operators automatically receive the existing Recruiter workspace.
// This grants NO monetary entitlement or bank payout without the Operator's
// affirmative current agreement and the separately commissioned payout gates.
const {validUid,emailOf}=require('./recruiter-portal');
const {assessOperator}=require('./qualification');
const {CURRENT_TERMS}=require('./recruiter-commercial-terms');
const ROLES=Object.freeze(['operator','traveler']);
const SOURCE='qualified_operator';
const SYSTEM_ACTOR='system_operator_qualification';
async function ensureQualifiedOperatorRecruiter({
 db,uid,verifiedEmail,now=Date.now(),identityLookup,
 evaluate=assessOperator,
}={}){
 const email=emailOf(verifiedEmail);
 if(!db||!validUid(uid)||!email||!Number.isSafeInteger(now)||now<=0)
  return {ok:false,reason:'invalid_request'};
 const ar=db.collection('recruiter_accounts').doc(uid);
 const ap=db.collection('recruiter_approvals').doc(uid);
 try{
  // Existing independent Recruiters and suspended accounts are never overwritten.
  const [oldA,oldP]=await Promise.all([ar.get(),ap.get()]);
  if(oldA.exists||oldP.exists)
   return oldA.exists&&oldP.exists
     ?{ok:true,existing:true,operatorReferral:oldA.data()?.enrollmentSource===SOURCE}
     :{ok:false,reason:'recruiter_records_require_review'};
  const lookup=identityLookup||((id)=>require('firebase-admin/auth').getAuth().getUser(id));
  const identity=await lookup(uid);
  if(identity?.disabled!==false||identity.emailVerified!==true||
     emailOf(identity.email)!==email)
   return {ok:false,reason:'operator_identity_not_verified'};
  return await db.runTransaction(async tx=>{
   const userRef=db.collection('users').doc(uid),fleetRef=db.collection('operators').doc(uid);
   const [a,p,u,o]=await Promise.all([tx.get(ar),tx.get(ap),tx.get(userRef),tx.get(fleetRef)]);
   if(a.exists||p.exists)
    return a.exists&&p.exists
      ?{ok:true,existing:true,operatorReferral:a.data()?.enrollmentSource===SOURCE}
      :{ok:false,reason:'recruiter_records_require_review'};
   if(!u.exists||!o.exists)
    return {ok:false,reason:'operator_not_qualified'};
   const current=evaluate({user:u.data(),fleet:o.data(),context:'qualify',
     liveMoney:true,account:{disabled:false},now});
   if(current?.qualified!==true)
    return {ok:false,reason:'operator_not_qualified'};
   const common={status:'approved',allowedRoles:[...ROLES],
     identityVerified:true,agreementAccepted:false,payoutEligibilityVerified:false};
   tx.create(ar,{...common,uid,verifiedEmail:email,enrollmentSource:SOURCE,
     reviewedBy:SYSTEM_ACTOR,reviewedAt:now,acceptedAt:now,version:1});
   tx.create(ap,{...common,approvedBy:SYSTEM_ACTOR,approvedAt:now,
     suspended:false,expiresAt:CURRENT_TERMS.expiresAt,updatedAt:now});
   return {ok:true,created:true,operatorReferral:true,agreementRequired:true};
  });
 }catch{return {ok:false,reason:'operator_auto_enrollment_unavailable'};}
}
function mayShareUnpaidOperatorInvitation(account,approval,role,now=Date.now()){
 return account?.enrollmentSource===SOURCE&&account?.status==='approved'&&
   approval?.status==='approved'&&approval.suspended!==true&&
   account.identityVerified===true&&approval.identityVerified===true&&
   account.agreementAccepted!==true&&approval.agreementAccepted!==true&&
   Array.isArray(account.allowedRoles)&&account.allowedRoles.includes(role)&&
   Array.isArray(approval.allowedRoles)&&approval.allowedRoles.includes(role)&&
   Number.isSafeInteger(approval.expiresAt)&&approval.expiresAt>now;
}
module.exports={SOURCE,ensureQualifiedOperatorRecruiter,mayShareUnpaidOperatorInvitation};
