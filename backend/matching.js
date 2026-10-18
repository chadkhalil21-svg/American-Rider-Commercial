// American Rider — dispatch engine.
// Given a traveler's pickup and the class they want, find the nearest AVAILABLE operator
// who can serve that class. This is the heart of the rideshare.

// The version in force. Imported rather than passed in, deliberately: see disclosureStale.
const { DISCLOSURE_VERSION } = require('./disclosure');
const { coverageUnsafeForNewTravel, policyExpiryAt } = require('./insurance-horizon');

// Distance between two lat/lng points, in miles (haversine formula).
function distanceMiles(a, b) {
  const R = 3958.8, toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

// Rough pickup ETA from distance (city driving ~22 mph).
function etaMinutes(miles, mph = 22) { return Math.max(1, Math.round((miles / mph) * 60)); }

// Has this operator's required commercial policy run out? The Operator's qualifying coverage
// remains a mandatory dispatch gate. Separate TNC-maintained contingency coverage required by
// applicable law is not a substitute for an Operator satisfying that qualification gate.
//
// IT LIVES HERE BECAUSE IT WAS LIVING IN TWO PLACES AND CALLED IN THREE. scheduler.js
// defined it — under a comment saying it "mirrors dispatch.ts coverageLapsed()", which is
// how definitions drift apart — and monitor.js CALLED it without importing it. That call
// sits inside a `try { … } catch { continue }`, so the ReferenceError was swallowed: every
// unanswered travel that should have been re-offered to another operator was silently
// skipped instead, and the sweep reported itself healthy. Found 29 Aug 2026 by no-undef,
// the first time a linter had ever been run over this directory.
//
// No expiry on file is NOT lapsed: /operator/online refuses to put anybody on duty without
// one, so an operator record without the field predates the gate rather than evading it.
function coverageLapsed(o, now = Date.now()) {
  if (!o.insuranceExpiry) return false;
  const end = policyExpiryAt(o.insuranceExpiry);
  return end === null || end < now;
}

// Has the statutory insurance disclosure moved on since this operator agreed to it?
//
// Florida §627.748(8)(a) requires the disclosure in writing before an operator carries anyone.
// It was checked in exactly one place, POST /operator/online, which is the moment somebody
// goes on duty. That is the right place to ask, and it is not the only place it matters: an
// operator already on duty when the wording changes keeps receiving travel under the version
// they agreed to, for the rest of that shift, with no further check anywhere.
//
// That stopped being hypothetical on 19 Sept 2026, when the version moved to 2026-09-18.1 and
// deployed. It is the same failure `insuranceExpiry` above was lifted here to solve — a policy
// running out mid-shift — and it gets the same answer: the version an operator agreed to is
// stamped on the fleet record, and dispatch reads it.
//
// An operator with no recorded version is stale. Absence is not agreement.
function disclosureStale(o, current = DISCLOSURE_VERSION) {
  return o.disclosureVersion !== current;
}

// HOW LONG AN OPERATOR STAYS DISPATCHABLE WITHOUT SAYING ANYTHING.
//
// `available` is a flag written when somebody taps Go On Duty. It was never cleared by
// anything except tapping Go Off Duty, which a closed app, a flat battery and an uninstall
// all skip — so every operator who had EVER been on duty stayed in the fleet, at the last
// place they were seen, marked available, for good. Dispatch matches by distance, so the
// oldest phantom nearest the traveler beat the operator actually sitting at a kerb.
//
// Found 29 Aug 2026 on the first real booking: a traveler paid $19.44 and was told a car was
// coming that belonged to a record nobody was holding. The operator on duty two miles away
// was never offered it.
//
// FIVE MINUTES, matching monitor.js's STALE_MIN, because it is the same judgement: a phone we
// have not heard from in five minutes tells us nothing about now. The operator app renews
// every 90 seconds, so this tolerates two missed renewals.
//
// THE DIRECTION TO BE WRONG IN. Too short and a working operator misses a fare, which the
// re-offer sweep then hands to somebody else. Too long and a traveler pays for a car that
// does not exist. Those are not comparable, so this errs short.
//
// The mobile app now renews presence from the native background-location task on supported
// iOS/Android builds. This server cutoff remains authoritative: background execution is never
// assumed merely because a handset once said it was available.
const PRESENCE_STALE_MS = 5 * 60 * 1000;

/** Has this operator's phone said anything recently enough to be believed? */
function presenceStale(o, now = Date.now()) {
  const at = Number(o.onlineAt);
  // No timestamp at all is a record from before presence was tracked. It is not evidence that
  // anybody is there, and "we cannot tell" must not read as "yes" for the same reason it does
  // not for insurance.
  if (!Number.isFinite(at) || at <= 0) return true;
  return now - at > PRESENCE_STALE_MS;
}

// Match a request to the best operator:
//   1. must be AVAILABLE (online, not mid-trip)
//   2. must have checked in recently — a flag nobody clears is not presence
//   3. must not be blocked by screening — and once screening is live, must have PASSED one
//   4. must have commercial cover that has not lapsed
//   5. must have agreed to the disclosure in force, and have qualified at their last renewal
//   6. must offer the requested class (Standard = anyone; Pet/Accessible/etc = must opt in)
//   7. of those, the NEAREST one wins
//
// WHY RULE 2 LIVES HERE AND NOT ONLY IN THE FLAGS. `available` is written by the operator's
// own phone — going online is a toggle in their hand. recordDecision() sets available:false
// when a screening refuses somebody, but nothing stops the phone setting it straight back.
// Dispatch is the one chokepoint the operator does not control, so dispatch is where the
// gate is. (Found 27 Aug 2026: screeningCurrent() said "read at dispatch" and nothing ever
// read it — a refused operator could self-reinstate with one toggle.)
//
//   - screeningBlocked (set on refusal, and by the 3-year-expiry sweep) is ALWAYS fatal.
//   - requireScreening — passed by production callers as operationalMode, NOT screeningReady(),
//     so no absent/misconfigured provider URL can waive the background-check requirement.
//     It demands screeningCheckedAt, stamped only after an actual provider PASS. Separate
//     readiness checks block paid Travel until an approved screening process is commissioned.
//     Only non-production demonstrations may explicitly opt out of this requirement.
function matchOperator(operators, pickup, travelClass = 'Standard', { requireScreening = false, now = Date.now(), allowQueued = false, travelMinutes = null } = {}) {
  // Nearest eligible candidate needs one pass, not sorting every Operator.
  // In a dense market this avoids allocating filtered arrays and O(n log n)
  // sorting. Keep the original eligibility order and stable tie-breaking:
  // the first equally near eligible Operator retains first refusal.
  let best = null;
  let bestMiles = Infinity;
  for (const o of operators) {
    if (!o.available) continue;
    if (o.currentRideId && !(allowQueued && o.queueEligible === true && !o.nextRideId)) continue;
    if (presenceStale(o, now) || o.screeningBlocked) continue;
    if (requireScreening && !o.screeningCheckedAt) continue;
    if (coverageLapsed(o, now) || coverageUnsafeForNewTravel(o.insuranceExpiry, now, travelMinutes)) continue;
    if (disclosureStale(o)) continue;
    if (o.commissioned !== true || o.documentBlocked) continue;
    if (travelClass !== 'Standard' && !(o.classes || []).includes(travelClass)) continue;
    const miles = distanceMiles(pickup, o);
    // Do not let an invalid coordinate displace a known eligible real position.
    if (!Number.isFinite(miles)) continue;
    if (miles < bestMiles) {
      best = o;
      bestMiles = miles;
    }
  }
  if (!best) return null;
  return { operator: best, miles: +bestMiles.toFixed(2), etaMin: etaMinutes(bestMiles) };
}

module.exports = {
  distanceMiles, etaMinutes, matchOperator, coverageLapsed, presenceStale, disclosureStale,
  PRESENCE_STALE_MS,
};
