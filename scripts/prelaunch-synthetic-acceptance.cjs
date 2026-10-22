'use strict';
// Shared, deterministic pre-store checks. NO external providers, no cloud calls,
// no credentials, no Stripe writes, no Firebase data or synthetic Operator enrollment.
// The real device/payment-provider acceptance boundary remains separate.
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const {verifyProductionSource,CANONICAL}=require('./verify-store-cloudrun-api.cjs');
const root=path.resolve(__dirname,'..');

const tests=[
  'backend/native-wallet-pickup-release-contract.test.js',
  'backend/synthetic-travel-lifecycle.test.js',
  'backend/manual-capture.test.js',
  'backend/authorized-hold-recovery.test.js',
  'backend/bookingrecovery.test.js',
  'backend/scheduled-exception.test.js',
  'backend/booking-readiness.test.js',
  'backend/geooperators.test.js',
  'backend/travelmoney.test.js',
];

if(verifyProductionSource(root)!==CANONICAL)
  throw Error('Release mobile app must target the existing paid Cloud Run backend.');

const isolatedEnv={
  PATH:process.env.PATH||'',
  HOME:process.env.HOME||'',
  NODE_ENV:'test',
  CI:'true',
  TZ:'UTC',
  AR_SYNTHETIC_ONLY:'1',
};
let passed=0;
for(const test of tests){
  const result=spawnSync(process.execPath,[path.join(root,test)],{
    cwd:root,env:isolatedEnv,encoding:'utf8',timeout:90000,maxBuffer:2*1024*1024,
  });
  if(result.error||result.status!==0){
    console.error('FAIL synthetic prelaunch:',test,'exit',result.status,
      result.error?.code||'');
    // No environment, tokens or provider response bodies are emitted.
    console.error(String(result.stderr||result.stdout||'').slice(-1200));
    process.exit(1);
  }
  passed++;
  console.log('PASS synthetic:',test);
}
console.log('PASS '+passed+' isolated prelaunch test suites; production API is Cloud Run.');
console.log('No real mobile wallet, live Connect account, bank payout or legal compliance attested.');
