'use strict';
// One continuous, deterministic synthetic Traveler + Operator lifecycle using REAL
// backend eligibility, Travel progression, qualification and service-geography code.
// No live Stripe, Firebase, Resend, CRA, insurance or device access; no real money.
// Artificial provider answers must never be described as production attestations.
const assert = require('node:assert/strict');
const { acceptOffer } = require('./eligibility');
const { progressTravel } = require('./travelprogress');
const { travelerCode, verifyOperatorCode } = require('./adultpickup');
const { settleTravel, cancelTravel } = require('./travelmoney');
const { initialMonitoringFromDocument, applyIndependentConfirmation } = require('./insurance-monitoring');
const { DISCLOSURE_VERSION } = require('./disclosure');
const { readinessForRoute } = require('./booking-readiness');
const { markets, marketFor, servesPoint } = require('./markets');
const { regionById } = require('./regions');

const NOW = Date.parse('2026-10-11T04:00:00.000Z');
const PICKUP = { lat: 25.7617, lng: -80.1918 };
const DEST = { lat: 25.7907, lng: -80.1300 };
const clone = x => structuredClone(x);
let assertions = 0;
function check(condition, message) { assertions++; assert.ok(condition, message); }

// A serialized transaction, with the entire read/write unit committed only when
// the simulated transaction succeeds. Concurrent accepts operate on one state.
function memoryDb(initial) {
  const data = clone(initial);
  let lock = Promise.resolve();
  let writes = 0;
  const ref = (collection, id) => ({ collection, id: String(id),
    get: async () => snapshot({collection,id:String(id)}),
    set: async (fields,options={}) => {
      if (!data[collection]) data[collection]={};
      data[collection][String(id)] = options.merge
        ? {...data[collection][String(id)],...clone(fields)} : clone(fields);
      writes++;
    },
  });
  const snapshot = r => {
    const value = data[r.collection]?.[r.id];
    return { exists: value !== undefined, data: () => clone(value) };
  };
  const db = {
    collection: name => ({ doc: id => ref(name, id) }),
    runTransaction(fn) {
      const operation = lock.then(async () => {
        const pending = [];
        const tx = {
          get: async r => snapshot(r),
          update(r, change) {
            pending.push(() => {
              check(data[r.collection]?.[r.id] !== undefined, 'update target must exist');
              Object.assign(data[r.collection][r.id], clone(change));
              writes++;
            });
          },
          set(r, change, options = {}) {
            pending.push(() => {
              if (!data[r.collection]) data[r.collection] = {};
              data[r.collection][r.id] = options.merge
                ? { ...(data[r.collection][r.id] || {}), ...clone(change) } : clone(change);
              writes++;
            });
          },
        };
        const result = await fn(tx);
        for (const operation of pending) operation();
        return result;
      });
      lock = operation.catch(() => {});
      return operation;
    },
  };
  return { db, data, getWrites: () => writes };
}

const limits = (pp, incident, property, csl) => ({
  bodilyInjuryPerPerson: pp, bodilyInjuryPerIncident: incident,
  propertyDamage: property, combinedSingleLimit: csl,
});
const doc = (fields = {}) => ({
  verdict: 'accept', expiry: '2099-01-01',
  evidence: { isTheRequestedDocument: true, legible: true,
    fields: { expiry: '2099-01-01', ...fields } },
});
function operatorUser() {
  const ins = doc({ commercialUse: 'yes', limits: '$1,000,000 CSL' });
  ins.evidence.insurance = {
    namedInsureds: ['Ana Operator'], listedDrivers: [], effectiveDate: '2026-01-01',
    expirationDate: '2099-01-01',
    vehicles: [{ description: 'car', vin: '', plate: 'KTR 4821' }],
    useStatements: [], tncEndorsement: 'yes', forHireUse: 'not_shown',
    loggedOnLimits: limits('$50,000', '$100,000', '$25,000', ''),
    rideLimits: limits('', '', '', '$1,000,000'),
    generalLimits: limits('', '', '', ''),
    pip: { shown: 'yes', amount: '$10,000' },
    uninsuredMotorist: { shown: 'yes', amount: '' },
  };
  const monitored = initialMonitoringFromDocument(ins, NOW);
  return {
    name: 'Ana Operator',
    operatingMarket: { id: 'fl-miami-dade' },
    documents: {
      license: doc(),
      registration: doc({ plate: 'KTR4821' }),
      insurance: ins,
    },
    screening: { decision: 'pass', recheckDue: NOW + 1e10 },
    insuranceDisclosure: { version: DISCLOSURE_VERSION, at: NOW - 1000 },
    insuranceMonitoring: applyIndependentConfirmation(monitored, {
      status: 'verified_active', source: 'synthetic_insurer_fixture', now: NOW,
    }),
  };
}
function initialData({ teen = false } = {}) {
  return {
    users: { op: operatorUser() },
    operators: { op: {
      available: true, onlineAt: NOW, commissioned: true,
      disclosureVersion: DISCLOSURE_VERSION, insuranceExpiry: '2099-01-01',
      currentRideId: 'ride1', lat: PICKUP.lat, lng: PICKUP.lng,
    } },
    rides: { ride1: {
      operatorId: 'op', travelerUid: 'traveler', tripNo: 'AR-SYN-001',
      status: 'assigned', costCents: 1825, paymentIntentId: 'pi_synthetic_does_not_exist',
      bookingFingerprint: 'fixture-booking', createdAt: NOW - 5000,
      pickupLat: PICKUP.lat, pickupLng: PICKUP.lng,
      destinationLat: DEST.lat, destinationLng: DEST.lng,
      ...(teen ? { party: { teen: true }, teenPickup: { required: true, verifiedAt: null } } : {}),
    } },
  };
}
const payment = () => ({
  id: 'pi_synthetic_does_not_exist', status: 'succeeded', currency: 'usd',
  amount_received: 1825, metadata: { uid: 'traveler', rideId: 'ride1' },
});
const externals = () => ({
  account: { disabled: false }, payouts: { enabled: true }, payment: payment(),
});
const accept = (db, overrides = {}) => acceptOffer({
  db, uid: 'op', rideId: 'ride1', liveMoney: true,
  externals: externals(), now: () => NOW, ...overrides,
});
const progress = (db, status, timestamp = NOW, uid = 'op') =>
  progressTravel({ db, uid, rideId: 'ride1', status, now: timestamp });

async function continuousJourney(teen, protectedAdult = false) {
  const simulation = memoryDb(initialData({ teen }));
  const { db, data } = simulation;
  if (protectedAdult) check(data.rides.ride1.adultPickup === undefined,
    'synthetic adult pickup begins without client-created verification');

  // A wrong party cannot accept a reserved paid Travel.
  let out = await accept(db, { uid: 'intruder' });
  check(out.status === 409, 'wrong Operator cannot accept');
  check(data.rides.ride1.status === 'assigned', 'wrong Operator must not modify Travel');

  // A forged Stripe receipt with the wrong amount may not authorize pickup.
  out = await accept(db, { externals: { ...externals(), payment: {
    ...payment(), amount_received: 1824,
  } } });
  check(out.status === 409 && out.body.code === 'payment_unconfirmed',
    'amount mismatch must not be treated as a paid Travel');
  check(data.rides.ride1.status === 'assigned', 'mismatched receipt must leave state unchanged');

  // Concurrency, a dropped response, and repeated taps must not double-book.
  const [a, b] = await Promise.all([accept(db), accept(db)]);
  check(a.status === 200 && b.status === 200, 'concurrent eligible accepts must resolve consistently');
  check(a.body.reused !== b.body.reused, 'exactly one acceptance must be first');
  check(data.rides.ride1.status === 'accepted' && data.rides.ride1.acceptedAt === NOW,
    'one durable accepted transition');
  const acceptedWrites = simulation.getWrites();
  out = await accept(db);
  check(out.body.reused === true && simulation.getWrites() === acceptedWrites,
    'retry after lost response must not write again');

  // A provider restriction blocks replay even after a past acceptance.
  out = await accept(db, { externals: { ...externals(), payouts: { enabled: false } } });
  check(out.status === 409, 'payout restriction must not return reused success');

  out = await progress(db, 'completed');
  check(out.status === 409 && data.rides.ride1.status === 'accepted',
    'no accepted-to-completed shortcut');
  out = await progress(db, 'arrived', NOW, 'intruder');
  check(out.status === 403, 'other Operator cannot announce arrival');

  data.operators.op.lat = DEST.lat;
  data.operators.op.lng = DEST.lng;
  out = await progress(db, 'arrived');
  check(out.body.code === 'outside_transition_radius', 'destination cannot stand in for pickup');

  data.operators.op.lat = PICKUP.lat;
  data.operators.op.lng = PICKUP.lng;
  out = await progress(db, 'arrived', NOW + 6 * 60 * 1000);
  check(out.body.code === 'position_stale', 'stale GPS cannot establish arrival');
  out = await progress(db, 'arrived', NOW);
  check(out.status === 200 && data.rides.ride1.status === 'arrived', 'arrival commits');

  if (protectedAdult) {
    check(data.rides.ride1.adultPickup?.required === true &&
      data.rides.ride1.adultPickup?.verifiedAt === null,
      'server acceptance itself must arm adult verification without opening a Traveler screen');
  }

  if (teen) {
    out = await progress(db, 'onboard', NOW + 1);
    check(out.body.code === 'teen_pickup_unverified',
      'unverified teen must not board');
    data.rides.ride1.teenPickup = { verifiedAt: NOW, verifiedBy: 'op' };
  }
  if (protectedAdult) {
    out = await progress(db, 'onboard', NOW + 1);
    check(out.status === 409 && out.body.code === 'adult_pickup_unverified',
      'Operator cannot claim adult pickup before authenticated private handoff');
    const fetched = await travelerCode({db,rideId:'ride1',travelerUid:'traveler',now:NOW});
    check(fetched.status === 200 && /^\d{6}$/.test(fetched.pin), 'Traveler can access private code');
    out = await verifyOperatorCode({db,rideId:'ride1',operatorUid:'intruder',pin:fetched.pin,now:NOW});
    check(out.status === 403, 'unassigned Operator cannot present pickup proof');
    out = await verifyOperatorCode({db,rideId:'ride1',operatorUid:'op',pin:'abcdef',now:NOW});
    check(out.status === 403, 'invalid code is rejected');
    out = await verifyOperatorCode({db,rideId:'ride1',operatorUid:'op',pin:fetched.pin,now:NOW});
    check(out.verified === true && data.rides.ride1.adultPickup.verifiedBy === 'op',
      'actual server-stamped handoff evidence permits boarding');
  }
  out = await progress(db, 'onboard', NOW + 1);
  check(out.status === 200 && data.rides.ride1.status === 'onboard', 'boarding commits');

  out = await progress(db, 'completed', NOW + 1);
  check(out.body.code === 'outside_transition_radius', 'pickup location cannot complete Travel');
  check(!data.rides.ride1.needsPayout, 'no payout before verified completion');

  data.operators.op.lat = DEST.lat;
  data.operators.op.lng = DEST.lng;
  data.operators.op.onlineAt = NOW + 2;
  out = await progress(db, 'completed', NOW + 2);
  check(out.status === 200 && data.rides.ride1.status === 'completed', 'Travel completes at destination');
  check(data.rides.ride1.needsPayout === true, 'only completion marks payout due');
  check(data.operators.op.currentRideId === null, 'completion releases current slot');
  const completedAt = data.rides.ride1.completedAt;
  const completedWrites = simulation.getWrites();
  out = await progress(db, 'completed', NOW + 3);
  check(out.body.unchanged === true && data.rides.ride1.completedAt === completedAt,
    'duplicate completion cannot change the completion timestamp');
  check(simulation.getWrites() === completedWrites,
    'duplicate completion cannot schedule another payout write');
  const transferCalls=[];const receiptCalls=[];
  const deps={operatorPayoutAccount:async()=>({accountId:'acct_fixture'}),
    transferToOperator:async args=>{
      transferCalls.push(args);
      return {ok:true,transferId:'tr_fixture',amountCents:1752,platformTake:73};
    },
    sendReceipt:async ride=>{receiptCalls.push(ride.tripNo);return {ok:true};},
  };
  out = await settleTravel({db,uid:'intruder',rideId:'ride1',deps,now:NOW+3});
  check(out.status === 403,'only Traveler can request settlement');
  out = await settleTravel({db,uid:'traveler',rideId:'ride1',deps,now:NOW+3});
  check(out.status===200 && transferCalls.length===1 && receiptCalls.length===1 &&
    transferCalls[0].paymentIntentId==='pi_synthetic_does_not_exist' &&
    data.rides.ride1.transferId==='tr_fixture',
    'completed Travel settles only its original payment and sends one receipt');
  out = await settleTravel({db,uid:'traveler',rideId:'ride1',deps,now:NOW+4});
  check(out.body.alreadySettled===true && transferCalls.length===1 && receiptCalls.length===1,
    'settlement replay does not pay or email twice');
  return { teen, protectedAdult, transitions: ['assigned', 'accepted', 'arrived', 'onboard', 'completed'] };
}

async function canceledAndRefundedJourney() {
  const fixture=memoryDb(initialData());
  const {db,data}=fixture;
  const ride=data.rides.ride1;
  const refunds=[];
  const outage=await cancelTravel({
    db,uid:'traveler',rideId:'ride1',stripeConfigured:false,now:NOW,
    deps:{}, // provider deliberately unavailable; cancellation must still commit
  });
  check(outage.status===202 && outage.body.refundPending===true &&
    ride.status==='cancelled' && ride.refundPending===true &&
    data.operators.op.currentRideId===null,
    'provider outage still cancels Travel, frees slot, and records refund obligation');
  const deps={
    refundableFor:async ({paymentIntentId,expectUid})=>{
      check(paymentIntentId==='pi_synthetic_does_not_exist'&&expectUid==='traveler',
        'refund uses the owned Travel charge only');
      return {cents:1825};
    },
    refundTravel:async args=>{
      refunds.push(args);
      return {ok:true,refundId:'re_fixture',amountCents:args.amountCents,status:'succeeded'};
    },
  };
  let out=await cancelTravel({db,uid:'traveler',rideId:'ride1',deps,now:NOW+1000});
  check(out.status===200&&data.rides.ride1.status==='cancelled'&&data.rides.ride1.refundPending===false&&
    data.rides.ride1.refundId==='re_fixture'&&data.rides.ride1.refundedCents===1825&&
    refunds.length===1&&refunds[0].idempotencyKey==='ar_cancel_refund_ride1',
    'refund recovery is bound to original cancellation and idempotent provider key');
  out=await cancelTravel({db,uid:'traveler',rideId:'ride1',deps,now:NOW+2000});
  check(out.body.alreadyRefunded===true&&refunds.length===1,
    'late retry does not issue a duplicate refund');
  out=await settleTravel({db,uid:'traveler',rideId:'ride1',deps:{
    operatorPayoutAccount:async()=>({accountId:'acct_fixture'}),
    transferToOperator:async()=>{throw Error('refund path must never transfer');},
  },now:NOW+3000});
  check(out.status===409,'a cancelled ride cannot trigger the normal payout');
}

async function operatorDeclinesReoffer() {
  const fixture=memoryDb(initialData());
  const {db,data}=fixture;
  let out=await progress(db,'declined');
  check(out.status===200&&data.rides.ride1.status==='assigned'&&
    !!data.rides.ride1.releasedAt&&data.operators.op.currentRideId===null,
    'Operator declines the unaccepted offer; original paid Travel remains reusable');
  // Model the dispatch service's reassignment decision without generating another
  // payment. Dedicated matching/booking suites exercise how a candidate is chosen.
  data.users.op2=operatorUser();
  data.operators.op2={...data.operators.op, currentRideId:'ride1'};
  data.rides.ride1.operatorId='op2';
  data.rides.ride1.releasedAt=null;
  const newAccept=await acceptOffer({db,uid:'op2',rideId:'ride1',
    liveMoney:true,externals:externals(),now:()=>NOW+1000});
  check(newAccept.status===200&&data.rides.ride1.status==='accepted'&&
    data.rides.ride1.operatorId==='op2'&&
    data.rides.ride1.paymentIntentId==='pi_synthetic_does_not_exist',
    'accepted reassignment retains original paid Travel and makes no new payment');
  out=await progress(db,'arrived',NOW+1000,'op');
  check(out.status===403,'declining Operator can never mutate reassigned Travel');
}

async function adverseBeforeAcceptance(kind) {
  const { db, data } = memoryDb(initialData());
  if (kind === 'insurance_cancelled') {
    data.users.op.insuranceMonitoring.status = 'cancelled';
  } else if (kind === 'insurance_unverified') {
    data.users.op.insuranceMonitoring = { status: 'unverified' };
  } else if (kind === 'insurance_expired') {
    data.users.op.documents.insurance.expiry = '2026-10-10';
  } else if (kind === 'screening_expired') {
    data.users.op.screening.recheckDue = NOW - 1;
  } else if (kind === 'screening_missing') {
    data.users.op.screening = null;
  } else if (kind === 'account_disabled') {
    const result = await accept(db, { externals: { ...externals(), account: { disabled: true } } });
    check(result.status === 409 && data.rides.ride1.status === 'assigned', 'disabled account refused');
    return;
  } else if (kind === 'disclosure_stale') {
    data.users.op.insuranceDisclosure.version = 'old-version';
  } else if (kind === 'payout_blocked') {
    const result = await accept(db, { externals: { ...externals(), payouts: { enabled: false } } });
    check(result.status === 409 && data.rides.ride1.status === 'assigned', 'payout-blocked refused');
    return;
  }
  const result = await accept(db);
  check(result.status === 409, kind + ' cannot accept');
  check(data.rides.ride1.status === 'assigned' && !!data.rides.ride1.releasedAt,
    kind + ' must release for reoffer, not charge another Travel');
  check(data.operators.op.available === false,
    kind + ' must remove unsafe Operator from dispatch');
}

async function triCountyGeography() {
  const ids=['fl-miami-dade','fl-broward','fl-palm-beach'];
  const points=[
    {lat:25.7617,lng:-80.1918},
    {lat:26.1224,lng:-80.1373},
    {lat:26.7153,lng:-80.0534},
  ];
  const counties=markets().filter(x=>ids.includes(x.id));
  check(counties.length===3,'all three intended counties remain configured');
  for(let i=0;i<ids.length;i++){
    const county=counties.find(m=>m.id===ids[i]);
    check(county?.status==='active',ids[i]+' configured open');
    check(regionById(county.regionId)?.jurisdiction?.stateCode==='FL',
      ids[i]+' retains independent Florida jurisdiction configuration');
    check(marketFor(points[i])?.id===ids[i]&&servesPoint(points[i]),
      ids[i]+' serves geographic pickups without a county evidence record');
  }
  check(!servesPoint({lat:28.5383,lng:-81.3792}),
    'an unserved county still refuses geographic booking');
  check(readinessForRoute({path:'/travel/dispatch',production:true,
    missing:['ops_auth','market_reference_store','screening_provider']}).ready,
    'separate administrative systems are not second county booking approvals');
  check(!readinessForRoute({path:'/travel/dispatch',production:true,
    missing:['stripe_live_key']}).ready,
    'individual paid Travel still requires its real payment provider');
}

(async () => {
  const oldMode=process.env.ADULT_PICKUP_VERIFICATION;
  const oldKey=process.env.TEEN_PIN_SECRET;
  try {
    delete process.env.ADULT_PICKUP_VERIFICATION;
    await continuousJourney(false);
    await continuousJourney(true);
    process.env.ADULT_PICKUP_VERIFICATION='on';
    process.env.TEEN_PIN_SECRET='synthetic-teen-and-adult-pickup-secret-longer-than-32-characters';
    await continuousJourney(false,true);
  } finally {
    if(oldMode===undefined)delete process.env.ADULT_PICKUP_VERIFICATION;
    else process.env.ADULT_PICKUP_VERIFICATION=oldMode;
    if(oldKey===undefined)delete process.env.TEEN_PIN_SECRET;
    else process.env.TEEN_PIN_SECRET=oldKey;
  }
  await canceledAndRefundedJourney();
  await operatorDeclinesReoffer();
  for (const type of [
    'insurance_cancelled', 'insurance_unverified', 'insurance_expired',
    'screening_expired', 'screening_missing',
    'account_disabled', 'disclosure_stale', 'payout_blocked',
  ]) await adverseBeforeAcceptance(type);
  await triCountyGeography();
  console.log('PASS synthetic continuous Traveler/Operator Travel, teen/adult pickup proof, server completion/one-time settlement/receipt, 8 adverse cases, three-county geography');
  console.log('PASS ' + assertions + ' deterministic assertions, in-memory only; no provider or real-device certification');
})().catch(error => { console.error(error); process.exitCode = 1; });
