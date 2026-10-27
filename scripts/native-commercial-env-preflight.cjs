'use strict';
// Fail-closed PRECONDITION for native Traveler -> Operator -> Stripe TEST commercial journeys.
// Zero provider writes. Never mistake app launch, source tests, or synthetic charges for a full mobile pass.
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
  // This preflight NEVER certifies an Operator or a payment; it merely permits actual UI automation to start.
  console.log('PASS PRECONDITIONS: isolated '+platform+' client can attempt Stripe TEST paid Traveler/Operator journey.');
  console.log('Full journey still requires native UI artifacts tied to a single Travel ID plus independent TEST Stripe provider retrieval.');
}
main().catch(err=>{ console.error('NATIVE COMMERCIAL QA BLOCKED:',err.message);process.exitCode=1;});
