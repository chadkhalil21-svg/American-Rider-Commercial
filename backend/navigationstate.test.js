const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const issues = fs.readFileSync(path.join(__dirname, '..', 'app', 'issues.tsx'), 'utf8');

// Patron Support is a stateful hierarchy inside one route. Back from a category/detail must
// return to the category list before the router stack is allowed to leave /issues.
assert.ok(
  /const supportBack = \(\) => \{[\s\S]*ride\.issueState !== null[\s\S]*resetIssue\(\)[\s\S]*goBack\(\)/.test(issues),
  'Patron Support Back must unwind in-route issue state before route navigation',
);
assert.ok(
  issues.includes('<LetterheadBar onBack={supportBack} />'),
  'Patron Support header must use the hierarchical back handler',
);
assert.equal(
  /<LetterheadBar onBack=\{goBack\} \/>/.test(issues),
  false,
  'Patron Support must not bypass its in-route hierarchy with raw route Back',
);

const reserve = fs.readFileSync(path.join(__dirname, '..', 'app', 'reserve.tsx'), 'utf8');
assert.ok(
  reserve.includes("user?.displayName?.trim() || accountName || t('traveler.me')"),
  'Self Traveler identity should prefer the authenticated or stored verified profile name over generic “Me”',
);

console.log('✓ Patron Support Back retraces issue detail → categories → route parent');
console.log('✓ Travel Confirmation uses the authenticated Traveler display name when available');


const operatorContext = fs.readFileSync(path.join(__dirname, '..', 'src', 'state', 'OperatorContext.tsx'), 'utf8');
assert.equal(/r\.tripNo \|\| r\.rideId \|\|/.test(operatorContext), false, 'Operator acceptance must never fabricate a Travel Number');
assert.ok(operatorContext.includes("if (!r.tripNo && !r.rideId)"), 'Operator acceptance must fail closed without authoritative Travel identity');
const insurance = fs.readFileSync(path.join(__dirname, '..', 'app', 'operator', 'insurance.tsx'), 'utf8');
for (const literal of ["'Not recorded'", "'Not sent'", "'Not submitted'", "'Not checked'", "'Not accepted'", "'Being checked'", "'Take a photograph'", "'Choose a file'"]) assert.equal(insurance.includes(literal), false, 'Insurance workflow must localize user-visible literal: ' + literal);
console.log('✓ Operator acceptance fails closed on missing authoritative Travel identity');
console.log('✓ Insurance action and failure states are localized');


assert.ok(operatorContext.includes("useState(UNKNOWN_PICKUP_WAIT)") || fs.readFileSync(path.join(__dirname, '..', 'src', 'state', 'RideContext.tsx'), 'utf8').includes("useState(UNKNOWN_PICKUP_WAIT)"), 'Pickup ETA must initialize unknown, not as a fabricated minute estimate');
assert.ok(reserve.includes("ride.pickupWait > 0 ?"), 'Travel confirmation must hide pickup ETA until an estimate exists');
const operatorVehicle = fs.readFileSync(path.join(__dirname, '..', 'app', 'operator', 'vehicle.tsx'), 'utf8');
assert.equal(operatorVehicle.includes("showNote('Saved.')"), false, 'Operator vehicle save confirmation must be localized');
assert.equal(operatorVehicle.includes(": 'Save'"), false, 'Operator vehicle save action must be localized');
console.log('✓ Pickup ETA remains unknown until authoritative evidence exists');
console.log('✓ Operator vehicle save states are localized');


assert.ok(reserve.includes("if (!controller.signal.aborted) { setPlaceSuggestions(results);"), 'Destination search must reject stale aborted responses');
assert.ok(reserve.includes("if (!controller.signal.aborted) { setDepSuggestions(results);"), 'Pickup search must reject stale aborted responses');
assert.ok(reserve.includes("!depSearchBusy && depMatched.length === 0"), 'Pickup search must not claim no results while lookup is pending');
assert.ok(reserve.includes("ride.arrival.name.trim()) chooseDestination"), 'Reserve must not request a quote for an empty destination');
const savedPlaces = fs.readFileSync(path.join(__dirname, '..', 'src', 'savedPlaces.ts'), 'utf8');
assert.ok(savedPlaces.includes("if (!localSaved && !remoteSaved) throw"), 'Saved Places must not report success when no durable store accepted the mutation');
const savedPlaceScreen = fs.readFileSync(path.join(__dirname, '..', 'app', 'saved-place.tsx'), 'utf8');
assert.ok(savedPlaceScreen.includes("setError(t('traveler.couldNotSaveConn'))"), 'Saved Place mutation failures must remain on-screen with an actionable error');
console.log('✓ Place search fences stale responses and truthful pending/empty states');
console.log('✓ Saved Places fail closed when persistence fails');


const qualify = fs.readFileSync(path.join(__dirname, '..', 'app', 'operator', 'qualify.tsx'), 'utf8');
assert.ok(qualify.includes('if (areaBusy) return;'), 'Operating-area mutation must reject duplicate taps');
assert.ok(qualify.includes("setAreaError(t('traveler.couldNotSaveConn'))"), 'Operating-area mutation failures must remain visible');
const settings = fs.readFileSync(path.join(__dirname, '..', 'app', 'settings.tsx'), 'utf8');
assert.equal(/<Pressable onPress=/.test(settings), false, 'Settings interactive rows must expose accessibility semantics');
const review = fs.readFileSync(path.join(__dirname, '..', 'app', 'operator', 'review.tsx'), 'utf8');
assert.equal(/<Pressable onPress=/.test(review), false, 'Operator review secondary action must expose accessibility semantics');
console.log('✓ Operator market mutation is fenced and failure-visible');
console.log('✓ Settings and Operator review controls expose accessibility roles');


const emergency = fs.readFileSync(path.join(__dirname, '..', 'app', 'emergency.tsx'), 'utf8');
assert.ok(emergency.includes('if (callBusy) return;'), 'Emergency call action must reject duplicate taps while opening the dialer');
for (const rel of ['app/delete-account.tsx','app/family.tsx','app/language.tsx','app/lost.tsx','app/message.tsx','app/prefs.tsx','app/profile.tsx','app/operator/background.tsx','app/operator/commissioned.tsx','app/operator/documents.tsx','app/operator/insurance.tsx']) {
  const source = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
  assert.equal(/<Pressable(?![^>]*accessibilityRole=)/s.test(source), false, rel + ' Pressables must expose an accessibility role');
}
console.log('✓ Emergency call action is duplicate-tap fenced');
console.log('✓ Audited Traveler and Operator controls expose accessibility roles');
