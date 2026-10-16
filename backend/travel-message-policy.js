'use strict';
// A sender must be the CURRENT Traveler, accepted Operator or authorized Teen guardian.
// No client-supplied participant identities or fake lost-item IDs confer permission.
async function authorizeTravelMessage({ db, ride, uid, lostItemId = null }) {
  const status = String(ride?.status || '');
  const who = String(uid || '');
  const side = who && who === String(ride?.travelerUid || '') ? 'traveler'
    : who && who === String(ride?.operatorId || '') ? 'operator'
    : ride?.party?.teen === true && who && who === String(ride?.party?.guardianUid || '')
      ? 'guardian' : null;
  if (!side) return { ok: false, status: 403, code: 'not_a_participant' };

  if (status === 'assigned' && side !== 'operator' ||
      ['accepted', 'arrived', 'onboard'].includes(status)) {
    if (lostItemId) return { ok: false, status: 409, code: 'lost_item_not_completed' };
    return { ok: true, from: side, lostItemId: null };
  }

  if (status !== 'completed' || !lostItemId || side === 'guardian') {
    return { ok: false, status: 409, code: 'thread_closed' };
  }
  const id = String(lostItemId).slice(0, 150);
  const snap = await db.collection('lost_items').doc(id).get();
  if (!snap.exists) return { ok: false, status: 409, code: 'unverified_lost_item' };
  const item = snap.data() || {};
  const candidateTrips = Array.isArray(item.candidateTripNos) ? item.candidateTripNos : [];
  if (String(item.travelerUid || '') !== String(ride.travelerUid || '') ||
      !(String(item.tripNo || '') === String(ride.tripNo || '') ||
        candidateTrips.includes(String(ride.tripNo || ''))) ||
      String(item.status || '') === 'returned') {
    return { ok: false, status: 409, code: 'unverified_lost_item' };
  }
  return { ok: true, from: side, lostItemId: id };
}
module.exports = { authorizeTravelMessage };
