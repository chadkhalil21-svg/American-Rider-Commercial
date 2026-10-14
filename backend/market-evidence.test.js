'use strict';
const assert=require('node:assert/strict');
const E=require('./market-evidence');
assert.deepEqual(E.planProblems('fl-southeast'),[]);
for(const id of ['fl-miami-dade','fl-broward','fl-palm-beach']){
  assert.deepEqual(E.planProblems(id),[]);
  assert.equal(E.planForRegion(id).regionId,'fl-southeast');
}
assert.equal(E.source('chicago-tnp-open-data').primaryEligible,false);
assert.equal(E.source('nyc-tlc-hvfhv').primaryEligible,false);
assert.equal(E.source('california-cpuc-tnc-public').primaryEligible,false);
assert.equal(E.source('american-rider-field-panel').primaryEligible,false);
assert.deepEqual(E.planProblems('tx-austin'),['tx-austin: no market evidence plan']);
const panel=E.source('controlled-public-price-panel');
assert.match(panel.caveat,/Human-controlled audit evidence/);
assert.match(panel.caveat,/No automated access/);
console.log('PASS independent market-research evidence registry');
