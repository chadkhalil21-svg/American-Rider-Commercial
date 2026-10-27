'use strict';
// Fail-closed ONLY for a local, throwaway Android QA runner. This is never an
// alternate authentication mode on production or a real device.
function isolatedNativeQa() {
  const e=process.env;
  return e.NODE_ENV==='test'&&
    e.EXPO_PUBLIC_AR_NATIVE_QA==='1'&&
    e.EXPO_PUBLIC_API_URL==='http://10.0.2.2:4242'&&
    e.FIREBASE_PROJECT_ID==='demo-american-rider-qa'&&
    e.GOOGLE_CLOUD_PROJECT==='demo-american-rider-qa'&&
    e.FIRESTORE_EMULATOR_HOST==='127.0.0.1:8080'&&
    e.FIREBASE_AUTH_EMULATOR_HOST==='127.0.0.1:9099'&&
    !e.K_SERVICE&&!e.FIREBASE_SERVICE_ACCOUNT&&!e.GOOGLE_APPLICATION_CREDENTIALS&&
    !e.STRIPE_SECRET_KEY&&!e.STRIPE_LIVE_SECRET_KEY;
}
module.exports={isolatedNativeQa};
