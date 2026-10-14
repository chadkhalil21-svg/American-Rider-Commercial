'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const U=require('./jurisdictions/us.json');
const {regionById}=require('./regions');
const {marketFor}=require('./markets');
assert.equal(U.jurisdictions.length,56);
assert.equal(new Set(U.jurisdictions.map(x=>x.code)).size,56);
for(const code of ['FL','TX','CA','NY','DC','PR'])
  assert.ok(U.jurisdictions.some(x=>x.code===code));
assert.equal(U.jurisdictions.find(x=>x.code==='TX').status,'uncommissioned');
assert.equal(regionById('fl-southeast').id,'fl-southeast');
assert.equal(marketFor({lat:25.775,lng:-80.191})?.status,'active');
assert.notEqual(marketFor({lat:28.5383,lng:-81.3792})?.status,'active');
const markets=fs.readFileSync(__dirname+'/markets.js','utf8');
assert.ok(markets.includes("filter(x=>/-counties\\.json$/.test(x))"));
assert.ok(!markets.includes("require('./markets/fl-counties.json')"));
console.log('PASS national geography does not depend on a county admission registry');
