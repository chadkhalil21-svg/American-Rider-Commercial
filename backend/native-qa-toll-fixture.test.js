'use strict';
const assert=require('node:assert/strict');
const {isolatedWynwoodTollFixture,ORIGIN,DESTINATION}=require('./native-qa-toll-fixture');
const keys=['NODE_ENV','AR_NATIVE_QA_LOCAL','AR_NATIVE_COMMERCIAL_QA','EXPO_PUBLIC_AR_NATIVE_QA',
'EXPO_PUBLIC_API_URL','FIREBASE_PROJECT_ID','GOOGLE_CLOUD_PROJECT','FIRESTORE_EMULATOR_HOST',
'FIREBASE_AUTH_EMULATOR_HOST','K_SERVICE','FIREBASE_SERVICE_ACCOUNT',
'GOOGLE_APPLICATION_CREDENTIALS','STRIPE_LIVE_SECRET_KEY','STRIPE_SECRET_KEY',
'STRIPE_PUBLISHABLE_KEY','STRIPE_TEST_SECRET_KEY'];
const before=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
const restore=()=>{for(const [k,v] of Object.entries(before)){if(v===undefined)delete process.env[k];else process.env[k]=v;}};
const qa=()=>Object.assign(process.env,{
  NODE_ENV:'test',AR_NATIVE_QA_LOCAL:'1',AR_NATIVE_COMMERCIAL_QA:'1',
  EXPO_PUBLIC_AR_NATIVE_QA:'1',
  EXPO_PUBLIC_API_URL:'http://127.0.0.1:4242',
  FIREBASE_PROJECT_ID:'demo-american-rider-qa',
  GOOGLE_CLOUD_PROJECT:'demo-american-rider-qa',
  FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080',
  FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',
  STRIPE_SECRET_KEY:'sk_test_synthetic_fake_key_not_a_provider_credential',
  STRIPE_PUBLISHABLE_KEY:'pk_test_synthetic_fake_key_not_a_provider_credential',
});
try{
  for(const k of keys)delete process.env[k];
  assert.equal(isolatedWynwoodTollFixture(ORIGIN,DESTINATION),null,
    'Synthetic tolls MUST be disabled for ordinary/production execution');
  qa();
  const t=isolatedWynwoodTollFixture(ORIGIN,DESTINATION);
  assert.deepEqual({status:t?.status,cents:t?.tollCents,qa:t?.qaOnly},
    {status:'clear',cents:0,qa:true});
  assert.equal(t.provider,'isolated-native-qa-synthetic-toll');
  assert.equal(isolatedWynwoodTollFixture(ORIGIN,{lat:25.7826,lng:-80.1341}),null,
    'No other route may infer zero toll');
  assert.equal(isolatedWynwoodTollFixture(DESTINATION,ORIGIN),null,
    'The reverse route has not been simulated');
  process.env.K_SERVICE='production-cloud-run';
  assert.equal(isolatedWynwoodTollFixture(ORIGIN,DESTINATION),null,
    'Cloud Run always rejects synthetic toll records');
  delete process.env.K_SERVICE;
  process.env.STRIPE_SECRET_KEY='sk_live_not_real_secret';
  assert.equal(isolatedWynwoodTollFixture(ORIGIN,DESTINATION),null,
    'Live Stripe always rejects synthetic toll records');
  process.env.STRIPE_SECRET_KEY='sk_test_synthetic_fake_key_not_a_provider_credential';
  process.env.FIRESTORE_EMULATOR_HOST='production-firestore:8080';
  assert.equal(isolatedWynwoodTollFixture(ORIGIN,DESTINATION),null,
    'Non-local Firestore always rejects synthetic toll records');
  console.log('PASS: simulated Wynwood zero toll isolated from production, Stripe LIVE, and every other route');
}finally{restore();}
