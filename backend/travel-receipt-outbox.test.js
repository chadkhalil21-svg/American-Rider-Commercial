'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {enqueueTravelReceipt,sweepTravelReceipts,MAX_ATTEMPTS}=require('./travel-receipt-outbox');
function database() {
  const data={rides:{},travel_receipt_outbox:{}};
  const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
  const db={data};
  db.collection=name=>({
    doc:id=>{
      const ref={name,id};
      ref.get=async()=>({exists:!!data[name]?.[id],data:()=>clone(data[name]?.[id])});
      ref.set=async(fields,opt={})=>{
        data[name]??={};
        data[name][id]=opt.merge?{...(data[name][id]||{}),...clone(fields)}:clone(fields);
      };
      ref.update=async fields=>{if(!data[name]?.[id])throw Error('missing');Object.assign(data[name][id],clone(fields));};
      return ref;
    },
    where:(field,op,value)=>({
      orderBy:()=>({
        limit:max=>({
          get:async()=>({
            docs:Object.entries(data[name]||{}).filter(([,v])=>
              v[field]<=value
            ).filter(([,v])=>Number.isFinite(v[field])&&v[field]<=value)
              .sort(([,a],[,b])=>a[field]-b[field]).slice(0,max)
              .map(([id,row])=>({id,data:()=>clone(row)}))
          }),
        }),
      }),
    }),
  });
  db.runTransaction=async fn=>{
    const writes=[];
    const tx={
      get:ref=>ref.get(),
      create:(ref,fields)=>writes.push(()=>{if(data[ref.name]?.[ref.id])throw Error('exists');return ref.set(fields);}),
      set:(ref,fields,opt)=>writes.push(()=>ref.set(fields,opt)),
      update:(ref,fields)=>writes.push(()=>ref.update(fields)),
    };
    const out=await fn(tx);
    for(const f of writes)await f();
    return out;
  };
  return db;
}
(async()=>{
  const db=database(),rideId='ride_test_2026_1';
  const ride={status:'completed',paymentIntentId:'pi_test',
    paidAt:100,costCents:1944,tripNo:'AR-1',dep:'A',dest:'B',miles:2.5,
    onboardAt:110,completedAt:112};
  assert.equal((await enqueueTravelReceipt({
    db,rideId,ride:{...ride,paidAt:undefined},to:'t@example.com',now:1000,
  })).reason,'payment_not_confirmed');
  assert.equal((await enqueueTravelReceipt({
    db,rideId,ride:{...ride,refunded:true},to:'t@example.com',now:1000,
  })).reason,'payment_not_confirmed');
  assert.equal((await enqueueTravelReceipt({
    db,rideId,ride,to:'t@example.com',now:1000,
  })).ok,true,'completed confirmed paid Travel queues before Operator transfer');
  assert.equal(db.data.rides[rideId].receiptQueuedAt,1000);
  assert.equal((await enqueueTravelReceipt({
    db,rideId,ride,to:'t@example.com',now:1001,
  })).duplicate,true,'immutable replay');
  let sends=0;
  const fail=await sweepTravelReceipts({db,now:1000,
    sendReceipt:async()=>{sends++;return {ok:false,reason:'rate_limited'};}});
  assert.equal(fail.retried,1);
  assert.equal(db.data.rides[rideId].receiptSentAt,undefined);
  const early=await sweepTravelReceipts({db,now:3000,
    sendReceipt:async()=>{throw Error('must not send early');}});
  assert.equal(early.considered,0);
  const success=await sweepTravelReceipts({db,now:61000,
    sendReceipt:async ({receipt,to,idempotencyKey})=>{
      sends++;
      assert.equal(receipt.costCents,1944);
      assert.equal(to,'t@example.com');
      assert.equal(idempotencyKey,'travel-receipt/'+rideId);
      return {ok:true,id:'em_123'};
    }});
  assert.equal(success.accepted,1);
  assert.equal(sends,2);
  assert.equal(db.data.rides[rideId].receiptSentAt,61000);
  assert.equal(db.data.travel_receipt_outbox[rideId].status,'accepted');
  const again=await sweepTravelReceipts({db,now:1000000,
    sendReceipt:async()=>{throw Error('must not duplicate');}});
  assert.equal(again.considered,0);
  assert.equal(MAX_ATTEMPTS,16,'daily quota recovery extends beyond 24-hour reset');
  assert.equal(require('./travel-receipt-outbox').retryDelay(16),86400000,
    'capped retry delay can span a full daily quota period');
  const travelMoney=fs.readFileSync(path.join(__dirname,'travelmoney.js'),'utf8');
  const before=travelMoney.indexOf('if (deps.queueReceipt && !ride.receiptQueuedAt && !ride.receiptSentAt)');
  const operator=travelMoney.indexOf('const { accountId, reason } = await deps.operatorPayoutAccount');
  assert.ok(before>=0 && before<operator,'receipt queued before Operator Connect check');
  const scheduler=fs.readFileSync(path.join(__dirname,'scheduler.js'),'utf8');
  assert.ok(scheduler.includes('enqueueTravelReceipt') && scheduler.indexOf('enqueueTravelReceipt')<scheduler.indexOf('deferAccountLookup(ride, now)'));
  const server=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
  assert.ok(server.includes('sweepTravelReceipts') && server.includes('queueReceipt: ride => enqueueTravelReceipt'));
  console.log('PASS receipt outbox: paid-only, independent queue, replay, backoff, provider retry, delivery, no double send');
})().catch(e=>{console.error(e);process.exitCode=1;});
