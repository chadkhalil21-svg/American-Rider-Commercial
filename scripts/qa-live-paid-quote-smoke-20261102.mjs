'use strict';
// Single authentic *quote only* smoke on the signed mobile Cloud Run backend.
// Never creates a booking, PaymentIntent, account, Travel, transfer or payout.
// Origin/destination are public Miami civic points, no real user's location.
const host='https://american-rider-api-production-623854974930.us-east1.run.app';
const body={pickup:{lat:25.7584,lng:-80.1955},dest:{lat:25.7465,lng:-80.2632},travelClass:'standard'};
try{
 const r=await fetch(host+'/fare-quote',{
  method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},
  body:JSON.stringify(body),signal:AbortSignal.timeout(16000)
 });
 const j=await r.json().catch(()=>({}));
 const num=v=>Number.isSafeInteger(v)&&v>=0?v:'unavailable';
 console.log('SIGNED_MOBILE_LIVE_QUOTE '+JSON.stringify({
  http:r.status,
  code:typeof j.code==='string'?j.code.slice(0,60):null,
  pricedBy:typeof j.pricedBy==='string'?j.pricedBy.slice(0,50):null,
  tollStatus:typeof j.tollStatus==='string'?j.tollStatus.slice(0,40):null,
  travelerPaysCents:num(j.travelerPays),
  operatorGetsCents:num(j.operatorGets),
  platformTakeCents:num(j.platformTake)
 }));
 if(r.status!==200||!Number.isSafeInteger(j.travelerPays)||j.travelerPays<=0 ||
  !Number.isSafeInteger(j.operatorGets)||j.operatorGets<0)
   process.exitCode=1;
}catch(e){console.log('SIGNED_MOBILE_LIVE_QUOTE_UNVERIFIED '+String(e?.message||e).slice(0,130));process.exitCode=1;}
console.log('NO MONEY MOVED: fare quote only; no account, booking, authorization, capture, transfer or refund.');
