// THE OTP ADAPTER — what it asks, what it makes of the answer, and what it does when there
// is no answer. No server is needed: fetch is replaced for the duration of each case, and the
// mapper is fed the saved real answers in infra/otp/ when they exist.
const fs = require('fs');
const path = require('path');
const T = require(path.join(__dirname, 'transit.js'));

const R = [];
const check = (l, ok, d) => R.push({ l, ok: !!ok, d });

const at = (hhmm) => `2026-09-09T${hhmm}:00-04:00`;
const stop = (id, name, lat, lon) => ({ name, lat, lon, stop: { gtfsId: id, name } });
const point = (name, lat, lon) => ({ name, lat, lon, stop: null });
const BRICKELL = stop('MDT:9515', 'BRICKELL STATION RAIL NORTHBOUND', 25.763828, -80.19542);
const MIA = stop('MDT:10495', 'MIAMI INTERNATIONAL AIRPORT STATION NORTHBOUND', 25.798002, -80.258746);
const METRORAIL = { gtfsId: 'MDT:31009', shortName: '2600', longName: 'REGULAR METRORAIL SERVICE', mode: 'RAIL', agency: { gtfsId: 'MDT:DTPW305', name: 'Miami-Dade Transit' } };
const BUS_150 = { gtfsId: 'MDT:31148', shortName: '150', longName: 'MIAMI BEACH AIRPORT FLYER', mode: 'BUS', agency: { gtfsId: 'MDT:DTPW305', name: 'Miami-Dade Transit' } };
const BUS_8 = { gtfsId: 'MDT:31101', shortName: '8', longName: 'FLAGLER', mode: 'BUS', agency: { gtfsId: 'MDT:DTPW305', name: 'Miami-Dade Transit' } };

const rawLeg = (mode, from, to, start, end, distance, route = null, extra = {}) => ({
  mode, transitLeg: !!route, distance, duration: (Date.parse(at(end)) - Date.parse(at(start))) / 1000,
  start: { scheduledTime: at(start), estimated: extra.estimatedStart ? { time: extra.estimatedStart } : null },
  end: { scheduledTime: at(end), estimated: null },
  from, to, route, headsign: extra.headsign || null,
  // OTP's stopCalls include the boarding and alighting stops; `stops` here is the count between.
  stopCalls: route ? new Array((extra.stops || 0) + 2).fill({ stopLocation: { __typename: 'Stop' } }) : [],
});
const edge = (legs) => ({ node: {
  start: legs[0].start.scheduledTime, end: legs[legs.length - 1].end.scheduledTime,
  duration: (Date.parse(legs[legs.length - 1].end.scheduledTime) - Date.parse(legs[0].start.scheduledTime)) / 1000, legs,
} });

const railTrip = edge([
  rawLeg('CAR', point('Origin', 25.7683, -80.183), point('service road', 25.7655, -80.1935), '16:52', '16:58', 1400),
  rawLeg('WALK', point('service road', 25.7655, -80.1935), BRICKELL, '16:58', '17:00', 150),
  rawLeg('RAIL', BRICKELL, MIA, '17:00', '17:25', 12000, METRORAIL, { stops: 7, headsign: 'ORANGE LINE AIRPORT STATION', estimatedStart: at('17:02') }),
  rawLeg('CAR', MIA, point('Destination', 25.7959, -80.287), '17:27', '17:35', 2900),
]);
const busTrip = (route) => edge([
  rawLeg('WALK', point('Origin', 25.7683, -80.183), BRICKELL, '16:50', '16:56', 400),
  rawLeg('BUS', BRICKELL, MIA, '16:58', '17:40', 11000, route, { stops: 12 }),
  rawLeg('WALK', MIA, point('Destination', 25.7959, -80.287), '17:42', '17:50', 300),
]);
const walkTrip = edge([rawLeg('WALK', point('Origin', 25.7683, -80.183), point('Destination', 25.7959, -80.287), '17:00', '19:00', 9000)]);
const bikeTrip = edge([
  rawLeg('BICYCLE', point('Origin', 25.7683, -80.183), BRICKELL, '16:50', '16:56', 1400),
  rawLeg('RAIL', BRICKELL, MIA, '17:00', '17:25', 12000, METRORAIL, { stops: 7 }),
]);

// --- the mapper --------------------------------------------------------------------------------
const okMap = T.mapPlan({ planConnection: { routingErrors: [], edges: [railTrip] } });
check('a rail itinerary maps to ok', okMap.status === 'ok' && okMap.itineraries.length === 1, JSON.stringify(okMap));
const it = okMap.itineraries[0];
check('OTP modes become ours: CAR → car, WALK → walk, RAIL → transit/rail',
  it && it.legs.map((l) => `${l.kind}/${l.mode}`).join(',') === 'car/car,walk/walk,transit/rail,car/car', it && it.legs.map((l) => l.mode).join(','));
check('a real-time estimate is preferred to the timetable', it && it.legs[2].startTime === at('17:02'), it && it.legs[2].startTime);
check('the timetable is used when there is no estimate', it && it.legs[2].endTime === at('17:25'));
check('stops carry their gtfsId; a street point has none',
  it && it.legs[2].from.stopId === 'MDT:9515' && it.legs[2].to.stopId === 'MDT:10495' && !('stopId' in it.legs[0].from), it && JSON.stringify(it.legs[2].from));
check('lon becomes lng', it && it.legs[2].from.lng === -80.19542 && it.legs[2].from.lat === 25.763828);
check('route, headsign and the stop-call count are carried, names as the feed spells them',
  it && it.legs[2].route.gtfsId === 'MDT:31009' && it.legs[2].route.longName === 'REGULAR METRORAIL SERVICE' &&
    it.legs[2].route.agency === 'Miami-Dade Transit' && it.legs[2].route.agencyId === 'MDT:DTPW305' &&
    it.legs[2].headsign === 'ORANGE LINE AIRPORT STATION' && it.legs[2].stops === 7,
  it && JSON.stringify(it.legs[2].route));
check('durations are seconds and distances metres',
  it && it.legs[2].durationSec === 1500 && it.legs[2].distanceMeters === 12000 && it.durationSec === 2580, it && [it.legs[2].durationSec, it.durationSec].join(','));
check('a walk leg carries no route', it && !('route' in it.legs[1]));

const busOn = T.mapPlan({ planConnection: { routingErrors: [], edges: [busTrip(BUS_8), busTrip(BUS_150)] } }, { busRoutes: new Set(['MDT:31148']) });
check('a bus on the allow-list is kept and one off it dropped',
  busOn.status === 'ok' && busOn.itineraries.length === 1 && busOn.itineraries[0].legs[1].route.gtfsId === 'MDT:31148', JSON.stringify(busOn));
// Integration: the allow-listed route still needs an actual departure soon after arrival
// at its specific stop. Never drop an ordinary rail itinerary because a bus is late.
const delayedBus = edge([
  rawLeg('WALK', point('Origin', 25.7683, -80.183), BRICKELL, '16:30', '16:40', 400),
  rawLeg('BUS', BRICKELL, MIA, '16:58', '17:40', 11000, BUS_150, { stops: 12 }),
]);
const reliableSource = { planConnection: { routingErrors: [], edges: [delayedBus, railTrip] } };
const windowed = T.mapPlan(reliableSource, {
  busRoutes: new Set(['MDT:31148']), requestedAt: new Date(at('16:30')),
  timezone: 'America/New_York',
});
check('an 18-minute wait at the actual weekday boarding stop rejects bus but retains rail',
  windowed.status === 'ok' && windowed.itineraries.length === 1 &&
  windowed.itineraries[0].legs.some((leg) => leg.mode === 'rail'), JSON.stringify(windowed));
const busOff = T.mapPlan({ planConnection: { routingErrors: [], edges: [busTrip(BUS_150)] } }, { busRoutes: null });
check('with no allow-list every bus is dropped: none', busOff.status === 'none', JSON.stringify(busOff));
const railWithoutList = T.mapPlan({ planConnection: { routingErrors: [], edges: [railTrip] } }, { busRoutes: null });
check('rail needs no allow-list', railWithoutList.status === 'ok');
const walkOnly = T.mapPlan({ planConnection: { routingErrors: [{ code: 'WALKING_BETTER_THAN_TRANSIT', description: '' }], edges: [walkTrip] } });
check('an itinerary with no transit leg is dropped, and the routing error is named',
  walkOnly.status === 'none' && walkOnly.routingErrors[0] === 'WALKING_BETTER_THAN_TRANSIT', JSON.stringify(walkOnly));
check('a mode we cannot describe drops the itinerary rather than half-describing it',
  T.mapPlan({ planConnection: { routingErrors: [], edges: [bikeTrip] } }).status === 'none');
check('no edges is none', T.mapPlan({ planConnection: { routingErrors: [{ code: 'NO_TRANSIT_CONNECTION_IN_SEARCH_WINDOW' }], edges: [] } }).status === 'none');
const nullPlan = T.mapPlan({ planConnection: null }, { errors: [{ message: 'Exception while fetching data (/planConnection)' }] });
check('a null planConnection is unavailable and says why', nullPlan.status === 'unavailable' && /Exception/.test(nullPlan.reason), JSON.stringify(nullPlan));
check('an empty answer is unavailable', T.mapPlan(null).status === 'unavailable');

// --- the saved real answers, when the infra agent has captured them -------------------------------
for (const file of ['example-response.json', 'example-response-car.json', 'example-response-filtered.json']) {
  const saved = path.join(__dirname, '..', 'infra', 'otp', file);
  if (!fs.existsSync(saved)) {
    console.log(`note  infra/otp/${file} not present; that saved-answer case is skipped`);
    continue;
  }
  let real = null;
  try { real = JSON.parse(fs.readFileSync(saved, 'utf8')); } catch (e) { real = { parseError: e.message }; }
  const mapped = T.mapPlan(real && (real.data || real), { busRoutes: T.allowedBusRoutes() });
  check(`infra/otp/${file} maps to ok`, mapped.status === 'ok', JSON.stringify(mapped).slice(0, 300));
  if (mapped.status === 'ok') {
    check('  every saved itinerary has a transit leg with a route and parseable times',
      mapped.itineraries.every((i) => i.legs.some((l) => l.kind === 'transit' && l.route && l.route.gtfsId) &&
        Number.isFinite(Date.parse(i.startTime)) && Number.isFinite(Date.parse(i.endTime)) && i.durationSec > 0),
      JSON.stringify(mapped.itineraries[0]).slice(0, 300));
    check('  Metrorail is a rail leg on MDT:31009, with a Miami-Dade agency where the query asked for one',
      mapped.itineraries.some((i) => i.legs.some((l) => l.mode === 'rail' && l.route.gtfsId === 'MDT:31009' && (!l.route.agency || /Miami-Dade/.test(l.route.agency)))));
    check('  a Metrorail leg passes a plausible number of stations, not the calls at both ends',
      mapped.itineraries.every((i) => i.legs.every((l) => l.kind !== 'transit' || (l.stops >= 0 && l.stops < 30))),
      JSON.stringify(mapped.itineraries.map((i) => i.legs.filter((l) => l.kind === 'transit').map((l) => l.stops))));
  }
}

// --- the allow-list file -------------------------------------------------------------------------
T._setBusRoutes(undefined);
const fromDisk = T.allowedBusRoutes();
if (fs.existsSync(path.join(__dirname, 'transit-routes.fl-southeast.json'))) {
  check('transit-routes.fl-southeast.json loads as a set of feed-prefixed gtfsIds',
    fromDisk instanceof Set && fromDisk.size > 0 && [...fromDisk].every((id) => /^[A-Za-z0-9_-]+:.+/.test(id)), fromDisk && [...fromDisk].slice(0, 5).join(','));
} else {
  check('without transit-routes.fl-southeast.json the allow-list is null (no bus)', fromDisk === null);
}

// --- schema rejections ---------------------------------------------------------------------------
check('an unknown access mode is recognised from the message',
  T.unsupportedMode([{ message: "Variable 'modes' has an invalid value: Invalid input for enum 'PlanAccessMode'. No value found for name 'CAR_DROP_OFF'" }], 'CAR_DROP_OFF', 'CAR_PICKUP'));
check('  and from the literal phrasing', T.unsupportedMode([{ message: "argument 'modes' ... is not a valid 'PlanEgressMode'" }], 'CAR_DROP_OFF', 'CAR_PICKUP'));
check('a walk-only request is never reported as an unsupported mode', !T.unsupportedMode([{ message: 'PlanAccessMode' }], 'WALK', 'WALK'));
check('an unrelated error is not', !T.unsupportedMode([{ message: 'Exception while fetching data' }], 'CAR_DROP_OFF', 'CAR_PICKUP'));
check('the departure time carries an explicit offset', T.offsetIso(new Date('2026-09-09T20:50:00.000Z')) === '2026-09-09T20:50:00+00:00', T.offsetIso(new Date('2026-09-09T20:50:00.000Z')));

// --- planTransit and transitHealth against a stand-in fetch ------------------------------------------
// The stand-in answers by request: GET /otp/ with the server info, and each GraphQL query by the
// operation it names. It remembers every request so the tests can read what was asked.
const realFetch = global.fetch;
const RAIL_ROUTES = { data: { routes: [{ gtfsId: 'MDT:31009', mode: 'RAIL' }, { gtfsId: 'MDT:14458', mode: 'TRAM' }, { gtfsId: 'SFRTA:1', mode: 'RAIL' }] } };
const INFO = { version: { version: '2.10.0' } };
function standIn(answers) {
  const calls = [];
  const fn = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url, method: init.method || 'GET', body, headers: init.headers || {} });
    let a;
    if (!body) a = answers.info === undefined ? INFO : answers.info;
    else if (/planConnection\(/.test(body.query)) a = answers.plan;
    else if (/routes\(/.test(body.query)) a = answers.routes === undefined ? RAIL_ROUTES : answers.routes;
    else if (/feeds/.test(body.query)) a = answers.feeds === undefined ? { data: { feeds: [{ feedId: 'MDT' }, { feedId: 'SFRTA' }] } } : answers.feeds;
    if (a instanceof Error) throw a;
    if (typeof a === 'function') return a(init);
    const status = (a && a.__status) || 200;
    return { ok: status < 400, status, text: async () => (typeof a === 'string' ? a : JSON.stringify(a)) };
  };
  fn.calls = calls;
  return fn;
}
const withFetch = async (impl, fn) => {
  global.fetch = impl;
  try { return await fn(); } finally { global.fetch = realFetch; }
};
const planCall = (f) => f.calls.find((c) => c.body && /planConnection\(/.test(c.body.query));
const FROM = { lat: 25.7683, lng: -80.183 };
const TO = { lat: 25.7959, lng: -80.287 };
const PLAN_OK = { data: { planConnection: { routingErrors: [], edges: [railTrip] } } };

(async () => {
  process.env.OTP_URL = 'http://otp.test:8080/';
  T._setBusRoutes(new Set(['MDT:31148', 'MDT:31009']));
  T._resetRailRoutes();
  let f = standIn({ plan: PLAN_OK });
  const ok = await withFetch(f, () => T.planTransit({ from: FROM, to: TO, when: new Date('2026-09-09T20:50:00Z'), access: 'CAR_DROP_OFF', egress: 'CAR_PICKUP' }));
  check('a good answer is ok', ok.status === 'ok' && ok.itineraries.length === 1, JSON.stringify(ok).slice(0, 200));
  const sent = planCall(f);
  check('the request goes to OTP_URL + /otp/gtfs/v1, trailing slash or not', sent.url === 'http://otp.test:8080/otp/gtfs/v1', sent.url);
  check('it is a planConnection query asking for stopCalls, not the removed intermediateStops',
    /planConnection\(/.test(sent.body.query) && /stopCalls/.test(sent.body.query) && !/intermediateStops/.test(sent.body.query));
  check('OTP is told the same deadline we hold it to', sent.headers.OTPTimeout === '8000', sent.headers.OTPTimeout);
  const v = sent.body.variables;
  check('origin and destination are coordinates', v.origin.location.coordinate.latitude === FROM.lat && v.destination.location.coordinate.longitude === TO.lng, JSON.stringify(v.origin));
  check('the departure is the time asked for, with an explicit offset', v.dateTime.earliestDeparture === '2026-09-09T20:50:00+00:00', v.dateTime.earliestDeparture);
  check('a car mode is sent beside WALK on the same end, as OTP 2.10 requires',
    JSON.stringify(v.modes.transit.access) === '["CAR_DROP_OFF","WALK"]' && JSON.stringify(v.modes.transit.egress) === '["CAR_PICKUP","WALK"]', JSON.stringify(v.modes));
  check('transfers are on foot, and walk-only itineraries are not wanted', v.modes.transit.transfer[0] === 'WALK' && v.modes.transitOnly === true);
  const modes = v.modes.transit.transit.map((m) => m.mode);
  check('rail of every kind, ferries, and — with an allow-list — buses are asked for',
    ['SUBWAY', 'TRAM', 'RAIL', 'FERRY', 'BUS'].every((m) => modes.includes(m)) && modes.length === 5, modes.join(','));
  const included = v.preferences && v.preferences.transit.filters[0].include[0].routes;
  check('OTP is told to plan only on the allowed routes: the bus list joined to its own rail routes',
    Array.isArray(included) && ['MDT:31148', 'MDT:31009', 'MDT:14458', 'SFRTA:1'].every((id) => included.includes(id)) && included.length === 4, JSON.stringify(included));
  check('  the rail routes were read from OTP first', f.calls.filter((c) => c.body && /routes\(/.test(c.body.query)).length === 1);

  f = standIn({ plan: PLAN_OK });
  await withFetch(f, () => T.planTransit({ from: FROM, to: TO }));
  check('  and remembered: the second plan does not ask again', !f.calls.some((c) => c.body && /routes\(/.test(c.body.query)));
  check('  access/egress default to WALK alone', JSON.stringify(planCall(f).body.variables.modes.transit.access) === '["WALK"]' && JSON.stringify(planCall(f).body.variables.modes.transit.egress) === '["WALK"]');

  T._resetRailRoutes();
  f = standIn({ plan: PLAN_OK, routes: new Error('fetch failed') });
  const noRail = await withFetch(f, () => T.planTransit({ from: FROM, to: TO }));
  check('when the rail-route list cannot be read the plan is still made, without the filter',
    noRail.status === 'ok' && planCall(f).body.variables.preferences === null, JSON.stringify(planCall(f).body.variables.preferences));

  T._setBusRoutes(null);
  T._resetRailRoutes();
  f = standIn({ plan: { data: { planConnection: { routingErrors: [], edges: [] } } } });
  await withFetch(f, () => T.planTransit({ from: FROM, to: TO }));
  const noBus = planCall(f).body.variables.modes.transit.transit.map((m) => m.mode);
  check('without an allow-list BUS is not asked for, no filter is sent, and no route list is read',
    !noBus.includes('BUS') && noBus.length === 4 && planCall(f).body.variables.preferences === null && !f.calls.some((c) => c.body && /routes\(/.test(c.body.query)), noBus.join(','));

  const none = await withFetch(standIn({ plan: { data: { planConnection: { routingErrors: [{ code: 'NO_TRANSIT_CONNECTION' }], edges: [] } } } }), () => T.planTransit({ from: FROM, to: TO }));
  check('an answer with no itinerary is none', none.status === 'none' && none.routingErrors[0] === 'NO_TRANSIT_CONNECTION', JSON.stringify(none));

  const rejected = await withFetch(standIn({ plan: { errors: [{ message: "Variable 'modes' has an invalid value: Invalid input for enum 'PlanAccessMode'. No value found for name 'CAR_DROP_OFF'" }], data: null } }),
    () => T.planTransit({ from: FROM, to: TO, access: 'CAR_DROP_OFF', egress: 'CAR_PICKUP' }));
  check('a schema that rejects car access is unavailable with code unsupported_mode',
    rejected.status === 'unavailable' && rejected.code === 'unsupported_mode' && /CAR_DROP_OFF/.test(rejected.reason), JSON.stringify(rejected));

  const partial = await withFetch(standIn({ plan: { errors: [{ message: 'Exception while fetching data (/planConnection) : boom' }], data: { planConnection: null } } }), () => T.planTransit({ from: FROM, to: TO }));
  check('a server-side exception is unavailable, with the message, and no code', partial.status === 'unavailable' && /boom/.test(partial.reason) && !partial.code, JSON.stringify(partial));

  const http502 = await withFetch(standIn({ plan: Object.assign('<html>Bad Gateway</html>', {}) , routes: { __status: 502 } }), () => T.planTransit({ from: FROM, to: TO }));
  check('a non-JSON HTTP error is unavailable and names the status', http502.status === 'unavailable' && /without a JSON body|502|200/.test(http502.reason), JSON.stringify(http502));

  const refused = await withFetch(async () => { throw Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } }); }, () => T.planTransit({ from: FROM, to: TO }));
  check('a refused connection is unavailable, not a throw', refused.status === 'unavailable' && /fetch failed/.test(refused.reason), JSON.stringify(refused));

  process.env.OTP_TIMEOUT_MS = '40';
  const t0 = Date.now();
  const hung = await withFetch((url, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })))),
    () => T.planTransit({ from: FROM, to: TO }));
  check('a server that never answers is unavailable after OTP_TIMEOUT_MS', hung.status === 'unavailable' && /40 ms/.test(hung.reason) && Date.now() - t0 < 2000, JSON.stringify(hung));
  delete process.env.OTP_TIMEOUT_MS;
  check('the default timeout is 8 seconds', T.otpTimeoutMs() === 8000);

  f = standIn({});
  const bad = await withFetch(f, () => T.planTransit({ from: null, to: TO }));
  check('bad coordinates are none and OTP is not asked', bad.status === 'none' && f.calls.length === 0, JSON.stringify(bad));

  f = standIn({});
  const healthy = await withFetch(f, () => T.transitHealth());
  check('transitHealth reports ok, the feeds loaded and the version',
    healthy.ok === true && healthy.version === '2.10.0' && JSON.stringify(healthy.feeds) === '["MDT","SFRTA"]', JSON.stringify(healthy));
  check('  from a feeds query and GET /otp/, nothing heavier',
    f.calls.some((c) => c.method === 'GET' && c.url === 'http://otp.test:8080/otp/') && f.calls.every((c) => !c.body || !/planConnection/.test(c.body.query)));
  const sick = await withFetch(async () => { throw new Error('fetch failed'); }, () => T.transitHealth());
  check('  and not ok, with a reason, when OTP is down', sick.ok === false && /fetch failed/.test(sick.reason), JSON.stringify(sick));
  const apiOff = await withFetch(standIn({ feeds: '<html>Not Found</html>' }), () => T.transitHealth());
  check('  and not ok when the GraphQL API is off even though /otp/ answers', apiOff.ok === false, JSON.stringify(apiOff));

  const FL = require(path.join(__dirname, 'regions.js')).regionById('fl-southeast');
  process.env.OTP_URL_FL_SOUTHEAST = 'http://fl.otp:8080/';
  check('OTP_URL_<REGION> names the region\'s own planner over OTP_URL', T.otpUrl(FL) === 'http://fl.otp:8080', T.otpUrl(FL));
  f = standIn({ plan: PLAN_OK });
  await withFetch(f, () => T.planTransit({ from: FROM, to: TO }));
  check('  and the plan for a travel in that region goes there', planCall(f).url === 'http://fl.otp:8080/otp/gtfs/v1', planCall(f).url);
  delete process.env.OTP_URL_FL_SOUTHEAST;
  check('  without it, OTP_URL stands in for the region', T.otpUrl(FL) === 'http://otp.test:8080', T.otpUrl(FL));
  f = standIn({ plan: PLAN_OK });
  const far = await withFetch(f, () => T.planTransit({ from: { lat: 37.788, lng: -122.4075 }, to: TO }));
  check('a travel outside every region is none, and no planner is asked', far.status === 'none' && far.reason === 'outside_market' && f.calls.length === 0, JSON.stringify(far));
  check('the bus allow-list is read from the region\'s file', /transit-routes\.fl-southeast\.json$/.test(T.routesFileFor(FL)) && /transit-routes\.fl-southeast\.json$/.test(T.routesFileFor()), T.routesFileFor(FL));
  delete process.env.OTP_URL;
  check('OTP_URL defaults to localhost:8080', T.otpUrl() === 'http://localhost:8080');
  T._setBusRoutes(undefined);
  T._resetRailRoutes();

  let failed = 0;
  for (const r of R) { if (!r.ok) failed++; console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.l}${r.ok ? '' : '  <-- ' + (r.d || '')}`); }
  console.log(`\n${R.length - failed}/${R.length} passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error('FAIL  the test file itself threw:', e);
  process.exit(1);
});
