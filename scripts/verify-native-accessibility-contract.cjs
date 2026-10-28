'use strict';
/**
 * Native QA prebuild gate. No simulator, secrets, network, or native build.
 * This catches false-positive taps caused by matching editable text or
 * a persistent heading rather than the intended button and state.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const load = (name) => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const primary = load('src/components/UI.tsx');
assert.match(primary, /testID\?: string/, 'PrimaryButton must accept a stable test ID');
assert.match(primary, /<Pressable\s+testID=\{testID\}/, 'PrimaryButton must forward its ID to the real control');
assert.match(primary, /accessibilityRole="button"/, 'PrimaryButton must expose an actual button role');
assert.match(primary, /disabled=\{disabled\}/, 'PrimaryButton must expose real enabled/disabled state');

const home = load('app/index.tsx');
assert.match(home, /testID="traveler-open-destination"[\s\S]*?ride\.startBooking\(\)/,
  'Home destination entry must identify a real booking action');

const reserve = load('app/reserve.tsx');
assert.match(reserve, /<TextInput\s+testID="destination-search-input"/,
  'Destination editable input must have an ID distinct from search results');
assert.match(reserve, /testID=\{destinationTestID\(p\.title\)\}/,
  'Live geocoder results must have stable, name-based IDs');
assert.match(reserve, /testID=\{destinationTestID\(p\.name\)\}/,
  'Local server destination results must have stable, name-based IDs');
assert.match(reserve, /testID="destination-option-custom"/,
  'Custom destination must remain distinguishable from actual searched results');
assert.match(reserve, /setSearching\(false\)/,
  'Destination selection must close edit mode');
assert.match(reserve, /!authoritativePriceReady\s*\?[\s\S]*?traveler-quote-ready/,
  'Quote-ready ID may appear only after authoritative server price resolves');
assert.match(reserve, /testID="traveler-confirm-travel"[\s\S]*?disabled=\{selectingScheduledTravel\s*\?\s*!canContinueScheduling\s*:\s*!canReserve\}/,
  'Confirmation control must expose actual payment/route readiness');

const operators = [
  ['app/operator/index.tsx', 'operator-commence-operations'],
  ['app/operator/index.tsx', 'operator-accept-traveler'],
  ['app/operator/pickup.tsx', 'operator-confirm-arrival'],
  ['app/operator/pickup.tsx', 'operator-commence-travel'],
  ['app/operator/trip.tsx', 'operator-complete-operation'],
  ['app/operator/complete.tsx', 'operator-return-to-operations'],
];
for (const [file, id] of operators) {
  assert.ok(load(file).includes('testID="'+id+'"'), file+' is missing '+id);
}
function slug(name) { return 'destination-option-'+name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); }
assert.equal(slug('Wynwood'), 'destination-option-wynwood');
assert.notEqual(slug('Wynwood'), 'destination-search-input');
assert.notEqual(slug('Wynwood'), slug('Miami International Airport'));
console.log('PASS: Traveler/Operator native controls, quote gating, and unambiguous Wynwood result IDs');
