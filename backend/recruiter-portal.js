'use strict';
// American Rider: independent recruiter identity and private invitation foundation.
// No referral compensation, bank collection, or public self-enrollment takes place here.
// All Firestore operations use server privilege; input data NEVER selects an account uid.
const crypto=require('node:crypto');
const {recruiterMayRefer}=require('./recruiter-eligibility');
const INVITE_MS=48*60*60*1000;
const validUid=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{4,128}$/.test(x);
const validActor=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(x);
const emailOf=x=>typeof x==='string'&&x.length<=254&&
  /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(x.trim())?x.trim().toLowerCase():null;
const normalizeRoles=roles=>Array.isArray(roles)&&roles.length>=1&&roles.length<=2&&
  roles.every(x=>x==='operator'||x==='traveler')?
    [...new Set(roles)].sort():null;
const tokenHash=token=>crypto.createHash('sha256').update(token).digest('hex');
const inviteToken=()=>crypto.randomBytes(32).toString('base64url');

async function createInvitation({db,email,allowedRoles,actor,now=Date.now()}={}){
  const address=emailOf(email),roles=normalizeRoles(allowedRoles);
  if(!db||!address||!roles||!validActor(actor)||!Number.isSafeInteger(now)||now<=0)
    return {ok:false,reason:'invalid_request'};
  const token=inviteToken(),id=tokenHash(token);
  try{
    // Token is never stored in plaintext. A random 256-bit key has no guessable ID.
    await db.collection('recruiter_invitations').doc(id).create({
      email:address,allowedRoles:roles,createdBy:actor,createdAt:now,
      expiresAt:now+INVITE_MS,status:'issued',version:1,
    });
    return {ok:true,id,token,expiresAt:now+INVITE_MS};
  }catch{return {ok:false,reason:'invitation_unavailable'};}
}

async function acceptInvitation({db,uid,verifiedEmail,token,now=Date.now()}={}){
  const email=emailOf(verifiedEmail);
  if(!db||!validUid(uid)||!email||typeof token!=='string'||
     !/^[A-Za-z0-9_-]{43}$/.test(token)||!Number.isSafeInteger(now)||now<=0)
    return {ok:false,reason:'invalid_request'};
  const id=tokenHash(token);
  try{
    return await db.runTransaction(async tx=>{
      const inviteRef=db.collection('recruiter_invitations').doc(id);
      const accountRef=db.collection('recruiter_accounts').doc(uid);
      const approvalRef=db.collection('recruiter_approvals').doc(uid);
      const [invSnap,acctSnap,approvalSnap]=await Promise.all([
        tx.get(inviteRef),tx.get(accountRef),tx.get(approvalRef),
      ]);
      if(!invSnap.exists)return {ok:false,reason:'invalid_or_expired_invitation'};
      const i=invSnap.data();
      if(i.status==='accepted'&&i.acceptedBy===uid&&emailOf(i.email)===email)
        return {ok:true,reason:'already_accepted',status:'approved'};
      if(i.status!=='issued'||i.expiresAt<=now||i.createdAt>now)
        return {ok:false,reason:'invalid_or_expired_invitation'};
      if(emailOf(i.email)!==email)
        return {ok:false,reason:'wrong_verified_email'};
      if(acctSnap.exists||approvalSnap.exists)
        return {ok:false,reason:'existing_recruiter_account'};
      if(!validActor(i.createdBy)||!Array.isArray(i.allowedRoles)||
         !normalizeRoles(i.allowedRoles))
        return {ok:false,reason:'invalid_founder_invitation'};
      // Founder invitation IS the participation decision. Do not ask the Founder
      // to click Approve again. This does not authorize public links or money:
      // verified identity, approved agreement, bank/tax checks and payout
      // eligibility all remain OFF until independently confirmed.
      tx.create(accountRef,{
        uid,verifiedEmail:email,allowedRoles:i.allowedRoles,
        invitationId:id,status:'approved',acceptedAt:now,
        reviewedBy:i.createdBy,reviewedAt:now,
        agreementAccepted:false,identityVerified:false,
        payoutEligibilityVerified:false,version:1,
      });
      tx.create(approvalRef,{
        status:'approved',approvedBy:i.createdBy,approvedAt:now,
        allowedRoles:i.allowedRoles,suspended:false,
        identityVerified:false,agreementAccepted:false,
        payoutEligibilityVerified:false,updatedAt:now,
      });
      tx.update(inviteRef,{status:'accepted',acceptedBy:uid,acceptedAt:now});
      return {ok:true,status:'approved',next:'identity_agreement_bank_verification'};
    });
  }catch{return {ok:false,reason:'invitation_accept_unavailable'};}
}

async function founderDecision({db,uid,actor,decision,now=Date.now()}={}){
  if(!db||!validUid(uid)||!validActor(actor)||
    !['approve','suspend','reject'].includes(decision)||!Number.isSafeInteger(now))
    return {ok:false,reason:'invalid_request'};
  try{
    return await db.runTransaction(async tx=>{
      const acctRef=db.collection('recruiter_accounts').doc(uid);
      const approvalRef=db.collection('recruiter_approvals').doc(uid);
      const snap=await tx.get(acctRef);
      if(!snap.exists)return {ok:false,reason:'no_recruiter'};
      const acct=snap.data();
      if(decision==='approve'&&acct.status!=='pending_review')
        return {ok:false,reason:'incorrect_status'};
      const status=decision==='approve'?'approved':decision==='suspend'?'suspended':'rejected';
      if(status==='approved'&&!Array.isArray(acct.allowedRoles))
        return {ok:false,reason:'invalid_allowed_roles'};
      const update={status,reviewedAt:now,reviewedBy:actor};
      tx.update(acctRef,update);
      // This is Founder enrollment permission, NOT confirmation of legal
      // identity, signed agreement, authorized bank, or reward eligibility.
      tx.set(approvalRef,{
        status,approvedBy:actor,approvedAt:status==='approved'?now:null,
        allowedRoles:acct.allowedRoles||[],suspended:status!=='approved',
        identityVerified:false,agreementAccepted:false,
        payoutEligibilityVerified:false,updatedAt:now,
      },{merge:true});
      return {ok:true,status};
    });
  }catch{return {ok:false,reason:'recruiter_review_unavailable'};}
}

// A recruiter may choose a display name for the private workspace.
// Not a legal-identity attestation, contract acceptance or bank authorization.
function profileNameOf(input){
  if(typeof input!=='string')return null;
  const name=input.normalize('NFC').trim().replace(/\s+/gu,' ');
  if(name.length<2||name.length>80||Buffer.byteLength(name,'utf8')>220)return null;
  if(Array.from(name).some(c=>{
    const code=c.codePointAt(0);
    return code<32||code===127||c==='<'||c==='>';
  }))return null;
  return name;
}
async function updateRecruiterProfile({db,uid,verifiedEmail,profileName,now=Date.now()}={}){
  const email=emailOf(verifiedEmail),name=profileNameOf(profileName);
  if(!db||!validUid(uid)||!email||!name||
     !Number.isSafeInteger(now)||now<=0)return {ok:false,reason:'invalid_profile'};
  try{
    return await db.runTransaction(async tx=>{
      const ref=db.collection('recruiter_accounts').doc(uid);
      const snap=await tx.get(ref);
      if(!snap.exists)return {ok:false,reason:'not_enrolled'};
      const record=snap.data()||{};
      if(record.status!=='approved'&&record.status!=='pending_review')
        return {ok:false,reason:'account_inactive'};
      if(emailOf(record.verifiedEmail)!==email)
        return {ok:false,reason:'identity_mismatch'};
      tx.update(ref,{profileName:name,profileUpdatedAt:now,profileVersion:1});
      return {ok:true,profileName:name,profileUpdatedAt:now};
    });
  }catch{return {ok:false,reason:'profile_unavailable'};}
}

async function recruiterSummary({db,uid,verifiedEmail,now=Date.now(),programEnabled=false,linkVerified=false,activityTrackingEnabled=false,
  financialEnabled=false,operatorInvitesEnabled=false}={}){
  if(!db||!validUid(uid))return {ok:false,reason:'invalid_request'};
  try{
    const ref=db.collection('recruiter_accounts').doc(uid);
    const snap=await ref.get();
    if(!snap.exists)return {ok:false,reason:'not_enrolled'};
    const data=snap.data();
    // Inactive relationships cannot retain even aggregate dashboard access.
    if(!['approved','pending_review'].includes(data.status))
      return {ok:false,reason:'account_inactive'};
    // Reconfirm the invitee's original verified email when called from the
    // authenticated website. The account's referral ownership is never movable
    // by simply changing a sign-in email.
    if(verifiedEmail!==undefined&&
       (emailOf(verifiedEmail)===null||
        emailOf(data.verifiedEmail)!==emailOf(verifiedEmail)))
      return {ok:false,reason:'identity_mismatch'};
    // Indexed count aggregation, never fetch all referred people to a handset.
    // Claims are introductions, NOT yet verified/qualified Operators or Travels.
    const base=db.collection('referral_attributions').where('inviterUid','==',uid);
    const [ops,travelers]=await Promise.all([
      base.where('role','==','operator').count().get(),
      base.where('role','==','traveler').count().get(),
    ]);
    const counts={operatorIntroductions:Number(ops.data().count)||0,
      travelerIntroductions:Number(travelers.data().count)||0};
    // Previously this was always false, so a fully approved recruiter could
    // never use the dashboard even after legitimate launch. Four independent
    // launch flags and current identity/contract/role checks govern availability.
    // With flags OFF (the default), this adds zero approval-record reads.
    let linksAvailable=false;
    if((programEnabled===true||(data.enrollmentSource==='qualified_operator'&&operatorInvitesEnabled===true))&&
       linkVerified===true&&data.status==='approved'){
      const approval=await db.collection('recruiter_approvals').doc(uid).get();
      linksAvailable=approval.exists&&Array.isArray(data.allowedRoles)&&
        data.allowedRoles.some(role=>
          recruiterMayRefer(data,approval.data(),role,now));
    }
    const activity=activityTrackingEnabled===true?
      await require('./recruiter-travel-activity').recruiterSettlementCounts({db,uid}):null;
    if(activity)Object.assign(counts,activity);
    // One owner-only point read on an explicit account view. Never poll
    // earnings or expose another recruiter's recipient/bank identifiers.
    let wallet=null;
    if(financialEnabled===true){
      const ws=await db.collection('recruiter_commission_wallets').doc(uid).get();
      const w=ws.exists?ws.data():{};
      const keys=['availableCents','reservedCents','paidCents','reversedCents','recoveryDueCents',
        'netPaidCents','connectFeesPaidCents'];
      if(!keys.every(k=>Number.isSafeInteger(w[k]??0)&&(w[k]??0)>=0))
        return {ok:false,reason:'financial_record_requires_review'};
      wallet=Object.fromEntries(keys.map(k=>[k,w[k]??0]));
    }
    return {ok:true,status:data.status,allowedRoles:data.allowedRoles||[],
      counts,profileName:data.profileName||null,
      compensation:financialEnabled?'commissioned':'not_commissioned',wallet,
      bankSetup:financialEnabled?'provider_verification_required':'not_commissioned',
      agreement:data.agreementAccepted===true?'accepted':'pending_secure_agreement',
      linksAvailable,verifiedOperators:null,qualifyingTravels:null,
      reviewedAt:data.reviewedAt||null,asOf:now};
  }catch{return {ok:false,reason:'recruiter_summary_unavailable'};}
}

module.exports={INVITE_MS,emailOf,normalizeRoles,validUid,profileNameOf,
  createInvitation,acceptInvitation,founderDecision,recruiterSummary,updateRecruiterProfile};
