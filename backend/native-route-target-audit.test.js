'use strict';
// Navigation actions that look live must link to actual Expo Router screens.
// Dynamic route expressions still require signed-device checks.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const app=path.join(__dirname,'../app');
function files(dir){
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
    const filename=path.join(dir,entry.name);
    return entry.isDirectory()?files(filename):
      /\.tsx$/.test(entry.name)?[filename]:[];
  });
}
const all=files(app);
const available=new Set(all.map(f=>{
  const relative=path.relative(app,f).replace(/\\/g,'/');
  return '/'+relative.replace(/\.(ios|android|web)\.tsx$/,'').replace(/\.tsx$/,'')
    .replace(/\/index$/,'');
}));
available.add('/');
let visited=0,links=0;
for(const file of all){
  visited++;
  const source=fs.readFileSync(file,'utf8');
  const reg=/router\.(?:navigate|push|replace|dismissTo)\(\s*['"]([^'"]+)['"]|pathname:\s*['"]([^'"]+)['"]/g;
  for(const match of source.matchAll(reg)){
    const target=match[1]||match[2];
    if(!target.startsWith('/')) continue;
    links++;
    assert(available.has(target),
      path.relative(app,file)+': unknown Expo Router destination '+target);
  }
}
assert(visited>=59,'Audit unexpectedly lost app screens');
assert(links>=100,'Audit unexpectedly lost navigation destinations');
// iOS Info.plist has a manual Google OAuth scheme; both it and the app's own
// scheme must survive Expo prebuild. A missing americanrider scheme caused the
// native iPhone simulator to refuse every Traveler/Operator deep link (error 115).
const config=require('../app.json').expo;
const eas=require('../eas.json');
const iosSchemes=config.ios?.infoPlist?.CFBundleURLTypes
  ?.flatMap(entry=>entry.CFBundleURLSchemes||[])||[];
const googleClient=eas.build.production.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const expectedGoogle='com.googleusercontent.apps.'+
  googleClient.replace(/\.apps\.googleusercontent\.com$/,'');
assert.equal(config.scheme,'americanrider','Expo Router must keep canonical scheme');
assert.equal(config.ios?.bundleIdentifier,'com.americanrider.app');
assert.equal(config.ios?.usesAppleSignIn,true,'Apple sign-in must be preserved');
assert.ok(iosSchemes.includes('americanrider'),
  'iOS app URL scheme must remain explicitly registered beside Google OAuth scheme');
assert.ok(iosSchemes.includes(expectedGoogle),
  'Google iOS callback URL scheme must not be replaced by app routing');
assert.equal(new Set(iosSchemes).size,iosSchemes.length,'URL schemes must be unique');
assert.ok(config.ios?.associatedDomains?.includes('applinks:americanrider.tech'));
assert.ok(config.android?.intentFilters?.some(filter=>
  filter.data?.some(d=>d.host==='americanrider.tech'&&d.pathPrefix==='/join')),
  'existing Android referral links must remain intact');

console.log('PASS: '+links+' literal native navigation references across '+visited+
 ' app screens point to real routes; dynamic routes require device checks.');
