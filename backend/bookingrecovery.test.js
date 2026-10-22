const assert = require('node:assert/strict');
const { sweepBookingRecovery, PREPARED_TTL_MS, PAID_UNMATCHED_TTL_MS } = require('./bookingrecovery');
const now = 2_000_000_000_000;
function store() {
  const rows = new Map();
  const snap = (id) => ({ id, exists: rows.has(id), data: () => ({ ...rows.get(id) }) });
  const db = {
    rows,
    collection(name) { return {
      doc(id) { const key = `${name}/${id}`; return {
        id, get: async () => snap(key),
        set: async (fields) => rows.set(key, { ...rows.get(key), ...fields }),
        update: async (fields) => rows.set(key, { ...rows.get(key), ...fields }),
      }; },
      where(field, _, value) {
        const constraints = [[field, value]];
        let after = null;
        const query = {
          where(nextField, _op, nextValue) { constraints.push([nextField,nextValue]); return query; },
          orderBy(field) { assert.equal(field,'__name__'); return query; },
          startAfter(id) { assert.equal(typeof id,'string'); after = id; return query; },
          limit(max) { return { async get() {
            return { docs: [...rows.entries()].filter(([id,row]) =>
              id.startsWith(`${name}/`) && constraints.every(([key,v]) => row[key] === v))
              .sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0)
              .filter(([id]) => after === null || id.slice(name.length+1) > after)
              .slice(0,max).map(([id]) => ({ id: id.slice(name.length+1), data: () => ({ ...rows.get(id) }) })) };
          } }; },
        };
        return query;
      },
    }; },
    runTransaction(fn) { return fn({
      get: (ref) => ref.get(), update: (ref, fields) => ref.update(fields),
    }); },
  };
  return db;
}
async function main() {
  const db = store(); const refunds=[];
  db.rows.set('rides/unpaid', { travelerUid: 'u', status: 'awaiting_payment', createdAt: now - PREPARED_TTL_MS - 1 });
  db.rows.set('rides/paid', { travelerUid: 'u', status: 'awaiting_assignment', createdAt: now - 900000,
    paidAt: now - PAID_UNMATCHED_TTL_MS - 1, paymentIntentId: 'pi_paid', costCents: 2350 });
  db.rows.set('rides/retry', { travelerUid: 'u', status: 'cancelled', createdAt: now - 900000,
    refundPending: true, paymentIntentId: 'pi_retry', cancelledFrom: 'assigned', costCents: 2350 });
  db.rows.set('rides/scheduled', { travelerUid: 'u', status: 'awaiting_payment',
    reservationId:'reservation', createdAt:now-900000, costCents:2350 });
  db.rows.set('scheduled_rides/reservation', { paymentIntentId:'pi_schedule' });
  const deps={
    verifiedTravelPayment: async (id) => ({ id, status:'succeeded', amount_received:2350,
      currency:'usd', metadata:{uid:'u',rideId:'scheduled'} }),
    refundableFor: async () => ({ cents: 2350 }),
    refundTravel: async (args) => { refunds.push(args); return { ok: true, refundId: `re_${args.paymentIntentId}`, amountCents: args.amountCents, status: 'succeeded' }; },
    operatorPayoutAccount: async () => ({ accountId: null }),
  };
  const out=await sweepBookingRecovery({ db, deps, stripeConfigured: true, now });
  assert.equal(out.ok,true, JSON.stringify(out));
  assert.deepEqual(out.closed.sort(), ['paid','retry','unpaid']);
  assert.equal(db.rows.get('rides/unpaid').status,'cancelled');
  assert.equal(db.rows.get('rides/paid').status,'cancelled');
  assert.equal(db.rows.get('rides/paid').refundPending,false);
  assert.deepEqual(refunds.map((r)=>r.paymentIntentId).sort(), ['pi_paid','pi_retry']);
  assert.equal(db.rows.get('rides/scheduled').paymentIntentId, 'pi_schedule');
  assert(refunds.every((r)=>r.idempotencyKey.startsWith('ar_cancel_refund_')));
  const again=await sweepBookingRecovery({ db, deps, stripeConfigured:true, now:now+1000 });
  assert.equal(again.closed.length,0);
  assert.equal(refunds.length,2,'completed refunds cannot repeat');
  const later=await sweepBookingRecovery({ db, deps, stripeConfigured:true,
    now:now+PAID_UNMATCHED_TTL_MS+1000 });
  assert(later.closed.includes('scheduled'));
  assert.equal(refunds.length,3,'the scheduled orphan was automatically refunded');
  // PRELAUNCH MANUAL CAPTURE: an authorized scheduled PaymentIntent is never
  // a settled charge. After a lost reservation->ride PI write, recover the
  // original provider hold and release it without a Stripe refund.
  {
    const holdDb=store(); const voids=[];
    holdDb.rows.set('rides/held-scheduled', {
      travelerUid:'u', status:'awaiting_payment',
      reservationId:'held-reservation', createdAt:now-PREPARED_TTL_MS-1,
      costCents:2350, routedMinutes:60,
    });
    holdDb.rows.set('scheduled_rides/held-reservation',{paymentIntentId:'pi_held'});
    const holdDeps={
      ...deps,
      verifiedTravelPayment:async(id)=>({
        id,status:'requires_capture',capture_method:'manual',
        amount:2350,amount_capturable:2350,currency:'usd',
        metadata:{uid:'u',rideId:'held-scheduled',capturePolicy:'manual_v1'},
        latest_charge:{payment_method_details:{card:{
          capture_before:Math.floor((now+3*24*60*60*1000)/1000),
        }}},
      }),
      settleUncapturedTravel:async(args)=>{
        voids.push(args);
        return {manual:true,ok:true,status:'released'};
      },
    };
    const beforeRefund=refunds.length;
    const held=await sweepBookingRecovery({db:holdDb,deps:holdDeps,stripeConfigured:true,now});
    assert.equal(held.ok,true,JSON.stringify(held));
    assert(held.closed.includes('held-scheduled'));
    const record=holdDb.rows.get('rides/held-scheduled');
    assert.equal(record.paymentIntentId,'pi_held');
    assert.equal(record.paymentCapturePolicy,'manual_v1');
    assert.equal(record.paidAt,undefined,
      'an uncollected hold must never acquire a paidAt timestamp');
    assert.equal(record.authorizationState,'released');
    assert.equal(record.refundPending,false);
    assert.equal(voids.length,1);
    assert.equal(voids[0].action,'cancel');
    assert.equal(voids[0].paymentIntentId,'pi_held');
    assert.equal(refunds.length,beforeRefund,'no captured refund for an uncaptured hold');
    const replay=await sweepBookingRecovery({db:holdDb,deps:holdDeps,stripeConfigured:true,now:now+2000});
    assert.equal(replay.ok,true,JSON.stringify(replay));
    assert.equal(voids.length,1,'no second provider authorization release after recovery');
  }
  // Adversarial regression: 125 unrelated records occupy the natural scan
  // order with refundPending=true but are NOT legally eligible for this cancel
  // refund path. A post-query .continue used to starve the valid paid refund.
  const flood=store();
  for(let i=0;i<125;i++)flood.rows.set(`rides/irrelevant-${i}`,{
    status:'assigned',travelerUid:'u',refundPending:true,createdAt:now-60_000,
  });
  flood.rows.set('rides/eligible-refund',{
    travelerUid:'u',status:'cancelled',refundPending:true,
    paymentIntentId:'pi_eligible',cancelledFrom:'assigned',costCents:2350,
    createdAt:now-900000,
  });
  const beforeCount=refunds.length;
  const recovered=await sweepBookingRecovery({ db:flood,deps,stripeConfigured:true,now });
  assert.equal(recovered.ok,true,JSON.stringify(recovered));
  assert.ok(recovered.closed.includes('eligible-refund'),'valid paid refund cannot be starved by irrelevant flags');
  assert.equal(recovered.overCapacity,false,'query must not bill 100 irrelevant refund documents');
  assert.equal(refunds.length,beforeCount+1);
  assert.equal(flood.rows.get('rides/eligible-refund').refundPending,false);
  // Repeated full first pages must not indefinitely hide a later cancellation.
  // This was possible with .limit(100) and no cursor: the first 250 recent
  // payments were ineligible, so the overdue payment at the end never appeared.
  for(let pass=0;pass<2;pass++){
    const fair=store();
    for(let i=0;i<250;i++){
      fair.rows.set(`rides/a${String(i).padStart(4,'0')}`,{
        travelerUid:'u',status:'awaiting_payment',createdAt:now-60_000,
      });
    }
    fair.rows.set('rides/zz_overdue',{
      travelerUid:'u',status:'awaiting_payment',
      createdAt:now-PREPARED_TTL_MS-1,
    });
    for(let tick=0;tick<3;tick++){
      const out=await sweepBookingRecovery({db:fair,deps,stripeConfigured:true,now:now+tick*1000});
      assert.equal(out.ok,true,JSON.stringify(out));
      assert.ok(out.scanned<=300, 'bounded at 100 documents per recovery group');
      if(tick<2)assert.equal(out.overCapacity,true);
    }
    assert.equal(fair.rows.get('rides/zz_overdue').status,'cancelled',
      'a later overdue Travel must not be permanently hidden by 250 recent records');
    const cursor=fair.rows.get('recovery_cursors/booking_recovery');
    assert.ok(cursor,'checkpoint must be durable between independent sweeps');
    assert.equal(cursor.preparedAfterId,null,'end of recovery list wraps to first page');
    const restarted=await sweepBookingRecovery({db:fair,deps,stripeConfigured:true,now:now+5_000});
    assert.equal(restarted.ok,true,JSON.stringify(restarted));
    assert.equal(fair.rows.get('rides/zz_overdue').status,'cancelled');
  }
  // No silent fallback to first-page starvation if the persisted checkpoint
  // cannot be read or saved. The release logs the error and recovery can retry.
  {
    const broken=store();
    const original=broken.collection;
    broken.collection=(name)=>{
      if(name!=='recovery_cursors')return original(name);
      return {doc:()=>({async get(){throw Error('synthetic quota exhausted')}})};
    };
    const result=await sweepBookingRecovery({db:broken,deps,stripeConfigured:true,now});
    assert.equal(result.ok,false);
    assert.ok(result.errors.some(e=>e.includes('checkpoint unavailable')));
  }
  {
    const broken=store();
    for(let i=0;i<101;i++)broken.rows.set(`rides/p${String(i).padStart(4,'0')}`,{
      travelerUid:'u',status:'awaiting_payment',createdAt:now-1000,
    });
    const original=broken.collection;
    broken.collection=(name)=>{
      if(name!=='recovery_cursors')return original(name);
      return {doc:(id)=>({
        get:()=>original(name).doc(id).get(),
        async set(){throw Error('synthetic checkpoint write outage')},
      })};
    };
    const result=await sweepBookingRecovery({db:broken,deps,stripeConfigured:true,now});
    assert.equal(result.ok,false);
    assert.ok(result.errors.some(e=>e.includes('checkpoint not persisted')));
  }
  console.log('PASS unattended prepared-booking closure, paid-unmatched refund and pending retry');
}
main().catch((e) => { console.error(e); process.exitCode=1; });
