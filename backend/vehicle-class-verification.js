'use strict';
// Special-vehicle service promises are *reviewer decisions*, never a class name
// sent by an Operator's phone or a guess from make/model text. Admin-written
// users/{uid}.vehicleClassApproval is not editable by mobile Firestore rules.
const SPECIAL = Object.freeze(['Large Vehicle', 'Pet Friendly']);
const normalize = value => String(value || '').replace(/[^a-z0-9]/gi, '').toUpperCase();

function verifiedOperatorClasses(profile, vehicle, now = Date.now()) {
  const base = ['Standard'];
  const evidence = profile?.vehicleClassApproval;
  if (!evidence || evidence.status !== 'approved' ||
      !Number.isSafeInteger(evidence.verifiedAt) || evidence.verifiedAt <= 0 || evidence.verifiedAt > now ||
      !Number.isSafeInteger(evidence.validUntil) || evidence.validUntil <= now ||
      !String(evidence.reviewedBy || '').trim() ||
      !normalize(vehicle?.plate) || !normalize(vehicle?.car) ||
      normalize(evidence.plate) !== normalize(vehicle.plate) ||
      normalize(evidence.car) !== normalize(vehicle.car) ||
      !Array.isArray(evidence.classes)) return base;
  // Approval must attest to the exact passenger promise, not only a category.
  // Six passenger seats EXCLUDE the Operator and each needs its own seat belt.
  return base.concat(SPECIAL.filter(c => {
    if (!evidence.classes.includes(c)) return false;
    if (c === 'Large Vehicle') return evidence.verifiedSeatConfiguration === true &&
      Number.isSafeInteger(evidence.passengerSeats) && evidence.passengerSeats >= 6 &&
      Number.isSafeInteger(evidence.passengerSeatBelts) && evidence.passengerSeatBelts >= 6;
    if (c === 'Pet Friendly') return evidence.petAcceptanceVerified === true;
    return false;
  }));
}
module.exports = { verifiedOperatorClasses };
