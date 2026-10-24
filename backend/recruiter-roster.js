'use strict';
// Private recruiter progress: one owned, indexed, bounded page at a time.
// No passenger name, phone, email, route, location, travel id, payment details
// or all-user / all-travels query. A referral is NOT a qualifying paid Travel.
const crypto=require('node:crypto');
const {validUid,emailOf}=require('./recruiter-portal');
const ROLES=new Set(['operator','traveler']);
const PAGE_SIZE=20;
const cursorPattern=/^[A-Za-z0-9_-]{4,128}_(?:operator|traveler)$/;
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
     (typeof after!=='string'||!cursorPattern.test(after)))
    return {ok:false,reason:'invalid_request'};
  try{
    const account=await db.collection('recruiter_accounts').doc(uid).get();
    if(!account.exists)return {ok:false,reason:'not_enrolled'};
    // The email verified at secure acceptance cannot silently be substituted.
    if(emailOf(account.data()?.verifiedEmail)!==emailOf(verifiedEmail)||
       !emailOf(verifiedEmail))return {ok:false,reason:'identity_mismatch'};
    if(!account.data()?.allowedRoles?.includes(role))
      return {ok:false,reason:'role_not_authorized'};
    let query=db.collection('referral_attributions')
      .where('inviterUid','==',uid).where('role','==',role)
      .orderBy('claimedAt','desc').limit(PAGE_SIZE+1);
    if(after){
      const cursor=await db.collection('referral_attributions').doc(after).get();
      if(!cursor.exists||cursor.data()?.inviterUid!==uid||cursor.data()?.role!==role)
        return {ok:false,reason:'invalid_cursor'};
      query=query.startAfter(cursor);
    }
    const result=await query.get();
    const docs=result.docs||[];
    const page=docs.slice(0,PAGE_SIZE);
    return {ok:true,role,items:page.map(projectIntroduction),
      nextCursor:docs.length>PAGE_SIZE&&page.length?page[page.length-1].id:null,
      pageSize:PAGE_SIZE,asOf:Date.now(),
      // This dashboard cannot claim customer identity, qualification, rides or
      // earned payments until explicit disclosure and verified source-of-truth.
      verifiedOperatorCount:null,qualifyingTravelCount:null,
      earnedCents:null,paidCents:null};
  }catch{return {ok:false,reason:'introductions_unavailable'};}
}
module.exports={PAGE_SIZE,referenceFor,projectIntroduction,listIntroductions};
