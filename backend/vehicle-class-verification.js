'use strict';
// Special-vehicle service promises are *reviewer decisions*, never a class name
// sent by an Operator's phone or a guess from make/model text. Admin-written
// users/{uid}.vehicleClassApproval is not editable by mobile Firestore rules.
const SPECIAL = Object.freeze(['Large Vehicle', 'Pet Friendly']);
const normalize = value => String(value || '').replace(/[^a-z0-9]/gi, '').toUpperCase();

function verifiedOperatorClasses(profile, vehicle) {
  const base = ['Standard'];
  const evidence = profile?.vehicleClassApproval;
  if (!evidence || evidence.status !== 'approved' ||
      !Number.isSafeInteger(evidence.verifiedAt) || evidence.verifiedAt <= 0 ||
      !String(evidence.reviewedBy || '').trim() ||
      !normalize(vehicle?.plate) || !normalize(vehicle?.car) ||
      normalize(evidence.plate) !== normalize(vehicle.plate) ||
      normalize(evidence.car) !== normalize(vehicle.car) ||
      !Array.isArray(evidence.classes)) return base;
  return base.concat(SPECIAL.filter(c => evidence.classes.includes(c)));
}
module.exports = { verifiedOperatorClasses };
