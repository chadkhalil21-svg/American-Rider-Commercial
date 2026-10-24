'use strict';
// Strict generator; NEVER publish guessed Apple/Play signing identifiers.
// Static file publication is not proof of OS-verified Universal/App Links.
const fs=require('node:fs');
const path=require('node:path');
const TEAM=/^[A-Z0-9]{10}$/;
const CERT=/^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/;
function associationPayload(teamId,playSha256){
  if(!TEAM.test(teamId)||!CERT.test(playSha256))
    throw Error('Verified Apple Team ID and Google Play app-signing SHA-256 required');
  return {
    apple:{applinks:{details:[{
      appIDs:[teamId+'.com.americanrider.app'],
      components:[{'/':'/join'},{'/':'/join/*'}],
    }]}},
    android:[{relation:['delegate_permission/common.handle_all_urls'],
      target:{namespace:'android_app',package_name:'com.americanrider.app',
        sha256_cert_fingerprints:[playSha256]}}],
  };
}
function writeAssociations(root,env=process.env){
  const teamId=(env.AR_APPLE_TEAM_ID||'').trim();
  const playSha256=(env.AR_ANDROID_PLAY_SHA256||'').trim();
  if(!teamId&&!playSha256)return {generated:false};
  if(!teamId||!playSha256)throw Error('Both signed app identifiers are required; no partial app association');
  const payload=associationPayload(teamId,playSha256);
  const dir=path.join(root,'.well-known');
  fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'apple-app-site-association'),
    JSON.stringify(payload.apple)+'\n','utf8');
  fs.writeFileSync(path.join(dir,'assetlinks.json'),
    JSON.stringify(payload.android)+'\n','utf8');
  return {generated:true};
}
module.exports={associationPayload,writeAssociations};
