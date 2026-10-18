'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { officialTollPriceForRoute, TRUSTED_MATCH_SOURCE } = require('./official-toll-pricing');

const now = Date.parse('2026-10-20T12:00:00Z');
const base = {
  provider: 'osrm', tollRelevant: true,
  officialMatchSource: TRUSTED_MATCH_SOURCE,
  officialMatchComplete: true,
  officialFacilityCrossings: ['FTA:gate-a', 'GMX:gate-b'],
  vehicleClass: 'two-axle', tollPaymentMethod: 'sunpass',
};
const book = {
  marketId: 'fl-southeast', approval: 'approved',
  currency: 'USD', rateType: 'fixed-two-axle-sunpass',
  sourceUrl: 'https://floridasturnpike.com/tolls/toll-rates/',
  reviewedAt: '2026-10-18T12:00:00Z',
  validFrom: '2026-10-01T00:00:00Z',
  validUntil: '2026-10-31T23:59:59Z',
  rates: {
    'FTA:gate-a': { name: 'Unit Test Toll A', cents: 125 },
    'GMX:gate-b': { name: 'Unit Test Toll B', cents: 75 },
  },
};
const opts = { books: { 'fl-southeast': book }, now };
const priced = officialTollPriceForRoute(base, 'fl-southeast', opts);
assert.equal(priced.status, 'tolled');
assert.equal(priced.tollCents, 200);
assert.equal(priced.provider, 'verified-official-toll-rates');
assert.equal(priced.facilities.length, 2);

// No official rate books are deployed. Raw OSM prices never authorize a charge.
assert.equal(officialTollPriceForRoute({ ...base, osmCharge: '1 USD' }, 'fl-southeast', { now }), null);
assert.equal(officialTollPriceForRoute({ ...base, officialMatchComplete: false }, 'fl-southeast', opts), null);
assert.equal(officialTollPriceForRoute({ ...base, officialMatchSource: 'osm-tags-only' }, 'fl-southeast', opts), null);
assert.equal(officialTollPriceForRoute({ ...base, provider: 'here' }, 'fl-southeast', opts), null);
assert.equal(officialTollPriceForRoute({ ...base, tollRelevant: false }, 'fl-southeast', opts), null);
assert.equal(officialTollPriceForRoute({ ...base, tollPaymentMethod: 'cash' }, 'fl-southeast', opts), null);
assert.equal(officialTollPriceForRoute({ ...base, vehicleClass: 'commercial-truck' }, 'fl-southeast', opts), null);
assert.equal(officialTollPriceForRoute({ ...base, officialFacilityCrossings: ['FTA:gate-a','missing'] }, 'fl-southeast', opts), null);
assert.equal(officialTollPriceForRoute({ ...base, officialFacilityCrossings: [] }, 'fl-southeast', opts), null);
assert.equal(officialTollPriceForRoute({ ...base, officialFacilityCrossings: ['FTA:gate-a;bad'] }, 'fl-southeast', opts), null);
assert.equal(officialTollPriceForRoute(base, 'fl-southeast', { ...opts, now: Date.parse('2026-12-01T00:00:00Z') }), null);
assert.equal(officialTollPriceForRoute(base, 'fl-southeast', { ...opts, books: { 'fl-southeast': { ...book, reviewedAt: '2026-06-01T00:00:00Z' } } }), null);
assert.equal(officialTollPriceForRoute(base, 'fl-southeast', { ...opts, books: { 'fl-southeast': { ...book, approval: 'draft' } } }), null);
assert.equal(officialTollPriceForRoute(base, 'fl-southeast', { ...opts, books: { 'fl-southeast': { ...book, sourceUrl: 'http://example.com' } } }), null);
assert.equal(officialTollPriceForRoute(base, 'fl-southeast', { ...opts, books: { 'fl-southeast': { ...book, rates: { ...book.rates, 'GMX:gate-b': { name: 'variable express', cents: 300, variable: true } } } } }), null);
assert.equal(officialTollPriceForRoute(base, 'other-market', opts), null);

// The live resolver must consult verified local rates before paid HERE.
const tolls = fs.readFileSync(path.join(__dirname, 'tolls.js'), 'utf8');
assert.match(tolls, /officialTollPriceForRoute\(route, region\?\.id\)/);
assert.ok(tolls.includes('route.tollSignalComplete === true'), 'unverified OSM road classes can never become a free toll');
assert.ok(tolls.indexOf("recordTollDecision('verified_official'") > 0 &&
  tolls.indexOf("recordTollDecision('verified_official'") < tolls.indexOf('const outcome = await resolveTolls(from, to, opts);'),
  'verified official price must return before any HERE request');
const app = fs.readFileSync(path.join(__dirname, '../app/reserve.tsx'), 'utf8');
assert.equal((app.match(/\}, 350\);/g) || []).length, 2, 'both independent typeahead inputs debounce paid autocomplete');
console.log('PASS: official-only toll rate gate, expired/mismatched OSM refusal, and bounded Geoapify typing');
