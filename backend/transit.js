// The OpenTripPlanner adapter — the one file that knows OTP's GraphQL schema.
//
// WHY THIS EXISTS (Chad, 9 Sept 2026). Smart Travel used to plan car → Metrorail → car from a
// hand-typed list of 23 stations: typed coordinates, a typed line order, 2.5 minutes a stop
// and 6 for the transfer. It was the app's private opinion of a railway. It could not know
// about Metromover, a bus lane, a closed station or a train that was not running. The
// founders ordered the list deleted and the planning done by a real OpenTripPlanner 2.x
// server built from Miami-Dade Transit and SFRTA GTFS (see infra/otp/). This file speaks to
// that server; smart.js prices what it returns.
//
// THE CONTRACT. planTransit() and transitHealth() never throw. planTransit() gives one of:
//   { status: 'ok', itineraries }             OTP answered with at least one usable itinerary
//   { status: 'none' }                        OTP answered; no transit route exists under our rules
//   { status: 'unavailable', reason, code? }  OTP unreachable, timed out, or refused the query
// 'none' and 'unavailable' are different facts and the client shows them differently: the
// first greys Smart Travel, the second says the planner is not answering.
//
// WHICH TRANSIT COUNTS (Chad, 9 Sept 2026): rail of every kind and ferries, plus only those
// buses that run on dedicated right-of-way or at a 15-minute headway or better. The bus
// routes are listed by gtfsId in transit-routes.json, generated from the GTFS by
// infra/otp/frequent-routes.mjs. Without the file no bus is offered at all: a missing list
// must fail towards fewer promises, not more.
//
// THE ALLOW-LIST IS APPLIED TWICE, on purpose. OTP is asked to plan only on the allowed routes
// (preferences.transit.filters), so that when the fastest way is an ordinary bus it finds the
// rail way instead of returning bus itineraries for us to throw away — a page of discarded
// itineraries would read as "no transit route exists", which would be false. And every
// itinerary is checked again here, because a filter that silently stopped applying must not
// be able to put a route on a screen. OTP's filter selects by route id, not by mode, so the
// rail routes are read from OTP itself and joined to the bus list.
//
// WHICH SERVER, WHICH FILE (9 Sept 2026, "think nationally"): the region's. Every query goes
// to the OTP the travel's region names (regions.js otpUrl — OTP_URL_<REGION>, else OTP_URL)
// and the bus allow-list is the region's file. One server for one market keeps working with
// OTP_URL alone; a second region is a second record, not a second copy of this file.
//
// Schema: OTP 2.10.0, verified 9 Sept 2026 — infra/otp/schema-notes.md. Two things it insists
// on: CAR_DROP_OFF / CAR_PICKUP must be listed beside WALK on the same end, and an
// OffsetDateTime must carry an offset.
const fs = require('fs');
const path = require('path');
const { regionForTrip, defaultRegion } = require('./regions');
const { acceptableBusBoardingWait } = require('./smart-bus-boarding-policy');

const DEFAULT_URL = 'http://localhost:8080';
const DEFAULT_TIMEOUT_MS = 8000;
const HEALTH_TIMEOUT_MS = 2500; // /health is read during incidents; it must not hang on OTP
const ROUTES_TIMEOUT_MS = 3000; // the rail-route list, a small query in front of the plan
const ROUTES_TTL_MS = 6 * 60 * 60 * 1000; // how long OTP's rail-route list is trusted
const ROUTES_RETRY_MS = 30 * 1000; // after a failed read, plan without the filter this long
const GRAPHQL_PATH = '/otp/gtfs/v1';
const INFO_PATH = '/otp/';
const CAR_TIMEOUT_MS = 6000; // a street route for the map; longer than this and the straight line is better than waiting

/** The bus allow-list file for a region (the first region when none is named — a health line, not a travel). */
const routesFileFor = (region) => path.join(__dirname, (region || defaultRegion()).transit.frequentRoutesFile);

/** The OTP server for a region: its own, else OTP_URL, else the local default. */
const otpUrl = (region) => ((region && region.otpUrl) || process.env.OTP_URL || DEFAULT_URL).trim().replace(/\/+$/, '');
const otpTimeoutMs = () => {
  const n = Number(process.env.OTP_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT_MS;
};

// The TransitMode values asked of OTP. BUS is added only when an allow-list exists.
const RAIL_MODES = ['SUBWAY', 'TRAM', 'RAIL', 'FERRY'];
// Everything OTP could call rail-like, for the route list that feeds the filter.
const RAIL_ROUTE_MODES = ['SUBWAY', 'TRAM', 'RAIL', 'FERRY', 'CABLE_CAR', 'MONORAIL', 'FUNICULAR', 'GONDOLA'];

// OTP leg mode → our { kind, mode }. Anything not listed cannot be priced or named by
// smart.js, so an itinerary containing it is dropped rather than half-described.
const LEG_MODES = {
  WALK: { kind: 'walk', mode: 'walk' },
  CAR: { kind: 'car', mode: 'car' },
  BUS: { kind: 'transit', mode: 'bus' },
  TROLLEYBUS: { kind: 'transit', mode: 'bus' },
  COACH: { kind: 'transit', mode: 'bus' },
  SUBWAY: { kind: 'transit', mode: 'subway' },
  TRAM: { kind: 'transit', mode: 'tram' },
  CABLE_CAR: { kind: 'transit', mode: 'tram' },
  MONORAIL: { kind: 'transit', mode: 'tram' },
  FUNICULAR: { kind: 'transit', mode: 'tram' },
  GONDOLA: { kind: 'transit', mode: 'tram' },
  RAIL: { kind: 'transit', mode: 'rail' },
  FERRY: { kind: 'transit', mode: 'ferry' },
};
const ALWAYS_ALLOWED = new Set(['subway', 'tram', 'rail', 'ferry']);

const isCoord = (c) =>
  !!c && Number.isFinite(c.lat) && Number.isFinite(c.lng) && Math.abs(c.lat) <= 90 && Math.abs(c.lng) <= 180;

// --- The bus allow-list --------------------------------------------------------------------
// Loaded lazily and re-read when the file changes, so a list generated while the server is
// running is honoured without a restart. Accepts what frequent-routes.mjs writes
// ({ routes: [{ gtfsId, ... }] }), an array of such files, a bare array of routes, or an
// array of gtfsId strings. Returns a Set of gtfsIds, or null when there is no usable file.
const routesCache = new Map(); // file → { key, routes }
let routesOverride; // tests substitute a Set (or null for "no file") without touching the disk

function busRoutesFrom(raw) {
  const entries = [];
  const collect = (x) => {
    if (Array.isArray(x)) x.forEach(collect);
    else if (typeof x === 'string') entries.push(x);
    else if (x && typeof x === 'object') {
      if (typeof x.gtfsId === 'string') entries.push(x.gtfsId);
      if (Array.isArray(x.routes)) collect(x.routes);
      if (Array.isArray(x.feeds)) collect(x.feeds);
    }
  };
  collect(raw);
  return new Set(entries.filter((id) => id.length > 0));
}

function allowedBusRoutes(region) {
  if (routesOverride !== undefined) return routesOverride;
  const file = routesFileFor(region);
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    routesCache.delete(file);
    return null;
  }
  const key = `${stat.mtimeMs}:${stat.size}`;
  let entry = routesCache.get(file);
  if (!entry || entry.key !== key) {
    try {
      entry = { key, routes: busRoutesFrom(JSON.parse(fs.readFileSync(file, 'utf8'))) };
    } catch {
      entry = { key, routes: null }; // unreadable is the same as absent: no bus
    }
    routesCache.set(file, entry);
  }
  return entry.routes;
}

/** Tests only: substitute the allow-list (a Set, or null for "no file"); undefined restores the disk. */
function _setBusRoutes(routes) {
  routesOverride = routes;
}

// --- Talking to OTP ------------------------------------------------------------------------
const errorText = (errors) =>
  errors
    .map((e) => (e && typeof e.message === 'string' ? e.message : JSON.stringify(e)))
    .join('; ')
    .slice(0, 500);

// One HTTP round trip with a deadline. Resolves { ok, status, body } where body is the parsed
// JSON or null; it never rejects.
async function request(pathname, init, ms, region) {
  // The deadline timer is deliberately not unref'd: it is cleared the moment the request
  // settles, and a request that never settles must be able to fire it.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(otpUrl(region) + pathname, { ...init, signal: ctrl.signal });
    const text = await res.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
    return { ok: res.ok, status: res.status, body: body && typeof body === 'object' ? body : null };
  } catch (e) {
    const aborted = e && e.name === 'AbortError';
    return { ok: false, status: 0, reason: aborted ? `otp: no answer within ${ms} ms` : `otp: ${(e && e.message) || String(e)}` };
  } finally {
    clearTimeout(timer);
  }
}

// One GraphQL query. Resolves { ok: true, data, errors } or { ok: false, reason, errors? }.
// OTP reports validation errors as HTTP 200 with `errors` and some failures as HTTP 4xx/5xx
// with a JSON body, so the two are read the same way.
async function gql(query, variables, timeoutMs, region) {
  const ms = timeoutMs || otpTimeoutMs();
  const r = await request(
    GRAPHQL_PATH,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', OTPTimeout: String(ms) },
      body: JSON.stringify({ query, variables }),
    },
    ms,
    region,
  );
  if (r.reason) return { ok: false, reason: r.reason };
  if (!r.body) return { ok: false, reason: `otp: http ${r.status} without a JSON body` };
  const errors = Array.isArray(r.body.errors) ? r.body.errors : [];
  if (r.body.data == null) {
    return {
      ok: false,
      reason: errors.length ? `otp: ${errorText(errors)}` : `otp: http ${r.status} with no data`,
      errors,
    };
  }
  return { ok: true, data: r.body.data, errors };
}

// planConnection (OTP ≥ 2.6; stopCalls ≥ 2.9). Times are OffsetDateTime strings; distances
// metres; durations seconds. A leg's `start`/`end` carry the scheduled time and, when the
// agency publishes one, a real-time estimate.
const PLAN_QUERY = `query SmartTravel($origin: PlanLabeledLocationInput!, $destination: PlanLabeledLocationInput!, $dateTime: PlanDateTimeInput, $modes: PlanModesInput, $preferences: PlanPreferencesInput, $first: Int) {
  planConnection(origin: $origin, destination: $destination, dateTime: $dateTime, modes: $modes, preferences: $preferences, first: $first) {
    routingErrors { code description }
    edges { node {
      start end duration
      legs {
        mode transitLeg headsign distance duration
        start { scheduledTime estimated { time } }
        end { scheduledTime estimated { time } }
        from { name lat lon stop { gtfsId name } }
        to { name lat lon stop { gtfsId name } }
        route { gtfsId shortName longName mode agency { gtfsId name } }
        stopCalls { stopLocation { __typename } }
      }
    } }
  }
}`;

const RAIL_ROUTES_QUERY = `query RailRoutes($modes: [TransitMode!]) { routes(transportModes: $modes) { gtfsId mode } }`;
const FEEDS_QUERY = '{ feeds { feedId } }';

// An OffsetDateTime with an explicit offset, which the schema insists on.
const offsetIso = (date) => date.toISOString().replace(/\.\d{3}Z$/, '+00:00');

// Did OTP refuse the query because it does not know the access/egress mode we asked for?
// graphql-java names the value and the enum in the message, in either phrasing:
//   "Invalid input for enum 'PlanAccessMode'. No value found for name 'CAR_DROP_OFF'"
//   "... is not a valid 'PlanEgressMode' - Literal value not in allowable values ..."
function unsupportedMode(errors, access, egress) {
  const wanted = [access, egress].filter((m) => m && m !== 'WALK');
  if (!wanted.length || !Array.isArray(errors) || !errors.length) return false;
  const text = errors.map((e) => (e && e.message) || '').join('\n');
  return wanted.some((m) => text.includes(m)) || /PlanAccessMode|PlanEgressMode/.test(text);
}

// --- The rail routes OTP knows, for the filter -------------------------------------------------
const railCache = new Map(); // region id → { at, ids, failedAt }: each region's OTP has its own list

async function railRouteIds(region) {
  const now = Date.now();
  const key = region ? region.id : '';
  const c = railCache.get(key) || { at: 0, ids: null, failedAt: 0 };
  if (c.ids && now - c.at < ROUTES_TTL_MS) return c.ids;
  if (c.failedAt && now - c.failedAt < ROUTES_RETRY_MS) return null;
  const r = await gql(RAIL_ROUTES_QUERY, { modes: RAIL_ROUTE_MODES }, Math.min(otpTimeoutMs(), ROUTES_TIMEOUT_MS), region);
  const routes = r.ok && Array.isArray(r.data.routes) ? r.data.routes : null;
  if (!routes) {
    railCache.set(key, { ...c, failedAt: now });
    return null;
  }
  const ids = routes.map((x) => x && x.gtfsId).filter((id) => typeof id === 'string' && id);
  railCache.set(key, { at: now, ids, failedAt: 0 });
  return ids;
}

/** Tests only: forget the rail-route lists read from OTP. */
function _resetRailRoutes() {
  railCache.clear();
}

// What to ask OTP for: which modes, and — when buses are in play — which routes.
async function transitSelection(region) {
  const busRoutes = allowedBusRoutes(region);
  if (!busRoutes || busRoutes.size === 0) return { busRoutes: null, modes: RAIL_MODES, routes: null };
  const rail = await railRouteIds(region);
  const routes = rail ? [...new Set([...rail, ...busRoutes])] : null; // null: post-filter only
  return { busRoutes, modes: RAIL_MODES.concat(['BUS']), routes };
}

// --- Mapping OTP's answer to ours ------------------------------------------------------------
const legTime = (t) => {
  if (!t) return null;
  if (typeof t === 'string') return t;
  if (typeof t === 'number') return new Date(t).toISOString();
  return (t.estimated && t.estimated.time) || t.scheduledTime || null;
};

const secondsBetween = (a, b) => {
  const ms = Date.parse(b) - Date.parse(a);
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 1000)) : 0;
};

const place = (p) => {
  if (!p) return { name: '', lat: null, lng: null };
  const out = {
    name: (p.stop && p.stop.name) || p.name || '',
    lat: Number.isFinite(p.lat) ? p.lat : null,
    lng: Number.isFinite(p.lon) ? p.lon : Number.isFinite(p.lng) ? p.lng : null,
  };
  if (p.stop && p.stop.gtfsId) out.stopId = p.stop.gtfsId;
  return out;
};

function mapLeg(raw) {
  const m = raw && LEG_MODES[raw.mode];
  if (!m) return null;
  const startTime = legTime(raw.start) || legTime(raw.startTime);
  const endTime = legTime(raw.end) || legTime(raw.endTime);
  const leg = {
    kind: m.kind,
    mode: m.mode,
    from: place(raw.from),
    to: place(raw.to),
    startTime,
    endTime,
    durationSec: Number.isFinite(raw.duration) ? Math.round(raw.duration) : secondsBetween(startTime, endTime),
    distanceMeters: Number.isFinite(raw.distance) ? Math.round(raw.distance) : 0,
  };
  if (m.kind === 'transit') {
    const r = raw.route || {};
    leg.route = {
      gtfsId: r.gtfsId || '',
      shortName: r.shortName || '',
      longName: r.longName || '',
      agency: (r.agency && r.agency.name) || '',
      agencyId: (r.agency && r.agency.gtfsId) || '',
    };
    if (raw.headsign) leg.headsign = raw.headsign;
    // `stops` is the stations passed BETWEEN boarding and alighting. OTP 2.10's stopCalls
    // lists every call including both ends (verified 9 Sept 2026: Brickell → Earlington
    // Heights has 6 stations between and 8 calls); the older intermediateStops did not.
    if (Array.isArray(raw.stopCalls)) leg.stops = Math.max(0, raw.stopCalls.length - 2);
    else leg.stops = Array.isArray(raw.intermediateStops) ? raw.intermediateStops.length : 0;
  }
  return leg;
}

function allowedTransit(leg, busRoutes) {
  if (leg.mode === 'bus') return !!(busRoutes && leg.route && busRoutes.has(leg.route.gtfsId));
  return ALWAYS_ALLOWED.has(leg.mode);
}

// One itinerary, or null when it is not one we can offer: no transit leg at all, a leg in a
// mode we cannot describe, or a bus that is not on the allow-list.
function mapItinerary(node, busRoutes) {
  if (!node || !Array.isArray(node.legs) || node.legs.length === 0) return null;
  const legs = [];
  for (const raw of node.legs) {
    const leg = mapLeg(raw);
    if (!leg) return null;
    if (leg.kind === 'transit' && !allowedTransit(leg, busRoutes)) return null;
    legs.push(leg);
  }
  if (!legs.some((l) => l.kind === 'transit')) return null;
  const startTime = legTime(node.start) || legTime(node.startTime) || legs[0].startTime;
  const endTime = legTime(node.end) || legTime(node.endTime) || legs[legs.length - 1].endTime;
  const durationSec = Number.isFinite(node.duration) ? Math.round(node.duration) : secondsBetween(startTime, endTime);
  return { startTime, endTime, durationSec, legs };
}

/**
 * Maps a planConnection response body (`data`) to the planTransit() contract. Exported so
 * the mapping can be tested against a saved OTP answer without a server.
 */
function mapPlan(data, { busRoutes = null, errors = [], requestedAt = null, timezone = 'America/New_York' } = {}) {
  const pc = data && data.planConnection;
  if (!pc) {
    return { status: 'unavailable', reason: errors.length ? `otp: ${errorText(errors)}` : 'otp: empty answer' };
  }
  const edges = Array.isArray(pc.edges) ? pc.edges : [];
  const itineraries = [];
  for (const edge of edges) {
    const it = mapItinerary(edge && edge.node, busRoutes);
    if (it && acceptableBusBoardingWait(it.legs, requestedAt, timezone)) itineraries.push(it);
  }
  if (itineraries.length === 0) {
    const codes = (Array.isArray(pc.routingErrors) ? pc.routingErrors : []).map((e) => e && e.code).filter(Boolean);
    return codes.length ? { status: 'none', routingErrors: codes } : { status: 'none' };
  }
  return { status: 'ok', itineraries };
}

/**
 * Plans a transit journey between two coordinates.
 *   access: 'WALK' | 'CAR_DROP_OFF'   how the traveler reaches the first stop
 *   egress: 'WALK' | 'CAR_PICKUP'     how they leave the last one
 * A car mode is sent beside WALK, as the schema requires, so an itinerary may still begin or
 * end on foot; smart.js decides what each end becomes. When the server's schema does not know
 * a requested mode the answer is { status: 'unavailable', code: 'unsupported_mode' } and the
 * caller may retry with WALK.
 */
async function planTransit({ from, to, when, access = 'WALK', egress = 'WALK', first = 8 } = {}) {
  if (!isCoord(from) || !isCoord(to)) return { status: 'none', reason: 'bad_coords' };
  // The region decides which planner is asked and which buses may be offered. Two points no
  // one region serves have no transit route we can sell, whatever a planner would say.
  const region = regionForTrip(from, to);
  if (!region) return { status: 'none', reason: 'outside_market' };
  const { busRoutes, modes, routes } = await transitSelection(region);
  const depart = when instanceof Date && Number.isFinite(when.getTime()) ? when : new Date();
  const variables = {
    origin: { location: { coordinate: { latitude: from.lat, longitude: from.lng } } },
    destination: { location: { coordinate: { latitude: to.lat, longitude: to.lng } } },
    dateTime: { earliestDeparture: offsetIso(depart) },
    modes: {
      transitOnly: true,
      transit: {
        access: access === 'WALK' ? ['WALK'] : [access, 'WALK'],
        egress: egress === 'WALK' ? ['WALK'] : [egress, 'WALK'],
        transfer: ['WALK'],
        transit: modes.map((mode) => ({ mode })),
      },
    },
    preferences: routes ? { transit: { filters: [{ include: [{ routes }] }] } } : null,
    first,
  };
  const r = await gql(PLAN_QUERY, variables, undefined, region);
  if (!r.ok) {
    const out = { status: 'unavailable', reason: r.reason };
    if (unsupportedMode(r.errors, access, egress)) out.code = 'unsupported_mode';
    return out;
  }
  return mapPlan(r.data, { busRoutes, errors: r.errors, requestedAt: depart, timezone: region.timezone });
}

/**
 * Is OTP answering? { ok: true, version?, feeds } or { ok: false, reason }. The GraphQL feeds
 * query is the verdict — it is the API Smart Travel uses; the version comes from GET /otp/.
 */
async function transitHealth({ region, timeoutMs } = {}) {
  const ms = timeoutMs || Math.min(otpTimeoutMs(), HEALTH_TIMEOUT_MS);
  const [api, info] = await Promise.all([
    gql(FEEDS_QUERY, {}, ms, region),
    request(INFO_PATH, { method: 'GET', headers: { Accept: 'application/json' } }, ms, region),
  ]);
  if (!api.ok) return { ok: false, reason: api.reason };
  const feeds = Array.isArray(api.data.feeds) ? api.data.feeds.map((f) => f && f.feedId).filter(Boolean) : [];
  const out = { ok: true, feeds };
  const v = info.body && info.body.version;
  const version = v && (typeof v === 'string' ? v : v.version);
  if (version) out.version = version;
  return out;
}

// --- A car route from OTP's own street graph ---------------------------------------------------
// For streets.js, when a region has no OSRM of its own. `direct: [CAR]` with `directOnly: true`
// asks for the drive and nothing else; the answer is one CAR leg whose legGeometry.points is a
// Google encoded polyline (precision 5). Verified 9 Sept 2026 against OTP 2.10.0: Brickell →
// the MIA kerb, 841 s, 13,120 m, 555 points.
const CAR_QUERY = `query CarRoute($origin: PlanLabeledLocationInput!, $destination: PlanLabeledLocationInput!) {
  planConnection(origin: $origin, destination: $destination, first: 1, modes: { directOnly: true, direct: [CAR] }) {
    routingErrors { code description }
    edges { node { duration legs { mode duration distance legGeometry { length points } } } }
  }
}`;

/** Decodes a Google encoded polyline into [{ lat, lng }]. Malformed input yields what it can. */
function decodePolyline(str, precision = 5) {
  const out = [];
  if (typeof str !== 'string') return out;
  const factor = 10 ** precision;
  let index = 0;
  let lat = 0;
  let lng = 0;
  const next = () => {
    let result = 0;
    let shift = 0;
    let b;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20 && index < str.length);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < str.length) {
    lat += next();
    lng += next();
    out.push({ lat: lat / factor, lng: lng / factor });
  }
  return out;
}

/**
 * The driven route between two coordinates from the region's OTP, or null. Same shape as
 * every street provider: { coords, durationSec, distanceMeters, provider: 'otp' }. Never throws.
 */
async function planCar(from, to, { region, timeoutMs } = {}) {
  if (!isCoord(from) || !isCoord(to)) return null;
  const r = region || regionForTrip(from, to);
  if (!r) return null;
  const variables = {
    origin: { location: { coordinate: { latitude: from.lat, longitude: from.lng } } },
    destination: { location: { coordinate: { latitude: to.lat, longitude: to.lng } } },
  };
  const res = await gql(CAR_QUERY, variables, timeoutMs || Math.min(otpTimeoutMs(), CAR_TIMEOUT_MS), r);
  if (!res.ok) return null;
  const pc = res.data && res.data.planConnection;
  const node = pc && Array.isArray(pc.edges) && pc.edges[0] ? pc.edges[0].node : null;
  if (!node || !Array.isArray(node.legs)) return null;
  const legs = node.legs.filter((l) => l && l.mode === 'CAR');
  if (!legs.length) return null;
  const coords = [];
  let distance = 0;
  let duration = 0;
  for (const leg of legs) {
    for (const p of decodePolyline(leg.legGeometry && leg.legGeometry.points)) {
      const last = coords[coords.length - 1];
      if (!last || last.lat !== p.lat || last.lng !== p.lng) coords.push(p);
    }
    distance += Number.isFinite(leg.distance) ? leg.distance : 0;
    duration += Number.isFinite(leg.duration) ? leg.duration : 0;
  }
  if (coords.length < 2) return null;
  return { coords, durationSec: Math.round(duration), distanceMeters: Math.round(distance), provider: 'otp' };
}

module.exports = {
  planTransit,
  planCar,
  transitHealth,
  mapPlan,
  allowedBusRoutes,
  routesFileFor,
  decodePolyline,
  unsupportedMode,
  offsetIso,
  otpUrl,
  otpTimeoutMs,
  PLAN_QUERY,
  CAR_QUERY,
  RAIL_MODES,
  _setBusRoutes,
  _resetRailRoutes,
};
