'use strict';
// One-time, GET-only public runtime comparison. No booking, payment, fee, or
// provider router request is triggered; never print keys or personal data.
const targets = [
  ['SIGNED_MOBILE_CLOUD_RUN','https://american-rider-api-production-623854974930.us-east1.run.app'],
  ['LEGACY_RENDER_OPERATIONS','https://american-rider-server-3d7x.onrender.com'],
];
async function get(url) {
  const res=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000)});
  if(!res.ok) throw Error('HTTP '+res.status);
  return await res.json();
}
for (const [name,host] of targets) {
  try {
    const [h,c]=await Promise.allSettled([get(host+'/health'),get(host+'/config')]);
    if(h.status==='rejected') { console.log(name+' HEALTH_UNAVAILABLE '+String(h.reason?.message||h.reason).slice(0,120));continue; }
    const body=h.value;
    const regions=Array.isArray(body.regions)?body.regions.map(r=>({
      id:String(r.id||''),streets:String(r.streets||'unreported'),
      otpConfigured:r.otp?.configured===true,otpResponding:r.otp?.ok===true
    })):[];
    const config=c.status==='fulfilled'?c.value:{};
    console.log(name+' VERIFIED_PUBLIC_RUNTIME '+JSON.stringify({
      releaseCommit:String(body.commit||'unreported').slice(0,10),
      deployment:String(body.deployment||'unreported'),
      stripeMode:String(body.stripe||'unreported'),
      paymentReady:body.operationalReady===true,
      canTakePayment:config.canTakePayment===true,
      manualCapture:config.manualTravelAuthorization===true,
      tollsConfigured:body.tolls==='on',
      regions
    }));
    if(regions.some(r=>r.id==='fl-southeast'&&r.streets==='none'))
      console.log(name+' ROUTING_WARNING: no OSRM/OTP street geometry for South Florida; inspect supported HERE route fallback separately');
    if(!regions.length) console.log(name+' ROUTING_NOT_REPORTED: no public configured-route evidence');
  } catch (e) { console.log(name+' READ_ONLY_DIAGNOSTIC_FAILED '+String(e?.message||e).slice(0,140)); }
}
console.log('READ_ONLY_ONLY: no actual Travel, paid routing, Stripe fee, production config, or market changed.');
