'use strict';
// Source contract for the backend-served public company pages.
// Render static Expo deployment is NOT evidence that these routes are live at americanrider.app.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {HOME_HTML,OPERATE_HTML,SUPPORT_HTML,TRAVEL_HTML,SAFETY_HTML,SMART_HTML,RECRUITMENT_HTML} = require('./site');
const {ABOUT_HTML,TERMS_HTML,PRIVACY_HTML} = require('./legal');
const server = fs.readFileSync(require.resolve('./server'), 'utf8');
const expectText=(page,text,label)=>assert.ok(page.includes(text),label+': missing '+text);
for(const [route,html] of [['/',HOME_HTML],['/operate',OPERATE_HTML],
  ['/travel',TRAVEL_HTML],['/recruitment',RECRUITMENT_HTML],['/support',SUPPORT_HTML],['/safety',SAFETY_HTML],
  ['/smart-travel',SMART_HTML],['/about',ABOUT_HTML],
  ['/terms',TERMS_HTML],['/privacy',PRIVACY_HTML]]){
  assert.match(html,/<!doctype html>/i,'whole HTML at '+route);
  assert.match(html,/<meta name="viewport"/i,'mobile viewport at '+route);
  assert.match(html,/<title>/i,'title at '+route);
  assert.ok(server.includes("app.get('"+route+"'"), 'backend route missing: '+route);
}
expectText(HOME_HTML,'99%','home');
expectText(HOME_HTML,'href="/recruitment"','home recruiter entry');
expectText(RECRUITMENT_HTML,'not yet open for enrollment','honest recruiter status');
expectText(RECRUITMENT_HTML,'Compensation, eligibility and payout frequency are not yet announced','no premature money promise');
assert.doesNotMatch(RECRUITMENT_HTML,/href="\/join|apply now|Friday payouts/i);

expectText(HOME_HTML,'$2.50','home');
expectText(HOME_HTML,'National Transportation','home');
expectText(HOME_HTML,'across the United States','home');
assert.doesNotMatch(HOME_HTML,/South Florida|Miami-Dade|Broward|Palm Beach/i,'homepage is nationally neutral');
expectText(HOME_HTML,'We are preparing the public mobile-app release.','home');
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
// Public fee terms must not promise inactive, unconditional arrival charges.
for(const [name,html] of [['Operator',OPERATE_HTML],['Support',SUPPORT_HTML],
  ['Travel',TRAVEL_HTML],['Terms',TERMS_HTML]]){
  assert.doesNotMatch(html,/cancellation carries a \$3\.00 arrival fee|After arrival, a\s+\$3\.00 arrival fee|returns (?:your |the )?fare less a \$3\.00 arrival fee|Nothing is charged until an operator has been assigned/i,
    name+' must not promise a fee/charge policy that is not active');
}
expectText(OPERATE_HTML,'An Operator', 'Operator cancellation');
expectText(SUPPORT_HTML,'authorization', 'Support payment');
expectText(TRAVEL_HTML,'temporary card authorization', 'Travel dispatch');
expectText(TERMS_HTML,'optional verified $4', 'Terms verified fee');
for(const page of [SAFETY_HTML,SUPPORT_HTML]){
  expectText(page,'Zero-tolerance impairment policy','Florida public policy');
  expectText(page,'suspect impairment','Florida report procedure');
  expectText(page,'support@americanrider.app','Florida reporting email');
}
assert.match(HOME_HTML,/ar-photo/,'editorial photography');
assert.match(HOME_HTML,/ar-vision/,'navy national message');
assert.match(HOME_HTML,/href="\/recruitment"/,'recruiter link separate');
assert.match(HOME_HTML,/illustrative photograph/i,'visual is illustration only');
console.log('PASS: public backend routes, current pricing and geography, Stripe Operator payout truth, no false recruiter/store claims');
