'use strict';
// Release contract: founder holds Smart Travel as a disabled option until the
// live planner, published timetable and physical trip handoff are commissioned.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const client = read('src/backend/smart.ts');
const screen = read('app/reserve.tsx');
const detail = read('app/smart.tsx');
const ride = read('src/state/RideContext.tsx');
const server = read('backend/server.js');

for(let pass=0;pass<2;pass++){
  assert.match(client,/export const SMART_TRAVEL_AVAILABLE = false;/);
  assert.match(client,/if \(!SMART_TRAVEL_AVAILABLE\) return \{ status: 'unavailable', plan: null \};/);
  // A disabled route must not contact a transit/planner endpoint or spend quota.
  assert.ok(client.indexOf('if (!SMART_TRAVEL_AVAILABLE) return') < client.indexOf('await fetch(`${PAYMENT_SERVER_URL}/smart-quote`'));
  assert.match(screen,/if \(!SMART_TRAVEL_AVAILABLE\) \{\s*setSmartStatus\('unavailable'\);/);
  assert.match(screen,/const smart = SMART_TRAVEL_AVAILABLE \? ride\.smartPlan : null;/);
  assert.match(screen, /ride\.smartStatus !== 'idle' \|\| !SMART_TRAVEL_AVAILABLE/);
  assert.match(screen, /disabled=\{!smart\} accessibilityState=\{\{ disabled: !smart \}\}/);
  assert.match(screen, /smartCardOff/);
  assert.match(detail,/const plan = journey\?\.plan \?\? \(SMART_TRAVEL_AVAILABLE \? ride\.smartPlan : null\);/);
  assert.match(ride,/if \(which === 1 && !SMART_TRAVEL_AVAILABLE\) return false;/);
  assert.match(ride,/if \(!journey \|\| !smartSecondCarKey\(journey\.leg1No\)\) return false;/);
  const newQuote=server.split("app.post('/smart-quote'")[1]?.split("app.post('/smart-revalidate'")[0];
  assert.ok(newQuote, 'new Smart quote route remains present');
  assert.match(newQuote,/res\.status\(503\)\.json\(\{ status: 'unavailable', code: 'smart_travel_not_commissioned' \}\)/);
  assert.match(newQuote,/res\.status\(404\)/); // old builds fail safely
  assert.doesNotMatch(newQuote,/await smartQuote\(/); // NO OTP/Firestore lookups from disabled path
  assert.match(server,/app.post\('\/smart-revalidate'/); // ongoing journeys retain recovery
}
console.log('PASS Smart Travel gray/unavailable on new bookings; legacy and direct paths fail closed; no added traffic; second-leg recovery preserved, two passes');
