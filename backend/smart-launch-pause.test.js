'use strict';
// Founder launch pause: synthetic source-integrity test with no users, fees, OTP
// requests, production Firestore reads or charge attempts.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const file = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const server = file('backend/server.js');
const reserve = file('app/reserve.tsx');
const smartClient = file('src/backend/smart.ts');
const screen = file('app/smart.tsx');
const context = file('src/state/RideContext.tsx');
const config = file('src/config.ts');
assert.match(config, /export const SMART_TRAVEL_NEW_BOOKINGS_ENABLED = false;/);
assert.match(server, /const SMART_TRAVEL_NEW_BOOKINGS_ENABLED = false;/);
const quoted = server.split("app.post('/smart-quote'")[1]?.split("app.post('/smart-revalidate'")[0];
assert.ok(quoted, 'Smart quote route missing');
assert.match(quoted, /if \(!SMART_TRAVEL_NEW_BOOKINGS_ENABLED\)/);
assert.ok(quoted.indexOf('if (!SMART_TRAVEL_NEW_BOOKINGS_ENABLED)') < quoted.indexOf('await smartQuote('),
 'Pause must precede planner work, prices, writes and all caller types');
assert.match(quoted, /status\(404\)/, 'legacy installed clients must fail closed');
assert.match(quoted, /status\(503\).*status: 'unavailable', code: 'smart_travel_paused'/,
 'current installed clients must see explicit unavailability');
assert.match(smartClient, /if \(!SMART_TRAVEL_NEW_BOOKINGS_ENABLED\) return \{ status: 'unavailable', plan: null \};/,
 'new client must not send a Smart quote request');
assert.match(reserve, /if \(!SMART_TRAVEL_NEW_BOOKINGS_ENABLED\) \{\s*setSmartStatus\('unavailable'\);/,
 'Smart Travel must show as currently unavailable');
assert.match(reserve, /disabled=\{!smart \|\| !SMART_TRAVEL_NEW_BOOKINGS_ENABLED\}/,
 'unavailable Smart card must not be tappable');
assert.match(reserve, /accessibilityState=\{\{ disabled: !smart \|\| !SMART_TRAVEL_NEW_BOOKINGS_ENABLED \}\}/,
 'accessibility must report disabled');
assert.match(screen, /if \(\(!SMART_TRAVEL_NEW_BOOKINGS_ENABLED && !journey\) \|\| !plan\)/,
 'direct navigation must not start a new Smart journey from a stale plan');
assert.match(context, /if \(which === 1\) \{\s*if \(!SMART_TRAVEL_NEW_BOOKINGS_ENABLED\) return false;/,
 'previously obtained plans must not start a fresh journey');
assert.match(context, /if \(!journey \|\| !smartSecondCarKey\(journey.leg1No\)\) return false;/,
 'already-committed second car must retain stable authorization');
const revalidate = server.split("app.post('/smart-revalidate'")[1]?.split("app.post('/destinations-near'")[0];
assert.ok(revalidate && revalidate.includes('revalidateTransit('),
 'protect already-started Smart journey recovery and validation');
const pricing = file('backend/market-pricing.js');
assert.match(pricing, /perMileCents: 95/);
assert.match(pricing, /perMinuteCents: 32/);
console.log('PASS: no new Smart Travel, gray/accessible card, old phones fail closed, ongoing journey recovery remains, prices unchanged.');
