'use strict';
// Fail-closed PRECONDITION for native Traveler -> Operator -> Stripe TEST commercial journeys.
// Only a disposable, unconfirmed Stripe TEST PaymentIntent is created and cancelled for key-pair verification.
// Never mistake app launch, source tests, or synthetic credentials for a full mobile pass.
const assert = require('node:assert/strict');
const os = require('node:os');
const url = require('node:url');
async function main() {
  const e = process.env;
  const platform = e.AR_NATIVE_PLATFORM;
  assert.ok(['ios','android'].includes(platform), 'AR_NATIVE_PLATFORM must be ios or android');
  const expectedApi = platform === 'ios' ? 'http://127.0.0.1:4242' : 'http://10.0.2.2:4242';
  const api = e.EXPO_PUBLIC_API_URL;
  assert.equal(api,expectedApi,'Native app MUST target its own loopback-only QA backend');
  assert.equal(e.EXPO_PUBLIC_AR_NATIVE_QA,'1','Native isolated Firebase QA mode required');
  assert.equal(e.AR_NATIVE_QA_LOCAL,'1','Backend local QA marker required');
  assert.equal(e.NODE_ENV,'test','Local API, NOT Expo release compiler, must run in test mode');
  assert.equal(e.GOOGLE_CLOUD_PROJECT,'demo-american-rider-qa','No production Google Cloud project');
  assert.equal(e.FIREBASE_PROJECT_ID,'demo-american-rider-qa','No production Firebase project');
  assert.equal(e.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8080','Local Firestore emulator mandatory');
  assert.equal(e.FIREBASE_AUTH_EMULATOR_HOST,'127.0.0.1:9099','Local Auth emulator mandatory');
  assert.ok(!e.K_SERVICE && !e.GOOGLE_APPLICATION_CREDENTIALS && !e.FIREBASE_SERVICE_ACCOUNT,
    'Production identity cannot enter commercial QA');
  assert.ok(!e.STRIPE_LIVE_SECRET_KEY, 'Live Stripe credentials forbidden');
  assert.match(e.STRIPE_SECRET_KEY||'',/^sk_test_/,'Stripe TEST secret required for native payment');
  assert.match(e.STRIPE_PUBLISHABLE_KEY||'',/^pk_test_/,'Matching Stripe TEST publishable key required');
  const ctrl = new AbortController();
  const timeout = setTimeout(()=>ctrl.abort(),10000);
  let r;
  try { r=await fetch('http://127.0.0.1:4242/config',{signal:ctrl.signal}); }
  finally { clearTimeout(timeout); }
  assert.equal(r.status,200,'Local API must serve /config');
  const config=await r.json();
  assert.equal(config.mode,'test','Native wallet MUST use Stripe test mode');
  assert.equal(config.canManagePaymentMethods,true,'Stripe TEST saved-card path is not commissioned');
  assert.equal(config.canTakePayment,true,
    'QA cannot create a paid Travel yet: check isolated active market, Operator coverage/availability, and Stripe TEST readiness');
  assert.equal(config.operationalReady,true,'Local backend is not commissioned for a paid Travel');

  // The secret-key balance check does not prove that the publishable key belongs
  // to the SAME Stripe TEST account. Stripe officially supports client-side
  // PaymentIntent retrieval with a publishable key plus its client_secret.
  // Probe this before booting an emulator: no card, authorization or capture.
  const Stripe=require('../backend/node_modules/stripe');
  const stripe=new Stripe(e.STRIPE_SECRET_KEY);
  assert.equal((await stripe.balance.retrieve()).livemode,false,'Stripe secret must be TEST');
  const probe=await stripe.paymentIntents.create({
    amount:100,currency:'usd',capture_method:'manual',
    payment_method_types:['card'],
    metadata:{qa_only:'true',purpose:'native_keypair_probe',ci_run:String(e.GITHUB_RUN_ID||'manual')},
  });
  try {
    assert.equal(probe.livemode,false,'Never probe a LIVE PaymentIntent');
    assert.equal(probe.status,'requires_payment_method','Probe must not authorize payment');
    const query=new URLSearchParams({client_secret:probe.client_secret});
    const pkResponse=await fetch('https://api.stripe.com/v1/payment_intents/'+probe.id+'?'+query,{
      headers:{Authorization:'Bearer '+e.STRIPE_PUBLISHABLE_KEY},
      signal:AbortSignal.timeout(10000),
    });
    const pkBody=await pkResponse.json().catch(()=>({}));
    assert.equal(pkResponse.status,200,'Stripe TEST key pair does not retrieve same intent: HTTP '+
      pkResponse.status+' code '+String(pkBody?.error?.code||'unknown'));
    assert.equal(pkBody.id,probe.id,'Publishable key cannot retrieve secret-key TEST intent');
    assert.equal(pkBody.livemode,false,'Client retrieved a LIVE Stripe intent');
    console.log('PASS: exact Stripe TEST publishable/secret key pair retrieves same uncharged PaymentIntent');
  } finally {
    await stripe.paymentIntents.cancel(probe.id);
  }

  // The home-screen destination entry exists ONLY when the iPhone or Android
  // sees an active market at its actual test pickup. Previous CI asserted
  // /config but never checked /markets/at, so the native journey reached
  // the home screen only to show "Service status cannot be confirmed".
  // This is a read-only backend probe, NOT a market activation or a bypass.
  const pickup={lat:25.7617,lng:-80.1918};
  const marketSignal=new AbortController();
  const marketTimer=setTimeout(()=>marketSignal.abort(),4000);
  let marketResponse;
  try {
    marketResponse=await fetch('http://127.0.0.1:4242/markets/at',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(pickup),
      signal:marketSignal.signal,
    });
  } finally { clearTimeout(marketTimer); }
  assert.equal(marketResponse.status,200,
    'LOCAL /markets/at failed: native Traveler home suppresses destination entry');
  const marketBody=await marketResponse.json();
  assert.ok(Array.isArray(marketBody.active) &&
    marketBody.here?.id==='fl-miami-dade' &&
    marketBody.here?.status==='active' &&
    marketBody.active.some(m=>m.id===marketBody.here.id&&m.status==='active'),
    'Local Miami pickup is not publicly active: native booking remains blocked; check real QA market response');
  console.log('PASS: local /markets/at returns active Miami-Dade pickup independently of /config');
  // Previous native runs reached Wynwood but displayed only dashes for every
  // class. Test the REAL server quote for the very same recorded fixture route,
  // before paying for another device compile. No mock fare, no bypass, no
  // charge and no changes to production market records.
  const quoteSignal=new AbortController();
  const quoteTimer=setTimeout(()=>quoteSignal.abort(),15000);
  let fareResponse;
  try {
    fareResponse=await fetch('http://127.0.0.1:4242/fare-quote',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        pickup,
        dest:{lat:25.801,lng:-80.1994},
        travelClass:'standard'
      }),
      signal:quoteSignal.signal,
    });
  } finally { clearTimeout(quoteTimer); }
  const fareBody=await fareResponse.json().catch(()=>null);
  assert.equal(fareResponse.status,200,
    'Local /fare-quote refused the Wynwood test route: HTTP '+fareResponse.status+
    ' code '+String(fareBody?.code||'none')+
    ' detail '+String(fareBody?.error||'unknown'));
  assert.ok(Number.isFinite(fareBody?.travelerPays)&&fareBody.travelerPays>0&&
    Number.isFinite(fareBody?.operatorGets)&&fareBody.operatorGets>0,
    'Wynwood test route returned no authoritative Traveler Total / Operator fare');
  console.log('PASS: local Wynwood /fare-quote has a positive server-owned Traveler Total');


  // This preflight NEVER certifies an Operator or a payment; it merely permits actual UI automation to start.
  console.log('PASS PRECONDITIONS: isolated '+platform+' client can attempt Stripe TEST paid Traveler/Operator journey.');
  console.log('Full journey still requires native UI artifacts tied to a single Travel ID plus independent TEST Stripe provider retrieval.');
}
main().catch(err=>{ console.error('NATIVE COMMERCIAL QA BLOCKED:',err.message);process.exitCode=1;});
