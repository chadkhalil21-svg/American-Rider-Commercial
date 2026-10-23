'use strict';
// Separate the Emergency case's identity contract from refund/support money.
// No account, provider, phone, or real emergency call is used in this test.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const support = fs.readFileSync(path.join(root, 'src/backend/support.ts'), 'utf8');
const screen = fs.readFileSync(path.join(root, 'app/emergency.tsx'), 'utf8');
const facts = fs.readFileSync(path.join(root, 'src/emergencyTravelFacts.ts'), 'utf8');
assert.match(support, /export type EmergencyTrip = Pick<SupportTrip,[\s\S]+?Partial<Pick<SupportTrip, 'totalCents' \| 'date'>>/,
  'emergency identity must allow known Travel without invented fare/date');
const emgStart = support.indexOf('export async function alertEmergency');
assert(emgStart >= 0);
assert.match(support.slice(emgStart, emgStart + 1400), /trip: EmergencyTrip \| null/,
  'emergency case must use the independent role-aware type');
assert.match(screen, /resolveEmergencyTravelFacts\(/);
assert.match(screen, /dep: facts\.dep/);
assert.match(screen, /arr: facts\.arr/);
assert.match(screen, /facts\.totalCents != null \? \{ totalCents: facts\.totalCents \} : \{\}/,
  'unknown amount is omitted instead of copied from old trip');
assert.match(facts, /if \(input\.role === 'operator' && current\?\.rideId && current\.tripNo\)/,
  'Operator Travel identity must be current and real');
assert.match(screen, /Crypto\.randomUUID\(\)/,
  'urgent self-initiated report keeps its stable per-screen retry key');
console.log('PASS: Emergency role-specific case identity, no invented fare, and original urgent retry semantics');
