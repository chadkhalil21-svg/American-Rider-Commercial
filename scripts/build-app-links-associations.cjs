'use strict';
// Emit an Apple association only for our independently verified public Team ID,
// and Android associations only when the ACTUAL Play signing certificate is known.
// Neither platform's signing readiness blocks the other.
const fs=require('node:fs');
const path=require('node:path');
const TEAM=/^[A-Z0-9]{10}$/;
const CERT=/^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/;
function associationPayload(teamId,playSha256){
  if(!teamId&&!playSha256)throw Error('At least one verified platform signing identity required');
  if(teamId&&!TEAM.test(teamId))throw Error('Verified Apple Team ID required');
  if(playSha256&&!CERT.test(playSha256))throw Error('Verified Google Play app-signing SHA-256 required');
  return {
    ...(teamId?{apple:{applinks:{details:[{
      appIDs:[teamId+'.com.americanrider.app'],
      components:[{'/':'/join'},{'/':'/join/*'}],
    }]}}}:{}),
    ...(playSha256?{android:[{relation:['delegate_permission/common.handle_all_urls'],
      target:{namespace:'android_app',package_name:'com.americanrider.app',
        sha256_cert_fingerprints:[playSha256]}}]}:{}),
  };
}
function writeAssociations(root,env=process.env){
  const teamId=(env.AR_APPLE_TEAM_ID||'').trim();
  const playSha256=(env.AR_ANDROID_PLAY_SHA256||'').trim();
  if(!teamId&&!playSha256)return {generated:false,appleGenerated:false,androidGenerated:false};
  // Validate all supplied identifiers BEFORE writing either published file.
  const payload=associationPayload(teamId,playSha256);
  const dir=path.join(root,'.well-known');
  fs.mkdirSync(dir,{recursive:true});
  if(payload.apple)fs.writeFileSync(path.join(dir,'apple-app-site-association'),
    JSON.stringify(payload.apple)+'\n','utf8');
  if(payload.android)fs.writeFileSync(path.join(dir,'assetlinks.json'),
    JSON.stringify(payload.android)+'\n','utf8');
  return {generated:true,appleGenerated:!!payload.apple,androidGenerated:!!payload.android};
}
module.exports={associationPayload,writeAssociations};
