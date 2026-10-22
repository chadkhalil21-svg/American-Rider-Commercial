// THE FARE FORMULA, PINNED TO THE ROUTE THAT SETTLED IT.
//
// This file exists because the formula drifted once already and nothing caught it. From
// 10 July 2026 the agreed model was $2.00 + $0.85/mile + $0.20/minute; the server was charging
// $3.00 + $1.80/mile with no time term, and the only record of the difference was a note in
// docs/FARE-MODEL.md marking it an open P1. It survived two months and a TestFlight build,
// because no test ever asserted what a mile costs.
//
// The comparison that ended it (Chad, 20 Sept 2026), Miami to MIA, 5.04 road miles, 15 minutes:
//   UberX $9.15 · Lyft $11.98 · $3.00+$1.80/mi = $12.07 · the agreed model = $9.28
const {
  fareCentsForCoords, fareCentsFor, assumedMph, minutesFor, MIN_TOTAL_CENTS,
} = require('./fares');
const { platformFeeCents, commissionCents } = require('./payments');

const results = [];
const check = (label, ok, detail) => results.push({ label, ok: !!ok, detail });
const usd = (c) => `$${(c / 100).toFixed(2)}`;
const HOME = { lat: 25.7689, lng: -80.1935 }; // Brickell City Centre

// ---- The rates themselves --------------------------------------------------------------
// Priced through a router's own numbers, so neither the circuity factor nor the assumed speed
// can flatter the result. This is the number in Chad's comparison, to the cent.
const chad = fareCentsForCoords(HOME, { lat: 25.7953, lng: -80.2789 }, { routedMiles: 5.04, routedMinutes: 15 });
check('the verified route prices at a $10.59 Fare — $1.00 + 5.04 miles + 15 minutes',
  chad.travelCostCents === 1059, `got ${usd(chad.travelCostCents)}`);

// Market competitiveness is NOT hard-coded against one platform-published snapshot. The fare
// formula is pinned here as product behavior; independent repeated-market sampling belongs in
// the market benchmark, not in a unit test. What this test can prove is the complete American
// Rider total and the 99% operator distribution for the calibration route.
const allIn = chad.travelCostCents + platformFeeCents(chad.travelCostCents, 'US');
check('the calibration route includes the complete platform fee in the traveler total',
  allIn === 1309, `ours all-in ${usd(allIn)}`);
check('the operator receives exactly 99% of the $10.59 Travel Fare',
  chad.travelCostCents - commissionCents(chad.travelCostCents) === 1049,
  `operator ${usd(chad.travelCostCents - commissionCents(chad.travelCostCents))}`);
check('a routed travel is marked as measured, not assumed', chad.timedBy === 'router');
check('the retired $1.80-per-mile flat Travel Fare model is no longer our route Fare',
  chad.travelCostCents < 1207);

// ---- The time term is real, and it is what the $1.80 model could not do ------------------
const clear = fareCentsForCoords(HOME, { lat: 25.7953, lng: -80.2789 }, { routedMiles: 5.04, routedMinutes: 15 });
const stuck = fareCentsForCoords(HOME, { lat: 25.7953, lng: -80.2789 }, { routedMiles: 5.04, routedMinutes: 40 });
check('the same five miles in forty minutes pays the operator more than in fifteen',
  stuck.travelCostCents - clear.travelCostCents === 800,
  `${usd(clear.travelCostCents)} vs ${usd(stuck.travelCostCents)}`);

// ---- The stand-in speed, and the one thing it must reproduce -----------------------------
check('with no router, the calibration route still resolves to 15.0 minutes',
  Math.abs(minutesFor(5.04, null) - 15) < 0.05, `got ${minutesFor(5.04, null).toFixed(2)}`);
check('and therefore to within a cent of the routed price',
  Math.abs(fareCentsForCoords(HOME, { lat: 25.7953, lng: -80.2789 }, { routedMiles: 5.04 }).travelCostCents - 1059) <= 2);
check('an unrouted travel says so', fareCentsForCoords(HOME, { lat: 25.7826, lng: -80.1341 }).timedBy === 'estimate');
check('assumed speed rises with distance — a city mile is not a Turnpike mile',
  assumedMph(1) < assumedMph(10) && assumedMph(10) < assumedMph(30));
check('and it stays inside a believable band for Miami, 14 to 38 mph',
  assumedMph(0.1) >= 14 && assumedMph(500) < 38);
check('a flat speed would have priced a 35-mile highway run at over an hour and a half; this does not',
  minutesFor(35, null) < 80, `${minutesFor(35, null).toFixed(0)} min`);

// ---- Continuity: no travel costs more than one slightly longer --------------------------
let worstJump = 0;
let prev = null;
for (let tenths = 1; tenths <= 4000; tenths += 1) {
  const m = tenths / 10;
  const cents = 100 + Math.round(m * 95) + Math.round(minutesFor(m, null) * 32);
  if (prev !== null) worstJump = Math.max(worstJump, cents - prev);
  prev = cents;
}
check('a tenth of a mile further never costs more than 25 cents more', worstJump <= 25, `${worstJump}c`);

// ---- The floor is on what the traveler pays ---------------------------------------------
const tiny = fareCentsForCoords(HOME, { lat: 25.769, lng: -80.1936 });
check('the shortest possible travel costs the traveler exactly $5.50',
  tiny.travelCostCents + platformFeeCents(tiny.travelCostCents, 'US') === MIN_TOTAL_CENTS,
  `${usd(tiny.travelCostCents + platformFeeCents(tiny.travelCostCents, 'US'))}`);
check('the no-pass-through minimum remains the intended $5.50 product floor',
  MIN_TOTAL_CENTS === 550);

// ---- No second, obsolete named-place fare authority -------------------------------------
// The historical Brickell table is intentionally retained for old records, NOT
// available for new quotes after route-based price revision. A named destination
// without a real pickup and destination cannot result in an honest Total.
const { priceRoute } = require('./fareauthority');
for (const name of ['Miami International Airport','South Beach','Wynwood']) {
  const historic = fareCentsFor(name);
  const attempted = priceRoute({destination:name});
  check(`no inaccurate historic named-only quote for ${name}`,
    historic > 0 && !(attempted?.travelCostCents > 0),
    `historic ${usd(historic)}, priced ${JSON.stringify(attempted)}`);
}
check('the aliases agree with their canonical name',
  fareCentsFor('MIA Airport') === fareCentsFor('Miami International Airport') &&
  fareCentsFor('Miami Airport') === fareCentsFor('Miami International Airport') &&
  fareCentsFor('Port of Miami') === fareCentsFor('PortMiami'));

// ---- TOLLS: the traveler pays, the operator is reimbursed, we keep nothing extra ---------
//
// Chad, 20 Sept 2026. Until today a toll came out of the operator's 99% — the Rickenbacker
// Causeway and every expressway toll was borne by the person driving. Uber and Lyft both add
// tolls to the fare, so our operators were absorbing what no competitor asks theirs to.
//
// A pass-through means the beneficiary gets the entire underlying amount. It does NOT mean
// American Rider subsidizes Stripe/Connect for forwarding it: the platform fee may increase
// by the minimum cents required to preserve the economic invariant.
const { quote } = require('./payments');
const plain = quote(2000, undefined, undefined, 'US');
const tolled = quote(2000, undefined, undefined, 'US', 175);
check('a toll may raise platform gross only to fund its induced transaction economics',
  tolled.platformTake >= plain.platformTake, `${plain.platformTake} vs ${tolled.platformTake}`);
check('the traveler total rises by the toll plus any required economic gross-up',
  tolled.travelerPays - plain.travelerPays === 175 + (tolled.appFee - plain.appFee));
check('and the operator is reimbursed the toll whole, on top of the 99%',
  tolled.operatorGets - plain.operatorGets === 175);
check('no commission is taken on a toll — a toll is not fare',
  tolled.commission === plain.commission);
check('the toll is counted as money owed onward, not money kept',
  tolled.passThroughCents - plain.passThroughCents === 175);
check('the split still reconciles: traveler = operator + platform + government remittance',
  tolled.travelerPays === tolled.operatorGets + tolled.platformTake + tolled.governmentFeeCents,
  JSON.stringify(tolled));
check('a nonsense toll is no toll rather than a negative charge',
  quote(2000, undefined, undefined, 'US', -500).tollCents === 0 &&
  quote(2000, undefined, undefined, 'US', 1.5).tollCents === 0 &&
  quote(2000, undefined, undefined, 'US', 'two dollars').tollCents === 0);

// A toll and an airport fee are different money and must not be confused: one is owed to a
// public body, the other back to the operator.
const both = quote(2000, undefined, [{ id: 'mia-tnc-pickup', name: 'MIA', payee: 'Miami-Dade Aviation Department', cents: 200 }], 'US', 175);
check('an airport fee and a toll are both passed through, and only the toll reaches the operator',
  both.governmentFeeCents === 200 && both.tollCents === 175 &&
  both.operatorGets === plain.operatorGets + 175 &&
  both.travelerPays === plain.travelerPays + 200 + 175 + (both.appFee - plain.appFee), JSON.stringify(both));

// ---- Facility rule: all drop-offs allowed inside active service geography ----------------
// Founder decision (22 Oct 2026): airport and seaport drop-offs do not inherit pickup
// permit gates. The rule is neutral across facilities. Airport/port pickups remain gated.
const { permitRequired, permitRequiredMessage, GOVERNMENT_FEES } = require('./fees');
const MIA = { lat: 25.7953, lng: -80.2789 };
const PORT = { lat: 25.775, lng: -80.165 };
const FLL = { lat: 26.0742, lng: -80.1506 };
const PBI = { lat: 26.6832, lng: -80.0956 };
const EVERGLADES = { lat: 26.087, lng: -80.113 };
const BRICKELL = { lat: 25.7617, lng: -80.1918 };
const WYNWOOD = { lat: 25.801, lng: -80.1994 };

check('no pickup fee in the registry is marked permitted', GOVERNMENT_FEES.every(f => f.permitted === false));
for (const [name, place] of [
  ['Miami International Airport', MIA],
  ['PortMiami', PORT],
  ['Fort Lauderdale airport', FLL],
  ['Palm Beach airport', PBI],
  ['Port Everglades', EVERGLADES],
]) {
  check(name + ' drop-off is not rejected by a pickup-only facility permit',
    permitRequired(BRICKELL, place) === null);
  check(name + ' drop-off can receive a normal, coordinate-based fare',
    priceRoute({pickup:BRICKELL,dest:place})?.travelCostCents > 0);
}
for (const [name, place] of [['MIA',MIA],['PortMiami',PORT],['FLL',FLL]]) {
  check(name + ' pickup stays restricted',
    permitRequired(place, BRICKELL)?.end === 'pickup');
}
check('an ordinary travel is untouched', permitRequired(BRICKELL, WYNWOOD) === null);
check('the pickup refusal names the facility and uses restrained wording',
  /Miami International Airport/.test(permitRequiredMessage(permitRequired(MIA,BRICKELL))) &&
  !/sorry|apolog|unfortunate|!/i.test(permitRequiredMessage(permitRequired(MIA,BRICKELL))));
check('an allowed drop-off is not misrepresented as a restricted pickup',
  permitRequired(BRICKELL,MIA) === null && permitRequired(MIA,BRICKELL)?.end === 'pickup');
// The gate must sit with the market gate, ahead of any price — a refusal that falls through to
// a quote is a booking we cannot honour.
const serverSrc = require('fs').readFileSync(require('path').join(__dirname, 'server.js'), 'utf8');
const authoritySrc = require('fs').readFileSync(require('path').join(__dirname, 'fareauthority.js'), 'utf8');
check('the canonical fare authority refuses an unpermitted place before it prices anything',
  authoritySrc.indexOf('permitRequired(body?.pickup') < authoritySrc.indexOf('fareCentsForCoords(body?.pickup'));
check('/fare-quote answers 409 with a code the app can act on',
  /code: 'permit_required'/.test(serverSrc));

for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.label}${r.ok || !r.detail ? '' : ` — ${r.detail}`}`);
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\n${failed.length} FAILED of ${results.length}` : `\nall ${results.length} passed`);
process.exit(failed.length ? 1 : 0);
