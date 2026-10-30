'use strict';
// One shared eligibility policy for URL issue and URL redemption.
// Referral access requires Founder approval, verified identity and agreement, not bank setup.
// Actual money transfer retains the independent Stripe/bank/tax gate.
// Pure function: no Firestore, HTTP, payment, location, or side effects.
const validRole=role=>role==='operator'||role==='traveler';
function eligibleApproval(approval,role,now=Date.now()){
  if(!approval||typeof approval!=='object'||!validRole(role)||
     !Number.isSafeInteger(now)||now<=0)return false;
  if(approval.status!=='approved'||approval.suspended===true||
     approval.identityVerified!==true||approval.agreementAccepted!==true||
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
function payoutEligibleApproval(approval,role,now){
  return eligibleApproval(approval,role,now)&&approval.payoutEligibilityVerified===true;
}
module.exports={eligibleApproval,recruiterMayRefer,payoutEligibleApproval};
