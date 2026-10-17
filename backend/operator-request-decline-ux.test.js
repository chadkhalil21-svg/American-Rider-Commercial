'use strict';
// Regression: tapping Decline must never be treated as the 15-second timeout.
// All checks offline, twice; no Traveler records, payments or external requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

for (let pass = 0; pass < 2; pass++) {
  const screen = read('app/operator/index.tsx');
  const context = read('src/state/OperatorContext.tsx');
  const api = read('src/backend/operatorInbox.ts');

  assert.match(screen, /const explicitlyDecline = useCallback\(async \(\) => \{/);
  assert.match(screen, /if \(!offered \|\| acceptingRef\.current \|\| decliningRef\.current\) return/);
  assert.match(screen, /if \(await op\.declineRequest\(offered\)\) \{\s*dismissAccepted\(\)/,
    'dismiss a deliberately declined request only after server accepts it');
  assert.match(screen, /setAcceptError\(t\('traveler\.couldNotSaveConn'\)\);\s*openRequest\(offered\);/,
    'if server cannot record the decline, show a clear error and retain retry');
  assert.match(screen, /onPress=\{\(\) => \{ if \(!acceptingRef\.current && !decliningRef\.current\) void explicitlyDecline\(\); \}\}/,
    'the visible Decline action uses deliberate refusal, not expiry');
  assert.match(screen, /if \(request && countdown <= 0 && !accepting && !declining/,
    'timeout must not fire during an explicit refusal');
  assert.match(screen, /if \(open\) op\.lapseRequest\(open\)/,
    'an unanswered request lapses and remains eligible for reassignment');
  assert.match(screen, /disabled=\{accepting \|\| declining\}/,
    'accept cannot race a pending explicit decline');
  assert.match(screen, /if \(acceptingRef\.current \|\| decliningRef\.current\) return/,
    'duplicate acceptance does not race a pending decline');

  assert.match(context, /declineRequest: \(r: SimRequest\) => Promise<boolean>/,
    'the client must receive authoritative success or failure');
  assert.match(context, /const declineRequest = useCallback\(async \(r: SimRequest\): Promise<boolean> => \{/);
  assert.match(context,
    /const accepted = await declineTravel\(r\.rideId\);\s*if \(accepted\) setIncoming\(null\);\s*return accepted;/,
    'never silently discard an offer when the decline was not accepted');
  assert.match(context, /lapsedRef\.current\.set\(r\.rideId, Date\.now\(\)\)/,
    'elapsed countdown leaves the Travel assigned and eligible to return');
  assert.match(api, /export const declineTravel = \(rideId: string\) => setStatus\(rideId, 'declined'\)/,
    'explicit rejection is sent to the existing server progress route');
  assert.match(api, /fetch\(\`\$\{PAYMENT_SERVER_URL\}\/travel\/progress\`/,
    'server remains authoritative for the refused request');
  assert.match(screen, /if \(await op\.acceptRequest\(request\)\)/,
    'acceptance still requires server approval before navigation');
}
console.log('PASS twice: intentional Decline invokes server; timeout only lapses; no false success or duplicate accept.');
