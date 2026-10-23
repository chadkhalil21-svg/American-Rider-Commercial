'use strict';
// Native roles share one Emergency view, but never a simulated/stale trip.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const helper = fs.readFileSync(path.join(root, 'src/emergencyTravelFacts.ts'), 'utf8');
const compiled = ts.transpileModule(helper, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics.length, 0);
const ctx = { exports: {}, Math };
vm.runInNewContext(compiled.outputText, ctx, { timeout: 1000 });
const pick = ctx.exports.resolveEmergencyTravelFacts;
const seed = { no: 'DEMO-000', dep: 'old address', arr: 'old place',
  total: 19.44, date: '2026-01-01' };
const other = { name: 'Previous Operator', car: 'Old car', plate: 'OLD123' };
const standard = { role: 'traveler', travelerActive: false, travelerTrip: seed,
  matchedOperator: other };
let facts = pick(standard);
assert.equal(facts.tripNo, '', 'historical/demo Travel must never appear in Emergency');
assert.equal(facts.hasOperator, false);
facts = pick({ ...standard, role: 'operator',
  activeOperatorTravel: { rideId: 'actual-ride-1', tripNo: 'AR-NEW',
    pickup: 'Confirmed pickup', dest: 'Confirmed destination' },
  operatorName: 'On Duty Operator',
  operatorVehicle: { car: 'Confirmed car', plate: 'VALID123' } });
assert.equal(facts.tripNo, 'AR-NEW');
assert.equal(facts.operator, 'On Duty Operator');
assert.equal(facts.plate, 'VALID123');
assert.equal(facts.dep, 'Confirmed pickup');
assert.equal(facts.arr, 'Confirmed destination');
assert.equal(facts.totalCents, undefined, 'Operator must not invent a fare in Emergency');
facts = pick({ ...standard, role: 'operator',
  activeOperatorTravel: null, operatorName: 'On Duty Operator',
  operatorVehicle: { car: 'Car', plate: 'PLATE' } });
assert.equal(facts.tripNo, '', 'Operator without active assigned travel has no travel number');
assert.equal(facts.vehicle, '', 'no stale vehicle tied to an unidentified operation');
facts = pick({ ...standard, role: 'traveler', travelerActive: true });
assert.equal(facts.tripNo, seed.no);
assert.equal(facts.totalCents, 1944);
facts = pick({ ...standard, role: 'operator', activeOperatorTravel: {
  rideId: 'assigned-but-number-unknown', pickup: 'A', dest: 'B' },
  operatorName: 'Operator' });
assert.equal(facts.hasOperator, false, 'do not invent an unfinished Travel Number');
const screen = fs.readFileSync(path.join(root, 'app/emergency.tsx'), 'utf8');
assert(screen.includes('useOperator()') && screen.includes('resolveEmergencyTravelFacts('));
assert(screen.includes('dep: facts.dep') && screen.includes('arr: facts.arr'));
assert(screen.includes('hasVehicleFacts &&') && screen.includes('hasOperatorName &&'),
  'never show empty or unverified identity fields');
assert(!screen.includes('ride.rideActive && hasOperator ? ride.lastTrip.no'),
  'old Traveler-only display must stay removed');
console.log('PASS: real Operator / Traveler Emergency role identities, stale demo exclusion, vehicle facts and current route');
