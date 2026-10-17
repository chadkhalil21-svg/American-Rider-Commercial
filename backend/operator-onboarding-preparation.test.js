'use strict';
// Pure and read-only onboarding regression. No Firebase, Stripe, actual people,
// identity evidence, commercial eligibility, R2 traffic or billed provider calls.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {operatorPreparationGate}=require('./operator-preparation');
const {markets}=require('./markets');
const {REGIONS}=require('./regions');
const src=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const county=markets().find(m=>m.id==='fl-miami-dade');
assert.ok(county,'configured Florida county required');
const stored=id=>({operatingMarket:{id}});
for(let pass=0;pass<2;pass++){
 const counties=markets();
 const {assessOperator}=require('./qualification');
 const missing=assessOperator({user:{operatingMarket:{id:county.id}},account:{disabled:false},liveMoney:false});
 assert.ok(missing.blockers.some(b=>b.code==='screening_required'),
  'sandbox may not qualify an unscreened Operator');
 const incomplete=assessOperator({user:{operatingMarket:{id:county.id},screening:{decision:'awaiting_agency'}},account:{disabled:false},liveMoney:false});
 assert.ok(incomplete.blockers.some(b=>b.code==='screening_incomplete'),
  'pending external report cannot be represented as a qualification pass');

 const approved=operatorPreparationGate(stored(county.id));
 assert.equal(approved,null,'source-verified Florida preparation permitted');
 const waitlisted=operatorPreparationGate(stored(county.id),{
   getMarkets:()=>counties.map(m=>m.id===county.id?{...m,status:'waitlist'}:m),
   regions:REGIONS,
 });
 assert.equal(waitlisted,null,'a waitlisted county must permit document preparation');
 const prelaunch=operatorPreparationGate(stored(county.id),{
   getMarkets:()=>counties.map(m=>m.id===county.id?{...m,status:'onboarding'}:m),
   regions:REGIONS,
 });
 assert.equal(prelaunch,null,'early preparation must not be linked to paid operations');
 assert.equal(operatorPreparationGate({})?.code,'screening_market_required');
 assert.equal(operatorPreparationGate(stored('unknown-county'))?.code,'screening_market_required');
 const corrupted=operatorPreparationGate(stored(county.id),{
   getMarkets:()=>counties.map(m=>m.id===county.id?{...m,regionId:'not-real'}:m),
   regions:REGIONS,
 });
 assert.ok(corrupted,'invalid regional or state policy cannot upload');
 const mismatched=operatorPreparationGate(stored(county.id),{
   getMarkets:()=>counties.map(m=>m.id===county.id?{...m,state:'GA'}:m),
   regions:REGIONS,
 });
 assert.ok(mismatched,'Florida rules cannot be inherited by Georgia');
 const server=src('backend/server.js');
 assert.match(server,/app\.post\('\/storage\/upload-url', requireAuth, LIMITS\.document, requireFreshAuth, requireOperatorPreparationMarket/);
 assert.match(server,/app\.post\('\/operator\/document', requireAuth, LIMITS\.document, requireFreshAuth, requireOperatorPreparationMarket/);
 assert.match(server,/if \(!r2Owns\(objectKey, req\.uid, 'operator-document'\)\)/,
   'document review remains confined to the authenticated owner');
 assert.match(server,/app\.post\('\/connect\/onboard', requireAuth, LIMITS\.connect, requireActiveOperatingMarket/);
 assert.match(server,/app\.post\('\/operator\/qualification\/submit', requireAuth, LIMITS\.qualification, requireActiveOperatingMarket/);
 assert.match(server,/app\.post\('\/operator\/screening\/existing', requireAuth, LIMITS\.screening, requireScreeningRequestMarket/);
 const screen=src('app/operator/qualify.tsx');
 const context=src('src/state/OperatorContext.tsx');
 assert.doesNotMatch(context,/\{ key: 'basics', title:/,'no false one-tap legal-identity badge');
 assert.match(context,/if \(k !== 'basics'\)/,'manual background pass remains prohibited');
 assert.match(screen,/d\.key === 'insurance'\) router\.navigate/);
 assert.match(screen,/label=\{t\('traveler\.tryAgain'\)\}/,'explicit operating-market retry');
 assert.match(screen,/if \(!area\?\.market\)/,'selected market precedes jurisdictional preparation');
 assert.match(screen,/disabled=\{submitting \|\| !areaAuthorized\}/,'final submission remains closed in waitlisted counties');
 const connect=src('src/backend/connect.ts');
 assert.match(connect,/error\?: string/);
 assert.match(connect,/getOperatingMarket\(\): Promise<MarketState>/);
 assert.match(connect,/return \{ \.\.\.EMPTY_MARKETS, error:/,
   'network failures must not appear as successful empty market lists');
 const background=src('app/operator/background.tsx');
 assert.match(background,/Linking\.openURL\(url\)\.catch/,'provider link must have failure recovery');
 assert.match(background,/status\?\.ok === false/,'screening status loss must be visible');
 assert.match(src('app/operator/insurance.tsx'),/configResolved && !config &&/);
}
console.log('PASS twice: waitlisted/onboarding paperwork, invalid jurisdictions, document ownership, independent paid eligibility, screening safety, error recovery and corrected four-step UI. No real external commissioning.');
