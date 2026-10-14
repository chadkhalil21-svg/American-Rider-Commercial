'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { dutyCoverageExpiry } = require('./operator-duty-coverage');
const AT = Date.parse('2026-10-11T03:00:00Z');
const proof = (expiry, decision) => ({ documents: { insurance: {
  verdict: 'accept', expiry, ...(decision ? { decision } : {}),
} } });
assert.deepEqual(dutyCoverageExpiry(proof('2027-05-01'), AT), {ok:true,expiry:'2027-05-01'});
assert.deepEqual(dutyCoverageExpiry(proof('2025-01-01', {verdict:'accept',expiry:'2028-03-01'}), AT),
  {ok:true,expiry:'2028-03-01'}, 'accepted verified expiry overrides an older machine-read date');
assert.deepEqual(dutyCoverageExpiry(proof('2027-05-01', {verdict:'refuse'}), AT), {ok:false,code:'no_coverage_on_file'});
assert.deepEqual(dutyCoverageExpiry(null, AT), {ok:false,code:'no_coverage_on_file'});
assert.deepEqual(dutyCoverageExpiry(proof('2026-10-10'), AT),
  {ok:false,code:'coverage_expired',expiry:'2026-10-10'});
for (const invalid of ['', '2026-02-30', '2026-13-01', '2026-01-00', '2030-1-1', 'garbage']) {
  assert.deepEqual(dutyCoverageExpiry(proof(invalid), AT), {ok:false,code:'no_coverage_on_file'});
}
assert.deepEqual(dutyCoverageExpiry(proof('2026-10-11'), Date.parse('2026-10-11T23:59:59Z')),
  {ok:true,expiry:'2026-10-11'});
assert.deepEqual(dutyCoverageExpiry(proof('2026-10-11'), Date.parse('2026-10-12T00:00:00Z')),
  {ok:false,code:'coverage_expired',expiry:'2026-10-11'});
const server = fs.readFileSync(require.resolve('./server'), 'utf8');
const online = server.split("app.post('/operator/online'")[1]?.split("app.post('/operator/offline'")[0] || '';
assert.match(online, /const coverage = dutyCoverageExpiry\(user\)/,
  'both foreground and background requests must derive policy expiry on the server');
assert.match(online, /insuranceExpiry: expiry/, 'dispatch receives the confirmed date');
assert.doesNotMatch(online, /const expiry = String\(b\.insuranceExpiry/,
  'caller-supplied dates cannot override or extend verified policy expiry');
assert.match(online, /assessOperator\(/, 'existing qualification and independent insurance gates remain');
assert.match(online, /setFleetOnlineIfOpen\(/, 'individual duty stays transactional');
assert.doesNotMatch(online, /setAdmittedFleetOnline\(/,
  'region-wide admission record does not control individual duty');
const presence = fs.readFileSync(path.resolve(__dirname, '../src/backend/presence.ts'), 'utf8');
assert.match(presence, /background: true/, 'the native background task uses the same endpoint');
console.log('PASS background duty uses accepted server policy expiry; safety gates remain independent of regional admission');
