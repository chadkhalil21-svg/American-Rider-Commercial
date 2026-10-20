// Canonical fare table (travel cost, in cents), keyed by destination.
// CURRENT REGIONAL TARIFF: backend/market-pricing.js is authoritative ($1.00 +
// $0.95/mile + $0.32/minute, $3.00 minimum in South Florida on 16 Oct 2026).
// Historical rate explanations below preserve the decision history, NOT the current tariff.
//
// The SERVER prices every ride from THIS table and never trusts an amount sent by the app.
// That way a tampered or malicious client can't decide its own price (e.g. "charge me 1 cent"):
// it can only say WHERE it's going, and the server looks up what that costs.
//
// This mirrors the fares in ../src/data.ts (PLACES + HOME_PLACE). Keep the two in sync — if a
// destination's price changes there, change it here too.
// DO NOT ADD NEW MARKETS HERE. Every figure below is a fare FROM BRICKELL, frozen when this
// table was the pricing model. It survives only for the coordinate-less path — a destination
// named with no position to measure from — and on 20 Sept 2026 eleven of the new Broward and
// Palm Beach destinations were deliberately left out of it.
//
// ADDING THEM WOULD HAVE SPREAD THE SKEW RATHER THAN FIXED IT: a Fort Lauderdale traveler
// asking for Las Olas would be quoted the fare from Brickell, which is the exact fault the
// regional destination list was built to remove. A distance fare needs an origin. Where there
// is no origin there is no honest price, and the server says so instead of inventing one —
// which is why backend/places.js only ever offers destinations that carry coordinates, and
// places.test.js asserts it.
const FARES = {
  // ALIASES, added 15 Aug 2026. src/data.ts calls these destinations 'MIA Airport' and
  // 'PortMiami'; this table only knew the older 'Miami Airport' and 'Port of Miami', so
  // the named-place path could not price the two busiest destinations in the market. It
  // went unnoticed because the app normally prices by coordinates and both places carry
  // lat/lng — the fallback only runs where geocoding is unavailable, such as the web
  // preview. Keep BOTH spellings: old trips and older builds still send the old ones.
  // 'Miami International Airport' is what src/data.ts calls it TODAY, and it was missing —
  // so the busiest destination in the market could not be priced by name at all. Hidden the
  // same way as the last two: the app normally prices by coordinates, so only the web preview
  // and any coordinate-less path ever hit this table. Added 25 Aug 2026.
  'Miami International Airport': 1020,
  'MIA Airport': 1020,
  'Miami Airport': 1020,
  PortMiami: 401,
  Wynwood: 494,
  'South Beach': 744,
  'Coral Gables': 1032,
  'Port of Miami': 401,
  'Kaseya Center': 350,
  Kendall: 1650,
  Doral: 1762,
  'Coconut Grove': 799,
  'Key Biscayne': 1008,
  'Little Havana': 401,
  'Design District': 624,
  'Midtown Miami': 545,
  Bayside: 350,
  'University of Miami': 1116,
  'Virginia Key': 631,
  'Convention Center': 791,
  Hialeah: 1386,
  'Bal Harbour': 1588,
  'North Miami Beach': 1887,
  'Sunny Isles': 2132,
  Aventura: 2167,
  'Hard Rock Stadium': 2155,
  Homestead: 4142,
  'Fort Lauderdale Airport': 3286,
  Home: 350,
};

// Returns the travel cost in cents for a known destination, or null if we don't recognize it.
function fareCentsFor(destination) {
  if (typeof destination !== 'string') return null;
  return Object.prototype.hasOwnProperty.call(FARES, destination) ? FARES[destination] : null;
}

// --- Distance-based pricing (for real addresses, not just the named places above) ----------
//
// THE RATES. These are the whole fare model — change them here and nowhere else.
// Chosen to sit near Miami UberX pricing so we're competitive without underpaying operators.
// Remember: the operator keeps 99% of this amount; the traveler pays this plus the
// server-calculated platform fee. That fee is the minimum whole-cent amount satisfying the
// complete unit-economic invariant in economics.js; it is not a fixed percentage.
// THE RATES. These are the whole fare model — change them here and nowhere else.
//
// RESTORED TO THE OFFICIAL FORMULA, 20 SEPT 2026 (Chad, explicitly, after re-checking Miami
// against a real route). This file had drifted to $3.00 + $1.80/mile with no time term, which
// was never the agreed model: docs/FARE-MODEL.md has carried $2.00 + $0.85/mile + $0.20/minute
// since Chad's 10 July consolidation, and has flagged the divergence as an open P1 since
// 15 September. The drift priced us ABOVE the platforms we exist to undercut.
//
// THE ROUTE THAT SETTLED IT. Miami to MIA, 5.04 road miles, 15 minutes:
//   UberX          $9.15        Lyft          $11.98
//   $3.00 + $1.80/mi           $12.07   — above both. The inversion of the whole proposition.
//   $2.00 + $0.85/mi + $0.20/min  $9.28   — within 2% of Uber, and the operator keeps 99%.
//
// $0.85/mile also clears the operator's cost floor: the IRS mileage rate rose to 76¢ on
// 1 July 2026, and 99% of $0.85 is $0.84 — a cushion of about 8 cents a mile (Chad, 20 Sept;
// the IRS figure is his and is not independently verified here).
// RECALIBRATED 20 SEPT 2026, SAME DAY, BECAUSE THE BENCHMARK WAS READ WRONG — Adrian caught it:
// "did you say UberX is less? We want to be competitive."
//
// THE ERROR WAS COMPARING OUR FARE TO UBER'S PRICE. On the benchmark route the formula produced
// a $9.28 travel fare and that was set beside UberX's $9.15. But $9.15 is what Uber charges the
// RIDER, and our traveler pays the fare PLUS the platform fee — $10.78. We were $1.63 dearer
// than Uber, 18%, on the very route chosen to prove we were cheaper. The per-mile rate was
// never the problem; the missing fee on our side of the comparison was.
//
// WHERE THE SLACK WAS. $0.85/mile is load-bearing — the operator keeps 99% of it, which is
// $0.84 against an IRS cost floor of $0.76, and cutting it breaks the promise to operators that
// this company is built on. So the base and the minute rate moved instead:
//
//   base $2.00 -> $1.00    per minute $0.20 -> $0.15    per mile UNCHANGED at $0.85
//
// The benchmark route now prices at a $7.53 fare, $9.03 all-in — TWELVE CENTS UNDER UberX —
// while the operator receives $7.46 against an Uber driver's $5.03 to $6.41 on the same trip.
//
// THAT IS THE WHOLE COMPANY IN ONE LINE, and it is only true because our take is $1.58 where
// Uber's is $2.74 to $4.12. We do not have to choose between a cheaper travel and a better-paid
// operator; we can do both, out of the difference in what the platform keeps. Choosing between
// them would have meant one half of the proposition was marketing.
// Compatibility exports describe the CURRENT South Florida production record only. Runtime
// pricing below never uses these as a geographic default.
const CURRENT_FL_PRICING = require('./market-pricing').pricingForRegion('fl-southeast');
const BASE_CENTS = CURRENT_FL_PRICING.baseCents;
const PER_MILE_CENTS = CURRENT_FL_PRICING.perMileCents;
const PER_MINUTE_CENTS = CURRENT_FL_PRICING.perMinuteCents;

// WHY A TIME TERM AT ALL. Distance-only pricing pays an operator the same for five miles in
// twelve minutes and five miles in forty. In Miami traffic that is a straight transfer from the
// operator to our headline price, and it is the failure mode the $1.80 flat rate reintroduced.

// THE FLOOR IS ON THE TRAVELER'S FARE+PLATFORM-FEE TOTAL. The absolute platform-fee
// floor is $2.50 and economics.js confirms that the $2.50 floor controls at the $3 minimum fare,
// so a no-pass-through Standard Travel starts at $5.50. Government fees and tolls, when
// applicable, are true pass-throughs and may raise the final Total.
const MIN_TOTAL_CENTS = 550;
const MINIMUM_CENTS = CURRENT_FL_PRICING.minimumFareCents; // compatibility export; runtime uses the market record

// Straight-line distance under-states how far a car actually drives (roads bend, one-ways,
// causeways). This multiplier approximates real driving distance, and is used ONLY when no
// street router answers — see minutesFor() below and quoteWithRoute().
//
// VALIDATED ON ONE MIAMI ROUTE, 20 SEPT 2026, which is one more than before: Miami to MIA is
// 3.88 straight-line miles and 5.04 by road, a ratio of 1.299. Chad asked for this to be
// checked against Miami specifically, because Biscayne Bay and the canal crossings mean some
// corridors bend further than a flat national assumption captures — a causeway route has no
// alternative and a bay crossing may be much worse. ONE route is not the network. The real
// answer is the router, which returns driven distance and needs no factor at all.
const ROAD_WINDING_FACTOR = 1.3;

// HOW LONG THE TRAVEL TAKES, WHEN NOTHING CAN TELL US.
//
// The time term needs minutes, and minutes come from a street router. No router is configured
// on the live server today (/health reports the planner unreachable), so this is the stand-in.
//
// A SINGLE AVERAGE SPEED WAS TRIED FIRST AND IS WRONG, visibly. Calibrating 20 mph on an urban
// route then applying it to a highway run priced Homestead — 26 miles, mostly Turnpike — at
// 106 minutes and $53.40, against $38.50 under the old model. City speed does not describe a
// trip that spends twenty miles at seventy.
//
// So speed rises with distance, because longer trips contain proportionally more highway:
//
//     mph = 14 + 24 × miles / (miles + 14.6)
//
// It is continuous, so no travel costs more than one a hundred yards longer. It runs from about
// 15 mph on a one-mile city crawl to an asymptote of 38 mph on a long run, and the constant
// 14.6 is chosen so the route the rates were calibrated on reproduces EXACTLY: 5.04 miles at
// 20.16 mph is 15.0 minutes, which is the figure in Chad's verified comparison.
//
// THIS IS A BRIDGE AND NOT AN ANSWER. Derived minutes cannot respond to traffic — the whole
// reason the time term exists — so a travel stuck on the Dolphin at rush hour still pays what a
// clear run pays. Only the router fixes that. Configure OSRM_URL (or OSRM_URL_FL_SOUTHEAST) and
// every quote switches to measured distance AND measured duration, the circuity factor stops
// being used at all, and `timedBy` on the quote changes from 'estimate' to 'router'.
const SPEED_FLOOR_MPH = 14; // a one-mile city crawl
const SPEED_RANGE_MPH = 24; // so the asymptote is 38 mph on a long highway run
const SPEED_HALF_MILES = 14.6; // set so 5.04 miles resolves to exactly 15.0 minutes

/** The average speed we assume for a travel of this length, when nothing measured it. */
function assumedMph(miles) {
  return SPEED_FLOOR_MPH + (SPEED_RANGE_MPH * miles) / (miles + SPEED_HALF_MILES);
}

/** Minutes for a travel: the router's own duration when there is one, else distance ÷ speed. */
function minutesFor(miles, routedMinutes) {
  if (Number.isFinite(routedMinutes) && routedMinutes > 0) return routedMinutes;
  if (!(miles > 0)) return 0;
  return (miles / assumedMph(miles)) * 60;
}

const EARTH_RADIUS_MILES = 3958.8;
const toRadians = (deg) => (deg * Math.PI) / 180;

// Great-circle ("as the crow flies") distance in miles between two lat/lng points.
function straightLineMiles(a, b) {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

const isCoord = (p) =>
  p &&
  typeof p.lat === 'number' &&
  typeof p.lng === 'number' &&
  Number.isFinite(p.lat) &&
  Number.isFinite(p.lng) &&
  Math.abs(p.lat) <= 90 &&
  Math.abs(p.lng) <= 180;

// Prices a trip between two coordinates. Returns { travelCostCents, miles } or null if the
// coordinates are missing or malformed.
//
// WHY THE SERVER DOES THIS: the app only ever says WHERE the traveler is going. It never sends
// a price. That way a tampered app cannot decide its own fare — exactly the same protection the
// FARES table above gives the named places.
function fareCentsForCoords(pickup, dest, route) {
  // OUTSIDE THE MARKET IS NOT A PRICE, IT IS AN ANSWER. See backend/market.js — this returned
  // a distance fare for any two points on earth, so the simulator's default San Francisco
  // location produced a $6,228 quote to Miami with a Continue button under it.
  const { outsideMarket } = require('./market');
  if (outsideMarket(pickup, dest)) return null;

  if (!isCoord(pickup) || !isCoord(dest)) return null;
  // No default market. If geography has no explicit pricing record, there is no honest fare.
  const pricing = require('./market-pricing').pricingForTrip(pickup, dest);
  if (!pricing) return null;
  // The router's driven distance when it answered, else straight line times the factor. A
  // routed distance needs no circuity guess: it IS the road.
  const routedMiles = Number(route?.routedMiles);
  const routed = Number.isFinite(routedMiles) && routedMiles > 0;
  const miles = routed ? routedMiles : straightLineMiles(pickup, dest) * ROAD_WINDING_FACTOR;
  const minutes = minutesFor(miles, Number(route?.routedMinutes));
  const raw = pricing.baseCents + Math.round(miles * pricing.perMileCents) + Math.round(minutes * pricing.perMinuteCents);
  return {
    travelCostCents: Math.max(pricing.minimumFareCents, raw),
    miles: Math.round(miles * 10) / 10,
    minutes: Math.round(minutes * 10) / 10,
    // So a quote can say whether the time term was measured or assumed, rather than implying
    // a precision the stand-in does not have.
    timedBy: Number.isFinite(Number(route?.routedMinutes)) && Number(route?.routedMinutes) > 0 ? 'router' : 'estimate',
  };
}

/**
 * The same price, beside what a street router says about the trip — for comparing the
 * straight-line model with driven distance and time BEFORE any price changes.
 *   { travelCostCents, miles, routedMiles, routedMinutes, provider }
 * When routing answers, its driven distance and duration are the pricing inputs. When routing
 * cannot answer, the explicit estimated-distance fallback remains available and is labelled
 * by fareCentsForCoords() as estimated rather than routed.
 */
async function quoteWithRoute(pickup, dest) {
  let route = null;
  try { route = await require('./streets').routeCar(pickup, dest); } catch { route = null; }
  const metrics = route ? { routedMiles: route.distanceMeters / 1609.344, routedMinutes: route.durationSec / 60 } : null;
  const priced = fareCentsForCoords(pickup, dest, metrics);
  if (!priced) return null;
  return {
    travelCostCents: priced.travelCostCents,
    miles: priced.miles,
    routedMiles: route ? Math.round((route.distanceMeters / 1609.344) * 10) / 10 : null,
    routedMinutes: route ? Math.round(route.durationSec / 60) : null,
    provider: route ? route.provider : null,
    timedBy: priced.timedBy,
  };
}

// --- Travel classes (the web demo's Travel Options) ---------------------------------------
// Multipliers apply to the FARE (the operator's side). Pet Friendly adds a flat $3 that goes
// to the operator for welcoming the pet — it rides inside the fare, so the 99% applies to it.
// The server applies these — the app only names a class, never a price.
const TRAVEL_CLASSES = {
  standard: { mult: 1.0, extraCents: 0, label: 'Standard' },
  premium: { mult: 1.42, extraCents: 0, label: 'Premium' },
  shared: { mult: 0.68, extraCents: 0, label: 'Shared' },
  large: { mult: 1.55, extraCents: 0, label: 'Large Vehicle' },
  accessible: { mult: 1.0, extraCents: 0, label: 'Accessible' },
  pet: { mult: 1.0, extraCents: 300, label: 'Pet Friendly' },
};

// The quotation API receives class keys (large/pet); the Travel prepare API
// receives the operator-facing display labels (Large Vehicle/Pet Friendly).
// Both MUST select the same fare rule. This translation is server-owned, not
// an authority for a phone to choose its own price or vehicle qualification.
function normalizeTravelClassKey(value) {
  if (typeof value !== 'string') return 'standard';
  const requested = value.trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(TRAVEL_CLASSES, requested)) return requested;
  for (const [key, spec] of Object.entries(TRAVEL_CLASSES)) {
    if (spec.label.toLowerCase() === requested) return key;
  }
  // Preserve historical unknown/missing-class fallback. Eligibility is checked
  // separately by the authoritative matcher; never infer a certified class here.
  return 'standard';
}

function applyTravelClass(cents, travelClass) {
  const cls = TRAVEL_CLASSES[normalizeTravelClassKey(travelClass)];
  return Math.round(cents * cls.mult) + cls.extraCents;
}

module.exports = {
  PER_MINUTE_CENTS, MIN_TOTAL_CENTS, assumedMph, minutesFor,
  FARES,
  fareCentsFor,
  fareCentsForCoords,
  quoteWithRoute,
  straightLineMiles,
  BASE_CENTS,
  PER_MILE_CENTS,
  MINIMUM_CENTS,
  TRAVEL_CLASSES,
  normalizeTravelClassKey,
  applyTravelClass,
};
