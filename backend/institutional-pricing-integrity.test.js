'use strict';
// Founder pricing integrity: no external API, Firebase, Stripe charge, live traveler,
// market promotion, account records or provider credential. Checks the actual fare
// modules, the human policy document and synthetic operational boundaries.
// Institutional source rationale: docs/audits/INSTITUTIONAL-PRICING-REVIEW-2026-10-16.md
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pricingForRegion,pricingForTrip}=require('./market-pricing');
const {fareCentsForCoords}=require('./fares');
const {quote}=require('./payments');
const {minimumPlatformFeeCents,economicsFor,MIN_PLATFORM_FEE_CENTS}=require('./economics');
const {controlledTargetFromAllIn,fareForMarketTarget}=require('./market-reference-fare');
const {MARKET_REFERENCE_TARGET_FRACTION}=require('./pricing-policy');

const pricing=pricingForRegion('fl-southeast');
assert.deepEqual([pricing.baseCents,pricing.perMileCents,pricing.perMinuteCents,pricing.minimumFareCents],
  [100,95,32,300],'the already-ratified Florida tariff must not drift');
assert.equal(MIN_PLATFORM_FEE_CENTS,250);
assert.equal(MARKET_REFERENCE_TARGET_FRACTION,0.90);
assert.equal(pricingForRegion('tx-austin'),null,'no implicit national Florida default');
assert.equal(pricingForTrip({lat:30.26,lng:-97.74},{lat:30.19,lng:-97.66}),null);

const doc=fs.readFileSync(path.join(__dirname,'../docs/FARE-MODEL.md'),'utf8');
assert.ok(doc.includes('Travel Fare = $1.00 + ($0.95 × routed miles) + ($0.32 × routed minutes)'),
  'the primary founder-facing fare model must describe the CURRENT commercial release');
assert.ok(doc.includes('minimum Travel Fare = $3.00'));
assert.ok(doc.includes('The absolute Platform Fee floor is $2.50.'));
assert.ok(doc.includes('not a current independent ride-hail price observation'),
  'public taxi prices and external geographic data must not be misrepresented as matched TNC totals');
// This table used to show obsolete 2026-09 payment-cost assumptions.
// Compute every documentation example from the authoritative integer-cent solver.
for(const [fare,us,foreign] of [
  [500,250,250],[1000,250,250],[2000,250,250],[3000,250,291],
  [4000,265,332],[5000,290,373],[6100,318,418],[7500,352,475],
  [10000,413,577],[15000,537,781],
]){
  const actualUS=minimumPlatformFeeCents({travelCostCents:fare,cardCountry:'US'});
  const actualForeign=minimumPlatformFeeCents({travelCostCents:fare,cardCountry:'GB'});
  assert.equal(actualUS,us);assert.equal(actualForeign,foreign);
  const usd=x=>'$'+(x/100).toFixed(2);
  const row='| '+usd(fare)+' | '+usd(actualUS)+' | '+usd(actualForeign)+' |';
  assert.ok(doc.includes(row),'economic example table does not match production: '+row);
}
const money=x=>Number.isSafeInteger(x)&&x>=0;
const routePrice=(miles,minutes)=>
  Math.max(pricing.minimumFareCents,pricing.baseCents+
    Math.round(miles*pricing.perMileCents)+Math.round(minutes*pricing.perMinuteCents));

const pickup={lat:25.78,lng:-80.20},dest={lat:25.79,lng:-80.19};
let exactCount=0,mathCount=0,marketCount=0;
for(let pass=0;pass<2;pass++){
  // Check actual route-pricing interface: the named-place fallback must never
  // replace the routed miles/minutes when verified route metrics are present.
  for(let i=0;i<1000;i++){
    const miles=0.2+(i%175)/10,minutes=1+(i%95);
    const actual=fareCentsForCoords(pickup,dest,{routedMiles:miles,routedMinutes:minutes});
    assert.ok(actual,'known South Florida routing input should price');
    assert.equal(actual.travelCostCents,routePrice(miles,minutes));
    assert.equal(actual.timedBy,'router');
  }
  // 10,000 complete pricing cases per pass. Exercise the live pricing
  // FUNCTIONS, never payment endpoints, with card, toll, government fee,
  // 99% Operator split, no hidden platform subsidy and target solver.
  for(let i=0;i<10000;i++){
    const miles=0.25+((i*7)%600)/10;
    const minutes=1+((i*11)%140);
    const fare=routePrice(miles,minutes);
    const cardCountry=i%3===0?'US':i%3===1?'GB':null;
    const toll=i%7===0?((i%13)+1)*125:0;
    const governmentCents=i%17===0?((i%5)+1)*200:0;
    const gov=governmentCents?[{id:'synthetic',name:'Synthetic government fee',
      payee:'government',cents:governmentCents}]:[];
    const priced=quote(fare,null,gov,cardCountry,toll);
    assert.ok(money(priced.travelerPays));
    assert.equal(priced.travelerPays,priced._economics.travelerPays);
    assert.equal(priced.operatorGets,fare-Math.floor(fare/100)+toll);
    assert.equal(priced.platformTake,priced.appFee+priced.commission);
    assert.equal(priced.travelerPays,fare+priced.appFee+governmentCents+toll);
    assert.ok(priced.appFee>=MIN_PLATFORM_FEE_CENTS);
    assert.ok(priced._economics.platformContributionCents>=priced._economics.requiredContributionCents);
    const independent=economicsFor({travelCostCents:fare,platformFeeCents:priced.appFee,
      governmentFeeCents:governmentCents,tollCents:toll,cardCountry});
    assert.equal(independent.platformContributionCents,priced._economics.platformContributionCents);
    if(cardCountry===null){
      assert.equal(minimumPlatformFeeCents({travelCostCents:fare,governmentFeeCents:governmentCents,
        tollCents:toll,cardCountry:null}),
        minimumPlatformFeeCents({travelCostCents:fare,governmentFeeCents:governmentCents,
          tollCents:toll,cardCountry:'GB'}),'unknown card remains internationally safe');
    }
    exactCount++;
    // Matched price is a synthetic hypothetical, NOT a live competitor
    // observation. Never write it to market-reference production collections.
    if(i%5===0){
      const targetAllIn=priced.travelerPays+50+(i%350);
      const targetControlled=controlledTargetFromAllIn({
        targetTravelerTotalCents:targetAllIn,passThroughCents:priced.passThroughCents,
      });
      const q=f=>quote(f,null,gov,cardCountry,toll);
      const proposal=fareForMarketTarget({floorFareCents:fare,
        targetControlledTotalCents:targetControlled,quoteForFare:q});
      const after=q(proposal.fareCents);
      assert.ok(proposal.fareCents>=fare);
      assert.ok(after.travelerPays<=targetAllIn);
      assert.ok(after.travelerPays>=priced.travelerPays);
      assert.ok(after._economics.platformContributionCents>=after._economics.requiredContributionCents);
      marketCount++;
    }
  }
  // An engineering arithmetic workload, NOT a load test of Firestore, Stripe,
  // road-routing availability, dispatch, phone GPS, or actual user behavior.
  // Doubled at each tier so route coefficient and integer overflow regressions
  // are visible without a charged provider call or a million DB writes.
  for(const n of [10000,100000,1000000]){
    let checksum=0;
    for(let i=0;i<n;i++){
      const miles=(i%601)/10+0.1;
      const minutes=(i*13%241)+1;
      const fare=routePrice(miles,minutes);
      const commission=Math.floor(fare/100);
      const operatorFare=fare-commission;
      assert.ok(Number.isSafeInteger(fare)&&fare>=300);
      assert.ok(Number.isSafeInteger(operatorFare)&&operatorFare>0);
      checksum=(checksum+fare+operatorFare)%1000000007;
      mathCount++;
    }
    assert.ok(checksum>0);
  }
}
console.log('PASS twice: '+exactCount+' actual economic quotes; '+marketCount+
  ' hypothetical matched-price solver cases; '+mathCount+
  ' arithmetic scenarios across 10K/100K/1M tiers; authoritative documentation parity.');
console.log('Synthetic only. No live passengers, money, network, market-reference promotion or capacity certification.');
