'use strict';
// Native URL smoke regression. Do not submit an App Store rebuild just to fix
// the existing signed binary: the corporate site also serves the /about alias.
const assert = require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=(p)=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const index=read('app/index.tsx');
const account=read('app/account.tsx');
const config=read('src/config.ts');
const site=read('scripts/build-corporate-website.cjs');
assert.match(config,/export const LEGAL_URL = 'https:\/\/americanrider\.tech'/);
for(const [file,src] of [['index',index],['account',account]]){
  assert.match(src,/\$\{LEGAL_URL\}\/company\//,file+' must open canonical company page');
  assert.doesNotMatch(src,/\$\{LEGAL_URL\}\/about/,file+' must not open nonexistent About route');
}
assert.match(site,/out\("about",render\(pages\.company\.title,pages\.company\.body,"company"\)\)/,
  'Legacy Build 53 /about must resolve without an iOS app rebuild');
assert.match(index,/operator\.verification === 'pending'[\s\S]{0,160}t\('traveler\.operatorQualificationStatus'\)/,
  'Pending operator must be offered qualification status, not finish qualification');
assert.match(index,/go\('\/operator\/review'\)/);
for(const lang of ['en','es','fr','it','de']){
  const locale=read('src/i18n/'+lang+'.ts');
  assert.match(locale,/operatorQualificationStatus:\s*['`]/,lang+' must translate pending review status');
}
console.log('PASS native About routes, existing signed Build 53 legacy alias, and pending operator wording');
