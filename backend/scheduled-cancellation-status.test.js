'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const ts = require('typescript');

function loadPureHelper(path) {
  const output = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('module', 'exports', output)(module, module.exports);
  return module.exports;
}
const { showScheduledOnHome, scheduledHomeHeadingKey } = loadPureHelper('src/scheduledHomeState.ts');
const now = Date.UTC(2026, 9, 21, 13, 0, 0);
const tomorrow = now + 24 * 3600_000;

// The founder's exact case: future appointment, server-confirmed cancelled status.
// A cancelled reservation never remains "upcoming", even before its pickup deadline.
assert.equal(showScheduledOnHome({ status: 'cancelled', atMs: tomorrow }, now), false);
assert.equal(showScheduledOnHome({ status: 'cancelled', atMs: now }, now), false);
assert.equal(showScheduledOnHome({ status: 'reserved', atMs: tomorrow }, now), true);
assert.equal(showScheduledOnHome({ status: 'dispatched', atMs: tomorrow }, now), true);
assert.equal(showScheduledOnHome({ status: 'reserved', atMs: now - 1 }, now), false);
assert.equal(showScheduledOnHome({ status: 'unmatched', atMs: tomorrow }, now), true);
assert.equal(showScheduledOnHome({ status: 'needs_attention', atMs: tomorrow }, now), true);
assert.equal(showScheduledOnHome({ status: 'price_changed', atMs: tomorrow }, now), true);
assert.equal(showScheduledOnHome({ status: 'unmatched', atMs: now - 61 * 60_000 }, now), false);
assert.equal(showScheduledOnHome({ status: 'dispatched', atMs: now - 91 * 60_000 }, now), false);
assert.equal(showScheduledOnHome(null, now), false);
assert.equal(showScheduledOnHome({ status: 'reserved', atMs: Number.NaN }, now), false);

assert.equal(scheduledHomeHeadingKey('reserved'), 'traveler.scheduledTravel');
assert.equal(scheduledHomeHeadingKey('dispatched'), 'traveler.schedOperatorAssigned');
assert.equal(scheduledHomeHeadingKey('unmatched'), 'traveler.noOperatorAvailable');
assert.equal(scheduledHomeHeadingKey('payment_failed'), 'traveler.cardDeclined');
assert.equal(scheduledHomeHeadingKey('price_changed'), 'traveler.schedNeedsReview');
assert.equal(scheduledHomeHeadingKey('needs_attention'), 'traveler.chargedNotCreated');

// Guard the actual end-to-end source wiring, not only the detached helper.
const scheduled = fs.readFileSync('src/backend/scheduled.ts', 'utf8');
const context = fs.readFileSync('src/state/RideContext.tsx', 'utf8');
const upcoming = fs.readFileSync('app/upcoming.tsx', 'utf8');
const home = fs.readFileSync('app/index.tsx', 'utf8');
const ride = fs.readFileSync('app/ride.tsx', 'utf8');
const server = fs.readFileSync('backend/server.js', 'utf8');
assert.match(scheduled, /page\.rides\.find\(\(r\) => showScheduledOnHome\(r, now\)\)/);
assert.match(context, /if \(!r \|\| r\.status === 'cancelled'\)/);
assert.match(context, /dismissCancelledScheduled\(schedId\)/);
assert.match(upcoming, /if \(confirmed\) \{[\s\S]{0,260}ride\.dismissCancelledScheduled\(id\)/);
assert.match(home, /ride\.schedState\?\.status !== 'cancelled'/);
assert.match(home, /scheduledHomeHeadingKey\(ride\.schedState\?\.status\)/);
assert.match(ride, /ride\.dispatchState === 'none' \? t\('traveler\.noOperatorAvailable'\)/);
assert.match(ride, /const stepIdx = st === 0 \? -1/);
assert.match(ride, /ride\.matchedOp && st >= 1 && !complete/);
assert.match(server, /tx\.update\(ref, \{ status: 'cancelled', closedReason:/);
assert.match(server, /if \(status !== 'reserved'\) return \{ status: 409/);
console.log('PASS: server-confirmed cancellation clears Home, history preserved, dispatch status is truthful');
