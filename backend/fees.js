// Government per-travel fees: what a public body charges for a pickup or a drop-off at a
// place it controls, collected from the traveler and held for remittance to that body.
//
// NEITHER FARE NOR PLATFORM FEE. The operator does not drive it (so the 99% is not computed on
// it) and American Rider does not keep it (so it is not platform take). payments.quote()
// carries it as passThroughCents; remittance.js sums what is owed to each payee for a month.
// docs/ECONOMICS-AND-INFRASTRUCTURE.md §"Three things the fare does not yet contain" is the
// founders' record of why this exists.
//
// GEOFENCED, NATIONAL BY DESIGN. A fee is a record: where it applies (a box), to which end of
// the travel, how much, who is paid, and the instrument that levies it. The boxes are the OSM
// bounding boxes of the places themselves (Nominatim, read 9 Sept 2026):
//   Miami International Airport   way 113657169 (aeroway=aerodrome)
//                                 lat 25.7829672–25.8081141, lng −80.3190281 – −80.2647351
//   PortMiami / Dodge Island      relation 2168371 (landuse=industrial "Port of Miami"; the
//                                 island, relation 2168370, has the identical box)
//                                 lat 25.7660505–25.7812829, lng −80.1818587 – −80.1450031
// A BOX, NOT THE POLYGON, and that has an edge: the port's box reaches the southern tip of
// Star Island, the airport's the west kerb of LeJeune Road. Both err towards charging a fee
// at a place that is not quite the place. When that matters, store the relation's polygon
// here and test against it; nothing outside this file changes.
//
// The registry is data. Adding a fee is adding a record; nothing else names a fee.
const { regionById, isCoord } = require('./regions');

const GOVERNMENT_FEES = Object.freeze([
  Object.freeze({
    id: 'mia-tnc-pickup',
    name: 'Miami International Airport fee',
    payee: 'Miami-Dade Aviation Department',
    cents: 200,
    applies: 'pickup',
    bbox: { latMin: 25.7829672, latMax: 25.8081141, lngMin: -80.3190281, lngMax: -80.2647351 },
    // No MDAD permit held. See permitRequired() above.
    permitted: false,
    source: 'MDAD Operational Directive 18-03, Exhibit F (8 Dec 2025)',
    osm: 'way/113657169',
    region: 'fl-southeast',
  }),
  Object.freeze({
    id: 'portmiami-tnc-pickup',
    name: 'PortMiami fee',
    payee: 'Miami-Dade Seaport Department',
    cents: 200,
    applies: 'pickup',
    bbox: { latMin: 25.7660505, latMax: 25.7812829, lngMin: -80.1818587, lngMax: -80.1450031 },
    // No PortMiami permit held. See permitRequired() above.
    permitted: false,
    source: 'PortMiami Terminal Tariff No. 010 (1 Oct 2025)',
    osm: 'relation/2168371',
    region: 'fl-southeast',
  }),
]);

// ——— PLACES WE ARE NOT PERMITTED AT, WHERE WE DO NOT EVEN KNOW THE FEE ————————————
//
// FOUND 20 SEPT 2026, TOURING THE APP AS A TRAVELER. The permit gate built this morning reads
// the FEE registry, so it covered exactly the two places we had troubled to price: MIA and
// PortMiami. Fort Lauderdale–Hollywood International was on the traveler's home screen as a
// bookable destination the whole time, and it was NOT refused — because it has no fee record.
//
// THAT IS THE WORSE OF THE TWO FAULTS. A place we decline is a disappointed traveler. A place
// we accept and cannot lawfully serve is an operator sent to an airport without a permit, on
// our instruction, to collect somebody we have taken money from.
//
// BROWARD IS NOT MIAMI-DADE. FLL is a different county, a different authority and a different
// permit; MDAD's directive says nothing about it. We do not hold that permit either, and we do
// not know its fee — so it goes here rather than in the fee registry, which is for money we
// can actually quote. A place may be restricted without us knowing what it would cost.
//
// THE RULE THIS ENCODES, and it is the one to carry into every new market: AN AIRPORT OR
// SEAPORT IS RESTRICTED UNTIL SOMEBODY HAS THE PAPER. Not "unless we find a rule against it" —
// the default for a place run by a public authority with its own ground-transportation regime
// is that we may not work there yet.
const RESTRICTED_PLACES = Object.freeze([
  Object.freeze({
    id: 'fll-airport',
    name: 'Fort Lauderdale–Hollywood International Airport',
    authority: 'Broward County Aviation Department',
    // OSM way 22693177 (aeroway=aerodrome), read 20 Sept 2026.
    bbox: { latMin: 26.0554, latMax: 26.0873, lngMin: -80.1729, lngMax: -80.1297 },
    reason: 'No Broward County Aviation Department TNC permit held.',
  }),
]);

const inBox = (b, p) =>
  isCoord(p) && p.lat >= b.latMin && p.lat <= b.latMax && p.lng >= b.lngMin && p.lng <= b.lngMax;

/**
 * The government fees a travel incurs, one line per fee per end it applies to:
 *   [{ id, name, payee, cents, end: 'pickup' | 'dropoff' }]
 * Either end may be missing (a reservation knows its pickup and only the name of its
 * destination); a missing end matches no box. `registry` is for tests.
 */
function governmentFeesFor(pickup, dest, registry = GOVERNMENT_FEES) {
  const lines = [];
  for (const fee of registry) {
    const atPickup = (fee.applies === 'pickup' || fee.applies === 'both') && inBox(fee.bbox, pickup);
    const atDropoff = (fee.applies === 'dropoff' || fee.applies === 'both') && inBox(fee.bbox, dest);
    if (atPickup) lines.push({ id: fee.id, name: fee.name, payee: fee.payee, cents: fee.cents, end: 'pickup' });
    if (atDropoff) lines.push({ id: fee.id, name: fee.name, payee: fee.payee, cents: fee.cents, end: 'dropoff' });
  }
  return lines;
}

/** The total, in cents, of governmentFeesFor(). */
function governmentFeeCents(pickup, dest, registry = GOVERNMENT_FEES) {
  return governmentFeesFor(pickup, dest, registry).reduce((s, l) => s + l.cents, 0);
}

// ——— PERMITTED PLACES, AND WHY WE DECLINE THE BUSIEST DESTINATION IN THE MARKET ————
//
// Chad, 20 Sept 2026: "sequence all MIA/PortMiami activity, including drop-offs, as a
// deliberate post-pilot phase. Launch without airport service, prove the core model works."
//
// IT IS NOT ONLY A SEQUENCING PREFERENCE, IT IS THE HONEST ANSWER. Both bodies require a
// permit before a transportation network company may pick up on their property — a three-week
// process with a $1,000 fee and an active LLC as a prerequisite. Without it:
//
//   our operators may not lawfully collect a traveler there, and
//   we would quote a $2.00 fee we have no account to remit it to.
//
// Quoting a government fee to a traveler and then keeping it because nobody has set up the
// remittance is the worst version of this, and it is what happens by default if the fee
// registry is live and the permit is not.
//
// HISTORICAL POLICY (superseded 22 October 2026): A PLACE WAS DECLINED AT BOTH ENDS. Chad included drop-offs deliberately, and the fee schedule
// is the reason the question arises at all: MIA's Exhibit F charges $2.00 to pick up and
// $0.00 to drop off, so a drop-off costs nothing and looks harmless. The permit is not a fee
// waiver — it is permission to operate on the property, and an operator who drops off without
// one is still on that property without one.
//
// TURNING IT ON IS ONE FIELD. Set `permitted: true` on the record when the permit is issued
// and the place becomes bookable at both ends, with its fee already correct. Nothing else
// changes, which is the point: the fee arithmetic has been built and tested since 9 September
// and is waiting rather than being written under time pressure on the day the permit arrives.
const permittedAt = (fee) => fee.permitted === true;

/**
 * Whether this travel originates at a pickup-restricted facility. Drop-offs are not blocked by pickup-only facility rules.
 * Returns { id, name, end } for the first such place, else null.
 */
function permitRequired(pickup, dest, registry = GOVERNMENT_FEES, restricted = RESTRICTED_PLACES) {
  for (const fee of registry) {
    if (permittedAt(fee)) continue;
    if (inBox(fee.bbox, pickup)) return { id: fee.id, name: fee.name, end: 'pickup' };
    // Founder-authorized drop-off-only service: a pickup permit does not block arrival.
  }
  // And the places we are not permitted at whose fee we cannot even quote. Checked second
  // only because the priced ones are the commoner case, not because they matter less.
  for (const place of restricted) {
    if (inBox(place.bbox, pickup)) return { id: place.id, name: place.name, end: 'pickup' };
    // Restricted-facility pickup remains blocked; drop-offs use normal service geography.
  }
  return null;
}

/** What to tell a traveler who chose a place we cannot serve yet. Never an apology. */
function permitRequiredMessage(blocked) {
  const place = blocked && blocked.name ? blocked.name.replace(/ fee$/, '') : 'that location';
  return blocked && blocked.end === 'pickup'
    ? `American Rider does not collect travelers at ${place} yet.`
    : `American Rider does not travel to ${place} yet.`;
}

/** A fee record by id, else null. */
function feeById(id) {
  return GOVERNMENT_FEES.find((f) => f.id === id) || null;
}

/** The fees levied inside one region. */
function feesForRegion(regionId) {
  return GOVERNMENT_FEES.filter((f) => f.region === regionId);
}

/** Every fee's region must exist: a fee nobody can reach is a record that will never be remitted. */
function registryProblems(registry = GOVERNMENT_FEES) {
  const problems = [];
  const seen = new Set();
  for (const f of registry) {
    if (seen.has(f.id)) problems.push(`duplicate fee id ${f.id}`);
    seen.add(f.id);
    if (!regionById(f.region)) problems.push(`${f.id}: unknown region ${f.region}`);
    if (!Number.isInteger(f.cents) || f.cents <= 0) problems.push(`${f.id}: cents must be a positive whole number`);
    if (!['pickup', 'dropoff', 'both'].includes(f.applies)) problems.push(`${f.id}: applies must be pickup, dropoff or both`);
    if (!f.source) problems.push(`${f.id}: no source`);
  }
  return problems;
}

module.exports = {
  permitRequired,
  permitRequiredMessage, RESTRICTED_PLACES, GOVERNMENT_FEES, governmentFeesFor, governmentFeeCents, feeById, feesForRegion, registryProblems };
