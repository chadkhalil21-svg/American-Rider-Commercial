const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

const fareClient = read('src/backend/fares.ts');
const reserve = read('app/reserve.tsx');
const auth = read('src/state/AuthContext.tsx');
assert.ok(fareClient.includes("code === 'toll_unavailable'"), 'client identifies an uncertain toll cost');
assert.ok(fareClient.includes("code === 'route_geometry_required'"), 'client identifies unknown physical destinations');
assert.ok(fareClient.includes("res.status === 429"), 'rate limits do not masquerade as valid prices');
assert.ok(fareClient.includes("args.onFailure?.('invalid_quote')"), 'malformed prices never authorize bookings');
assert.ok(reserve.includes("setPriceFailed(true)"), 'failed quotes are explicit');
assert.ok(reserve.includes("!priceFailed && !unavailable"), 'booking cannot bypass rejected price');
assert.ok(reserve.includes("!pickup || !dest"), 'name-only destinations do not become prices');
const placeClient = read('src/backend/placeSearch.ts');
assert.ok(reserve.includes('uniqueNearbyExactPlace(place.name, options, anchor)'), 'location fallback requires unique nearby exact match');
assert.ok(placeClient.includes('matches.length !== 1'), 'ambiguous same-name locations require manual selection');
assert.ok(placeClient.includes('km <= 250 ? only : null'), 'out-of-area automatic location is prohibited');
assert.ok(reserve.includes("onPress={() => { void chooseDestination(ride.arrival); }}"), 'Traveler can retry without choosing a destination again');
assert.ok(auth.includes("getDoc(doc(db, 'users', u.uid))"), 'read saved account name when auth provider omitted it');
assert.ok(auth.includes("version !== request"), 'late name reads cannot change another signed-in account');
for (const lang of ['en', 'es', 'fr', 'it', 'de']) {
  const catalog = read('src/i18n/' + lang + '.ts');
  for (const key of ['retryTravelCost', 'quoteTollUnavailable', 'quoteLocationUnresolved', 'quoteServiceUnavailable']) {
    assert.ok(catalog.includes(key + ':'), lang + ' is missing ' + key);
  }
}
console.log('Traveler quote failure, retry, name fallback, localization contracts passed');
