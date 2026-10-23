'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const home=fs.readFileSync(path.join(root,'legal/index.html'),'utf8');
const support=fs.readFileSync(path.join(root,'legal/support/index.html'),'utf8');
const economics=fs.readFileSync(path.join(root,'backend/economics.js'),'utf8');
const ledger=fs.readFileSync(path.join(root,'PROJECT-LEDGER.md'),'utf8');
for(const [name,html] of [['home',home],['support',support]]){
  for(const email of ['support@americanrider.app','relations@americanrider.app']){
    assert.ok(html.includes('href="mailto:'+email+'"'),name+' missing verified public contact '+email);
  }
}
assert.ok(support.includes('insurance@americanrider.app'));
assert.ok(support.includes('private in-app upload process'));
assert.ok(home.includes('at least $2.50 per Travel'));
assert.ok(!home.includes('$1.50 or 5% of the travel fare'),'stale fee is prohibited');
assert.ok(!home.includes('Brickell to Dadeland journey'),'Smart Travel comparative claim not yet publicly bookable');
assert.ok(home.includes('One all-in Total'),'Traveler Total is clearly disclosed');
assert.ok(home.includes('99% of the Travel Fare'),'Operator share remains explicit');
assert.ok(!home.includes('$24.26')&&!home.includes('$2.74')&&!home.includes('$27.00'),
  'homepage must not publish illustrative route fares as live offers');
assert.ok(economics.includes('const MIN_PLATFORM_FEE_CENTS = 250'));
assert.ok(ledger.includes('Previously earned Stripe transfers and bank payouts are never hostage')||ledger.includes('previously earned Stripe transfers and bank payouts are never hostage'));
console.log('PASS: public contact/fee/store scope matches current founder decisions');
