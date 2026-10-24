'use strict';
// One shared eligibility policy for URL issue and URL redemption.
// A Founder-approved account alone is NOT a signed agreement or identity proof.
// Pure function: no Firestore, HTTP, payment, location, or side effects.
const validRole=role=>role==='operator'||role==='traveler';
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
function recruiterMayRefer(account,approval,role,now){
  return account?.status==='approved' &&
    Array.isArray(account.allowedRoles) && account.allowedRoles.includes(role) &&
    eligibleApproval(approval,role,now);
}
module.exports={eligibleApproval,recruiterMayRefer};
