'use strict';
// This gate can ONLY target disposable local Firebase Auth/Firestore emulators.
// It cannot be enabled in Cloud Run, on a deployed API or in a normal store build.
function isolatedQaBase() {
  const e=process.env;
  return e.NODE_ENV==='test'&&
    e.EXPO_PUBLIC_AR_NATIVE_QA==='1'&&
    e.EXPO_PUBLIC_API_URL==='http://10.0.2.2:4242'&&
    e.FIREBASE_PROJECT_ID==='demo-american-rider-qa'&&
    e.GOOGLE_CLOUD_PROJECT==='demo-american-rider-qa'&&
    e.FIRESTORE_EMULATOR_HOST==='127.0.0.1:8080'&&
    e.FIREBASE_AUTH_EMULATOR_HOST==='127.0.0.1:9099'&&
    !e.K_SERVICE&&!e.FIREBASE_SERVICE_ACCOUNT&&!e.GOOGLE_APPLICATION_CREDENTIALS&&
    !e.STRIPE_LIVE_SECRET_KEY;
}
function isolatedNativeQa() {
  const e=process.env;
  if(!isolatedQaBase())return false;
  // An ordinary native login QA run must NEVER touch Stripe, not even test.
  if(e.AR_NATIVE_COMMERCIAL_QA!=='1')return !e.STRIPE_SECRET_KEY&&!e.STRIPE_TEST_SECRET_KEY;
  // Separate opt-in to actual Stripe sandbox commercial tests, and NO live key.
  // A configured prefix is necessary, not sufficient: the test harness must call
  // Stripe's authenticated balance API and assert livemode===false before writes.
  return /^sk_test_[^\s]+$/.test(e.STRIPE_SECRET_KEY||'')&&
    /^pk_test_[^\s]+$/.test(e.STRIPE_PUBLISHABLE_KEY||'');
}
function isolatedNativeCommercialQa() {
  return isolatedNativeQa()&&process.env.AR_NATIVE_COMMERCIAL_QA==='1';
}
module.exports={isolatedNativeQa,isolatedNativeCommercialQa};
