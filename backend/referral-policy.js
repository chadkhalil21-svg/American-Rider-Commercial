'use strict';
// SOURCE-ONLY foundation. Nothing imports this into production routes or Stripe.
// One referral engine serves Travelers, Operators and independent partners.
// This module NEVER issues payouts, refunds, credits, messages or database writes.
// Activation requires separate Founder approval, counsel review and unit-economics tests.
const VALID_CODE=/^[A-Z0-9]{8,32}$/;
const ROLES=new Set(['traveler','operator']);

function normalizedCode(value) {
  if(typeof value!=='string') return null;
  const code=value.trim().toUpperCase();
  return VALID_CODE.test(code)?code:null;
}
function inviteLink(code,origin='https://americanrider.app') {
  const token=normalizedCode(code);
  // Retain legacy app links only for existing signed-client compatibility.
  // New recruiter links may use the founder-owned .tech origin once native
  // domain association + signed iOS/Android builds are independently proven.
  if(!['https://americanrider.app','https://americanrider.tech'].includes(origin))return null;
  return token?origin+'/join?r='+encodeURIComponent(token):null;
}
// Server-only decision, run after identity verification. Referrer identity must
// come from an authenticated, server-owned referral record, never an URL UID.
function claimDecision({referrerUid,inviteeUid,targetRole,alreadyClaimed=false,
  alreadyActivatedRole=false,sharedIdentity=false,referrerEligible=false}={}) {
  if(!ROLES.has(targetRole))return {ok:false,reason:'unsupported_role'};
  if(typeof referrerUid!=='string'||!referrerUid||
     typeof inviteeUid!=='string'||!inviteeUid)return {ok:false,reason:'missing_identity'};
  if(referrerUid===inviteeUid||sharedIdentity)return {ok:false,reason:'self_or_related_account'};
  if(!referrerEligible)return {ok:false,reason:'referrer_not_eligible'};
  if(alreadyClaimed)return {ok:false,reason:'first_accepted_attribution_is_final'};
  if(alreadyActivatedRole)return {ok:false,reason:'role_already_active'};
  return {ok:true,reason:'eligible_for_server_atomic_claim'};
}
// A payout candidate, never a payout instruction. A verified settlement
// integration must create ONE immutable event per (travelId, programId, role)
// and check it transactionally before recording any reward. Replay is a no-op.
// availableContributionCents is the remaining post-cost, post-minimum-margin
// budget for ALL referral rewards on this one Travel, not gross platform fee.
function rewardDecision({attribution,travel,program,priorQualifiedTravels=0,
  earnedCents=0,availableContributionCents=0,alreadyCredited=false}={}) {
  const reject=(reason)=>({eligible:false,rewardCents:0,reason});
  if(!program||program.enabled!==true)return reject('program_off');
  if(!attribution||!travel)return reject('missing_evidence');
  if(!ROLES.has(attribution.targetRole))return reject('unsupported_role');
  if(typeof attribution.inviteeUid!=='string'||!attribution.inviteeUid)return reject('missing_invitee');
  if(attribution.targetRole==='operator'&&travel.operatorUid!==attribution.inviteeUid)
    return reject('wrong_operator');
  if(attribution.targetRole==='traveler'&&travel.travelerUid!==attribution.inviteeUid)
    return reject('wrong_traveler');
  if(typeof travel.id!=='string'||!travel.id)return reject('missing_travel_id');
  if(travel.status!=='completed'||travel.paymentStatus!=='captured'||
     travel.refunded===true||travel.disputed===true||travel.synthetic===true)
    return reject('not_qualifying_paid_travel');
  if(alreadyCredited)return reject('duplicate_event');
  if(!Number.isSafeInteger(priorQualifiedTravels)||priorQualifiedTravels<0||
     !Number.isSafeInteger(earnedCents)||earnedCents<0)
    return reject('invalid_history');
  if(!Number.isSafeInteger(program.perTravelCents)||program.perTravelCents<=0||
     !Number.isSafeInteger(program.maxTravels)||program.maxTravels<=0||
     !Number.isSafeInteger(program.maxCents)||program.maxCents<=0)
    return reject('invalid_program');
  if(priorQualifiedTravels>=program.maxTravels)return reject('travel_cap');
  const remaining=program.maxCents-earnedCents;
  if(remaining<=0)return reject('payment_cap');
  const candidate=Math.min(program.perTravelCents,remaining);
  // Refuse the entire reward if it would consume the reserved base margin.
  // A promised fixed reward must be expressly funded in the future fare
  // economics BEFORE the program is enabled, not silently reduced afterward.
  if(!Number.isSafeInteger(availableContributionCents)||
     availableContributionCents<candidate)return reject('reward_not_funded');
  return {eligible:true,rewardCents:candidate,reason:'candidate_requires_atomic_ledger'};
}
module.exports={normalizedCode,inviteLink,claimDecision,rewardDecision};
