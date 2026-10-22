// Place discovery is not authorization to transport: recommendations and national search
// may surface a venue, but a fare and dispatch must still pass the server's facility gate.
const fs = require('node:fs');
const path = require('node:path');
const { GOVERNMENT_FEES, RESTRICTED_PLACES, permitRequired, permitRequiredMessage } = require('./fees');
const { destinationsNear } = require('./places');

const results = [];
const check = (label, ok, detail) => results.push({ label, ok: !!ok, detail });
const source = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const serverRestricted = [
  ...GOVERNMENT_FEES.filter((f) => f.permitted !== true),
  ...RESTRICTED_PLACES,
];
check('the server restricts at least the three known unpermitted facilities',
  serverRestricted.length >= 3, `${serverRestricted.length}`);

// Actual displayed nearby recommendations are returned by the server, which filters by
// permitRequired. A removed compiled-in PLACES list cannot certify the new autocomplete.
const probes = [
  { lat: 25.7689, lng: -80.1935 },
  { lat: 26.1224, lng: -80.1431 },
  { lat: 26.7153, lng: -80.0534 },
];
const offered = probes.flatMap((point) => destinationsNear(point, 40).destinations
  .map((destination) => ({ point, destination })));
check('nearby recommendations remain populated in operating counties', offered.length > 10,
  `${offered.length} recommendations`);
check('no nearby recommendation bypasses the facility gate',
  offered.every(({ point, destination }) =>
    !permitRequired(point, { lat: destination.lat, lng: destination.lng })));

const appSrc = source('src/data.ts');
check('the app keeps no stale compiled-in bookable destination list',
  !/export const BOOKABLE_PLACES|export const PLACES/.test(appSrc));
for (const f of ['index.tsx', 'reserve.tsx']) {
  const screen = source(`app/${f}`);
  check(`${f} asks the server for nearby suggestions`,
    /destinationsNear/.test(screen) && !/BOOKABLE_PLACES/.test(screen));
}
check('national autocomplete remains discovery, not a permit exemption',
  source('app/reserve.tsx').includes('searchPlaces(') &&
  source('backend/fareauthority.js').includes('permitRequired(body?.pickup, body?.dest)') &&
  source('backend/server.js').includes("app.post('/travel/dispatch'"));

const fll = { lat: 26.0742, lng: -80.1506 };
check('Fort Lauderdale airport pickup restricted but drop-off allowed',
  permitRequired(fll, null)?.end === 'pickup' &&
  permitRequired(null, fll) === null);
check('pickup refusal names the correct county facility',
  /Fort Lauderdale/.test(permitRequiredMessage(permitRequired(fll, null))));
for (const [label, point] of [
  ['MIA', { lat: 25.795, lng: -80.29 }],
  ['PortMiami', { lat: 25.774, lng: -80.166 }],
  ['FLL', fll],
]) {
  check(`${label}: paid travel may arrive but not originate`,
    permitRequired(null, point) === null && permitRequired(point, null)?.end === 'pickup');
}
check('restricted places identify their authority',
  RESTRICTED_PLACES.every((p) => typeof p.authority === 'string' && p.authority.length > 0));

for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.label}${r.ok || !r.detail ? '' : ` — ${r.detail}`}`);
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\n${failed.length} FAILED of ${results.length}` : `\nall ${results.length} passed`);
process.exit(failed.length ? 1 : 0);
