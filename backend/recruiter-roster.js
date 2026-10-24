'use strict';
// Private recruiter progress: one owned, indexed, bounded page at a time.
// No passenger name, phone, email, route, location, travel id, payment details
// or all-user / all-travels query. A referral is NOT a qualifying paid Travel.
const crypto=require('node:crypto');
const {validUid,emailOf}=require('./recruiter-portal');
const ROLES=new Set(['operator','traveler']);
const PAGE_SIZE=20;
const cursorPattern=/^[A-Za-z0-9_-]{4,128}_(?:operator|traveler)$/;
// Opaque, authenticated pagination tokens. Never return a Firebase user ID
// even as a URL query parameter. Configure AR_RECRUITER_CURSOR_KEY as 64 hex
// chars in scaled production; safe process-local fallback invalidates old
// pages after a restart rather than exposing internal identities.
const configuredKey=process.env.AR_RECRUITER_CURSOR_KEY;
const cursorKey=/^[a-fA-F0-9]{64}$/.test(configuredKey||'')?
  Buffer.from(configuredKey,'hex'):crypto.randomBytes(32);
function encodeCursor(docId,uid,role){
  const nonce=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv('aes-256-gcm',cursorKey,nonce);
  cipher.setAAD(Buffer.from(uid+'|'+role));
  const body=Buffer.concat([cipher.update(docId,'utf8'),cipher.final()]);
  return Buffer.concat([nonce,cipher.getAuthTag(),body]).toString('base64url');
}
function decodeCursor(token,uid,role){
  if(typeof token!=='string'||token.length>256||
     !/^[A-Za-z0-9_-]+$/.test(token))return null;
  try{
    const bytes=Buffer.from(token,'base64url');
    if(bytes.length<29)return null;
    const decipher=crypto.createDecipheriv('aes-256-gcm',cursorKey,bytes.subarray(0,12));
    decipher.setAuthTag(bytes.subarray(12,28));
    decipher.setAAD(Buffer.from(uid+'|'+role));
    const id=Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()])
      .toString('utf8');
    return cursorPattern.test(id)?id:null;
  }catch{return null;}
}
function referenceFor(id){
  return 'AR-'+crypto.createHash('sha256').update('recruitment-reference-v1:'+id)
    .digest('hex').slice(0,12).toUpperCase();
}
function projectIntroduction(snapshot){
  const row=snapshot.data()||{};
  return {
    reference:referenceFor(snapshot.id),
    role:row.role,
    recordedAt:Number.isSafeInteger(row.claimedAt)&&row.claimedAt>0?
      row.claimedAt:null,
    progress:'introduction_recorded',
    // Accounting has no live verified payments; no speculative zeros.
    qualifyingTravels:null,
    earnedCents:null,
    paidCents:null,
  };
}
async function listIntroductions({db,uid,verifiedEmail,role,after=null}={}){
  if(!db||!validUid(uid)||!ROLES.has(role)||after!==null&&
     (typeof after!=='string'||after.length>256))
    return {ok:false,reason:'invalid_request'};
  try{
    const account=await db.collection('recruiter_accounts').doc(uid).get();
    if(!account.exists)return {ok:false,reason:'not_enrolled'};
    if(!['approved','pending_review'].includes(account.data()?.status))
      return {ok:false,reason:'account_inactive'};
    // The email verified at secure acceptance cannot silently be substituted.
    if(emailOf(account.data()?.verifiedEmail)!==emailOf(verifiedEmail)||
       !emailOf(verifiedEmail))return {ok:false,reason:'identity_mismatch'};
    if(!account.data()?.allowedRoles?.includes(role))
      return {ok:false,reason:'role_not_authorized'};
    let query=db.collection('referral_attributions')
      .where('inviterUid','==',uid).where('role','==',role)
      // Stable document-ID cursor reuses the already deployed two-field index.
      // Referral date remains visible, but this is not a newest-first feed.
      .orderBy('__name__','asc').limit(PAGE_SIZE+1);
    if(after){
      const cursorId=decodeCursor(after,uid,role);
      if(!cursorId)return {ok:false,reason:'invalid_cursor'};
      const cursor=await db.collection('referral_attributions').doc(cursorId).get();
      if(!cursor.exists||cursor.data()?.inviterUid!==uid||cursor.data()?.role!==role)
        return {ok:false,reason:'invalid_cursor'};
      query=query.startAfter(cursor);
    }
    const result=await query.get();
    const docs=result.docs||[];
    const page=docs.slice(0,PAGE_SIZE);
    return {ok:true,role,items:page.map(projectIntroduction),
      nextCursor:docs.length>PAGE_SIZE&&page.length?
        encodeCursor(page[page.length-1].id,uid,role):null,
      pageSize:PAGE_SIZE,asOf:Date.now(),
      // This dashboard cannot claim customer identity, qualification, rides or
      // earned payments until explicit disclosure and verified source-of-truth.
      verifiedOperatorCount:null,qualifyingTravelCount:null,
      earnedCents:null,paidCents:null};
  }catch{return {ok:false,reason:'introductions_unavailable'};}
}
module.exports={PAGE_SIZE,referenceFor,projectIntroduction,listIntroductions};
