'use strict';
// Strictly isolated native-device QA. Never create an authentication override on
// a production backend, with live credentials, or against real Firebase records.
function isolatedNativeQa(){
  const e=process.env;
  const local=e.NODE_ENV==='test'&&e.AR_NATIVE_QA_LOCAL==='1'&&
    e.EXPO_PUBLIC_AR_NATIVE_QA==='1'&&
    (e.EXPO_PUBLIC_API_URL==='http://10.0.2.2:4242'||
     e.EXPO_PUBLIC_API_URL==='http://127.0.0.1:4242')&&
    e.FIREBASE_PROJECT_ID==='demo-american-rider-qa'&&
    e.GOOGLE_CLOUD_PROJECT==='demo-american-rider-qa'&&
    e.FIRESTORE_EMULATOR_HOST==='127.0.0.1:8080'&&
    e.FIREBASE_AUTH_EMULATOR_HOST==='127.0.0.1:9099'&&
    !e.K_SERVICE&&!e.FIREBASE_SERVICE_ACCOUNT&&
    !e.GOOGLE_APPLICATION_CREDENTIALS&&!e.STRIPE_LIVE_SECRET_KEY;
  if(!local)return false;
  // Ordinary native sign-in smoke intentionally disables all payment access.
  if(e.AR_NATIVE_COMMERCIAL_QA!=='1')
    return !e.STRIPE_SECRET_KEY&&!e.STRIPE_TEST_SECRET_KEY;
  // The only exception is disposable commercial acceptance with matching
  // Stripe TEST key types. Upstream QA fixture independently confirms
  // balance.livemode===false BEFORE any simulated money moves.
  return /^sk_test_[^\s]+$/.test(e.STRIPE_SECRET_KEY||'')&&
    /^pk_test_[^\s]+$/.test(e.STRIPE_PUBLISHABLE_KEY||'')&&
    !e.STRIPE_TEST_SECRET_KEY;
}
module.exports={isolatedNativeQa};
