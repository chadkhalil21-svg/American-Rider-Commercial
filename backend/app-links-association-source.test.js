'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {associationPayload,writeAssociations}=require('../scripts/build-app-links-associations.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'ar-app-links-'));
const fakeTeam='ABCDEFGHIJ',fakeSha=Array(32).fill('AB').join(':');
try{
  assert.equal(writeAssociations(root,{}).generated,false,'unverified links never published');
  assert.equal(fs.existsSync(path.join(root,'.well-known')),false);
  assert.throws(()=>writeAssociations(root,{AR_APPLE_TEAM_ID:fakeTeam}),/Both signed/);
  assert.throws(()=>associationPayload(fakeTeam,'00:11'),/Verified Apple Team/);
  assert.equal(fs.existsSync(path.join(root,'.well-known')),false);
  const out=writeAssociations(root,{AR_APPLE_TEAM_ID:fakeTeam,AR_ANDROID_PLAY_SHA256:fakeSha});
  assert.equal(out.generated,true);
  const a=JSON.parse(fs.readFileSync(path.join(root,'.well-known','apple-app-site-association'),'utf8'));
  const g=JSON.parse(fs.readFileSync(path.join(root,'.well-known','assetlinks.json'),'utf8'));
  assert.deepEqual(a.applinks.details[0].appIDs,[fakeTeam+'.com.americanrider.app']);
  assert.deepEqual(a.applinks.details[0].components,[{'/':'/join'},{'/':'/join/*'}]);
  assert.equal(g[0].target.package_name,'com.americanrider.app');
  assert.deepEqual(g[0].target.sha256_cert_fingerprints,[fakeSha]);
  console.log('PASS official Apple and Google domain association schemas; never guessed or deployed without verified identifiers');
}finally{fs.rmSync(root,{recursive:true,force:true});}
