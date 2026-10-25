'use strict';
// Read-only Founder counts, separate from powerful /ops write privileges.
// Never trust self-described email, display name, UID from request JSON,
// frontend config, or the mere presence of a valid Firebase identity.
const {getAuth}=require('firebase-admin/auth');
const {adminDb,adminStatus}=require('./firebase-admin');
const {readKey}=require('./env');
const {founderPlatformCounts}=require('./founder-platform-counts');

const ALLOWED_PROVIDERS=new Set(['google.com','apple.com']);
const MAX_AGE_SECONDS=12*60*60;
function allowedFounderUids(raw=readKey('AR_FOUNDER_FIREBASE_UIDS')){
  const entries=String(raw||'').split(',').map(x=>x.trim()).filter(Boolean);
  if(entries.length===0||entries.length>5||entries.some(x=>!/^[A-Za-z0-9_-]{6,128}$/.test(x)))return [];
  return [...new Set(entries)];
}
function founderTokenAllowed(decoded,allowlist,nowSeconds=Math.floor(Date.now()/1000)){
  if(!decoded||!Array.isArray(allowlist)||allowlist.length===0)return false;
  if(!allowlist.includes(String(decoded.uid||''))||decoded.email_verified!==true)return false;
  if(!ALLOWED_PROVIDERS.has(decoded.firebase?.sign_in_provider))return false;
  const age=nowSeconds-Number(decoded.auth_time);
  return Number.isFinite(age)&&age>=0&&age<=MAX_AGE_SECONDS;
}
function json(res,status,body){
  return res.status(status).json(body);
}
function mountFounderReadonly(app,{verifyToken,db,readUids,clock,dbReady}={}){
  const verify=verifyToken||((token)=>getAuth().verifyIdToken(token,true));
  const database=db||adminDb;
  const uids=readUids||allowedFounderUids;
  const now=clock||Date.now;
  const isReady=dbReady||(()=>adminStatus().ok);
  // Bounded per-process throttling after verified identity; avoid polling Firestore.
  const calls=new Map();
  app.post('/founder/overview/read',async(req,res)=>{
    res.set('Cache-Control','private, no-store, max-age=0');
    res.set('Pragma','no-cache');
    res.set('Referrer-Policy','no-referrer');
    res.set('X-Content-Type-Options','nosniff');
    res.set('Vary','Origin, Authorization');
    const permitted=uids();
    if(!permitted.length)return json(res,503,{code:'founder_account_not_configured'});
    const bearer=String(req.headers?.authorization||'');
    if(!/^Bearer [A-Za-z0-9._-]{60,4096}$/.test(bearer))
      return json(res,401,{code:'sign_in_required'});
    let claims;
    try{claims=await verify(bearer.slice(7));}
    catch{return json(res,401,{code:'session_expired_or_invalid'});}
    if(!founderTokenAllowed(claims,permitted,Math.floor(now()/1000)))
      return json(res,403,{code:'founder_access_not_authorized'});
    const uid=String(claims.uid);
    const time=now();
    for(const [k,v] of calls){if(time-v.windowStart>5*60*1000)calls.delete(k);}
    const old=calls.get(uid);
    if(old&&time-old.windowStart<5*60*1000&&old.count>=15){
      res.set('Retry-After','300');
      return json(res,429,{code:'please_refresh_later'});
    }
    if(old&&time-old.windowStart<5*60*1000)old.count++;
    else calls.set(uid,{count:1,windowStart:time});
    const handle=isReady()?database():null;
    if(!handle)return json(res,503,{code:'overview_temporarily_unavailable'});
    try{
      const result=await founderPlatformCounts(handle,{now:time});
      if(!result.counts)return json(res,503,{code:'overview_temporarily_unavailable'});
      return json(res,200,{
        asOf:result.asOf,day:result.day?.date||null,timezone:'America/New_York',
        counts:result.counts,unavailable:result.unavailable||[],
        notice:'Registered accounts may overlap with Operators. Available does not establish qualification. Completed is not paid.'
      });
    }catch{
      return json(res,503,{code:'overview_temporarily_unavailable'});
    }
  });
}
module.exports={allowedFounderUids,founderTokenAllowed,mountFounderReadonly,MAX_AGE_SECONDS};
