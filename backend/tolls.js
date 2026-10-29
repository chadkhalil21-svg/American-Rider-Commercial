// Server-side toll authority. HERE is invoked only when toll-cost resolution is requested;
// map rendering and ordinary street routing remain independent.
//
// HERE Routing v8 returns toll fares per section. A fare id may repeat across sections, so
// deduplicate by id before summing. If HERE explicitly reports toll data unavailable, or if
// the provider cannot answer, status is unknown — never silently $0.
const { readKey } = require('./env');
const { officialTollPriceForRoute } = require('./official-toll-pricing');
const { recordTollDecision } = require('./toll-decision-audit');
const { isolatedWynwoodTollFixture } = require('./native-qa-toll-fixture');

const HERE_TOLL_URL = 'https://router.hereapi.com/v8/routes';
const TIMEOUT_MS = 7000;
// A verified toll answer may be reused briefly for the SAME endpoints. This avoids
// paying the toll provider twice when the confirmation screen re-quotes a class,
// while expired or uncertain answers never authorize a fare.
const VERIFIED_TTL_MS = 60_000;
const verified = new Map();
const inflight = new Map();

function cents(price) {
  if (!price || !Number.isFinite(Number(price.value))) return null;
  const currency = String(price.currency || '').toUpperCase();
  if (currency && currency !== 'USD') return null;
  const n = Math.round(Number(price.value) * 100);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

function parseHereTolls(data, { paymentMethod = null } = {}) {
  const route = Array.isArray(data?.routes) ? data.routes[0] : null;
  if (!route || !Array.isArray(route.sections)) return { status: 'unknown', tollCents: null, reason: 'no_route' };
  const notices = route.sections.flatMap((s) => Array.isArray(s?.notices) ? s.notices : []);
  if (notices.some((n) => String(n?.code || '').toLowerCase() === 'tollsdataunavailable')) {
    return { status: 'unknown', tollCents: null, reason: 'provider_data_unavailable' };
  }
  const seen = new Set();
  let total = 0;
  for (const section of route.sections) {
    for (const toll of (Array.isArray(section?.tolls) ? section.tolls : [])) {
      const fares = Array.isArray(toll?.fares) ? toll.fares : [];
      if (!fares.length) return { status: 'unknown', tollCents: null, reason: 'missing_toll_fare' };
      // HERE fares within ONE toll can be alternative payment methods, NOT separate
      // charges. A transponder, cash and card price must never be added together.
      const eligible = paymentMethod
        ? fares.filter(f => Array.isArray(f?.paymentMethods) && f.paymentMethods.includes(paymentMethod))
        : fares;
      const unique = new Map();
      for (const fare of eligible) {
        const id = String(fare?.id || '');
        if (!id) return { status: 'unknown', tollCents: null, reason: 'missing_fare_identity' };
        if (!unique.has(id)) unique.set(id, fare);
      }
      if (unique.size !== 1) {
        return { status: 'unknown', tollCents: null, reason: 'ambiguous_toll_payment_method' };
      }
      const fare = unique.values().next().value;
      const id = String(fare.id);
      if (seen.has(id)) continue;
      const amount = cents(fare?.convertedPrice) ?? cents(fare?.price);
      if (amount == null) return { status: 'unknown', tollCents: null, reason: 'unpriced_toll' };
      seen.add(id);
      total += amount;
    }
  }
  return { status: total > 0 ? 'tolled' : 'clear', tollCents: total, provider: 'here' };
}

async function resolveTollsUncached(from, to, { departureTime = 'any' } = {}) {
  const apiKey = readKey('HERE_API_KEY');
  if (!apiKey) return { status: 'unknown', tollCents: null, reason: 'provider_not_configured' };
  const q = new URLSearchParams({
    origin: `${from.lat},${from.lng}`,
    destination: `${to.lat},${to.lng}`,
    transportMode: 'car',
    return: 'tolls',
    currency: 'USD',
    departureTime,
    apiKey,
  });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${HERE_TOLL_URL}?${q}`, { signal: ctrl.signal });
    if (!res.ok) return { status: 'unknown', tollCents: null, reason: `provider_http_${res.status}` };
    return parseHereTolls(await res.json());
  } catch {
    return { status: 'unknown', tollCents: null, reason: 'provider_unavailable' };
  } finally {
    clearTimeout(timer);
  }
}

// If our own road router is unavailable, HERE can supply one route's road length,
// duration, and verified toll charge together. This is a LAST-RESORT routing
// authority, not a straight-line guess or an assumption that tolls are zero.
// Keep this separate from map route geometry: HERE summary is not a road polyline.
async function verifiedHereRoute(from, to) {
  const key = readKey('HERE_API_KEY');
  if (!key || ![from?.lat, from?.lng, to?.lat, to?.lng].every(Number.isFinite)) return null;
  const params = new URLSearchParams({
    origin: `${from.lat},${from.lng}`, destination: `${to.lat},${to.lng}`,
    transportMode: 'car', return: 'summary,tolls', currency: 'USD',
    departureTime: 'any', apiKey: key,
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${HERE_TOLL_URL}?${params}`, { signal: controller.signal });
    if (!response.ok) return null;
    const payload = await response.json();
    const tolls = parseHereTolls(payload);
    if (tolls.status === 'unknown') return null;
    const sections = payload?.routes?.[0]?.sections;
    if (!Array.isArray(sections) || !sections.length) return null;
    let distanceMeters = 0, durationSec = 0;
    for (const section of sections) {
      if (!Number.isFinite(section?.summary?.length) || section.summary.length < 0 ||
          !Number.isFinite(section?.summary?.duration) || section.summary.duration < 0) return null;
      distanceMeters += section.summary.length;
      durationSec += section.summary.duration;
    }
    if (!Number.isFinite(distanceMeters) || distanceMeters <= 0 ||
        !Number.isFinite(durationSec) || durationSec <= 0) return null;
    return { distanceMeters, durationSec, provider: 'here', verifiedTolls: tolls };
  } catch { return null; }
  finally { clearTimeout(timer); }
}

// A bounded, time-limited cache contains only verified provider responses, not
// unknown or failed lookups. Same-route requests share one in-flight lookup.
async function resolveTolls(from, to, opts = {}) {
  if (![from?.lat, from?.lng, to?.lat, to?.lng].every(Number.isFinite)) {
    return { status: 'unknown', tollCents: null, reason: 'invalid_coordinates' };
  }
  const key = [from.lat, from.lng, to.lat, to.lng, opts.departureTime || 'any'].join('|');
  const cached = verified.get(key);
  if (cached && cached.until > Date.now()) return cached.value;
  if (cached) verified.delete(key);
  if (inflight.has(key)) return inflight.get(key);
  const promise = resolveTollsUncached(from, to, opts);
  inflight.set(key, promise);
  try {
    const value = await promise;
    if (value.status === 'clear' || value.status === 'tolled') {
      verified.set(key, { value, until: Date.now() + VERIFIED_TTL_MS });
      if (verified.size > 256) verified.delete(verified.keys().next().value);
    }
    return value;
  } finally {
    inflight.delete(key);
  }
}

/**
 * Cost-aware toll resolution.
 * 1. Ask our own street router whether the selected route contains an OSM toll road class.
 * 2. A definitive OSRM "no toll class" is clear at zero provider cost.
 * 3. For certified OSRM crossings, use a fresh rate book approved against the
 *    public toll authority. Raw OSM charge=* is NEVER directly billable.
 * 4. If not verified locally, use HERE as the final priced route authority.
 *
 * We deliberately do not infer "clear" from an unavailable/OTP route because absence of
 * evidence is not evidence of no toll.
 */
async function resolveTollsCostAware(from, to, opts = {}) {
  // LOCAL-ONLY SYNTHETIC acceptance fixture. This is NOT a certified free
  // road. The full live resolver remains fail-closed for all production,
  // non-Wynwood, and otherwise unverified routes. Its isolation guard also
  // rejects real Firestore, any production Cloud Run instance and live Stripe.
  const synthetic = isolatedWynwoodTollFixture(from,to);
  if(synthetic){
    recordTollDecision('isolated_qa_fixture',{route:opts.route||null,outcome:synthetic});
    return synthetic;
  }
  let route = opts.route || null;
  // A caller that already attempted to select the authoritative road route must not trigger a
  // second route selection here. A transient second answer could make tolls describe a
  // different physical path than the fare. Unknown is safer than split-route authority.
  // The fallback route and its tolls were obtained in the SAME verified HERE
  // response; do not ask HERE to price a potentially different route a second time.
  if (route?.provider === 'here' &&
      ['clear', 'tolled'].includes(route.verifiedTolls?.status)) {
    recordTollDecision('here', { route, outcome: route.verifiedTolls });
    return route.verifiedTolls;
  }
  if (!route && opts.routeAttempted === true) {
    const outcome = { status: 'unknown', tollCents: null, reason: 'authoritative_route_unavailable' };
    recordTollDecision('route_unknown', { route, outcome });
    return outcome;
  }
  if (!route) {
    try { route = await require('./streets').routeCar(from, to); } catch { route = null; }
  }
  // An OSM/OSRM negative is only authoritative after the market's toll-facility coverage has
  // been certified against the responsible public authorities. OSM can be incomplete; absence
  // of toll=yes must never become a nationwide $0 assumption.
  const region = require('./regions').regionForTrip(from, to);
  if (route?.provider === 'osrm' && route.tollRelevant === false &&
      route.tollSignalComplete === true && region?.tollCoverage?.certified === true) {
    const outcome = { status: 'clear', tollCents: 0, provider: 'osrm-osm-certified', reason: 'certified_market_route_has_no_toll_class' };
    recordTollDecision('verified_osm_clear', { route, outcome });
    return outcome;
  }
  // Price the exact traversed, independently verified toll facilities FIRST.
  // The current registry is intentionally empty until official rates and full
  // OSRM-to-gantry matching are commissioned. Never bill a raw OSM charge tag.
  const official = officialTollPriceForRoute(route, region?.id);
  if (official) {
    recordTollDecision('verified_official', { route, outcome: official });
    return official;
  }
  // HERE can choose different streets for the same endpoints than OSRM/OTP.
  // Without certified route matching, a separate HERE toll quote must not be
  // attached to an OSRM/OTP-priced fare. A same-response HERE route is handled
  // above; otherwise return UNKNOWN until official crossings are commissioned.
  if (route && route.provider !== 'here') {
    const outcome = { status: 'unknown', tollCents: null, reason: 'unmatched_toll_route' };
    recordTollDecision('route_unknown', { route, outcome });
    return outcome;
  }
  const outcome = await resolveTolls(from, to, opts);
  recordTollDecision('here', { route, outcome });
  return outcome;
}

module.exports = { resolveTolls, resolveTollsCostAware, verifiedHereRoute, parseHereTolls, HERE_TOLL_URL, TIMEOUT_MS };
