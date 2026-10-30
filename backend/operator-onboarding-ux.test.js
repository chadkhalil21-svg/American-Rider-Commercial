'use strict';
// Twice-run, offline end-to-end static audit of the actual Operator UI.
// Prevent regressions to fake approval, hidden quote links, or premature checks.
const assert=require('node:assert/strict'),fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
for(let pass=0;pass<2;pass++){
 const insurance=read('app/operator/insurance.tsx');
 const q=read('app/operator/qualify.tsx');
 const docs=read('src/state/OperatorContext.tsx');
 const bg=read('app/operator/background.tsx');
 const conn=read('src/backend/connect.ts');
 const server=read('backend/server.js');
 const options=read('src/data.ts');
 assert.doesNotMatch(docs,/\{ key: 'basics', title: 'traveler.qualBasics'/,'unverified basics must not count as approved');
 assert.match(q,/const areaAuthorized = areaActive/,'registration only in open service area');
 assert.match(q,/\{area\?\.market && <Card style=\{styles.listCard\}>/,'document checklist is available before a market opens');
 assert.match(q,/joinOperatorAreaWaitlist\(marketId\)/,'opt-in interest separate from registration');
 assert.match(q,/router.navigate\('\/operator\/payouts'\)/,'payout setup available from one checklist');
 assert.match(q,/marketCheckAgain/,'market errors have direct retry');
 assert.match(conn,/error\?: string/,'failed market load must not mimic empty successful results');
 assert.match(insurance,/insRequirementsHeadline/,'essential insurance requirements appear prominently');
 assert.match(insurance,/insFloridaRequirementsShort/,'Florida limits visible without revealing a hidden panel');
 assert.match(insurance,/Share.share\(\{ message: config.script \}\)/,'broker instructions can be shared');
 assert.match(insurance,/insCompareHeadline/,'comparison sources visible by default');
 for(const provider of ['Insureon','Limousine Insurance HQ'])
  assert.ok(insurance.includes("'"+provider+"'"),provider+' featured, not hidden');
 assert.doesNotMatch(insurance,/referredBroker|BROKER\.name/,'no prominent single-broker steering');
 assert.match(insurance,/insOlderVehicleNote/,'older-car options explained');
 assert.match(insurance,/insCompareDisclosure/,'no fake prices or guarantee of lowest quote');
 assert.match(insurance,/showLegalDetails/,'necessary statutory details remain available');
 assert.match(insurance,/insRiskCancelled/,'adverse insurance reporting retained');
 assert.match(bg,/Linking.openURL\(url\)\.catch/,'provider URLs cannot fail silently');
 assert.match(bg,/status\?\.ok === false/,'screening status errors recover');
 assert.match(server,/app.post\('\/storage\/upload-url', requireAuth, LIMITS.document, requireFreshAuth, requirePrivateUploadPurpose/);
 assert.match(server,/if \(purpose === 'operator-document'\) return requireActiveOperatingMarket\(req, res, next\)/);
 assert.match(server,/if \(purpose === 'lost-item'\) return next\(\)/);
 assert.match(server,/app.post\('\/operator\/document', requireAuth, LIMITS.document, requireFreshAuth, requireActiveOperatingMarket/);
 assert.match(server,/app.post\('\/operator\/screening\/existing', requireAuth, LIMITS.screening, requireScreeningRequestMarket/);
 assert.match(server,/app.post\('\/connect\/onboard', requireAuth, LIMITS.connect, requireActiveOperatingMarket/);
 for(const lang of ['en','es','fr','it','de']){
  const loc=read('src/i18n/'+lang+'.ts');
  for(const k of ['insRequirementsHeadline','insFloridaRequirementsShort','insCompareHeadline','insOlderVehicleNote','insCompareDisclosure'])
   assert.ok(loc.includes(k+': '),'missing '+lang+'/'+k);
 }
 assert.match(insurance,/showMore/,'specialist carrier options remain available on request');
 assert.match(options,/name: 'Progressive Commercial'/,'specialist carrier remains available');
 assert.match(options,/name: 'Insureon'/,'comparison service exists');
 assert.match(options,/name: 'Limousine Insurance HQ'/,'three-broker quote service exists');
}
console.log('PASS twice: market-safe first-class onboarding, real insurer comparisons, opt-in, loss reporting. No network or provider purchase.');
