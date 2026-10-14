'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const here = name => fs.readFileSync(path.join(__dirname, name), 'utf8');
const {markets, marketFor, servesPoint, tripOutsideMarkets} = require('./markets');
const server = here('server.js');
const registry = here('markets.js');
const mcp = here('chatgpt-mcp.js');
const place = (lat, lng) => ({lat, lng});

for (let pass = 1; pass <= 2; pass++) {
  for (const [id, point] of [
    ['fl-miami-dade', place(25.7959, -80.2871)],
    ['fl-broward', place(26.1224, -80.1373)],
    ['fl-palm-beach', place(26.7153, -80.0534)],
  ]) {
    assert.equal(marketFor(point)?.id, id);
    assert.equal(servesPoint(point), true, id + ' configured for Travel');
    assert.equal(markets().find(m => m.id === id)?.status, 'active');
  }
  const pickup = place(25.7959,-80.2871);
  assert.equal(tripOutsideMarkets(pickup,place(26.7153,-80.0534)),null);
  assert.equal(servesPoint(place(24.5551,-81.78)),false, 'unknown coverage is not silently enabled');
  assert.doesNotMatch(registry,/require\(['"]\.\/market-admission['"]\)|regionReady\(/,
    'geographic availability must not depend on regulatory checklists');
  assert.match(server,/function requireServedPickup\(/);
  assert.match(server,/function requireServedTravel\(/);
  assert.doesNotMatch(server,/requireAdmittedPickup|requireAdmittedTravel|admittedMarket\(|requireActiveOperatingMarket|setAdmittedFleetOnline\(/);
  assert.doesNotMatch(server,/require\(['"]\.\/market-readiness['"]\)/,
    'commercial routes cannot read obsolete market-admission engine');
  for (const route of ['/connect/onboard','/storage/upload-url',
                       '/operator/document','/operator/qualification/submit']) {
    const s = server.indexOf("app.post('" + route + "'");
    assert.ok(s >= 0, route + ' endpoint exists');
    const signature = server.slice(s,server.indexOf('async (req, res) =>',s)+20);
    assert.doesNotMatch(signature,/market|admission/i,route + ' has no regional onboarding gate');
  }
  assert.doesNotMatch(mcp,/deps\.(inspectMarket|activateRegion|pauseMarket|manifestFor)\(/);
  assert.match(here('market-fleet.js'),/latest\.payoutsEnabled\s*===\s*false/,
    'duty still protects concurrent Stripe payout downgrades');
}
console.log('PASS twice: regional geography independent of county approval and Operator onboarding');
