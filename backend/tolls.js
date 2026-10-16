// Server-side toll authority. HERE is invoked only when toll-cost resolution is requested;
// map rendering and ordinary street routing remain independent.
//
// HERE Routing v8 returns toll fares per section. A fare id may repeat across sections, so
// deduplicate by id before summing. If HERE explicitly reports toll data unavailable, or if
// the provider cannot answer, status is unknown — never silently $0.
const { readKey } = require('./env');

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

function parseHereTolls(data) {
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
      for (const fare of (Array.isArray(toll?.fares) ? toll.fares : [])) {
        const id = String(fare?.id || '');
        if (id && seen.has(id)) continue;
        const amount = cents(fare?.convertedPrice) ?? cents(fare?.price);
        if (amount == null) return { status: 'unknown', tollCents: null, reason: 'unpriced_toll' };
        if (id) seen.add(id);
        total += amount;
      }
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
 * 3. A toll-relevant route, or a router that cannot make that determination, falls through to
 *    the toll-price authority. Today that final authority is HERE; jurisdiction-maintained
 *    official rate registries can be inserted before HERE without changing callers.
 *
 * We deliberately do not infer "clear" from an unavailable/OTP route because absence of
 * evidence is not evidence of no toll.
 */
async function resolveTollsCostAware(from, to, opts = {}) {
  let route = opts.route || null;
  // A caller that already attempted to select the authoritative road route must not trigger a
  // second route selection here. A transient second answer could make tolls describe a
  // different physical path than the fare. Unknown is safer than split-route authority.
  if (!route && opts.routeAttempted === true) {
    return { status: 'unknown', tollCents: null, reason: 'authoritative_route_unavailable' };
  }
  if (!route) {
    try { route = await require('./streets').routeCar(from, to); } catch { route = null; }
  }
  // An OSM/OSRM negative is only authoritative after the market's toll-facility coverage has
  // been certified against the responsible public authorities. OSM can be incomplete; absence
  // of toll=yes must never become a nationwide $0 assumption.
  const region = require('./regions').regionForTrip(from, to);
  if (route?.provider === 'osrm' && route.tollRelevant === false && region?.tollCoverage?.certified === true) {
    return { status: 'clear', tollCents: 0, provider: 'osrm-osm-certified', reason: 'certified_market_route_has_no_toll_class' };
  }
  return resolveTolls(from, to, opts);
}

module.exports = { resolveTolls, resolveTollsCostAware, parseHereTolls, HERE_TOLL_URL, TIMEOUT_MS };
