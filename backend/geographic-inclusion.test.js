'use strict';
const assert = require('node:assert/strict');
const { markets } = require('./markets');
const { regionById } = require('./regions');
const { readinessFor } = require('./market-readiness');

const south = regionById('fl-southeast');
assert.ok(south);
for (const id of ['fl-miami-dade', 'fl-broward', 'fl-palm-beach']) {
  const market = markets().find(m => m.id === id);
  assert.ok(market, id);
  assert.equal(market.status, 'active', id + ' is geographically included');
  assert.equal(market.regionId, south.id);
  assert.ok(south.activeMarketFips.includes(market.fips));
  const commercial = readinessFor({ market, region: south, providerMissing: ['screening_provider'] });
  assert.notEqual(commercial.status, 'active',
    'geographic inclusion must not assert a commercially active market');
}
console.log('PASS: all three counties geographically included by default; paid admission separate');
