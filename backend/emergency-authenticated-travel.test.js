'use strict';
// Safety contract: a Travel and its monitored Emergency case belong to actual
// authenticated participants, not to whoever supplied a Travel number/plate.
// No 911 call, push delivery, provider email or real database connection.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { emergencyTravelContext, emergencyCaseEvidence } = require('./emergency-travel-context');

const RIDE = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);
const CASE = 'AR-C-' + 'A'.repeat(24);
const rides = new Map([[RIDE, {
  travelerUid: 'traveler-one', operatorId: 'operator-one', status: 'onboard',
  party: { teenUid: 'teen-one', guardianUid: 'guardian-one' },
  tripNo: 'AR-VERIFIED-100', dep: 'Pickup from record', dest: 'Destination from record',
  operatorName: 'Operator From Record', operatorCar: 'Car From Record',
  operatorPlate: 'PLATE-REAL',
  monitor: { state: 'emergency', caseNo: CASE },
}]]);
const tickets = new Map([[CASE, {
  uid: 'traveler-one', kind: 'emergency', trip: { no: 'AR-VERIFIED-100' },
  alertAcceptedAt: 12345,
}]]);
const db = { collection(name) {
  const data = name === 'rides' ? rides : tickets;
  return { doc(id) { return { async get() {
    return { exists: data.has(id), data: () => data.get(id) };
  } }; } };
} };
const read = (uid, rideId = RIDE) => emergencyTravelContext({ db, uid, rideId });

(async () => {
  const traveler = await read('traveler-one');
  const operator = await read('operator-one');
  assert.equal(traveler.tripNo, 'AR-VERIFIED-100');
  assert.equal(operator.role, 'operator');
  assert.equal(operator.vehicle, 'Car From Record');
  assert.equal(operator.plate, 'PLATE-REAL');
  assert.equal(operator.monitoredCase.caseNo, CASE);
  assert.equal(operator.monitoredCase.emailed, true);
  assert.equal((await read('teen-one')).rideId, RIDE);
  assert.equal((await read('guardian-one')).rideId, RIDE);
  assert.equal(await read('another-account'), null, 'ride ID alone grants no access');
  assert.equal(await read('operator-one', OTHER), null);
  assert.equal(await read('operator-one', '../bad'), null);
  assert.equal(await read('operator-one', ''), null);

  const evidence = emergencyCaseEvidence(operator);
  assert.equal(evidence.trip.no, 'AR-VERIFIED-100');
  assert.equal(evidence.operator, 'Operator From Record');
  assert.equal(evidence.plate, 'PLATE-REAL');
  assert.equal(evidence.trip.rideId, RIDE);
  assert.equal(emergencyCaseEvidence(null).trip, null,
    'unproven Travel must be filed as a general emergency');
  assert.equal(emergencyCaseEvidence(null).plate, null);

  tickets.set(CASE, { uid: 'different-traveler', kind: 'emergency',
    trip: { no: 'AR-VERIFIED-100' }, alertAcceptedAt: 1 });
  assert.equal((await read('operator-one')).monitoredCase, null,
    'never adopt somebody else\'s existing incident');
  tickets.set(CASE, { uid: 'traveler-one', kind: 'support',
    trip: { no: 'AR-VERIFIED-100' }, alertAcceptedAt: 1 });
  assert.equal((await read('traveler-one')).monitoredCase, null,
    'a support case is not an already reported emergency');

  tickets.set(CASE, { uid: 'traveler-one', kind: 'emergency', status: 'resolved',
    trip: { no: 'AR-VERIFIED-100' }, alertAcceptedAt: 1 });
  assert.equal((await read('operator-one')).monitoredCase, null,
    'a closed monitored Emergency cannot suppress a fresh urgent report');

  // Previous-trip pushes may refer to real cases, but never to a CURRENT car.
  tickets.set(CASE, { uid: 'traveler-one', kind: 'emergency', status: 'open',
    trip: { no: 'AR-VERIFIED-100' }, alertAcceptedAt: 12345 });
  rides.get(RIDE).status = 'completed';
  const oldTrip = await read('operator-one');
  assert.equal(oldTrip.active, false);
  assert.equal(oldTrip.tripNo, '');
  assert.equal(oldTrip.plate, '', 'never present a past plate as current');
  assert.equal(oldTrip.monitoredCase?.caseNo, CASE, 'reuse genuine unresolved case');
  rides.get(RIDE).monitor = { state: 'escalated', caseNo: CASE };
  assert.equal(await read('traveler-one'), null, 'old ordinary Travel cannot be verified as underway');
  rides.get(RIDE).monitor = { state: 'emergency', caseNo: CASE };
  rides.get(RIDE).status = 'onboard';

  const root = path.resolve(__dirname, '..');
  const source = x => fs.readFileSync(path.join(root, x), 'utf8');
  const server = source('backend/server.js');
  const screen = source('app/emergency.tsx');
  const push = source('src/boot/FullRoot.tsx');
  assert.match(server, /app\.get\('\/emergency\/context', requireAuth/);
  assert.match(server, /app\.post\('\/emergency', requireAuth/);
  assert.match(server, /emergencyTravelContext\(\{/);
  assert.match(server, /emergencyCaseEvidence\(context\)/);
  assert.match(server, /if \(context\?\.monitoredCase\)/,
    'existing route monitor cases cannot be duplicated on notification tap');
  assert.doesNotMatch(
    server.slice(server.indexOf("app.post('/emergency'"),
      server.indexOf("// --- Emergency: the vehicle has moved.")),
    /operator: String\(b\.operator|plate: String\(b\.plate|trip = b\.trip/,
    'backend must not accept unauthenticated phone-supplied Operator or Travel facts');
  assert(screen.includes('useOperator()') &&
    screen.includes('fetchEmergencyTravelContext(candidateRideId)'));
  assert(screen.includes('rideId: candidateRideId') && screen.includes('trip: null') &&
    screen.includes("const tripNo = currentVerified?.tripNo || ''"),
    'Emergency lookup hint is not unverified client Travel evidence');
  assert(push.includes("if (screen === '/emergency')") &&
    push.includes("pathname: '/emergency', params: { rideId }"),
    'cold-start emergency push preserves canonical Travel for both roles');
  const support = source('src/backend/support.ts');
  const ticketsSource = source('backend/tickets.js');
  assert(screen.includes('rideId: currentVerified?.rideId ?? null') &&
    screen.includes('[notify.state, notify.caseNo, currentVerified?.rideId]'),
    'a verified late-loading Operator Travel must refresh active GPS case updates');
  assert(support.includes('rideId?: string | null;') &&
    server.includes("rideId: typeof b.rideId === 'string' ? b.rideId : null"),
    'native GPS updates send a bounded untrusted hint to the server');
  assert(ticketsSource.includes("context.role !== 'operator'") &&
    ticketsSource.includes('context.monitoredCase?.caseNo !== String(caseNo)') &&
    ticketsSource.includes("['resolved', 'closed'].includes(existing.status)"),
    'Operator GPS requires the exact live monitored case and cannot reopen closed incidents');
  assert(ticketsSource.includes("'emergency.operatorLocation': position") &&
    ticketsSource.includes("'emergency.coords': position.coords"),
    'Operator and Traveler GPS must be stored separately, not overwritten');
  assert(screen.includes("Linking.openURL('tel:911')"),
    'Call 911 must remain immediately available');
  assert(!server.includes("Linking.openURL('tel:911')") &&
    !server.includes("dial911("),
    'server must never call emergency services automatically');

  console.log('PASS authenticated two-role Emergency facts, monitored case reuse, arbitrary ride denial, generic fallback and 911 choice');
})().catch(e => { console.error(e); process.exitCode = 1; });
