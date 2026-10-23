'use strict';
// Synthetic position sequencing; never calls 911, GPS hardware or geocoding API.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/emergencyPosition.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics.length, 0);
const sandbox = { exports: {}, Math };
vm.runInNewContext(compiled.outputText, sandbox, { timeout: 1000 });
const { applyEmergencyPosition: sample, applyEmergencyStreet: address } = sandbox.exports;
const p1 = { lat: 25.7617, lng: -80.1918 };
const p2 = { lat: 25.7630, lng: -80.1918 }; // about 145m north
const near = { lat: 25.76173, lng: -80.1918 }; // under 5m north
const start = sample(null, p1, 1_000);
assert.equal(start.address, null);
assert.equal(start.at, 1_000);
let labeled = address(start, p1, '101 Original Street', 'Miami');
assert.equal(labeled.address, '101 Original Street');
assert.equal(labeled.at, 1_000, 'geocoding never advances the sample timestamp');
const drift = sample(labeled, near, 2_000);
assert.equal(drift.address, '101 Original Street',
  'small GPS noise may preserve a street established at the same physical point');
const moved = sample(drift, p2, 3_000);
assert.equal(moved.address, null, 'moving across a street clears obsolete location');
assert.equal(moved.region, null);
assert.equal(moved.coords.lat, p2.lat);
assert.equal(moved.at, 3_000);
const late = address(moved, p1, '101 Original Street', 'Miami');
assert.equal(late, moved, 'late old geocoder cannot replace latest GPS fix');
const olderGps = sample(moved, p1, 1_500);
assert.equal(olderGps, moved, 'out-of-order GPS callback cannot move Emergency backward');
const fresh = address(moved, p2, '202 Current Street', 'Miami');
assert.equal(fresh.address, '202 Current Street');
assert.equal(fresh.coords.lat, p2.lat);
assert.equal(fresh.at, 3_000);
const invalid = sample(fresh, { lat: 999, lng: 0 }, 4_000);
assert.equal(invalid, fresh, 'invalid GPS cannot become location evidence');
const screen = fs.readFileSync(path.join(__dirname, '../app/emergency.tsx'), 'utf8');
assert(screen.includes('applyEmergencyPosition(prev, { lat, lng }, at)') &&
  screen.includes('applyEmergencyStreet(prev, { lat, lng }, address, region)') &&
  screen.includes('l.timestamp'),
  'native Emergency reads actual GPS sample time and never writes a stale geocoded point');
assert(!screen.includes('address: prev?.address ?? null') &&
  !screen.includes('setFix({ coords: { lat, lng }, address, region, at: now })'),
  'older unsafe state updates must stay removed');
console.log('PASS Emergency moving GPS truth, 145m address invalidation, 15m jitter, out-of-order readings and slow geocoder rollback');
