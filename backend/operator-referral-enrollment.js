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
  if(oldA.exists||oldP.exists){
   if(!oldA.exists||!oldP.exists)return {ok:false,reason:'recruiter_records_require_review'};
   if(oldA.data()?.enrollmentSource!==SOURCE)
     return {ok:true,existing:true,operatorReferral:false};
   if(oldA.data()?.status!=='approved'||oldP.data()?.status!=='approved'||
      oldP.data()?.suspended===true)
     return {ok:false,operatorReferral:true,reason:'recruiter_suspended'};
  }
  const lookup=identityLookup||((id)=>require('firebase-admin/auth').getAuth().getUser(id));
  const identity=await lookup(uid);
  if(identity?.disabled!==false||identity.emailVerified!==true||
     emailOf(identity.email)!==email)
   return {ok:false,operatorReferral:oldA.exists&&oldA.data()?.enrollmentSource===SOURCE,
     reason:'operator_identity_not_verified'};
  if(oldA.exists){
   // Referral privileges expire with Operator qualification; a historic
   // approval document cannot authorize sharing after insurance/screening lapse.
   const [u,o]=await Promise.all([
     db.collection('users').doc(uid).get(),db.collection('operators').doc(uid).get()]);
   if(!u.exists||!o.exists||evaluate({user:u.data(),fleet:o.data(),
      context:'qualify',liveMoney:true,account:{disabled:false},now})?.qualified!==true)
     return {ok:false,operatorReferral:true,reason:'operator_not_qualified'};
   return {ok:true,existing:true,operatorReferral:true};
  }
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
