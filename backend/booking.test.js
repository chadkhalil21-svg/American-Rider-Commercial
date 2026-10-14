const assert = require('node:assert/strict');
const { bookingId, prepareBooking, paymentMatches, assignPaidTravel } = require('./booking');
const { matchOperator } = require('./matching');
const { DISCLOSURE_VERSION } = require('./disclosure');

function store() {
  const data = new Map(); let tail = Promise.resolve();
  const db = {
    data,
    collection(name) { return { doc(id) { return { id, path: `${name}/${id}` }; } }; },
    runTransaction(fn) {
      const run = tail.then(() => fn({
        async get(ref) { return { exists: data.has(ref.path), data: () => structuredClone(data.get(ref.path)) }; },
        create(ref, value) { assert(!data.has(ref.path)); data.set(ref.path, structuredClone(value)); },
        update(ref, fields) { assert(data.has(ref.path)); data.set(ref.path, { ...data.get(ref.path), ...structuredClone(fields) }); },
      }));
      tail = run.catch(() => {});
      return run;
    },
  };
  return db;
}
const now = 2_000_000_000_000;
const quote = {
  tripNo: 'AR-1-MIA', pickupLat: 25.77, pickupLng: -80.19,
  travelClass: 'Standard', travelCostCents: 2000, costCents: 2350,
};
const operator = {
  id: 'operator-1', name: 'Operator One', available: true,
  lat: 25.77, lng: -80.19, onlineAt: now, commissioned: true,
  disclosureVersion: DISCLOSURE_VERSION, screeningCheckedAt: now, insuranceExpiry:'2099-01-01',
  classes: ['Standard'], car: 'Car', plate: 'Plate',
};
function provider(rideId, uid, amount = 2350) {
  return { id: `pi_${rideId}`, status: 'succeeded', currency: 'usd', amount_received: amount,
    metadata: { uid, rideId } };
}
async function main() {
  const closing=store();closing.data.set('account_closures/departing',{closingAt:now});
  const closingKey='closing-booking-key-0001';
  const denied=await prepareBooking({db:closing,uid:'departing',key:closingKey,fingerprint:'route',record:quote,now});
  assert.equal(denied.body.code,'account_closing');
  const closingId=bookingId('departing',closingKey);
  assert.equal(closing.data.has(`rides/${closingId}`),false,'no new chargeable booking after account closure begins');
  closing.data.set(`rides/${closingId}`,{...quote,status:'awaiting_assignment',travelerUid:'departing',paymentIntentId:`pi_${closingId}`});
  const blockedPaid=await assignPaidTravel({db:closing,uid:'departing',rideId:closingId,
    payment:provider(closingId,'departing'),candidate:null,now});
  assert.equal(blockedPaid.body.code,'account_closing');
  assert.equal(closing.data.get(`rides/${closingId}`).status,'awaiting_assignment');
  const db = store(); const key = 'booking-uuid-00000001';
  const first = await prepareBooking({ db, uid: 'traveler-1', key, fingerprint: 'route-a', record: quote, now });
  assert.equal(first.status, 201);
  const same = await prepareBooking({ db, uid: 'traveler-1', key, fingerprint: 'route-a', record: { ...quote, costCents: 999 }, now });
  assert.equal(same.status, 200); assert.equal(same.body.rideId, first.body.rideId);
  assert.equal(db.data.get(`rides/${first.body.rideId}`).costCents, 2350, 'retry must not reprice or overwrite');
  assert.equal((await prepareBooking({ db, uid: 'traveler-1', key, fingerprint: 'route-b', record: quote, now })).status, 409);
  assert.notEqual(bookingId('traveler-1', key), bookingId('traveler-2', key));
  const id = first.body.rideId;
  db.data.set(`rides/${id}`, { ...db.data.get(`rides/${id}`), paymentIntentId: `pi_${id}` });
  assert(!paymentMatches(db.data.get(`rides/${id}`), provider(id, 'attacker'), 'traveler-1', id));
  assert(!paymentMatches(db.data.get(`rides/${id}`), provider(id, 'traveler-1', 999), 'traveler-1', id));
  assert(!paymentMatches(db.data.get(`rides/${id}`), { ...provider(id, 'traveler-1'), status: 'processing' }, 'traveler-1', id));
  assert.equal((await assignPaidTravel({ db, uid: 'traveler-2', rideId: id, payment: provider(id, 'traveler-1'), candidate: null, now })).status, 403);
  assert.equal((await assignPaidTravel({ db, uid: 'traveler-1', rideId: id, payment: provider(id, 'attacker'), candidate: null, now })).status, 409);
  const noSupply = await assignPaidTravel({ db, uid: 'traveler-1', rideId: id, payment: provider(id, 'traveler-1'), candidate: null, now });
  assert.equal(noSupply.body.matched, null);
  assert.equal(db.data.get(`rides/${id}`).status, 'awaiting_assignment');
  db.data.set('operators/operator-1', operator);
  const second = await prepareBooking({ db, uid: 'traveler-2', key: 'booking-uuid-00000002', fingerprint: 'route-b', record: { ...quote, tripNo: 'AR-2-MIA' }, now });
  const secondId = second.body.rideId;
  db.data.set(`rides/${secondId}`, { ...db.data.get(`rides/${secondId}`), paymentIntentId: `pi_${secondId}` });
  const candidate = { operator, miles: 0, etaMin: 1 };
  const [a, b] = await Promise.all([
    assignPaidTravel({ db, uid: 'traveler-1', rideId: id, payment: provider(id, 'traveler-1'), candidate, now }),
    assignPaidTravel({ db, uid: 'traveler-2', rideId: secondId, payment: provider(secondId, 'traveler-2'), candidate, now }),
  ]);
  assert.equal(a.status, 200); assert.equal(a.body.matched.id, operator.id);
  assert.equal(b.status, 409); assert.equal(b.body.code, 'operator_unavailable');
  assert.equal(db.data.get('operators/operator-1').currentRideId, id);
  assert.equal(matchOperator([{ ...db.data.get('operators/operator-1'), id: operator.id }],
    { lat: quote.pickupLat, lng: quote.pickupLng }, 'Standard', { now }), null);
  assert.equal(db.data.get(`rides/${secondId}`).status, 'awaiting_payment');
  // Anticipatory capacity: one next Travel may be reserved only while the current passenger
  // is onboard and the Operator is approaching that destination.
  const qdb = store();
  const activeId = 'active-current';
  qdb.data.set(`rides/${activeId}`, { operatorId: operator.id, status: 'onboard',
    destinationLat: operator.lat, destinationLng: operator.lng });
  qdb.data.set('operators/operator-1', { ...operator, currentRideId: activeId });
  const q = await prepareBooking({ db: qdb, uid: 'traveler-q', key: 'booking-queue-00000001',
    fingerprint: 'route-q', record: quote, now });
  const qid=q.body.rideId;
  qdb.data.set(`rides/${qid}`, { ...qdb.data.get(`rides/${qid}`), paymentIntentId: `pi_${qid}` });
  const queued = await assignPaidTravel({ db:qdb, uid:'traveler-q', rideId:qid,
    payment:provider(qid,'traveler-q'), candidate:{operator:{...operator,currentRideId:activeId,queueEligible:true}}, now });
  assert.equal(queued.status,200);
  assert.equal(qdb.data.get('operators/operator-1').currentRideId,activeId,'current passenger remains authoritative');
  assert.equal(qdb.data.get('operators/operator-1').nextRideId,qid,'next Travel occupies a separate one-deep slot');
  assert.equal(qdb.data.get(`rides/${qid}`).queuedAfterRideId,activeId);
  const q2=await prepareBooking({db:qdb,uid:'traveler-q2',key:'booking-queue-00000002',
    fingerprint:'route-q2',record:quote,now});
  const q2id=q2.body.rideId;qdb.data.set(`rides/${q2id}`,{...qdb.data.get(`rides/${q2id}`),paymentIntentId:`pi_${q2id}`});
  const over=await assignPaidTravel({db:qdb,uid:'traveler-q2',rideId:q2id,payment:provider(q2id,'traveler-q2'),
    candidate:{operator:{...operator,currentRideId:activeId,queueEligible:true}},now});
  assert.equal(over.body.code,'operator_unavailable','queue depth is exactly one');
  const retry = await assignPaidTravel({ db, uid: 'traveler-1', rideId: id, payment: provider(id, 'traveler-1'), candidate, now });
  assert.equal(retry.status, 200); assert.equal(retry.body.reused, true);
  const secondOperator = { ...operator, id: 'operator-2', name: 'Operator Two' };
  db.data.set('operators/operator-2', secondOperator);
  db.data.set(`rides/${id}`, { ...db.data.get(`rides/${id}`), releasedAt: now + 1 });
  const reoffered = await assignPaidTravel({ db, uid: 'traveler-1', rideId: id,
    payment: provider(id, 'traveler-1'), candidate: { operator: secondOperator }, now: now + 2 });
  assert.equal(reoffered.status, 200);
  assert.equal(reoffered.body.rideId, id, 'same paid Travel on reoffer');
  assert.equal(reoffered.body.matched.id, secondOperator.id);
  assert.equal(db.data.get('operators/operator-1').currentRideId, null);
  assert.equal(db.data.get('operators/operator-2').currentRideId, id);
  assert.deepEqual(db.data.get(`rides/${id}`).declinedBy, [operator.id]);
  const teen = await prepareBooking({ db, uid: 'guardian', key:'teen-booking-uuid-0001',
    fingerprint:'teen-route', record:{...quote,party:{teen:true,familyLinkId:'family-1',guardianUid:'guardian',teenUid:'teen'}}, now });
  const teenId=teen.body.rideId;
  db.data.set(`rides/${teenId}`,{...db.data.get(`rides/${teenId}`),paymentIntentId:`pi_${teenId}`,
    teenPickup:{required:true,hash:'a'.repeat(64)}});
  db.data.set('family_links/family-1',{status:'active',guardianUid:'guardian',teenUid:'teen',
    teenDob:new Date(now-15*365*86400000).toISOString().slice(0,10)});
  const pendingTeen=await assignPaidTravel({db,uid:'guardian',rideId:teenId,
    payment:provider(teenId,'guardian'),candidate:null,now});
  assert.equal(pendingTeen.status,200);
  db.data.set('family_links/family-1',{...db.data.get('family_links/family-1'),status:'revoked'});
  const revokedTeen=await assignPaidTravel({db,uid:'guardian',rideId:teenId,
    payment:provider(teenId,'guardian'),candidate:null,now:now+1});
  assert.equal(revokedTeen.body.code,'family_authorization_revoked');
  assert.equal(db.data.get(`rides/${teenId}`).status,'awaiting_assignment');
  const previousMode = process.env.DEPLOYMENT_MODE;
  try {
    process.env.DEPLOYMENT_MODE = 'production';
    const live = store();
    const prepared = await prepareBooking({ db: live, uid: 'adult', key: 'market-test-key-0001', fingerprint: 'geometry', record: quote, now });
    const liveId = prepared.body.rideId;
    live.data.set(`rides/${liveId}`, { ...live.data.get(`rides/${liveId}`), paymentIntentId: `pi_${liveId}` });
    // A geographically active pickup is served without a county approval record.
    const { marketFor } = require('./markets');
    const market = marketFor({ lat: quote.pickupLat, lng: quote.pickupLng });
    assert.equal(market?.status, 'active');
    live.data.set('operators/operator-1', operator);
    live.data.set(`market_admission/${market.id}`, { status: 'paused' });
    const offered = await assignPaidTravel({ db: live, uid: 'adult', rideId: liveId,
      payment: provider(liveId, 'adult'), candidate: { operator }, now });
    assert.equal(offered.body.matched.id, operator.id,
      'a stale county approval must not block an otherwise valid paid Travel');
    const secondPaid = await prepareBooking({ db: live, uid: 'adult2',
      key: 'market-test-key-0002', fingerprint: 'geometry', record: quote, now });
    live.data.set(`rides/${secondPaid.body.rideId}`,
      { ...live.data.get(`rides/${secondPaid.body.rideId}`), paymentIntentId: `pi_${secondPaid.body.rideId}` });
    const unassigned = await assignPaidTravel({ db: live, uid: 'adult2',
      rideId: secondPaid.body.rideId, payment: provider(secondPaid.body.rideId, 'adult2'),
      candidate: null, now });
    assert.equal(unassigned.status, 200);
    const third = await prepareBooking({ db: live, uid: 'adult3',
      key: 'market-test-key-0003', fingerprint: 'outside',
      record: { ...quote, pickupLat: 28.5383, pickupLng: -81.3792 }, now });
    live.data.set(`rides/${third.body.rideId}`,
      { ...live.data.get(`rides/${third.body.rideId}`), paymentIntentId: `pi_${third.body.rideId}` });
    const outside = await assignPaidTravel({ db: live, uid: 'adult3',
      rideId: third.body.rideId, payment: provider(third.body.rideId, 'adult3'),
      candidate: null, now });
    assert.equal(outside.body.code, 'outside_market', 'unserved pickup is still refused');
  } finally {
    if (previousMode === undefined) delete process.env.DEPLOYMENT_MODE;
    else process.env.DEPLOYMENT_MODE = previousMode;
  }
  console.log('PASS canonical paid booking, ownership, amount, idempotency and one-Operator capacity');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
