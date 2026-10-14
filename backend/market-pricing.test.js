const assert=require('node:assert/strict');
const P=require('./market-pricing');
const R=require('./regions');
const F=require('./fares');

const fl=R.regionById('fl-southeast');
assert.ok(fl);
assert.deepEqual(P.pricingProblems(fl),[]);
const settledFlorida=P.pricingForRegion('fl-southeast');
assert.deepEqual({
  baseCents:settledFlorida.baseCents,
  perMileCents:settledFlorida.perMileCents,
  perMinuteCents:settledFlorida.perMinuteCents,
  minimumFareCents:settledFlorida.minimumFareCents,
},{baseCents:100,perMileCents:95,perMinuteCents:32,minimumFareCents:300});
assert.equal(P.requiresAgreedTotalOnBooking(settledFlorida),true,
  'new Florida tariff requires the exact agreed Traveler Total');
assert.equal(fl.activeMarketFips.length,3,'configured Florida service uses three open counties');
assert.equal(P.pricingForRegion('tx-austin'),null,'Texas cannot inherit Florida pricing');
assert.equal(P.pricingForRegion('ca-bay-area'),null,'California cannot inherit Florida pricing');

// Another jurisdiction cannot inherit a region's prices or geography.
assert.equal(P.pricingForRegion('tx-austin'),null);
// A coordinate outside a configured/active market never receives South Florida coefficients.
assert.equal(F.fareCentsForCoords({lat:30.2672,lng:-97.7431},{lat:30.1975,lng:-97.6664}),null);

console.log('regional pricing and geographic fail-closed tests passed');
