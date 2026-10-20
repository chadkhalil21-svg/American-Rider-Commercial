'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const begin = src.indexOf("app.post('/operator/online'");
const end = src.indexOf("app.post('/operator/offline'", begin);
assert(begin >= 0 && end > begin, 'Operator duty route must exist');
const route = src.slice(begin, end);
function occurrences(pattern) { return (route.match(pattern) || []).length; }
function check() {
  // Read once, fail closed: no cached cross-request eligibility and no loosening gates.
  assert.equal(occurrences(/collection\('users'\)\.doc\(String\(req\.uid\)\)\.get\(\)/g), 1);
  assert.equal(occurrences(/collection\('operators'\)\.doc\(String\(req\.uid\)\)\.get\(\)/g), 1);
  assert(!route.includes('await operatorRecord(req.uid)'), 'No third user read in presence renewal');
  for (const key of ['accountDisabled(req.uid)', 'cachedPayoutStatus(', 'connectAccountStatus(',
    'assessOperator({', 'screeningCurrent(', 'dutyCoverageExpiry(', 'operatingMarketGate(',
    'setGeographicFleetOnline(', 'setFleetOnlineIfOpen(']) {
    assert(route.includes(key), 'Required individual Operator safety/financial gate missing: ' + key);
  }
  assert(route.indexOf('assessOperator({') < route.indexOf('setGeographicFleetOnline('),
    'Eligibility must precede any production availability write');
  assert(route.includes("if (!status.payoutsEnabled)"), 'Missing Stripe payout deny gate');
  assert(route.includes("if (!assessment.eligible)"), 'Missing qualification deny gate');
  assert(route.includes('if (!coverage.ok)'), 'Missing insurance deny gate');
  assert(route.includes('if (!servesPoint({ lat, lng }))'), 'Missing active-area deny gate');
}
check();check();
console.log('PASS twice: one fresh user + fleet read per Operator renewal; safety, geography and Stripe gates intact.');
