// Paying, cancelling and settling are decided by the travel record, not the request.
// Adversarial regressions for the independent audit of e26adcb. Run: node backend/travelmoney.test.js
const fs = require('fs');
const path = require('path');
const { payForTravel, cancelTravel, settleTravel } = require('./travelmoney');

const R = [];
const check = (l, c, d) => R.push({ l, ok: !!c, d });

// A Firestore stand-in. `update` throws on a missing document, as Firestore does.
function fakeDb(seed) {
  const data = JSON.parse(JSON.stringify(seed));
  const snap = (c, id) => ({ exists: !!data[c]?.[id], data: () => (data[c]?.[id] ? JSON.parse(JSON.stringify(data[c][id])) : undefined) });
  const db = {
    data,
    collection: (c) => ({
      doc: (id) => ({
        get: async () => snap(c, id),
        set: async (f, o) => { data[c] = data[c] || {}; data[c][id] = o?.merge ? { ...(data[c][id] || {}), ...f } : { ...f }; },
        update: async (f) => {
          if (!data[c]?.[id]) { const e = new Error(`NOT_FOUND: no document ${c}/${id}`); e.code = 5; throw e; }
          data[c][id] = { ...data[c][id], ...f };
        },
      }),
    }),
  };
  db.runTransaction = async (fn) => {
    const tx = {
      get: async (ref) => ref.get(),
      update: (ref, fields) => ref.update(fields),
      set: (ref, fields, opts) => ref.set(fields, opts),
    };
    return fn(tx);
  };
  return db;
}

// A Stripe stand-in: two paid intents belonging to the SAME traveler, one per travel.
function stripe() {
  const intents = {
    pi_A: { uid: 'alice', tripNo: 'AR-1-MIA', cents: 1944, refunded: 0 },
    pi_B: { uid: 'alice', tripNo: 'AR-2-MIA', cents: 5000, refunded: 0 },
  };
  const log = { refunds: [], transfers: [], creates: [] };
  return {
    intents,
    log,
    refundableFor: async ({ paymentIntentId, expectUid }) => {
      const pi = intents[paymentIntentId];
      if (!pi || pi.uid !== expectUid) return { cents: 0, reason: 'not yours' };
      return { cents: pi.cents - pi.refunded, reason: null };
    },
    refundTravel: async ({ paymentIntentId, amountCents, idempotencyKey }) => {
      intents[paymentIntentId].refunded += amountCents;
      log.refunds.push({ paymentIntentId, amountCents, idempotencyKey });
      return { ok: true, refundId: `re_${paymentIntentId}`, amountCents, status: 'succeeded' };
    },
    transferFixed: async (x) => { log.transfers.push({ kind: 'fee', ...x }); return { ok: true, transferId: 'tr_fee' }; },
    transferToOperator: async (x) => { log.transfers.push({ kind: 'fare', ...x }); return { ok: true, transferId: `tr_${x.paymentIntentId}`, amountCents: 1900, platformTake: 44 }; },
    operatorPayoutAccount: async () => ({ accountId: 'acct_op' }),
    create: async (binding) => { log.creates.push(binding); return { paymentIntentId: 'pi_new', clientSecret: 'cs', breakdown: { governmentFeeCents: 0, feeLines: [] } }; },
  };
}

const fare = { travelCostCents: 1800, costCents: 1950 };
const rides = (over = {}) => ({
  rides: {
    A: { ...fare, travelerUid: 'alice', operatorId: 'op1', tripNo: 'AR-1-MIA', status: 'accepted', paymentIntentId: 'pi_A', ...(over.A || {}) },
    B: { ...fare, travelerUid: 'alice', operatorId: 'op2', tripNo: 'AR-2-MIA', status: 'accepted', paymentIntentId: 'pi_B', ...(over.B || {}) },
    C: { ...fare, travelerUid: 'bob', operatorId: 'op3', tripNo: 'AR-3-MIA', status: 'assigned', ...(over.C || {}) },
  },
});

(async () => {
  // ——— 1. /travel/cancel refunds the travel's OWN payment ———————————————————————————————
  {
    const db = fakeDb(rides());
    const s = stripe();
    const out = await cancelTravel({ db, uid: 'alice', rideId: 'A', deps: s, paymentIntentId: 'pi_B', body: { paymentIntentId: 'pi_B' } });
    check('cancel A while naming B\'s payment: A is refunded', out.status === 200 && out.body.refunded === true && s.log.refunds.length === 1 && s.log.refunds[0].paymentIntentId === 'pi_A', JSON.stringify(s.log.refunds));
    check('…and B is NEVER refunded', s.intents.pi_B.refunded === 0 && !s.log.refunds.some((r) => r.paymentIntentId === 'pi_B'));
    check('cancellation carries one stable Stripe idempotency key for this Travel', s.log.refunds[0].idempotencyKey === 'ar_cancel_refund_A');
    check('…and B stays live', db.data.rides.B.status === 'accepted' && !db.data.rides.B.refundId);
    check('the cancel function takes no payment id from its caller at all', !/paymentIntentId\s*[,}]/.test(cancelTravel.toString().split('\n')[0]));
  }
  {
    const db = fakeDb(rides({ A: { paymentIntentId: null } }));
    const s = stripe();
    const out = await cancelTravel({ db, uid: 'alice', rideId: 'A', deps: s });
    check('a travel with no payment of its own refunds nothing — not some other payment', out.body.refunded === false && s.log.refunds.length === 0 && db.data.rides.A.status === 'cancelled');
  }
  {
    const db = fakeDb(rides());
    const s = stripe();
    const out = await cancelTravel({ db, uid: 'alice', rideId: 'C', deps: s });
    check('another traveler\'s travel cannot be cancelled', out.status === 403 && db.data.rides.C.status === 'assigned' && s.log.refunds.length === 0);
  }
  {
    const db = fakeDb(rides({ A: { status: 'arrived' } }));
    const s = stripe();
    const out = await cancelTravel({ db, uid: 'alice', rideId: 'A', deps: s });
    check('after arrival: refunded less the $3 arrival fee, which goes to the operator (unchanged)',
      out.body.amountCents === 1644 && out.body.arrivalFeeCents === 300 && s.log.transfers.some((t) => t.kind === 'fee' && t.amountCents === 300));
  }
  {
    const db = fakeDb(rides({ A: { status: 'accepted', paymentIntentId: null } }));
    const collection = db.collection;
    db.collection = (name) => {
      const col = collection(name);
      return { doc(id) {
        const ref = col.doc(id);
        if (name !== 'rides' || id !== 'A') return ref;
        const get = ref.get; let first = true;
        ref.get = async () => {
          if (!first) return get();
          first = false;
          const stale = await get();
          // Provider intent attaches and Operator reaches pickup before cancellation tx reads.
          db.data.rides.A.paymentIntentId = 'pi_A';
          db.data.rides.A.status = 'arrived';
          return stale;
        };
        return ref;
      } };
    };
    const s = stripe();
    const out = await cancelTravel({ db, uid: 'alice', rideId: 'A', deps: s });
    check('payment attached between cancel reads is refunded from the transactional Travel',
      out.status === 200 && out.body.refunded === true && s.log.refunds[0]?.paymentIntentId === 'pi_A');
    check('arrival between cancel reads retains the earned $3 Operator fee',
      out.body.amountCents === 1644 && s.log.transfers[0]?.amountCents === 300);
  }
  {
    const db = fakeDb(rides({ A: { status: 'onboard' } }));
    const out = await cancelTravel({ db, uid: 'alice', rideId: 'A', deps: stripe() });
    check('onboard: cancellation refused (unchanged)', out.status === 409 && db.data.rides.A.status === 'onboard');
  }

  // ——— 1b. Future ENROUTE fees: consent/terms gated, same existing Operator read ———
  {
    const at = 2_000_000_000_000;
    const start = { lat:25.78,lng:-80.19,positionAt:at-10000 };
    const db = fakeDb({
      ...rides({A:{acceptedAt:at,pickupLat:25.8,pickupLng:-80.19,
        pickupProgressStart:start,operatorEtaMin:8}}),
      operators:{op1:{currentRideId:'A',lat:25.786,lng:-80.19,onlineAt:at+130000}},
    });
    let operatorReads=0;
    const originalCollection=db.collection;
    db.collection=(name)=>{
      const col=originalCollection(name);
      return {doc(id){
        const ref=col.doc(id),get=ref.get;
        ref.get=async()=>{if(name==='operators')operatorReads++;return get();};
        return ref;
      }};
    };
    const st=stripe();
    const result=await cancelTravel({db,uid:'alice',rideId:'A',deps:st,
      now:at+150000,enableVerifiedProgressFee:true});
    check('en-route verification: correct $3 from existing paid Travel, no new Stripe charge',
      result.status===200&&result.body.arrivalFeeCents===300&&st.log.refunds[0].amountCents===1644&&
        st.log.transfers.some(t=>t.kind==='fee'&&t.amountCents===300));
    check('en-route verification: exactly one existing Operator doc read, no extra location query',
      operatorReads===1);
    check('en-route verification: reason and compact evidence in already-written cancellation',
      db.data.rides.A.cancellationFeeReason==='verified_enroute_progress'&&
      db.data.rides.A.cancellationFeeEvidence.closingMiles>=0.3);
  }
  {
    const at=2_000_000_000_000;
    const db=fakeDb({...rides({A:{acceptedAt:at,pickupLat:25.8,pickupLng:-80.19,
      pickupProgressStart:null}}),operators:{op1:{currentRideId:'A',lat:25.79,lng:-80.19,
      onlineAt:at+130000}}});
    const st=stripe();
    const result=await cancelTravel({db,uid:'alice',rideId:'A',deps:st,
      now:at+150000,enableVerifiedProgressFee:true});
    check('missing accepted GPS baseline: full refund and no payout fee',
      result.body.arrivalFeeCents===0&&st.log.transfers.length===0&&
      db.data.rides.A.cancellationFeeReason==='missing_or_wrong_operator_location');
  }
  {
    const at=2_000_000_000_000;
    const db=fakeDb(rides({A:{status:'arrived',acceptedAt:at,arrivedAt:at+60000}}));
    const st=stripe();
    const result=await cancelTravel({db,uid:'alice',rideId:'A',deps:st,
      now:at+90000,enableVerifiedProgressFee:true});
    check('verified arrival remains free during two-minute cancellation grace',
      result.body.arrivalFeeCents===0&&st.log.transfers.length===0);
  }

  {
    const at=2_000_000_000_000;
    const db=fakeDb({...rides({A:{acceptedAt:at,pickupLat:25.8,pickupLng:-80.19,
      pickupProgressStart:{lat:25.78,lng:-80.19,positionAt:at-10000}}}),
      operators:{op1:{currentRideId:'A',lat:25.786,lng:-80.19,onlineAt:at+130000}}});
    const st=stripe(); const originalRefund=st.refundTravel;
    let failOnce=true;
    st.refundTravel=async args=>{
      if(failOnce){failOnce=false;throw Error('synthetic Stripe outage');}
      return originalRefund(args);
    };
    const first=await cancelTravel({db,uid:'alice',rideId:'A',deps:st,now:at+150000,
      enableVerifiedProgressFee:true});
    check('Stripe outage: Travel closed, fee evidence preserved and refund pending',
      first.status===202&&db.data.rides.A.refundPending===true&&
      db.data.rides.A.cancellationFeeCents===300);
    const recovered=await cancelTravel({db,uid:'alice',rideId:'A',deps:st,now:at+180000,
      enableVerifiedProgressFee:true});
    check('retry: original $3 amount frozen after Operator reservation released',
      recovered.status===200&&recovered.body.arrivalFeeCents===300&&
      st.log.refunds.length===1&&st.log.refunds[0].amountCents===1644&&
      st.log.transfers.length===1);
  }

  // ——— Manual HOLD cancellations: no Refund object, original PaymentIntent only ———
  {
    const at=2_000_000_000_000;
    const db=fakeDb(rides({A:{status:'accepted',acceptedAt:at,
      paymentCapturePolicy:'manual_v1',authorizationState:'held'}}));
    const st=stripe(),events=[];
    st.settleUncapturedTravel=async args=>{
      events.push(args);
      return {manual:true,ok:true,status:'released',captureCents:0};
    };
    const out=await cancelTravel({db,uid:'alice',rideId:'A',deps:st,now:at+60_000,
      enableManualCancellationFee:true,enableVerifiedProgressFee:true});
    check('held card fee-free cancellation voids original authorization with NO refund',out.status===200&&
      out.body.authorizationReleased===true&&events[0].action==='cancel'&&
      st.log.refunds.length===0&&st.log.transfers.length===0&&
      db.data.rides.A.authorizationState==='released');
  }
  {
    const at=2_000_000_000_000;
    const db=fakeDb(rides({A:{status:'arrived',acceptedAt:at,
      arrivedAt:at+120000,paymentCapturePolicy:'manual_v1',authorizationState:'held',
      cancellationFeeDisclosureVersion:'net3-allin400-v1'}}));
    const st=stripe(),events=[];
    st.settleUncapturedTravel=async args=>{
      events.push(args);return {manual:true,ok:true,status:'captured',captureCents:400};
    };
    const first=await cancelTravel({db,uid:'alice',rideId:'A',deps:st,now:at+360_000,
      enableManualCancellationFee:true,enableVerifiedProgressFee:true});
    check('disclosed $4 fee captures only 400 cents from a held fare and no refund',first.status===200&&
      first.body.capturedCents===400&&first.body.operatorNetCents===300&&
      events[0].action==='fee'&&events[0].verifiedFeeCents===400&&
      st.log.refunds.length===0&&st.log.transfers[0]?.amountCents===300);
    const again=await cancelTravel({db,uid:'alice',rideId:'A',deps:st,now:at+370_000,
      enableManualCancellationFee:true,enableVerifiedProgressFee:true});
    check('replay freezes the same $4 gross fee despite an already released Operator',
      again.status===200&&events.length===2&&events[1].action==='fee'&&
      events[1].verifiedFeeCents===400&&db.data.rides.A.cancellationFeeCaptureCents===400);
  }
  {
    const at=2_000_000_000_000;
    const db=fakeDb(rides({A:{status:'arrived',acceptedAt:at,arrivedAt:at+120000,
      paymentCapturePolicy:'manual_v1',authorizationState:'held'}}));
    const st=stripe(),events=[];
    st.settleUncapturedTravel=async args=>{events.push(args);return {manual:true,ok:true,status:'released'};};
    const out=await cancelTravel({db,uid:'alice',rideId:'A',deps:st,now:at+360_000,
      enableManualCancellationFee:true,enableVerifiedProgressFee:true});
    check('arrival alone without upfront $4 fee disclosure cannot take funds',out.status===200&&
      events[0].action==='cancel'&&st.log.transfers.length===0&&st.log.refunds.length===0);
  }
  {
    const at=2_000_000_000_000;
    const db=fakeDb(rides({A:{status:'completed',paymentCapturePolicy:'manual_v1',
      authorizationState:'held'}}));
    const st=stripe(),events=[];
    st.settleUncapturedTravel=async args=>{
      events.push(args);return {manual:true,ok:true,status:'captured',captureCents:1950};
    };
    st.operatorPayoutAccount=async()=>({accountId:null,reason:'Connect delayed'});
    const out=await settleTravel({db,uid:'alice',rideId:'A',deps:st,now:at});
    check('completed Travel collects held fare even when Connect is unavailable',
      out.status===200&&events.length===1&&events[0].action==='complete'&&
      events[0].totalCents===1950&&db.data.rides.A.authorizationState==='captured'&&
      db.data.rides.A.payoutPending===true&&st.log.transfers.length===0);
  }

  // ——— Same-Travel 5-minute Operator no-show: strict proof, $4/$3 capture ———
  {
    const at=1790390000000;
    const ride={status:'arrived',paymentCapturePolicy:'manual_v1',
      cancellationFeeDisclosureVersion:'net3-allin400-v1',
      acceptedAt:at-540000,arrivedAt:at-360000,pickupContactAt:at-60000,
      pickupContactBy:'op1',pickupLat:25.7617,pickupLng:-80.1918};
    const op={currentRideId:'A',lat:25.7617,lng:-80.1918,onlineAt:at-1000};
    const db=fakeDb({...rides({A:ride}),operators:{op1:op}});
    const st=stripe(),calls=[];
    st.settleUncapturedTravel=async args=>{
      calls.push(args);return {manual:true,ok:true,status:'captured',captureCents:400};
    };
    const result=await cancelTravel({db,uid:'op1',operatorNoShowUid:'op1',
      rideId:'A',deps:st,now:at,enableManualCancellationFee:true});
    check('no-show: only 5-minute present Operator with contact can close Travel',
      result.status===200&&db.data.rides.A.status==='cancelled'&&
      db.data.rides.A.noShowBy==='op1'&&
      db.data.operators.op1.currentRideId===null);
    check('no-show: exactly one $4 partial capture and a $3 Operator transfer, zero refund',
      result.body.capturedCents===400&&result.body.operatorNetCents===300&&
      calls.length===1&&calls[0].action==='fee'&&
      calls[0].uid==='alice'&&calls[0].verifiedFeeCents===400&&
      st.log.refunds.length===0&&st.log.transfers[0]?.amountCents===300);
    const again=await cancelTravel({db,uid:'op1',operatorNoShowUid:'op1',
      rideId:'A',deps:st,now:at+1000,enableManualCancellationFee:true});
    check('no-show repeat keeps frozen $4 and original Traveler/Travel ownership',
      again.status===200&&calls[1]?.verifiedFeeCents===400&&calls[1]?.uid==='alice');
  }
  {
    const at=1790390000000;
    const base={status:'arrived',paymentCapturePolicy:'manual_v1',
      cancellationFeeDisclosureVersion:'net3-allin400-v1',
      acceptedAt:at-540000,arrivedAt:at-60000,
      pickupContactAt:at-30000,pickupContactBy:'op1',
      pickupLat:25.7617,pickupLng:-80.1918};
    for(const [label,delta] of [
      ['too early',{}],
      ['missing contact',{arrivedAt:at-360000,pickupContactAt:null}],
      ['already boarded',{arrivedAt:at-360000,status:'onboard'}],
      ['remote GPS',{arrivedAt:at-360000,remote:true}],
      ['scheduled',{arrivedAt:at-360000,scheduledFor:at+600000}],
      ['teen',{arrivedAt:at-360000,party:{teen:true}}],
    ]) {
      const operator={currentRideId:'A',lat:delta.remote?25.80:25.7617,
        lng:-80.1918,onlineAt:at-1000};
      const db=fakeDb({...rides({A:{...base,...delta}}),operators:{op1:operator}});
      const st=stripe(),capture=[];
      st.settleUncapturedTravel=async args=>{capture.push(args);return {manual:true,ok:true,status:'captured',captureCents:400};};
      const out=await cancelTravel({db,uid:'op1',operatorNoShowUid:'op1',
        rideId:'A',deps:st,now:at,enableManualCancellationFee:true});
      check('no-show refused: '+label,
        out.status!==200&&db.data.rides.A.status!=='cancelled'&&
        db.data.operators.op1.currentRideId==='A'&&capture.length===0);
    }
  }

  // ——— 2. /create-payment-intent proves the ride before anything is charged ——————————————————
  {
    const db = fakeDb(rides());
    const s = stripe();
    const out = await payForTravel({ db, uid: 'alice', rideId: 'C', create: s.create });
    check("Traveler A cannot attach a payment to Traveler B's ride", out.status === 403 && !db.data.rides.C.paymentIntentId);
    check('…and no PaymentIntent is created for it', s.log.creates.length === 0);
  }
  {
    const db = fakeDb(rides());
    const s = stripe();
    const out = await payForTravel({ db, uid: 'alice', rideId: 'does-not-exist', create: s.create });
    check('a nonexistent ride is refused', out.status === 404);
    check('…no PaymentIntent is created', s.log.creates.length === 0);
    check('…and no phantom ride appears', !db.data.rides['does-not-exist']);
  }
  {
    const db = fakeDb(rides());
    const s = stripe();
    const out = await payForTravel({ db, uid: 'alice', rideId: '', create: s.create });
    check('no ride id at all is refused, with no charge', out.status === 400 && s.log.creates.length === 0);
  }
  {
    const db = fakeDb(rides({ A: { status: 'cancelled', paymentIntentId: null } }));
    const s = stripe();
    const out = await payForTravel({ db, uid: 'alice', rideId: 'A', create: s.create });
    check('a cancelled travel cannot be paid for', out.status === 409 && s.log.creates.length === 0);
  }
  {
    const db = fakeDb({ rides: { N: { ...fare, travelerUid: 'alice', operatorId: 'op1', tripNo: 'AR-9-MIA', status: 'assigned' } } });
    const s = stripe();
    const out = await payForTravel({ db, uid: 'alice', rideId: 'N', create: s.create, now: 7 });
    check('the owner prepares their own intent, without claiming payment success', out.status === 200 && db.data.rides.N.paymentIntentId === 'pi_new' && db.data.rides.N.paymentIntentCreatedAt === 7 && !db.data.rides.N.paidAt);
    check('Stripe gets the RIDE\'s Travel Number and id, not the request\'s', s.log.creates[0].tripNo === 'AR-9-MIA' && s.log.creates[0].rideId === 'N');
  }
  {
    const db = fakeDb({ rides: { N: { ...fare, travelerUid: 'alice', tripNo: 'AR-9-MIA', status: 'assigned', paymentClaim: 'pay_other', paymentClaimedAt: 1000 } } });
    const s = stripe();
    const out = await payForTravel({ db, uid: 'alice', rideId: 'N', create: s.create, now: 2000 });
    check('a concurrent live payment claim blocks a second Stripe creation', out.status === 409 && out.body.code === 'payment_in_progress' && s.log.creates.length === 0);
  }
  {
    const db = fakeDb({ rides: { N: { ...fare, travelerUid: 'alice', tripNo: 'AR-9-MIA', status: 'assigned', paymentClaim: 'pay_dead', paymentClaimedAt: 1000 } } });
    const s = stripe();
    const out = await payForTravel({ db, uid: 'alice', rideId: 'N', create: s.create, now: 122001 });
    check('an expired payment claim is recoverable instead of stranding the Travel', out.status === 200 && db.data.rides.N.paymentIntentId === 'pi_new' && s.log.creates.length === 1);
  }
  {
    const src = fs.readFileSync(path.join(__dirname, 'travelmoney.js'), 'utf8');
    const body = src.slice(src.indexOf('async function payForTravel'), src.indexOf('async function cancelTravel'));
    check('payment claims use a unique nonce, not uid/ride as a pretend lock', /randomUUID\(\)/.test(body));
    check('payment claims have an expiry so a dead process cannot strand payment forever', /PAYMENT_CLAIM_TTL_MS/.test(body) && /claimAge/.test(body));
  }
  // ——— an already-paid travel: NO Stripe creation call at all (audit of f6ef88d) ——————————————
  {
    const db = fakeDb({ rides: { N: { ...fare, travelerUid: 'alice', tripNo: 'AR-9-MIA', status: 'assigned', paymentIntentId: 'pi_first' } } });
    const s = stripe();
    const out = await payForTravel({ db, uid: 'alice', rideId: 'N', create: s.create });
    check('a travel with a payment on record: refused', out.status === 409 && out.body.code === 'already_paid');
    check('…and Stripe creates NOTHING — creates.length stays 0', s.log.creates.length === 0, JSON.stringify(s.log.creates));
    check('…and the record is untouched', db.data.rides.N.paymentIntentId === 'pi_first');
  }
  {
    const db = fakeDb({ rides: { N: { ...fare, travelerUid: 'alice', tripNo: 'AR-9-MIA', status: 'assigned', paymentIntentId: 'pi_first' } } });
    const s = stripe();
    const resumed = [];
    const out = await payForTravel({
      db, uid: 'alice', rideId: 'N', create: s.create,
      resume: async (id) => { resumed.push(id); return { paymentIntentId: id, clientSecret: 'cs_first', resumed: true, breakdown: { feeLines: [] } }; },
    });
    check('a retry of the same unpaid payment continues the EXISTING intent', out.status === 200 && out.body.paymentIntentId === 'pi_first' && resumed.join() === 'pi_first');
    check('…still with creates.length 0', s.log.creates.length === 0);
  }
  {
    const db = fakeDb({ rides: { N: { ...fare, travelerUid: 'alice', tripNo: 'AR-9-MIA', status: 'assigned', paymentIntentId: 'pi_first' } } });
    const s = stripe();
    const out = await payForTravel({ db, uid: 'alice', rideId: 'N', create: s.create, resume: async () => null });
    check('an intent that cannot be continued (paid, cancelled, other amount): refused, creates.length 0', out.status === 409 && s.log.creates.length === 0);
  }
  {
    const src = fs.readFileSync(path.join(__dirname, 'travelmoney.js'), 'utf8');
    const body = src.slice(src.indexOf('async function payForTravel'), src.indexOf('async function cancelTravel'));
    check('payForTravel transactionally claims the payment transition BEFORE calling create()', /runTransaction/.test(body) && /paymentClaim/.test(body) && body.indexOf('runTransaction') < body.indexOf('await create('));
    const pay = fs.readFileSync(path.join(__dirname, 'payments.js'), 'utf8');
    const resume = pay.slice(pay.indexOf('async function resumePaymentIntent'), pay.indexOf('async function chargeRide'));
    check('resumePaymentIntent retrieves and never creates a PaymentIntent', /paymentIntents\.retrieve\(/.test(resume) && !/paymentIntents\.create\(/.test(resume));
    check('…and continues only this traveler\'s intent, for this travel, unpaid, at the same amount',
      /metadata\?\.uid !== String\(uid\)/.test(resume) && /metadata\?\.rideId !== String\(rideId\)/.test(resume) && /RESUMABLE\.includes\(pi\.status\)/.test(resume) && /pi\.amount !== q\.travelerPays/.test(resume));
  }

  // ——— 3. /travel/settle only for a completed travel, out of its own payment ——————————————————
  for (const st of ['assigned', 'accepted', 'arrived', 'onboard', 'cancelled']) {
    const db = fakeDb(rides({ A: { status: st } }));
    const s = stripe();
    const out = await settleTravel({ db, uid: 'alice', rideId: 'A', deps: s });
    check(`settlement of a ${st} travel is refused, and nothing is transferred`, out.status === 409 && out.body.code === 'not_completed' && s.log.transfers.length === 0 && !db.data.rides.A.transferId);
  }
  {
    const db = fakeDb(rides({ A: { status: 'completed' } }));
    const s = stripe();
    const sent = [];
    const out = await settleTravel({ db, uid: 'alice', rideId: 'A', deps: { ...s, sendReceipt: async (r) => { sent.push(r); return { ok: true }; } }, now: 9 });
    check('a completed travel settles normally', out.status === 200 && db.data.rides.A.transferId === 'tr_pi_A' && db.data.rides.A.settledAt === 9);
    check('…out of its own payment, with its own Travel Number', s.log.transfers[0].paymentIntentId === 'pi_A' && s.log.transfers[0].expectedTripNo === 'AR-1-MIA');
    check('…and the receipt is sent once', sent.length === 1 && db.data.rides.A.receiptSentAt === 9);
    const again = await settleTravel({ db, uid: 'alice', rideId: 'A', deps: s });
    check('settling twice is a no-op', again.body.alreadySettled === true && s.log.transfers.length === 1);
  }
  {
    const db = fakeDb(rides({ A: { status: 'completed' }, B: { status: 'completed' } }));
    const s = stripe();
    await settleTravel({ db, uid: 'alice', rideId: 'A', deps: s, body: { paymentIntentId: 'pi_B' } });
    check('settling A never pays out of B\'s payment', s.log.transfers.every((t) => t.paymentIntentId === 'pi_A'));
  }
  {
    const db = fakeDb(rides({ C: { status: 'completed', paymentIntentId: 'pi_C' } }));
    const out = await settleTravel({ db, uid: 'alice', rideId: 'C', deps: stripe() });
    check("another traveler's travel cannot be settled", out.status === 403);
  }

  // ——— the routes use these, and ignore the request's payment ————————————————————————————
  const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const route = (p) => (server.match(new RegExp(`app\\.post\\('${p.replace(/\//g, '\\/')}'[\\s\\S]*?\\n\\}\\);`)) || [''])[0];
  const cancel = route('/travel/cancel');
  const settle = route('/travel/settle');
  const pay = route('/create-payment-intent');
  check('/travel/cancel calls cancelTravel and never reads req.body.paymentIntentId', /cancelTravelFor\(/.test(cancel) && !/req\.body\?\.paymentIntentId/.test(cancel));
  check('/travel/settle calls settleTravel and never reads req.body.paymentIntentId', /settleTravelFor\(/.test(settle) && !/req\.body\?\.paymentIntentId/.test(settle));
  check('/create-payment-intent goes through payForTravel, with no tripNo from the body', /payForTravel\(/.test(pay) && !/req\.body\?\.tripNo/.test(pay));
  check('/create-payment-intent no longer writes to a ride with set(…, { merge: true })', !/collection\('rides'\)\.doc\(rideId\)\.set\(/.test(pay));
  const sched = fs.readFileSync(path.join(__dirname, 'scheduler.js'), 'utf8');
  check('the settlement sweep also requires a completed travel', /x\.status !== 'completed'/.test(sched));

  let bad = 0;
  for (const r of R) { if (!r.ok) bad++; console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.l}${r.ok ? '' : '  — ' + (r.d || '')}`); }
  console.log(`\n${R.length - bad}/${R.length} passed`);
  process.exit(bad ? 1 : 0);
})();
