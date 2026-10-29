// Exercise backend/scheduler.js against a fake Firestore and a fake Stripe.
// Proves the DECISIONS, which is what the file is: when to dispatch, when to wait, what
// happens when nobody is available, when the card fails, and when we charge and then cannot
// create the travel.
const path = require('path');
const ROOT = __dirname;

// ---- fake Firestore -----------------------------------------------------------------
function makeDb(seed) {
  const data = JSON.parse(JSON.stringify(seed));
  let addCount = 0;
  let addShouldThrow = false;
  let attachShouldThrow = false;
  const docRef = (col, id) => ({
    __col: col, __id: id, id,
    async get() {
      const d = data[col]?.[id];
      return { exists: !!d, id, data: () => JSON.parse(JSON.stringify(d)) };
    },
    async set(fields, opts) {
      if (attachShouldThrow && col === 'rides' && fields.paymentIntentId) throw new Error('payment attachment failed (simulated)');
      data[col] = data[col] || {};
      data[col][id] = opts?.merge ? { ...(data[col][id] || {}), ...fields } : { ...fields };
    },
    async create(fields) {
      if (addShouldThrow) throw new Error('permission denied (simulated)');
      data[col] = data[col] || {};
      if (data[col][id]) throw new Error('already exists');
      data[col][id] = { ...fields };
    },
    async update(fields) { Object.assign(data[col][id], fields); },
  });
  const db = {
    __data: data,
    collection: (col) => ({
      doc: (id) => docRef(col, id),
      where: (field, op, val) => {
        const rowsFor = (filters) => Object.entries(data[col] || {}).filter(([, r]) =>
          filters.every(([key,comparison,value]) => comparison==='==' ? r[key]===value :
            comparison==='<=' ? Number(r[key])<=value : comparison==='>=' ? Number(r[key])>=value : false));
        const snap = (rows) => ({
          docs: rows.map(([id, r]) => ({ id, data: () => JSON.parse(JSON.stringify(r)) })),
        });
        // Honours the bound — see the note in monitor.test.js. A double that swallowed
        // .limit(n) would let an unbounded per-tick scan pass its own test.
        const query=(filters)=>({
          where:(key,comparison,value)=>query([...filters,[key,comparison,value]]),
          async get() { return snap(rowsFor(filters)); },
          limit: (n) => ({ async get() { return snap(rowsFor(filters).slice(0, n)); } }),
          orderBy: (sortField) => ({
            limit: (n) => ({ async get() {
              return snap(rowsFor(filters).sort((a,b) => Number(a[1][sortField]) - Number(b[1][sortField])).slice(0,n));
            } }),
            startAt: () => ({ endAt: () => ({ limit: (n) => ({ async get() { return snap(rowsFor(filters).slice(0,n)); } }) }) }),
          }),
        });
        return query([[field,op,val]]);
      },
      async get() {
        const rows = Object.entries(data[col] || {});
        return { docs: rows.map(([id, r]) => ({ id, data: () => JSON.parse(JSON.stringify(r)) })) };
      },
      async add(obj) {
        if (addShouldThrow) throw new Error('permission denied (simulated)');
        const id = `ride${++addCount}`;
        data[col] = data[col] || {};
        data[col][id] = obj;
        return { id };
      },
    }),
    async runTransaction(fn) {
      return fn({
        get: (ref) => ref.get(),
        update: (ref, fields) => { Object.assign(data[ref.__col][ref.__id], fields); },
        create: (ref, fields) => { if (addShouldThrow) throw new Error('permission denied (simulated)'); data[ref.__col] = data[ref.__col] || {}; if (data[ref.__col][ref.__id]) throw new Error('already exists'); data[ref.__col][ref.__id] = { ...fields }; },
      });
    },
  };
  return { db, data, failAdds: () => { addShouldThrow = true; }, failPaymentAttach: () => { attachShouldThrow = true; } };
}

// ---- inject stubs BEFORE scheduler.js is required ------------------------------------
let charge = async (opts) => ({ ok: true, paymentIntentId: `pi_${opts.reservationId}`, chargedCents: 2720 });
const tickets = [];
function inject(dbHandle) {
  const pricing = require('./payments').quote || require(path.join(ROOT, 'payments.js')).quote;
  for (const [rel, exports] of [
    ['./firebase-admin.js', { adminDb: () => dbHandle, adminStatus: () => ({ ok: true, reason: null }) }],
    ['./payments.js', { quote: pricing,
      chargeScheduledTravel: (...a) => charge(...a), connectAccountStatus: async () => ({ payoutsEnabled:true }),
      verifiedTravelPayment: async (id) => {
        const [rideId, ride] = Object.entries(dbHandle.__data.rides || {}).find(([,r]) => r.paymentIntentId === id) || [];
        return ride ? { id, status:'succeeded', currency:'usd', amount_received: ride.costCents,
          metadata:{ uid:ride.travelerUid, rideId } } : null;
      } }],
    ['./tickets.js', { fileTicket: async (t) => { tickets.push(t); return { caseNo: 'AR-CASE-1' }; } }],
  ]) {
    const p = require.resolve(path.join(ROOT, rel));
    require.cache[p] = { id: p, filename: p, loaded: true, exports, children: [], paths: [] };
  }
  delete require.cache[require.resolve(path.join(ROOT, 'scheduler.js'))];
  return require(path.join(ROOT, 'scheduler.js'));
}

const MIN = 60 * 1000;
const base = (atMinFromNow, extra = {}) => ({
  travelerUid: 'u1', travelerName: 'A. Smith', travelerEmail: 'a@example.com',
  atMs: Date.now() + atMinFromNow * MIN,
  dep: 'Brickell', dest: 'Miami International Airport',
  pickupLat: 25.7617, pickupLng: -80.1918,
  travelClass: 'Standard', travelCostCents: 2450, costCents: 2720,
  tripNo: 'AR-2048-MIA', status: 'reserved', ...extra,
});
// THE FIXTURES CARRY A CURRENT DISCLOSURE. Dispatch has filtered on disclosureVersion since
// 08c0d89, and a record without one is deliberately not dispatchable (dispatchgate.test.js:
// absence is not agreement). These fixtures predate that gate, so every case below failed for
// a reason unrelated to what it asserts. Repaired, not loosened — the gate is statutory.
const { DISCLOSURE_VERSION } = require('./disclosure');
const { FEE_CONSENT_VERSION } = require('./connect-fee-consent');
const NOW = Date.now();
const DOC = (kind) => ({ status:'accepted', verdict:'accept', kind, expiry:'2030-12-31', readAt:NOW, evidence:{ isTheRequestedDocument:true, legible:true, fields: kind==='registration' ? { plate:'ABC123' } : {} } });
const QUALIFIED_USER = (id) => ({ name:id==='opA'?'Nearby N.':'Far F.', stripeAccountId:`acct_${id}`, stripeFeeConsent:{version:FEE_CONSENT_VERSION,acceptedAt:NOW-1000,accountMonthlyUsd:2,approvedSeparatelyBilledFees:true}, operatingMarket:{ id:'fl-miami-dade' }, insuranceDisclosure:{ version:DISCLOSURE_VERSION, at:NOW }, insuranceMonitoring:{ status:'verified_active', source:'onboarding_document', lastVerifiedAt:NOW-1000, nextVerificationDueAt:NOW+30*24*60*60*1000 }, documents:{ license:DOC('license'), registration:DOC('registration'), insurance:{...DOC('insurance'), evidence:{ isTheRequestedDocument:true, legible:true, fields:{ commercialUse:'yes', limits:'$1,000,000' }, insurance:{ namedInsureds:[id==='opA'?'Nearby N.':'Far F.'], vehicles:[{plate:'ABC123'}], effectiveDate:'2025-01-01', expirationDate:'2030-12-31', tncEndorsement:'yes', rideLimits:{combinedSingleLimit:'$1,000,000'}, loggedOnLimits:{bodilyInjuryPerPerson:'$50,000',bodilyInjuryPerIncident:'$100,000',propertyDamage:'$25,000'}, pip:{shown:'yes',amount:'$10,000'}, uninsuredMotorist:{shown:'yes'} } } } }, screening:{ decision:'pass', completedAt:NOW, recheckDue:NOW + 365*24*60*60*1000 } });
const FLEET = {
  opA: { name: 'Nearby N.', lat: 25.7625, lng: -80.1925, available: true, commissioned: true, screeningCheckedAt: NOW, onlineAt: NOW, classes: ['Standard'], stripeAccountId:'acct_opA', feeConsentVersion:FEE_CONSENT_VERSION, disclosureVersion: DISCLOSURE_VERSION, insuranceExpiry:'2030-12-31' },
  opB: { name: 'Far F.', lat: 25.90, lng: -80.30, available: true, commissioned: true, screeningCheckedAt: NOW, onlineAt: NOW, classes: ['Standard'], stripeAccountId:'acct_opB', feeConsentVersion:FEE_CONSENT_VERSION, disclosureVersion: DISCLOSURE_VERSION, insuranceExpiry:'2030-12-31' },
};

const results = [];
const check = (label, cond, detail) => { results.push({ label, ok: !!cond, detail }); };

(async () => {
  // 1. A reservation 40 minutes out is NOT touched at all.
  {
    const h = makeDb({ scheduled_rides: { r1: base(40) }, operators: FLEET, users: { opA: QUALIFIED_USER('opA'), opB: QUALIFIED_USER('opB') } });
    const rep = await inject(h.db).sweepScheduled();
    check('40 min out: outside the window, untouched', rep.considered === 0, JSON.stringify(rep));
  }

  // 2. 20 minutes out with an operator ~1 min away: HELD, not dispatched.
  {
    const h = makeDb({ scheduled_rides: { r1: base(20) }, operators: FLEET, users: { opA: QUALIFIED_USER('opA'), opB: QUALIFIED_USER('opB') } });
    const rep = await inject(h.db).sweepScheduled();
    check('20 min out, operator 1 min away: held',
      rep.waiting === 1 && rep.dispatched.length === 0,
      h.data.scheduled_rides.r1.lastSweepResult);
  }

  // A bounded unsorted status scan can hide the only due reservation behind 100 future ones.
  {
    const oldMode = process.env.DEPLOYMENT_MODE;
    process.env.DEPLOYMENT_MODE = 'production';
    let charges = 0;
    charge = async () => { charges++; return { ok: true, paymentIntentId: 'unreachable' }; };
    const h = makeDb({ scheduled_rides: { r1: base(3) }, operators: FLEET,
      users: { opA: QUALIFIED_USER('opA'), opB: QUALIFIED_USER('opB') } });
    const worker = inject(h.db);
    const missing = await worker.sweepScheduled();
    const blocked = await worker.sweepScheduled({ checkMarket: async () => 'waitlist' });
    check('a production reservation without admitted market never charges, even if callback is missing',
      charges === 0 && !h.data.rides && h.data.scheduled_rides.r1.status === 'reserved' &&
      missing.failed[0]?.reason?.includes('market admission') && blocked.failed[0]?.reason?.includes('market admission'));
    if (oldMode === undefined) delete process.env.DEPLOYMENT_MODE;
    else process.env.DEPLOYMENT_MODE = oldMode;
    charge = async (opts) => ({ ok: true, paymentIntentId: `pi_${opts.reservationId}`, chargedCents: 2720 });
  }

  // A bounded unsorted status scan can hide the only due reservation behind 100 future ones.
  {
    const many={};
    for(let i=0;i<100;i++) many[`future${i}`]=base(40);
    many.due=base(3);
    const h=makeDb({ scheduled_rides:many, operators:FLEET,
      users:{opA:QUALIFIED_USER('opA'),opB:QUALIFIED_USER('opB')} });
    const rep=await inject(h.db).sweepScheduled();
    check('due-time order finds due Travel beyond 100 future reservations',
      rep.dispatched.length===1 && rep.dispatched[0].id==='due', JSON.stringify(rep));
    check('distant future reservations do not falsely report a saturated due queue',
      rep.overCapacity!==true);
  }
  {
    // Overload must still be reported if the due queue ITSELF contains 100
    // entries. Never suppress warnings for truly competing near-term Travels.
    const many={};
    for(let i=0;i<100;i++)many['due'+i]=base(20);
    const h=makeDb({scheduled_rides:many,operators:{},users:{}});
    const rep=await inject(h.db).sweepScheduled();
    check('100 genuinely due reservations still report saturation',
      rep.overCapacity===true && rep.considered===100,JSON.stringify(rep));
  }

  // 3. 3 minutes out: dispatched, charged, travel created, operator recorded.
  {
    const h = makeDb({ scheduled_rides: { r1: base(3) }, operators: FLEET, users: { opA: QUALIFIED_USER('opA'), opB: QUALIFIED_USER('opB') } });
    const rep = await inject(h.db).sweepScheduled();
    const ride = h.data.rides && Object.values(h.data.rides)[0];
    check('3 min out: dispatched to the NEAREST operator',
      rep.dispatched.length === 1 && ride?.operatorId === 'opA' && ride?.status === 'assigned',
      JSON.stringify({ rep: rep.dispatched, op: ride?.operatorName }));
    check('  travel carries the payment for settlement', ride?.paymentIntentId === 'pi_r1', ride?.paymentIntentId);
    check('  travel carries the promised hour', typeof ride?.scheduledFor === 'number', ride?.scheduledFor);
    check('  reservation marked dispatched with an ETA',
      h.data.scheduled_rides.r1.status === 'dispatched' && h.data.scheduled_rides.r1.etaMin >= 1,
      JSON.stringify({ status:h.data.scheduled_rides.r1.status, error:h.data.scheduled_rides.r1.dispatchError }));
    check('  claim released', h.data.scheduled_rides.r1.claimedAt === null, h.data.scheduled_rides.r1.claimedAt);
  }

  // Cancellation must not answer 200 after the worker has claimed an off-session charge.
  {
    const h=makeDb({scheduled_rides:{r1:base(3)},operators:FLEET,
      users:{opA:QUALIFIED_USER('opA'),opB:QUALIFIED_USER('opB')}});
    let acceptedCancellation=null;
    charge=async()=>{acceptedCancellation=h.data.scheduled_rides.r1.status==='reserved';
      return {ok:true,paymentIntentId:'pi_r1',chargedCents:2720};};
    const rep=await inject(h.db).sweepScheduled();
    check('claim→Traveler cancellation cannot return success while Stripe is charging',
      acceptedCancellation===false && rep.dispatched.length===1 && h.data.scheduled_rides.r1.status==='dispatched');
    charge=async(opts)=>({ok:true,paymentIntentId:`pi_${opts.reservationId}`,chargedCents:2720});
  }
  {
    const h=makeDb({scheduled_rides:{r1:base(3)},operators:FLEET,
      users:{opA:QUALIFIED_USER('opA'),opB:QUALIFIED_USER('opB')}});
    charge=async()=>{h.data.scheduled_rides.r1.cancelRequestedAt=Date.now();
      return {ok:true,paymentIntentId:'pi_r1',chargedCents:2720};};
    const rep=await inject(h.db).sweepScheduled();
    const ride=Object.values(h.data.rides||{})[0];
    check('revocation during provider call never offers the charged Travel',
      rep.dispatched.length===0 && h.data.scheduled_rides.r1.status==='needs_attention' &&
      ride?.status==='awaiting_payment' && ride.paymentIntentId==='pi_r1' && !h.data.operators.opA.currentRideId);
    charge=async(opts)=>({ok:true,paymentIntentId:`pi_${opts.reservationId}`,chargedCents:2720});
  }
  {
    const {bookingId}=require('./booking');
    const r=base(3,{status:'dispatching',claimedAt:Date.now()-4*MIN,claimNonce:'abandoned'});
    const rideId=bookingId('u1','scheduled-r1'.padEnd(16,'_'));
    const h=makeDb({scheduled_rides:{r1:r},rides:{[rideId]:{status:'awaiting_payment',paymentIntentId:'pi_orphan'}},
      operators:FLEET,users:{opA:QUALIFIED_USER('opA'),opB:QUALIFIED_USER('opB')}});
    let charged=0;charge=async()=>{charged++;return {ok:true,paymentIntentId:'pi_new',chargedCents:2720};};
    const rep=await inject(h.db).sweepScheduled();
    check('stale claim with staged money requires reconciliation, not a second off-session charge',
      rep.staleClaims===1 && h.data.scheduled_rides.r1.status==='needs_attention' && charged===0);
    check('stale scheduled claim reaches durable founder support queue',
      tickets.some(t=>t.reason==='Scheduled Travel requires Operations review' &&
        t.idempotencyKey && /pi_orphan/.test(t.description)) &&
        !!h.data.scheduled_rides.r1.caseNo);
    charge=async(opts)=>({ok:true,paymentIntentId:`pi_${opts.reservationId}`,chargedCents:2720});
  }

  // 4. Two reservations at once do not both get the same operator.
  {
    const h = makeDb({ scheduled_rides: { r1: base(3), r2: base(3, { tripNo: 'AR-2049-MIA' }) }, operators: FLEET, users: { opA: QUALIFIED_USER('opA'), opB: QUALIFIED_USER('opB') } });
    const rep = await inject(h.db).sweepScheduled();
    const ops = Object.values(h.data.rides || {}).map((r) => r.operatorId);
    check('two due at once: two different operators',
      rep.dispatched.length === 2 && new Set(ops).size === 2, JSON.stringify(ops));
  }

  // 5. Nobody available, still early: waits. Past the grace: unmatched, and NOT charged.
  {
    let charged = 0;
    charge = async () => { charged++; return { ok: true, paymentIntentId: 'pi_x', chargedCents: 1 }; };
    const h = makeDb({ scheduled_rides: { r1: base(3) }, operators: {} });
    const rep = await inject(h.db).sweepScheduled();
    check('no operators, still early: waiting', rep.waiting === 1 && charged === 0, JSON.stringify(rep));

    const h2 = makeDb({ scheduled_rides: { r1: base(-15) }, operators: {} });
    const rep2 = await inject(h2.db).sweepScheduled();
    check('no operators, past grace: unmatched and never charged',
      h2.data.scheduled_rides.r1.status === 'unmatched' && charged === 0,
      h2.data.scheduled_rides.r1.closedReason);
    charge = async (opts) => ({ ok: true, paymentIntentId: `pi_${opts.reservationId}`, chargedCents: 2720 });
  }

  // 6. Card declined: NOBODY is sent, and the reservation is released to try again.
  {
    charge = async () => ({ ok: false, code: 'card_declined', error: 'Your card was declined.' });
    const h = makeDb({ scheduled_rides: { r1: base(3) }, operators: FLEET, users: { opA: QUALIFIED_USER('opA'), opB: QUALIFIED_USER('opB') } });
    await inject(h.db).sweepScheduled();
    const r = h.data.scheduled_rides.r1;
    check('card declined: staged Travel is never offered or paid',
      Object.values(h.data.rides || {}).every((ride) => ride.status === 'awaiting_payment' && !ride.operatorId && !ride.paymentIntentId)
      && r.status === 'reserved' && r.claimedAt === null, JSON.stringify(r.status));
    check('  the reason is on the record for the traveler', r.paymentError === 'Your card was declined.', r.paymentError);

    // Past the grace it stops retrying and says so.
    const h2 = makeDb({ scheduled_rides: { r1: base(-15) }, operators: FLEET, users: { opA: QUALIFIED_USER('opA'), opB: QUALIFIED_USER('opB') } });
    await inject(h2.db).sweepScheduled();
    check('  past grace: payment_failed', h2.data.scheduled_rides.r1.status === 'payment_failed',
      h2.data.scheduled_rides.r1.status);
    charge = async (opts) => ({ ok: true, paymentIntentId: `pi_${opts.reservationId}`, chargedCents: 2720 });
  }

  // 7. A failed post-charge attachment remains a durable, webhook-recoverable obligation.
  {
    const h = makeDb({ scheduled_rides: { r1: base(3) }, operators: FLEET, users: { opA: QUALIFIED_USER('opA'), opB: QUALIFIED_USER('opB') } });
    h.failPaymentAttach();
    const rep = await inject(h.db).sweepScheduled();
    const r = h.data.scheduled_rides.r1;
    check('charged but not dispatched: needs_attention', r.status === 'needs_attention', r.status);
    check('  a prepared unoffered Travel already exists before charging',
      Object.values(h.data.rides || {}).some((ride) => ride.status === 'awaiting_payment' && ride.reservationId === 'r1'));
    check('  a support case was opened automatically',
      tickets.some(t=>t.reason==='Scheduled travel charged but not dispatched' && /REFUND OF CAPTURED FUNDS IS OWED/.test(t.description)), tickets.at(-1)?.reason);
    check('  the case number is on the reservation', r.caseNo === 'AR-CASE-1', r.caseNo);
  }
  // 7a. A genuine manual-only hold is not money already collected.
  // The same post-authorization attachment failure must create a case to
  // release the original hold, without inventing a cash refund or paid total.
  {
    charge=async()=>({ok:true,paymentIntentId:'pi_held_r1',chargedCents:2720,
      capturePolicy:'manual_v1'});
    const h=makeDb({scheduled_rides:{r1:base(3)},operators:FLEET,
      users:{opA:QUALIFIED_USER('opA'),opB:QUALIFIED_USER('opB')}});
    h.failPaymentAttach();
    const rep=await inject(h.db).sweepScheduled();
    const reservation=h.data.scheduled_rides.r1;
    check('manual hold failed dispatch: still needs attention',
      reservation.status==='needs_attention');
    check('manual hold amounts must not become charged money',
      reservation.chargedCents===0&&reservation.authorizedCents===2720,
      JSON.stringify({charged:reservation.chargedCents,authorized:reservation.authorizedCents}));
    check('manual hold case records release rather than a bank refund',
      tickets.some(t=>t.reason==='Scheduled Travel authorization held but not dispatched' &&
        /RELEASE ORIGINAL HOLD; NO CAPTURED REFUND IS OWED/.test(t.description)));
    charge=async(opts)=>({ok:true,paymentIntentId:`pi_${opts.reservationId}`,chargedCents:2720});
  }
  // 7b. A failure to create the booking occurs BEFORE charging, not after it.
  {
    let charged = 0;
    charge = async () => { charged++; return { ok:true, paymentIntentId:'pi_wrong', chargedCents:2720 }; };
    const h = makeDb({ scheduled_rides: { r1: base(3) }, operators: FLEET,
      users: { opA: QUALIFIED_USER('opA'), opB: QUALIFIED_USER('opB') } });
    h.failAdds();
    const rep = await inject(h.db).sweepScheduled();
    check('failed durable prepare never opens an off-session charge',
      charged === 0 && rep.failed.length === 1 && h.data.scheduled_rides.r1.status === 'needs_attention');
    check('failed prepare is recorded in existing founder case queue without claiming money was captured',
      tickets.some(t=>t.reason==='Scheduled Travel requires Operations review' &&
        /No provider payment reference was confirmed/.test(t.description)) &&
      !!h.data.scheduled_rides.r1.caseNo);
    charge = async (opts) => ({ ok: true, paymentIntentId: `pi_${opts.reservationId}`, chargedCents: 2720 });
  }

  // 8. A legacy reservation with no pickup is closed, not retried forever.
  {
    const legacy = base(3); delete legacy.pickupLat; delete legacy.pickupLng;
    const h = makeDb({ scheduled_rides: { r1: legacy }, operators: FLEET, users: { opA: QUALIFIED_USER('opA'), opB: QUALIFIED_USER('opB') } });
    await inject(h.db).sweepScheduled();
    check('pre-dispatch reservation: closed with a reason',
      h.data.scheduled_rides.r1.status === 'unmatched', h.data.scheduled_rides.r1.closedReason);
  }

  // 9. A class nobody offers is not fobbed off on a Standard operator.
  {
    const h = makeDb({ scheduled_rides: { r1: base(-15, { travelClass: 'Pet Friendly' }) }, operators: FLEET, users: { opA: QUALIFIED_USER('opA'), opB: QUALIFIED_USER('opB') } });
    await inject(h.db).sweepScheduled();
    check('unserved class: unmatched, not substituted',
      h.data.scheduled_rides.r1.status === 'unmatched' && !h.data.rides,
      h.data.scheduled_rides.r1.closedReason);
  }

  // 10. Expired insurance is not dispatchable.
  {
    const h = makeDb({
      scheduled_rides: { r1: base(3) },
      operators: { opA: { ...FLEET.opA, insuranceExpiry: '2020-01-01' } },
      users: { opA: QUALIFIED_USER('opA') },
    });
    const rep = await inject(h.db).sweepScheduled();
    check('lapsed coverage: not dispatched', rep.dispatched.length === 0 && !h.data.rides, JSON.stringify(rep));
  }

  let bad = 0;
  for (const r of results) { if (!r.ok) bad++; console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.label}${r.ok ? '' : '   <-- ' + r.detail}`); }
  console.log(`\n${results.length - bad}/${results.length} passed`);
  process.exit(bad ? 1 : 0);
})();
