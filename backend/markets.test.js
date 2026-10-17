// County markets: which pickups are served, the three active counties, and the gates that read them.
// Run: node backend/markets.test.js
const fs = require('fs');
const path = require('path');

const R = [];
const check = (l, c, d) => R.push({ l, ok: !!c, d });
const fresh = () => {
  delete require.cache[require.resolve('./markets')];
  return require('./markets');
};

let M = fresh();
const P = (lat, lng) => ({ lat, lng });
const where = {
  southBeach: P(25.7826, -80.1341),
  miamiBeach41st: P(25.8127, -80.1224), // off the simplified coastline: snapped
  mia: P(25.7959, -80.287),
  homestead: P(25.4687, -80.4776),
  fll: P(26.0742, -80.1506),
  hillsboroBeach: P(26.29, -80.078), // off the simplified coastline: snapped
  pbi: P(26.6832, -80.0956),
  tequesta: P(26.9687, -80.1289),
  keyLargo: P(25.0865, -80.4473), // Monroe — inside the old regional box
  oceanReef: P(25.3095, -80.2789), // Monroe
  hobeSound: P(27.0595, -80.1364), // Martin
  naples: P(26.142, -81.7948), // Collier
  orlando: P(28.5383, -81.3792), // Orange
  chicago: P(41.8781, -87.6298),
};
const name = (p) => M.marketFor(p)?.id || null;

// ——— 1:500,000 boundaries: coast, county lines, and what is outside ————————————————————
const B = (lat, lng) => M.marketFor(P(lat, lng))?.id || null;
check('500k: Miami Beach, Collins Ave at 41st, is Miami-Dade without any allowance', B(25.8127, -80.1224) === 'fl-miami-dade');
check('500k: Golden Beach (north edge of Miami-Dade)', B(25.964, -80.12) === 'fl-miami-dade');
check('500k: Hallandale Beach (south edge of Broward)', B(25.9812, -80.1484) === 'fl-broward');
check('500k: Deerfield Beach A1A is Broward', B(26.317, -80.077) === 'fl-broward');
check('500k: Boca Raton is Palm Beach', B(26.3683, -80.1289) === 'fl-palm-beach');
check('500k: Jupiter Inlet is Palm Beach', B(26.944, -80.073) === 'fl-palm-beach');
check('500k: Jupiter Island is Martin (waitlist)', B(26.99, -80.108) === 'fl-martin' && !M.servesPoint(P(26.99, -80.108)));
check('500k: Florida City is Miami-Dade', B(25.4479, -80.4792) === 'fl-miami-dade');
check('500k: the Card Sound bridge is in no active county', !M.servesPoint(P(25.2888, -80.37)));
check('500k: PortMiami and Port Everglades are in their counties (restricted-place rules apply separately)', B(25.7781, -80.1794) === 'fl-miami-dade' && B(26.092, -80.121) === 'fl-broward');
check('shoreline: beach sand 14–93 m off the generalized shore is given its only nearby county',
  B(25.905, -80.1215) === 'fl-miami-dade' && B(26.1224, -80.103) === 'fl-broward' && B(26.2317, -80.0879) === 'fl-broward');
check('shoreline: the Deerfield pier, 139 m out, is outside', B(26.317, -80.074) === null);
check('shoreline: Biscayne Bay and open water are outside', B(25.70, -80.22) === null && B(25.78, -80.08) === null);
check('shoreline: the allowance is 100 m, not a kilometre', M.SHORE_M === 100);
const FLc = require('./markets/fl-counties.json');
check('the boundaries are the Census 1:500,000 file', /500,000/.test(FLc.source) && FLc.counties.length === 67);

check('Miami-Dade is active', M.marketFor(where.mia)?.id === 'fl-miami-dade' && M.marketStatus(where.mia) === 'active');
check('Broward is active', name(where.fll) === 'fl-broward' && M.servesPoint(where.fll));
check('Palm Beach is active', name(where.pbi) === 'fl-palm-beach' && M.servesPoint(where.pbi));
check('South Beach is Miami-Dade', name(where.southBeach) === 'fl-miami-dade');
check('a beach off the simplified coastline is snapped to its county (Miami Beach)', name(where.miamiBeach41st) === 'fl-miami-dade');
check('…and Hillsboro Beach', name(where.hillsboroBeach) === 'fl-broward');
check('Homestead is Miami-Dade', name(where.homestead) === 'fl-miami-dade');
check('Tequesta is Palm Beach', name(where.tequesta) === 'fl-palm-beach');
check('Key Largo is Monroe, waitlist — though inside the old regional box', name(where.keyLargo) === 'fl-monroe' && M.marketStatus(where.keyLargo) === 'waitlist');
check('Ocean Reef is Monroe, waitlist', name(where.oceanReef) === 'fl-monroe' && !M.servesPoint(where.oceanReef));
check('Hobe Sound is Martin, waitlist', name(where.hobeSound) === 'fl-martin' && !M.servesPoint(where.hobeSound));
check('Naples is Collier, waitlist', !M.servesPoint(where.naples));
check('Orlando is Orange, waitlist', name(where.orlando) === 'fl-orange' && !M.servesPoint(where.orlando));
check('outside Florida: no market, waitlist', M.marketFor(where.chicago) === null && M.marketStatus(where.chicago) === 'waitlist');
check('malformed point: no market', M.marketFor({ lat: 'x' }) === null && !M.servesPoint(null));

check('cross-county travel among the three: Miami-Dade → Palm Beach', M.tripOutsideMarkets(where.mia, where.pbi) === null);
check('cross-county travel among the three: Palm Beach → Broward', M.tripOutsideMarkets(where.pbi, where.fll) === null);
check('a pickup in an active county may go to a waitlist county inside the region (Miami → Key Largo)', M.tripOutsideMarkets(where.mia, where.keyLargo) === null);
check('…or to the Everglades side of Palm Beach (Belle Glade)', M.tripOutsideMarkets(where.pbi, P(26.6845, -80.6676)) === null);
check('a destination outside the region stays refused, as it shipped (Palm Beach → Orlando)', M.tripOutsideMarkets(where.pbi, where.orlando) === 'destination');
check('…and Tequesta → Hobe Sound, above the region\'s northern edge, as it shipped', M.tripOutsideMarkets(where.tequesta, where.hobeSound) === 'destination');
check('a pickup in a waitlist county is refused (Key Largo → Miami)', M.tripOutsideMarkets(where.keyLargo, where.mia) === 'pickup');
check('a pickup outside Florida is refused', M.tripOutsideMarkets(where.chicago, where.mia) === 'pickup');
check('a destination that is not a valid location is refused', M.tripOutsideMarkets(where.mia, { lat: 'x' }) === 'destination');
check('neither end valid', M.tripOutsideMarkets(null, null) === 'both');
check('pickup and destination both outside', M.tripOutsideMarkets(where.chicago, where.orlando) === 'both');

process.env.MARKET_STATUS = 'fl-broward:waitlist';
M = fresh();
check('a county can be switched off alone: Broward waitlist', !M.servesPoint(where.fll) && M.servesPoint(where.mia) && M.servesPoint(where.pbi));
check('…and travel from it stops; travel to it continues', M.tripOutsideMarkets(where.fll, where.mia) === 'pickup' && M.tripOutsideMarkets(where.mia, where.fll) === null);
process.env.MARKET_STATUS = 'fl-monroe:active';
M = fresh();
check('a county with no region (routing, fares, jurisdiction) cannot be activated', !M.servesPoint(where.keyLargo));
delete process.env.MARKET_STATUS;
M = fresh();
check('the shipped active set is exactly the three counties',
  M.markets().filter((m) => m.status === 'active').map((m) => m.id).sort().join() === 'fl-broward,fl-miami-dade,fl-palm-beach');

// ——— the market gate the rest of the server uses ————————————————————————————————————
delete require.cache[require.resolve('./market')];
const market = require('./market');
check('market.js gate: Key Largo is no longer "in market"', !market.inMarket(where.keyLargo) && market.inMarket(where.mia));
check('market.js gate: priced routes refuse a waitlist PICKUP and accept any destination', market.outsideMarket(where.keyLargo, where.mia) === 'pickup' && market.outsideMarket(where.mia, where.keyLargo) === null);

// ——— wiring ——————————————————————————————————————————————————————————————————
const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const route = (sig) => (server.match(new RegExp(`app\\.${sig}[\\s\\S]*?\\n\\}\\);`)) || [''])[0];
const dispatch = route("post\\('\\/travel\\/dispatch'");
check('dispatch: the PICKUP must be in an active market (not the device position)', /servesPoint\(pickup\)/.test(dispatch));
const online = route("post\\('\\/operator\\/online'");
check('go on duty: declared market active and position in an active market', /operatingMarketGate\(user\)/.test(online) && /servesPoint\(\{ lat, lng \}\)/.test(online));
const doc = route("post\\('\\/operator\\/document'");
check('document reading prepares a configured jurisdiction, not a paid county',
  /operatorPreparationGate\(u\)/.test(doc) && /requireOperatorPreparationMarket/.test(doc));
check('private document uploads also require configured jurisdictional preparation',
  /app\.post\('\/storage\/upload-url', requireAuth, LIMITS\.document, requireFreshAuth, requireOperatorPreparationMarket/.test(server));
check(
  'screening report intake is tied to the configured jurisdiction registry before commercial activation',
  /app\.post\('\/operator\/screening\/existing', requireAuth, LIMITS\.screening, requireScreeningRequestMarket/.test(server) &&
    /const gate = screeningPreparationFor\(market, region\)/.test(server) && /req\.screeningPolicy = gate\.policy/.test(server),
);
check('Stripe Connect onboarding: only in an active market', /app\.post\('\/connect\/onboard', requireAuth, LIMITS\.connect, requireActiveOperatingMarket/.test(server));
check('waitlist is lightweight: one record, rate-limited, nothing started', /app\.post\('\/waitlist', requireAuth, LIMITS\.waitlist/.test(server) && !/checkr|readDocument|connectAccountFor/.test(route("post\\('\\/waitlist'")));
check('restricted places stay separate from county activation', /permitRequired/.test(server));
check('routing is not run for a pickup outside the active markets', /servesPoint\(req\.body\?\.pickup\)/.test(route("post\\('\\/route'")));

let bad = 0;
for (const r of R) { if (!r.ok) bad++; console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.l}${r.ok ? '' : '  — ' + (r.d || '')}`); }
console.log(`\n${R.length - bad}/${R.length} passed`);
process.exit(bad ? 1 : 0);
