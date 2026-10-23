'use strict';
// Source contract for the backend-served public company pages.
// Render static Expo deployment is NOT evidence that these routes are live at americanrider.app.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {HOME_HTML,OPERATE_HTML,SUPPORT_HTML,TRAVEL_HTML,SAFETY_HTML,SMART_HTML} = require('./site');
const {ABOUT_HTML,TERMS_HTML,PRIVACY_HTML} = require('./legal');
const server = fs.readFileSync(require.resolve('./server'), 'utf8');
const expectText=(page,text,label)=>assert.ok(page.includes(text),label+': missing '+text);
for(const [route,html] of [['/',HOME_HTML],['/operate',OPERATE_HTML],
  ['/travel',TRAVEL_HTML],['/support',SUPPORT_HTML],['/safety',SAFETY_HTML],
  ['/smart-travel',SMART_HTML],['/about',ABOUT_HTML],
  ['/terms',TERMS_HTML],['/privacy',PRIVACY_HTML]]){
  assert.match(html,/<!doctype html>/i,'whole HTML at '+route);
  assert.match(html,/<meta name="viewport"/i,'mobile viewport at '+route);
  assert.match(html,/<title>/i,'title at '+route);
  assert.ok(server.includes("app.get('"+route+"'"), 'backend route missing: '+route);
}
expectText(HOME_HTML,'99%','home');
expectText(HOME_HTML,'$2.50','home');
expectText(HOME_HTML,'Miami-Dade, Broward and','home');
expectText(HOME_HTML,'Palm Beach counties','home');
expectText(HOME_HTML,'public app-store release has not yet been verified','home');
assert.doesNotMatch(HOME_HTML,/\$24\.50|launch(?:ed)? nationwide|now available nationwide/i);
assert.doesNotMatch(HOME_HTML,/href="\/recruiter/i,'no live recruiting link');
expectText(OPERATE_HTML,'99%','operate');
expectText(OPERATE_HTML,'$2.50','operate');
assert.doesNotMatch(OPERATE_HTML,/On a \$24\.50 travel/i);
expectText(ABOUT_HTML,'through Stripe','about');
expectText(ABOUT_HTML,'connected Stripe account','about');
expectText(ABOUT_HTML,'$2.50','about');
assert.doesNotMatch(ABOUT_HTML,/American Rider settles by bank transfer/i);
assert.doesNotMatch(ABOUT_HTML,/it is not itemised/i);
assert.doesNotMatch(ABOUT_HTML,/Every matter is answered by a person/i);
expectText(TERMS_HTML,'<html','terms');
expectText(PRIVACY_HTML,'<html','privacy');
console.log('PASS: public backend routes, current pricing and geography, Stripe Operator payout truth, no false recruiter/store claims');
