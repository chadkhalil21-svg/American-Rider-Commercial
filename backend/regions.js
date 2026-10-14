// Where American Rider operates: the registry of service regions.
//
// WHY THIS EXISTS (Chad, 9 Sept 2026): "think nationally — we start in Florida's tri-county
// area (Miami-Dade, Broward, Palm Beach), then Florida, then other states." Until this file
// the market was written into the code by hand in four places — a bounding box in market.js,
// the same box again in routes.js, the transit planner's address in transit.js and one
// county's fare table in smart.js — and opening the next region would have meant finding all
// four and hoping they were the only four. Now a region is one record here, and everything
// that depends on WHERE (the market gate, street routing, the transit planner, the bus
// allow-list, agency fares, government fees, the remittance calendar) reads it from the
// coordinates of the travel.
//
// A REGION IS
//   id        'fl-southeast'. Stable, lower-case, and the suffix of its environment variables:
//             OTP_URL_FL_SOUTHEAST, OSRM_URL_FL_SOUTHEAST.
//   bbox      the box a coordinate must fall inside to be served. A box rather than a polygon
//             on purpose: it is the same test market.js has always applied, it costs nothing,
//             and its edges fall on water or farmland where nobody is refused a travel that
//             could have been driven. Replace with a polygon when a region's edge is a city.
//   timezone  IANA name. The transit planner's OffsetDateTime and the monthly government-fee
//             remittance period both depend on it.
//   otpUrl    the OpenTripPlanner server that knows this region's streets and timetables:
//             OTP_URL_<ID>, then OTP_URL, then null. READ WHEN ASKED, NOT AT IMPORT — a value
//             set after startup (or by a test) must count, and a region with no planner must
//             say so rather than remember an old one.
//   osrmUrl   an OSRM server for street routing, same lookup. Without one, streets.js asks OTP.
//   transit.feeds     the GTFS feeds loaded into that OTP, by the feedId OTP prefixes onto
//             every identifier it returns ('MDT:31009'). fareCents is the configured base boarding fare; null means the fare is not known here (zone- or
//             date-priced) and smart.js reports that rather than inventing a number. freeModes
//             lists our leg modes that ride free on that feed. transferIncluded must be explicitly
//             true before Smart Travel assumes later boardings on that feed add no fare.
//   transit.frequentRoutesFile  the bus allow-list infra/otp/frequent-routes.mjs writes for
//             this region, relative to backend/. Without the file no bus is offered.
//
// ADDING A REGION is adding a record. The rest of the backend does not name a region anywhere.
//
// FARES, VERIFIED 9 SEPT 2026:
//   Miami-Dade Transit  $2.25 per boarding, Metrorail and Metrobus; Metromover and the MIA
//                       Mover are free (route_type 0, our mode 'tram').
//   Palm Tran           $2.00 "Single Trip" — palmtran.org/fares-passes, read on this date.
//   Broward County Transit  NOT CONFIRMED. broward.org/bct/fares renders its fare table by
//                       script and could not be read; the county fact-sheet PDF is gone (404).
//                       Search engines report $2.00 regular and $2.65 premium express, but a
//                       fare this app prints must come from the agency's own page. null until
//                       somebody reads it there — the leg is then reported as fareUnknown.
//   Tri-Rail, Brightline  zone- and date-priced respectively; never known here.
const clean = (v) => (typeof v === 'string' ? v.trim() : '');
const envSuffix = (id) => id.toUpperCase().replace(/[^A-Z0-9]+/g, '_');

/** Builds one region record; the two server addresses are live reads of the environment. */
function region(def) {
  // A REGION WITHOUT A JURISDICTION IS A REGION WE CANNOT LAWFULLY OPERATE IN. Thrown at
  // import rather than checked later: the failure is loud, immediate, and impossible to ship
  // past — which is the only kind of check that survives somebody in a hurry.
  if (!def.jurisdiction || !def.jurisdiction.state || !def.jurisdiction.disclosureStatute) {
    throw new Error(`Region ${def.id} has no jurisdiction record: whose TNC law applies there?`);
  }
  const suffix = envSuffix(def.id);
  const rec = {
    ...def,
    // A fully configured region includes its counties in the geographical
    // service catalogue by default. This is NOT paid-booking authorization.
    // An explicit list still supports deliberate geographic exclusions.
    activeMarketFips: Array.isArray(def.activeMarketFips)
      ? [...def.activeMarketFips]
      : (Array.isArray(def.marketFips) ? [...def.marketFips] : []),
    get otpUrl() {
      return clean(process.env[`OTP_URL_${suffix}`]) || clean(process.env.OTP_URL) || null;
    },
    get osrmUrl() {
      return clean(process.env[`OSRM_URL_${suffix}`]) || clean(process.env.OSRM_URL) || null;
    },
  };
  return Object.freeze(rec);
}

// ——— JURISDICTION: WHOSE LAW APPLIES, AND WHY IT IS A REGION FIELD ————————————————
//
// FOUND 20 SEPT 2026 BY SWEEPING FOR MARKET ASSUMPTIONS rather than by anybody reporting it.
// Seventeen strings in each of the five language catalogues name Florida or §627.748, and ten
// backend modules do — the insurance disclosure, the screening standard, the three-year
// re-check, the regulator an operator is told to verify a licence with, the words an operator
// reads out to an insurance agent.
//
// EVERY ONE OF THEM IS CORRECT TODAY AND WRONG THE DAY WE OPEN GEORGIA. And unlike a wrong
// destination list, which is an inconvenience, this is a legal failure in both directions: an
// operator in Georgia would be handed a disclosure citing a statute that does not govern them,
// and Georgia's own disclosure requirement would go unsatisfied. The §627.748(8)(a) gate at
// POST /operator/online would be enforcing the wrong state's rule against them.
//
// SO JURISDICTION IS A PROPERTY OF THE REGION, exactly as `timezone` already is, and for the
// same reason: it is a fact about WHERE, and the code that needs it should read it from the
// coordinates of the travel rather than know it.
//
// THE FIELD IS REQUIRED, AND regions.test.js FAILS WITHOUT IT. That is the point of adding it
// now rather than when the second state opens: a region cannot be added by copying this record
// and changing the box, because the copy would carry Florida's statute into another state
// silently. Adding a market now forces somebody to answer what that market's law requires.
//
// WHAT IS NOT YET DONE, stated so it is not mistaken for finished: the app's catalogues and
// the backend's disclosure text still contain Florida's words directly. Threading this record
// through them is the work; this is the record they will read. Until then, a second region
// must not be opened.
const REGIONS = Object.freeze([
  region({
    id: 'fl-southeast',
    name: 'South Florida',
    state: 'FL',
    counties: ['Miami-Dade', 'Broward', 'Palm Beach'],
    marketFips: ['12086', '12011', '12099'],
    activeMarketFips: ['12086', '12011', '12099'],
    geographyEvidence: { status: 'verified', authority: 'U.S. Census Bureau county boundaries' },
    tollPolicy: { status: 'verified', failClosed: true, nationalDiscovery: 'FHWA toll-facility inventory', liveAuthority: 'facility operator or HERE fallback' },
    // WHOSE LAW APPLIES HERE. See the note above REGIONS.
    jurisdiction: {
      state: 'Florida',
      stateCode: 'FL',
      tncStatute: 'Fla. Stat. §627.748',
      disclosureStatute: 'Fla. Stat. §627.748(8)(a)',
      // The body an operator can check an insurance agency's licence with.
      insuranceRegulator: 'Florida Department of Financial Services',
      // How long a background screening stands before it must be repeated, per §627.748(12).
      screeningYears: 3,
    },
    bbox: { latMin: 25.05, latMax: 26.98, lngMin: -80.95, lngMax: -79.95 },
    timezone: 'America/New_York',
    transit: {
      feeds: [
        { feedId: 'MDT', agency: 'Miami-Dade Transit', fareCents: 225, freeModes: ['tram'], transferIncluded: true },
        { feedId: 'BCT', agency: 'Broward County Transit', fareCents: null },
        { feedId: 'PALMTRAN', agency: 'Palm Tran', fareCents: 200 },
        { feedId: 'SFRTA', agency: 'Tri-Rail', fareCents: null },
        { feedId: 'BRIGHTLINE', agency: 'Brightline', fareCents: null },
      ],
      frequentRoutesFile: 'transit-routes.fl-southeast.json',
    },
  }),
]);

const isCoord = (p) =>
  !!p &&
  typeof p.lat === 'number' &&
  typeof p.lng === 'number' &&
  Number.isFinite(p.lat) &&
  Number.isFinite(p.lng) &&
  Math.abs(p.lat) <= 90 &&
  Math.abs(p.lng) <= 180;

/** Is the point inside the region's box? Malformed points are outside every region. */
function inRegion(r, p) {
  if (!r || !isCoord(p)) return false;
  const b = r.bbox;
  return p.lat >= b.latMin && p.lat <= b.latMax && p.lng >= b.lngMin && p.lng <= b.lngMax;
}

/** The region whose box contains the point, else null. */
function regionFor(p) {
  for (const r of REGIONS) if (inRegion(r, p)) return r;
  return null;
}

/** The region both ends of a travel fall in, else null: a travel between two regions is not served. */
function regionForTrip(pickup, dest) {
  const a = regionFor(pickup);
  if (!a) return null;
  return inRegion(a, dest) ? a : null;
}

/** A region by id, else null. */
function regionById(id) {
  return REGIONS.find((r) => r.id === id) || null;
}

/**
 * The region used where nothing about a request says which — a health line, an allow-list
 * read with no coordinates in hand. The first record. Never used to price or route a travel:
 * those read the region from their coordinates.
 */
function defaultRegion() {
  return REGIONS[0];
}

/** The registry as plain data for /health and the founders: no server addresses, only whether one is set. */
function listRegions() {
  return REGIONS.map((r) => ({
    id: r.id,
    name: r.name,
    state: r.state,
    counties: [...r.counties],
    timezone: r.timezone,
    // Whose law applies. Projected because /ops and /health list regions, and "which statute
    // governs this market" is exactly the sort of thing that should be readable rather than
    // reconstructed from somebody's memory of what was true when the market opened.
    jurisdiction: { ...r.jurisdiction },
    bbox: { ...r.bbox },
    otp: { configured: !!r.otpUrl },
    streets: r.osrmUrl ? 'osrm' : r.otpUrl ? 'otp' : 'none',
    transit: {
      feeds: r.transit.feeds.map((f) => ({ feedId: f.feedId, agency: f.agency, fareCents: f.fareCents, freeModes: [...(f.freeModes || [])], transferIncluded: f.transferIncluded === true })),
      frequentRoutesFile: r.transit.frequentRoutesFile,
    },
  }));
}

module.exports = { REGIONS, regionFor, regionForTrip, regionById, inRegion, defaultRegion, listRegions, isCoord, envSuffix };
