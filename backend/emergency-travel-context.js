'use strict';

/**
 * Emergency Travel identity is server evidence, not client-supplied metadata.
 * Any signed-in person can request emergency help, but a Travel number,
 * Operator name and vehicle/plate are shown or filed only when the authenticated
 * person belongs to that exact canonical Travel. Never return financial secrets.
 */
const RIDE_ID = /^[a-f0-9]{40}$/;

async function emergencyTravelContext({ db, uid, rideId }) {
  if (!db || !uid || typeof rideId !== 'string' || !RIDE_ID.test(rideId))
    return null;
  const snapshot = await db.collection('rides').doc(rideId).get();
  if (!snapshot.exists) return null;
  const r = snapshot.data() || {};
  const who = String(uid);
  const member = [
    r.travelerUid,
    r.operatorId,
    r.party?.teenUid,
    r.party?.guardianUid,
  ].some(v => typeof v === 'string' && v.length > 0 && v === who);
  if (!member) return null;

  const text = (v, max = 100) => typeof v === 'string' ? v.slice(0, max) : '';
  const context = {
    rideId,
    tripNo: text(r.tripNo, 80),
    dep: text(r.dep, 150),
    dest: text(r.dest, 150),
    operator: text(r.operatorName, 120),
    vehicle: text(r.operatorCar, 120),
    plate: text(r.operatorPlate, 32),
    role: r.operatorId === who ? 'operator' : 'traveler',
    // Does not attest actual 911 or handset delivery.
    monitoredCase: null,
  };
  const m = r.monitor;
  if (m?.state === 'emergency' && typeof m.caseNo === 'string' &&
      /^AR-C-[A-Z0-9-]{8,80}$/.test(m.caseNo)) {
    // Never trust a case reference merely because someone wrote it onto a ride.
    // Validate the ticket is the emergency case filed for this Traveler/Travel.
    const ticketSnap = await db.collection('support_tickets').doc(m.caseNo).get();
    const ticket = ticketSnap.exists ? ticketSnap.data() || {} : {};
    if (ticketSnap.exists && ticket.kind === 'emergency' &&
        ticket.uid === r.travelerUid &&
        ticket.trip?.no === r.tripNo) {
      context.monitoredCase = {
        caseNo: m.caseNo,
        stored: true,
        emailed: !!ticket.alertAcceptedAt,
      };
    }
  }
  return context;
}

function emergencyCaseEvidence(context) {
  return {
    trip: context ? {
      no: context.tripNo || null,
      dep: context.dep || null,
      arr: context.dest || null,
      rideId: context.rideId,
    } : null,
    operator: context?.operator || null,
    vehicle: context?.vehicle || null,
    plate: context?.plate || null,
  };
}

module.exports = { emergencyTravelContext, emergencyCaseEvidence, RIDE_ID };
