'use strict';
// National screening commissioning boundaries. Run: node backend/screening-jurisdictions.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const US = require('./jurisdictions/us.json');
const { REGIONS } = require('./regions');
const { markets } = require('./markets');
const { policyForState, screeningPreparationFor, reviewPolicyFor } = require('./screening-jurisdictions');

const FL = policyForState('FL');
assert.equal(US.jurisdictions.length, 56, 'national registry lists all states and applicable jurisdictions');
assert.ok(FL, 'Florida screening policy is explicitly implemented');
assert.equal(FL.stateCode, 'FL');
assert.equal(FL.screeningYears, 3);
assert.equal(FL.reviewEngine, 'florida_627748_v1');
assert.deepEqual([...FL.requiredElements], ['nationwide_criminal','sex_offender','driving_history']);

const florida = REGIONS.find(r => r.id === 'fl-southeast');
const miami = markets().find(m => m.id === 'fl-miami-dade');
const broward = markets().find(m => m.id === 'fl-broward');
assert.equal(screeningPreparationFor(miami, florida).ok, true, 'configured Florida allows preparation');
assert.equal(screeningPreparationFor(broward, florida).ok, true, 'same state policy works for multiple counties');
assert.equal(screeningPreparationFor({ ...miami, status: 'waitlist' }, florida).ok, true,
  'preparation does not grant commercial activation');
assert.equal(screeningPreparationFor(null, florida).ok, false, 'no county is no permission');
assert.equal(screeningPreparationFor(miami, null).ok, false, 'no region is no permission');
assert.equal(screeningPreparationFor({ ...miami, regionId: 'other-region' }, florida).ok, false,
  'a forged market-to-region link is blocked');
assert.equal(screeningPreparationFor({ ...miami, state: 'GA' }, florida).ok, false,
  'a forged county state is blocked');
assert.equal(screeningPreparationFor(miami, {
  ...florida, jurisdiction: { ...florida.jurisdiction, screeningYears: 5 },
}).ok, false, 'a stale cadence mismatch blocks preparation');

const georgia = { ...florida, id: 'ga-example', state: 'GA',
  jurisdiction: { ...florida.jurisdiction, stateCode: 'GA', state: 'Georgia' } };
const mockGaCounty = { ...miami, id: 'ga-example-county', state: 'GA', regionId: 'ga-example' };
assert.equal(policyForState('GA'), null, 'a U.S. jurisdiction without a screened policy is not configured');
assert.equal(screeningPreparationFor(mockGaCounty, georgia).ok, false,
  'a plausible new region cannot copy Florida screening');
assert.equal(policyForState(georgia.jurisdiction.stateCode), null,
  'uncommissioned screening jurisdiction is not permitted to inherit Florida approval');

for (const code of ['AL', 'CA', 'DC', 'NY', 'TX', 'PR', 'VI', 'XX', 'fl', '', null]) {
  assert.equal(policyForState(code), null, 'unknown or uncommissioned state fails closed: ' + code);
}
assert.equal(reviewPolicyFor({ jurisdictionCode: 'GA' }), null,
  'the Florida report adjudicator cannot decide a Georgia case');
assert.equal(reviewPolicyFor({ jurisdictionCode: 'FL', policyId: 'wrong-version' }), null,
  'case policy version mismatch fails closed');
assert.equal(reviewPolicyFor({ jurisdictionCode: 'FL', policyId: FL.id }).id, FL.id);
assert.equal(reviewPolicyFor({ jurisdictionCode: null })?.id, FL.id,
  'a case predating the registry stays on the original Florida-only standard');
assert.equal(reviewPolicyFor(null), null);

const { assessOperator } = require('./qualification');
const mismatched = assessOperator({
  user: { operatingMarket: { id: 'fl-miami-dade' },
    screening: { decision: 'pass', jurisdictionCode: 'GA', recheckDue: Date.now() + 1e9 } },
  fleet: null, context: 'qualify', liveMoney: true, account: { disabled: false },
});
assert.ok(mismatched.blockers.some(b => b.code === 'screening_jurisdiction_mismatch'),
  'Florida qualification cannot inherit a report cleared for a different state');

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const external = fs.readFileSync(path.join(__dirname, 'external-screening.js'), 'utf8');
const adverse = fs.readFileSync(path.join(__dirname, 'external-screening-adverse.js'), 'utf8');
assert.match(server, /screeningPreparationFor\(market, region\)/,
  'preparation route uses the national policy');
assert.match(server, /jurisdictionCode: policy\.stateCode, policyId: policy\.id/,
  'case binds the evaluated state policy');
assert.match(external, /reviewPolicyFor\(prior\)/,
  'positive screening decisions must use an implemented state adjudicator');
assert.match(adverse, /reviewPolicyFor\(screen\)/,
  'negative decisions must also use an implemented state adjudicator');

console.log('PASS national screening registry: Florida configured, all other jurisdictions fail closed');
