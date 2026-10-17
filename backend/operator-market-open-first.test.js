'use strict';
// Founder-settled active-market-first registration. Runs twice, entirely offline.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const {markets}=require('./markets');
const {REGIONS}=require('./regions');
const {screeningPreparationFor}=require('./screening-jurisdictions');
const miami=markets().find(m=>m.id==='fl-miami-dade');
assert.ok(miami && miami.status==='active');
const region=REGIONS.find(r=>r.id===miami.regionId);
assert.ok(region);
for(let i=0;i<2;i++){
 assert.equal(screeningPreparationFor(miami,region).ok,true,'an open area with correct policy may screen');
 for(const status of ['waitlist','onboarding','unconfigured',null]){
  const denied=screeningPreparationFor({...miami,status},region);
  assert.equal(denied.ok,false,'no screening in a non-active area');
  assert.equal(denied.code,'market_waitlist');
 }
 assert.equal(screeningPreparationFor(null,region).ok,false);
 assert.equal(screeningPreparationFor({...miami,state:'CO'},region).ok,false,
  'a Colorado claim cannot use Florida screening policy');
 const server=read('backend/server.js');
 const form=read('app/operator/qualify.tsx');
 const connect=read('src/backend/connect.ts');
 const body=server.split("app.post('/operator/market'")[1]?.split("app.get('/operator/market'")[0]||'';
 assert.doesNotMatch(body,/collection\('waitlist'\)/,
  'selecting a county must never create an interest record without explicit opt-in');
 assert.match(server,/app.post\('\/waitlist', requireAuth, LIMITS.waitlist/,
  'optional interest is separate and rate-limited');
 assert.match(server,/app.post\('\/storage\/upload-url', requireAuth, LIMITS.document, requireFreshAuth, requirePrivateUploadPurpose/,
  'private upload has purpose-scoped authorization');
 assert.match(server,/if \(purpose === 'operator-document'\) return requireActiveOperatingMarket\(req, res, next\)/,
  'Operator document upload still requires an open service county');
 assert.match(server,/if \(purpose === 'lost-item'\) return next\(\)/,
  'Traveler lost-property photos must not need Operator registration');
 assert.match(server,/app.post\('\/operator\/document', requireAuth, LIMITS.document, requireFreshAuth, requireActiveOperatingMarket/,
  'document review still requires an open service county');
 assert.match(server,/app.post\('\/operator\/qualification\/submit', requireAuth, LIMITS.qualification, requireActiveOperatingMarket/,
  'qualification submission still requires an open service county');
 assert.match(server,/app.post\('\/connect\/onboard', requireAuth, LIMITS.connect, requireActiveOperatingMarket/,
  'payout onboarding requires an open service county');
 for(const route of ['authorize-status','attest','request-confirmation']){
  const limit=route==='request-confirmation'?'document':'qualification';
  assert.ok(server.includes("app.post('/operator/insurance/"+route+"', requireAuth, LIMITS."+limit+", requireActiveOperatingMarket"),
   'insurance action must not write or contact a provider in an unopened county: '+route);
 }
 assert.ok(server.includes("app.post('/operator/insurance/report-risk', requireAuth, LIMITS.qualification, async"),
  'insurance cancellation and nonpayment risk can always be reported to protect Travelers');
 assert.match(server,/const gate = screeningPreparationFor\(market, region\)/,
  'screening checks current market status in backend');
 assert.match(server,/requireOperationalReadiness/,
  'duty retains separate eligibility gate');
 assert.match(form,/const areaAuthorized = areaActive;/,
  'app checklist never unlocks for waitlist');
 assert.doesNotMatch(form,/d.key === 'background' && area\?\.market\?\.status === 'waitlist'/,
  'background screen is not available in waitlist');
 assert.match(form, /joinOperatorAreaWaitlist\(marketId\)/,
  'joining an interest list is a separate user action');
 assert.match(form,/\{areaActive && <Card style=\{styles.listCard\}>/,
  'checklist hidden before opening');
 assert.match(connect,/joinOperatorAreaWaitlist\(marketId: string\)/);
 for(const lang of ['en','es','fr','it','de']){
  const tr=read('src/i18n/'+lang+'.ts');
  assert.match(tr,/marketNotActive:.*%\{name\}/,'closed-market notice present');
  assert.doesNotMatch(tr,/marketPrelaunch:/,'outdated preopening clearance promise absent');
 }
}
console.log('PASS twice: open-first registration, screening, documents, payouts, duty, opt-in waitlist; no billed calls or user data.');
