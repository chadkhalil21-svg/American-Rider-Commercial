'use strict';
const assert=require('node:assert/strict');
const cp=require('node:child_process');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const source=path.join(__dirname,'native-qa-android-network.cjs');
const fixture='<?xml version="1.0" encoding="utf-8"?><manifest xmlns:android="http://schemas.android.com/apk/res/android"><application android:label="QA" /></manifest>';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'ar-native-security-'));
const file=path.join(root,'AndroidManifest.xml');
const env={...process.env,AR_NATIVE_PLATFORM:'android',AR_NATIVE_QA_LOCAL:'1',
 AR_NATIVE_COMMERCIAL_QA:'1',EXPO_PUBLIC_AR_NATIVE_QA:'1',
 EXPO_PUBLIC_API_URL:'http://10.0.2.2:4242',FIREBASE_PROJECT_ID:'demo-american-rider-qa',
 GOOGLE_CLOUD_PROJECT:'demo-american-rider-qa'};
delete env.K_SERVICE;delete env.STRIPE_LIVE_SECRET_KEY;delete env.GOOGLE_APPLICATION_CREDENTIALS;
try {
 fs.writeFileSync(file,fixture);
 cp.execFileSync(process.execPath,[source,file],{env,stdio:'pipe'});
 const updated=fs.readFileSync(file,'utf8');
 const cfg=fs.readFileSync(path.join(root,'res','xml','american_rider_qa_network_security_config.xml'),'utf8');
 assert.match(updated,/android:networkSecurityConfig="@xml\/american_rider_qa_network_security_config"/);
 assert.match(cfg,/<base-config cleartextTrafficPermitted="false"/);
 assert.match(cfg,/<domain>10\.0\.2\.2<\/domain>/);
 assert.match(cfg,/<domain-config cleartextTrafficPermitted="true"/);
 assert.doesNotMatch(cfg,/includeSubdomains="true"|<domain>\*|<base-config cleartextTrafficPermitted="true"/);
 for(const wrong of [{AR_NATIVE_QA_LOCAL:'0'},{EXPO_PUBLIC_AR_NATIVE_QA:'0'},
  {GOOGLE_CLOUD_PROJECT:'american-rider-35688'},
  {EXPO_PUBLIC_API_URL:'https://americanrider.tech'}]) {
  fs.writeFileSync(file,fixture);fs.rmSync(path.join(root,'res'),{recursive:true,force:true});
  const o=cp.spawnSync(process.execPath,[source,file],{env:{...env,...wrong},encoding:'utf8'});
  assert.notEqual(o.status,0,'Must reject unsafe QA env '+JSON.stringify(wrong));
  assert.equal(fs.readFileSync(file,'utf8'),fixture,'failed guard must not edit manifest');
 }
 console.log('PASS Android QA network policy: scoped to local emulator, production denied');
} finally {fs.rmSync(root,{recursive:true,force:true});}
