'use strict';
// SYNTHETIC provider chain: real Stripe SDK signature verification and REAL
// American Rider inbox/financial-event handler, with isolated memory Firestore.
// No network, live users, provider writes, accounts, money or physical devices.
const assert = require('node:assert/strict');
const Stripe = require('stripe');
const stripe = new Stripe('sk_test_synthetic_never_authorized');
const normalSecret = 'whsec_offline_synthetic_normal';
const connectSecret = 'whsec_offline_synthetic_connect';
const data = { rides: {}, users: {}, operators: {}, provider_events: {} };
const cases = new Map();
let alertOutage = false, writesUnavailable = false, calls = 0, assertions = 0;
const check = (condition, message) => { assertions++; assert.ok(condition, message); };
let transactionLock = Promise.resolve();
function snapshot(col, id) {
  const value = data[col]?.[id];
  return { exists: value !== undefined, id, data: () => structuredClone(value) };
}
function record(col,id) {
  return {
    id, col,
    get: async () => snapshot(col,id),
    async create(value) {
      if (writesUnavailable) throw Error('synthetic database outage');
      if (data[col]?.[id] !== undefined) { const e=Error('already exists'); e.code=6; throw e; }
      (data[col] ||= {})[id] = structuredClone(value);
    },
    async set(value,options={}) {
      if (writesUnavailable) throw Error('synthetic database outage');
      (data[col] ||= {})[id] = options.merge
        ? { ...(data[col][id]||{}), ...structuredClone(value) } : structuredClone(value);
    },
  };
}
const db = {
  collection(name) {
    return {
      doc(id) { return record(name,String(id)); },
      where(field,op,value) {
        check(['=='].includes(op),'only tested equality queries permitted');
        let rows = Object.entries(data[name]||{}).filter(([,v])=>v[field]===value);
        return { limit(n) {
          return { async get() {
            return { docs: rows.slice(0,n).map(([id,value])=>({
              id, data:()=>structuredClone(value),
            })) };
          } };
        } };
      },
    };
  },
  runTransaction(fn) {
    const run = transactionLock.then(async () => {
      const pending = [];
      const tx = {
        get: async ref => snapshot(ref.col,ref.id),
        set(ref,patch,opts={}) { pending.push(()=>record(ref.col,ref.id).set(patch,opts)); },
        update(ref,patch) { pending.push(async()=>{
          if(!snapshot(ref.col,ref.id).exists)throw Error('missing transaction target');
          await record(ref.col,ref.id).set(patch,{merge:true});
        }); },
      };
      const result = await fn(tx);
      // Serialize claims/financial updates as one unit inside this fake.
      for(const step of pending) await step();
      return result;
    });
    transactionLock = run.catch(()=>{});
    return run;
  },
};
function stub(rel, exports) {
  const name=require.resolve(rel);
  require.cache[name]={id:name,filename:name,loaded:true,exports,children:[],paths:[]};
}
stub('./firebase-admin',{adminDb:()=>db,adminStatus:()=>({ok:true})});
stub('./tickets',{fileTicket:async ({idempotencyKey,...other})=>{
  calls++;
  if(alertOutage)throw Error('synthetic alert service unavailable');
  if(!cases.has(idempotencyKey))cases.set(idempotencyKey,{
    ...other,caseNo:'SYN-CASE-'+String(cases.size+1),
  });
  return {ok:true,stored:true,emailed:true,caseNo:cases.get(idempotencyKey).caseNo};
}});
stub('./env',{readKey:()=>''});
stub('./email',{money:n=>'$'+(Number(n||0)/100).toFixed(2)});
stub('./operatorfees',{recordPayoutActivity:async()=>({ok:true,ignored:true})});
stub('./disputeevidence',{saveDisputeEvidence:async({event})=>({ref:'synthetic/dispute/'+event.data.object.id})});
const inbox = require('./providerqueue');
const financial = require('./webhook');
let seq=0;
function event(type,obj,options={}) {
  return {
    id:'evt_synthetic_'+String(++seq).padStart(5,'0'),
    object:'event', type,
    created:Math.floor(Date.now()/1000),
    ...(options.connect?{account:'acct_fake_operator'}:{}),
    data:{object:structuredClone(obj)},
  };
}
function verify(e,{connect=false,corrupt=false,wrongKey=false}={}) {
  const raw=JSON.stringify(e);
  const secret=connect?connectSecret:normalSecret;
  const signature=stripe.webhooks.generateTestHeaderString({
    payload:raw, secret:wrongKey?'whsec_wrong_synthetic':secret,
    timestamp:Math.floor(Date.now()/1000),
  });
  return stripe.webhooks.constructEvent(Buffer.from(corrupt?raw+' ':raw),signature,secret);
}
async function deliver(e,opts={}) {
  const verified=verify(e,opts);
  const queued=await inbox.enqueueProviderEvent({provider:'stripe',event:verified});
  if(!queued.ok)return {queued};
  const handled=await inbox.processProviderEvent({
    id:queued.id,handlers:{stripe:financial.handleEvent},workerId:'synthetic-1',
  });
  return {queued,handled};
}
function reset(pass) {
  for(const name of Object.keys(data))data[name]={};
  cases.clear();seq=0;calls=0;alertOutage=false;writesUnavailable=false;
  data.rides['ride_test_'+pass]={
    travelerUid:'traveler',travelerEmail:'traveler@example.invalid',
    tripNo:'AR-SYN-'+pass, status:'accepted',costCents:1900,
    paymentIntentId:null,dep:'Synthetic A',dest:'Synthetic B',
  };
  data.users.op={stripeAccountId:'acct_fake_operator'};
  data.operators.op={available:true};
}
async function run(pass){
  reset(pass);
  const rideId='ride_test_'+pass;
  const payment={id:'pi_synthetic_'+pass,amount_received:1900,currency:'usd',
    metadata:{uid:'traveler',rideId,product:'American Rider travel'}};
  check(!data.rides[rideId].paymentIntentId,'no payment before a valid Stripe event');
  const paymentEvent=event('payment_intent.succeeded',payment);
  check(!!verify(paymentEvent),'real Stripe SDK validates signed raw bytes');
  assert.throws(()=>verify(paymentEvent,{corrupt:true}),/signature/i);
  assert.throws(()=>verify(paymentEvent,{wrongKey:true}),/signature/i);
  const first=await deliver(paymentEvent);
  check(first.queued.ok && first.handled.ok,'signed paid event stored and processed');
  check(data.rides[rideId].paymentIntentId===payment.id,'actual Travel payment linked');
  check(data.provider_events[first.queued.id].status==='done','durable provider event marked done');
  const duplicate=await deliver(paymentEvent);
  check(duplicate.queued.duplicate===true && duplicate.handled.skipped,
    'duplicate Stripe delivery neither re-processes nor updates payment');

  const contradictory=verify({...paymentEvent,data:{object:{
    ...payment,amount_received:1,
  }}});
  const changed=await inbox.enqueueProviderEvent({provider:'stripe',event:contradictory});
  check(changed.ok===false && /conflicting/.test(changed.reason),
    'signed synthetic event reused with altered amount must not ACK as a replay');
  check(data.rides[rideId].paymentIntentId===payment.id,
    'untrusted changed amount never rewrites original paid Travel');
  const raced=event('payment_intent.succeeded',{...payment,id:'pi_race_'+pass});
  const raceId=inbox.eventDocId('stripe',raced.id);
  const raceEnqueued=await inbox.enqueueProviderEvent({provider:'stripe',event:verify(raced)});
  const [r1,r2]=await Promise.all([
    inbox.processProviderEvent({id:raceId,handlers:{stripe:financial.handleEvent},workerId:'wA'}),
    inbox.processProviderEvent({id:raceId,handlers:{stripe:financial.handleEvent},workerId:'wB'}),
  ]);
  check(raceEnqueued.ok && [r1,r2].filter(x=>x.ok&&!x.skipped).length===1,
    'two competing workers process one provider message once');
  check(data.rides[rideId].paymentIntentId===payment.id,
    'a different successful payment cannot replace original paid Travel');
  check(cases.size===1,'mismatched second paid intent opens exactly one review case');

  const refundOk=event('refund.updated',{
    object:'refund',id:'re_synthetic_ok_'+pass,
    payment_intent:payment.id,status:'succeeded',amount:100,
  });
  const ok=await deliver(refundOk);
  check(ok.handled.ok && cases.size===1,'successful refund update does not create a failed-refund case');

  const refundFail=event('refund.failed',{
    object:'refund',id:'re_synthetic_failed_'+pass,
    payment_intent:payment.id,status:'failed',amount:200,failure_reason:'synthetic failure',
  });
  alertOutage=true;
  const fail=await deliver(refundFail);
  check(fail.queued.ok&&!fail.handled.ok,'notification outage keeps provider event pending');
  check(data.provider_events[fail.queued.id].status==='pending','provider event remains recoverable');
  check(!data.rides[rideId].refundFailureReviewRequired,'cannot claim unfiled case');
  alertOutage=false;
  data.provider_events[fail.queued.id].nextAttemptAt=0;
  const recovered=await inbox.processProviderEvent({
    id:fail.queued.id,handlers:{stripe:financial.handleEvent},workerId:'after_restart',
  });
  check(recovered.ok,'replay after outage processes event once');
  check(data.rides[rideId].refundFailureReviewRequired===true,'Travel flagged for failed refund');
  const ticketCount=cases.size;
  const failureUpdate=event('refund.updated',{...refundFail.data.object});
  const replay=await deliver(failureUpdate);
  check(replay.handled.ok&&cases.size===ticketCount,
    'same refund ID across different Stripe events opens only one case');
  const successAfterFailure=event('refund.updated',{
    ...refundFail.data.object,status:'succeeded',
  });
  await deliver(successAfterFailure);
  check(data.rides[rideId].refundFailureReviewRequired===true,
    'out-of-order success does not silently close the alert');

  const disputeEvent=event('charge.dispute.created',{
    id:'dp_synthetic_'+pass,payment_intent:payment.id,amount:500,
    reason:'fraudulent',evidence_details:{due_by:2000000000},
  });
  const dispute=await deliver(disputeEvent);
  check(dispute.handled.ok&&data.rides[rideId].disputed===true,
    'signed dispute opens review and marks linked Travel');
  check(data.rides[rideId].disputeId==='dp_synthetic_'+pass,
    'dispute is indexed by provider identifier');

  const restricted=event('account.updated',{
    id:'acct_fake_operator',metadata:{uid:'op'},payouts_enabled:false,
    charges_enabled:false,requirements:{disabled_reason:'synthetic restriction'},
  },{connect:true});
  const connectRaw=JSON.stringify(restricted);
  const connectHeader=stripe.webhooks.generateTestHeaderString({
    payload:connectRaw,secret:connectSecret,timestamp:Math.floor(Date.now()/1000),
  });
  assert.throws(()=>stripe.webhooks.constructEvent(
    Buffer.from(connectRaw),connectHeader,normalSecret),/signature/i,
    'Connect event may never pass the general account secret');
  const shut=await deliver(restricted,{connect:true});
  check(shut.handled.ok && data.operators.op.available===false,
    'signed Connect restriction blocks an Operator from new dispatch');

  writesUnavailable=true;
  const unwritten=await deliver(event('refund.updated',{
    id:'re_synthetic_quota',status:'succeeded',payment_intent:payment.id,
  }));
  check(unwritten.queued.ok===false && unwritten.handled===undefined,
    'database outage never acknowledges an unstored provider event');
  writesUnavailable=false;

  const count=Object.keys(data.provider_events).length;
  check(count>=7,'drill covered signed payment, refund, dispute and Connect events');
  return {pass,assertions,providerEvents:count,caseCount:cases.size,
    validTravelPayment:data.rides[rideId].paymentIntentId===payment.id,
    failedRefundFlag:data.rides[rideId].refundFailureReviewRequired===true,
    operatorRestricted:data.operators.op.available===false};
}
(async()=>{
  const reports=[];
  for(let pass=1;pass<=2;pass++)reports.push(await run(pass));
  check(reports.every(r=>r.validTravelPayment&&r.failedRefundFlag&&r.operatorRestricted),
    'both independent passes preserve monetary and operator safety invariants');
  console.log('PASS TWICE synthetic signed Stripe -> durable Firestore-style inbox -> actual handler: '+JSON.stringify(reports));
  console.log('BOUNDARY: real Stripe SDK used OFFLINE, in-memory database and fictional events; no real provider callback, bank, GPS, devices, billable reads or external money.');
})().catch(e=>{console.error(e);process.exitCode=1});
