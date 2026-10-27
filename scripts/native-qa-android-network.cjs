'use strict';
// CI-only transform of Expo's generated Android QA RELEASE manifest.
// Production app.json / signed-store manifests are never changed.
// Android 9+ blocks cleartext HTTP; local Firebase runs on 10.0.2.2.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
function apply(manifestPath=path.join('android','app','src','main','AndroidManifest.xml')) {
  const e=process.env;
  for(const [key,want] of Object.entries({
    AR_NATIVE_PLATFORM:'android',AR_NATIVE_QA_LOCAL:'1',AR_NATIVE_COMMERCIAL_QA:'1',
    EXPO_PUBLIC_AR_NATIVE_QA:'1',EXPO_PUBLIC_API_URL:'http://10.0.2.2:4242',
    FIREBASE_PROJECT_ID:'demo-american-rider-qa',
    GOOGLE_CLOUD_PROJECT:'demo-american-rider-qa',
  })) assert.equal(e[key],want,'Refuse QA network exemption outside isolated Android: '+key);
  assert.ok(!e.K_SERVICE&&!e.STRIPE_LIVE_SECRET_KEY&&!e.GOOGLE_APPLICATION_CREDENTIALS,
    'Never relax networking for a production process');
  const src=fs.readFileSync(manifestPath,'utf8');
  assert.match(src,/<manifest\b[^>]*xmlns:android="http:\/\/schemas\.android\.com\/apk\/res\/android"/,
    'Unknown Android manifest namespace');
  assert.match(src,/<application(?:\s|>)/,'Missing generated application');
  assert.doesNotMatch(src,/android:networkSecurityConfig=/,'Refuse overwriting native security config');
  assert.doesNotMatch(src,/android:usesCleartextTraffic=/,'Refuse overriding native security');
  const patched=src.replace(/<application(?=\s|>)/,
    '<application android:networkSecurityConfig="@xml/american_rider_qa_network_security_config"');
  const out=path.join(path.dirname(manifestPath),'res','xml','american_rider_qa_network_security_config.xml');
  fs.mkdirSync(path.dirname(out),{recursive:true});
  // HTTPS is required for every destination except the non-routable emulator host alias.
  const xml=`<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false" />
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">10.0.2.2</domain>
  </domain-config>
</network-security-config>
`;
  assert.ok(!fs.existsSync(out),'QA XML must not already exist');
  fs.writeFileSync(out,xml);
  fs.writeFileSync(manifestPath,patched);
  console.log('QA-only Android network policy: host alias permitted, all other HTTP blocked');
}
if (require.main===module) apply(process.argv[2]);
module.exports={apply};
