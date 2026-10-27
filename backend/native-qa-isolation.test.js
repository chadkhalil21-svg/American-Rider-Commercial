'use strict';
const assert=require('node:assert/strict');
const {isolatedNativeQa}=require('./native-qa-isolation');
const envs=['NODE_ENV','EXPO_PUBLIC_AR_NATIVE_QA','EXPO_PUBLIC_API_URL',
'FIREBASE_PROJECT_ID','GOOGLE_CLOUD_PROJECT','FIRESTORE_EMULATOR_HOST',
'FIREBASE_AUTH_EMULATOR_HOST','K_SERVICE','FIREBASE_SERVICE_ACCOUNT',
'GOOGLE_APPLICATION_CREDENTIALS','STRIPE_SECRET_KEY','STRIPE_LIVE_SECRET_KEY','STRIPE_PUBLISHABLE_KEY','STRIPE_TEST_SECRET_KEY','AR_NATIVE_QA_LOCAL','AR_NATIVE_COMMERCIAL_QA'];
const previous=Object.fromEntries(envs.map(k=>[k,process.env[k]]));
const local={NODE_ENV:'test',AR_NATIVE_QA_LOCAL:'1',EXPO_PUBLIC_AR_NATIVE_QA:'1',
EXPO_PUBLIC_API_URL:'http://10.0.2.2:4242',
FIREBASE_PROJECT_ID:'demo-american-rider-qa',
GOOGLE_CLOUD_PROJECT:'demo-american-rider-qa',
FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099'};
try{
for(const k of envs)delete process.env[k];
assert.equal(isolatedNativeQa(),false,'unconfigured environment must stay production auth');
Object.assign(process.env,local);
assert.equal(isolatedNativeQa(),true,'fully isolated fixture must allow local token verification');
for(const [k,v] of [
 ['NODE_ENV','production'],['EXPO_PUBLIC_AR_NATIVE_QA','0'],
 ['EXPO_PUBLIC_API_URL','https://americanrider.tech'],
 ['FIREBASE_PROJECT_ID','american-rider-35688'],
 ['GOOGLE_CLOUD_PROJECT','american-rider-35688'],
 ['FIRESTORE_EMULATOR_HOST','firebase.googleapis.com:443'],
 ['FIREBASE_AUTH_EMULATOR_HOST','firebase.googleapis.com:443'],
 ['K_SERVICE','american-rider'],['FIREBASE_SERVICE_ACCOUNT','any'],
 ['GOOGLE_APPLICATION_CREDENTIALS','/tmp/key.json'],
 ['STRIPE_SECRET_KEY','sk_live_example'],['STRIPE_LIVE_SECRET_KEY','sk_live_example']
]){process.env[k]=v;assert.equal(isolatedNativeQa(),false,k+' must prevent local QA exception');delete process.env[k];Object.assign(process.env,local);}

// Explicit opt-in to provider-verified Stripe TEST payments may preserve isolated
// local Firebase token verification; any live/real-project switch MUST stop.
process.env.AR_NATIVE_COMMERCIAL_QA='1';
process.env.STRIPE_SECRET_KEY='sk_test_FixtureOnly';
process.env.STRIPE_PUBLISHABLE_KEY='pk_test_FixtureOnly';
assert.equal(isolatedNativeQa(),true,'commercial isolated QA should allow two Stripe TEST keys');
for(const [k,bad] of [
 ['STRIPE_SECRET_KEY','sk_live_realMoneyForbidden'],
 ['STRIPE_PUBLISHABLE_KEY','pk_live_forbidden'],
 ['FIREBASE_PROJECT_ID','american-rider-35688'],
 ['GOOGLE_CLOUD_PROJECT','american-rider-35688'],
 ['EXPO_PUBLIC_API_URL','https://american-rider-api-production-623854974930.us-east1.run.app'],
 ['K_SERVICE','american-rider-api-production'],
 ['AR_NATIVE_QA_LOCAL','0'],
 ['AR_NATIVE_COMMERCIAL_QA','0'],
 ['STRIPE_LIVE_SECRET_KEY','sk_live_forbidden'],
]) {
 const prior=process.env[k];
 process.env[k]=bad;
 assert.equal(isolatedNativeQa(),false,'strict commercial QA must refuse '+k);
 if(prior===undefined)delete process.env[k];else process.env[k]=prior;
}
delete process.env.AR_NATIVE_COMMERCIAL_QA;
delete process.env.STRIPE_SECRET_KEY;
delete process.env.STRIPE_PUBLISHABLE_KEY;
assert.equal(isolatedNativeQa(),true,'keyless native smoke remains available independently');

console.log('PASS: native QA Auth/Admin override is unusable in every simulated production environment');
}finally{for(const k of envs)previous[k]===undefined?delete process.env[k]:process.env[k]=previous[k];}
