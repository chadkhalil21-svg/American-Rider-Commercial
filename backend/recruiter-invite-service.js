'use strict';
// One private invitation procedure shared by Founder Operations and delegated OAuth.
// The caller MUST first pass named-Founder MFA/allowlist and invitation launch gates.
// This module never accepts bank data, moves money or marks payout eligibility.
const crypto=require('node:crypto');
const {createInvitation,emailOf,normalizeRoles}=require('./recruiter-portal');
function validFounder(actor){return typeof actor==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(actor);}
async function sendRecruiterInvitation({db,send,email,allowedRoles,actor,now=Date.now()}={}){
  const address=emailOf(email),roles=normalizeRoles(allowedRoles);
  if(!db||typeof send!=='function'||!address||!roles||!validFounder(actor)||
      !Number.isSafeInteger(now)||now<=0)return {ok:false,code:'invalid_invitation'};
  // A deterministic lock prevents double-send when ChatGPT or the iPhone retries.
  // No reusable plaintext token or banking information is stored here.
  const fingerprint=crypto.createHash('sha256')
    .update(address+'|'+roles.join(',')).digest('hex');
  const ref=db.collection('recruiter_invite_dispatches').doc(fingerprint);
  try{
    const granted=await db.runTransaction(async tx=>{
      const previous=await tx.get(ref);
      const record=previous.exists?previous.data():null;
      if(record&&Number(record.expiresAt)>now){
        return {ok:false,code:'invitation_already_requested'};
      }
      const next={email:address,roles,requestedBy:actor,requestedAt:now,
        expiresAt:now+48*60*60*1000,status:'preparing'};
      if(previous.exists)tx.set(ref,next);else tx.create(ref,next);
      return {ok:true};
    });
    if(!granted.ok)return granted;
  }catch{return {ok:false,code:'invitation_lock_unavailable'};}
  const issued=await createInvitation({db,email:address,allowedRoles:roles,actor,now});
  if(!issued.ok){
    await ref.set({status:'failed',failedAt:Date.now()},{merge:true}).catch(()=>{});
    return {ok:false,code:'invitation_creation_unavailable'};
  }
  const url='https://americanrider.tech/recruitment/accept?token='+encodeURIComponent(issued.token);
  let sent;
  try{
    sent=await send({
      from:'American Rider Relations <relations@americanrider.tech>',
      to:address,replyTo:'relations@americanrider.tech',
      subject:'An invitation to represent American Rider',
      text:'AMERICAN RIDER\\n\\nYou are invited to review an independent recruiting relationship with American Rider.\\n\\nOpen your private invitation: '+
        url+'\\n\\nThis invitation expires in 48 hours and works only with the invited, verified email. No compensation or account activation is promised.\\n\\nQuestions: relations@americanrider.tech',
      idempotencyKey:'recruiter-invite/'+issued.id,
    });
  }catch{sent={ok:false};}
  if(!sent?.ok){
    await Promise.all([
      db.collection('recruiter_invitations').doc(issued.id)
        .set({status:'delivery_unconfirmed',deliveryFailedAt:Date.now()},{merge:true}).catch(()=>{}),
      ref.set({status:'delivery_unconfirmed'},{merge:true}).catch(()=>{}),
    ]);
    return {ok:false,code:'invitation_delivery_unconfirmed'};
  }
  await Promise.all([
    db.collection('recruiter_invitations').doc(issued.id)
      .set({sentAt:Date.now(),providerId:sent.id||null},{merge:true}).catch(()=>{}),
    ref.set({status:'submitted',invitationId:issued.id},{merge:true}).catch(()=>{}),
  ]);
  // Provider submission is not proof the mailbox received or accepted the invite.
  return {ok:true,delivery:'submitted',expiresAt:issued.expiresAt,email:address,allowedRoles:roles};
}
module.exports={sendRecruiterInvitation};
