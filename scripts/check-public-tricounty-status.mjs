// One read-only production verification during CI: do not confuse a county in
// the geographic registry with a commercially activated pickup market.
// Never changes market admission, Operator eligibility or live payment settings.
const url='https://american-rider-server-3d7x.onrender.com/markets';
const required=['fl-miami-dade','fl-broward','fl-palm-beach'];
try {
  const response=await fetch(url,{method:'GET',signal:AbortSignal.timeout(12000),
    headers:{Accept:'application/json'}});
  if(!response.ok) {
    console.log('TRI_COUNTY_STATUS_UNVERIFIED: Public server returned HTTP '+response.status);
  } else {
    const body=await response.json();
    if(!Array.isArray(body?.active)) throw new Error('No valid list of active markets');
    const active=new Set(body.active.filter(x=>x?.status==='active').map(x=>String(x.id)));
    for(const county of required){
      console.log('LIVE_TRI_COUNTY '+county+' '+(active.has(county)?'ACTIVE':'NOT_CONFIRMED_ACTIVE'));
    }
    console.log('LIVE_TRI_COUNTY_SUMMARY '+required.filter(x=>active.has(x)).length+'/3 currently public-active.');
  }
} catch(e) {
  console.log('TRI_COUNTY_STATUS_UNVERIFIED: '+String(e.message||e).slice(0,200));
}
// A read-only network probe is informative, not an authority to launch service.
// Unreachable production must not make an otherwise unrelated code test claim
// insurance or permissions are satisfied. Missing statuses remain unverified.


// Separately inspect real commercial payment readiness. This public, GET-only
// diagnostic never creates a booking, turns on screening, changes a region,
// charges a card, or exposes provider credentials. CI must not falsely claim
// a production booking succeeded merely because the server deploy is green.
try {
  const response=await fetch('https://american-rider-server-3d7x.onrender.com/health',{
    method:'GET',signal:AbortSignal.timeout(12000),headers:{Accept:'application/json'}});
  if(!response.ok){
    console.log('LIVE_COMMERCIAL_READINESS_UNVERIFIED: health HTTP '+response.status);
  }else{
    const body=await response.json();
    if(body?.service!=='american-rider-server') throw Error('Unexpected health responder');
    const flag=value=>value===true?'YES':value===false?'NO':'UNKNOWN';
    const field=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,40}$/.test(value)?value:'UNKNOWN';
    const missing=Array.isArray(body.operationalMissing)
      ?body.operationalMissing.filter(s=>typeof s==='string'&&/^[a-z_]{1,48}$/.test(s)).slice(0,30)
      :null;
    console.log('LIVE_COMMERCIAL_COMMIT '+field(body.commit));
    console.log('LIVE_COMMERCIAL_DEPLOYMENT '+field(body.deployment));
    console.log('LIVE_COMMERCIAL_STRIPE '+field(body.stripe));
    console.log('LIVE_COMMERCIAL_PAYMENT_READY '+flag(body.operationalReady));
    console.log('LIVE_COMMERCIAL_PAYMENT_MISSING '+(missing===null?'UNKNOWN':missing.length?missing.join(','):'NONE'));
    console.log('LIVE_COMMERCIAL_SCREENING '+field(body.screening));
    console.log('LIVE_COMMERCIAL_DOCUMENTS '+field(body.documents));
    console.log('LIVE_COMMERCIAL_WEBHOOK '+field(body.webhook));
    console.log('LIVE_COMMERCIAL_RECEIPTS '+field(body.receipts));
    console.log('LIVE_COMMERCIAL_OPS_AUTH '+field(body.opsAuth));
  }
}catch(e){
  console.log('LIVE_COMMERCIAL_READINESS_UNVERIFIED: '+String(e?.message||e).slice(0,160));
}
// A successful public health response only confirms configured readiness.
// It is not a signed-app booking/payment/Operator dispatch test or legal signoff.
