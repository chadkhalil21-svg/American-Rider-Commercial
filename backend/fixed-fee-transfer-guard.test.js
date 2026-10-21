'use strict';
const assert=require('node:assert/strict');
const {transferCancellationOnce}=require('./fixed-fee-transfer-guard');
function harness(){
 const store=new Map([['rides/r1',{status:'cancelled',paymentCapturePolicy:'manual_v1',
  paymentIntentId:'pi1',travelerUid:'u1',operatorId:'op1',
  cancellationFeeCaptureCents:400,arrivalFeeCents:300}]]);
 const changes=[],sent=[];
 const ref=(name,id)=>({path:name+'/'+id});
 let tail=Promise.resolve();
 const db={collection:n=>({doc:id=>ref(n,id)}),runTransaction:fn=>{
   const done=tail.then(()=>fn({
     get:async r=>({exists:store.has(r.path),data:()=>structuredClone(store.get(r.path))}),
     create:(r,v)=>{if(store.has(r.path))throw Error('already exists');
       store.set(r.path,structuredClone(v));changes.push([r.path,'create'])},
     set:(r,v,opt)=>{store.set(r.path,opt?.merge?{...store.get(r.path),...v}:v);
       changes.push([r.path,'set'])},
   }));
   tail=done.catch(()=>{});return done;
 }};
 const attrs={rideId:'r1',paymentIntentId:'pi1',expectedUid:'u1',
   accountId:'acct_op1',chargeId:'ch1',db};
 const transfer=()=>({id:'tr1',amount:300,currency:'usd',
   destination:'acct_op1',source_transaction:'ch1',transfer_group:'ar_cancel_r1',
   metadata:{rideId:'r1',paymentIntentId:'pi1'},reversed:false,amount_reversed:0});
 const work=(o={})=>transferCancellationOnce({...attrs,
   findTransfers:async()=>({data:[...sent]}),
   createTransfer:async()=>{const t=transfer();sent.push(t);return t},...o});
 return {store,changes,sent,work,transfer};
}
(async()=>{
 const a=harness();
 const first=await a.work();
 assert.equal(first.ok,true);assert.equal(first.amountCents,300);
 assert.equal(a.sent.length,1);assert.equal(a.store.get('rides/r1').arrivalFeeTransferId,'tr1');
 const writes=a.changes.length;
 assert.equal((await a.work()).alreadySettled,true);
 assert.equal(a.sent.length,1);assert.equal(a.changes.length,writes,
   'replayed fixed payout reads durable records without a second write');
 const b=harness();
 const uncertain=await b.work({createTransfer:async()=>{throw Error('timeout')}});
 assert.equal(uncertain.ok,false);
 const retry=await b.work({createTransfer:async()=>{throw Error('should not retry')}});
 assert.equal(retry.code,'prior_transfer_outcome_uncertain');
 const c=harness();
 const uncertainSuccess=await c.work({createTransfer:async()=>{c.sent.push(c.transfer());throw Error('network timeout')}});
 assert.equal(uncertainSuccess.code,'provider_transfer_creation_uncertain');
 const resumed=await c.work({createTransfer:async()=>{throw Error('MUST NOT CREATE SECOND')}});
 assert.equal(resumed.ok,true);assert.equal(c.sent.length,1);
 const d=harness();d.store.get('rides/r1').cancellationFeeCaptureCents=0;
 assert.equal((await d.work()).code,'fee_record_not_verified');assert.equal(d.sent.length,0);
 const e=harness();
 e.sent.push({...e.transfer(),amount:301});
 assert.equal((await e.work()).code,'provider_transfer_mismatch');assert.equal(e.sent.length,1);
 const f=harness();f.store.get('rides/r1').travelerUid='stranger';
 assert.equal((await f.work()).code,'fee_record_not_verified');assert.equal(f.sent.length,0);
 const g=harness(), create=[];await Promise.all([
   g.work({createTransfer:async()=>{create.push('first');g.sent.push(g.transfer());return g.sent[0]}}),
   g.work({createTransfer:async()=>{create.push('second');g.sent.push(g.transfer());return g.sent.at(-1)}})
 ]);
 assert.equal(create.length,1,'concurrent terminal events cannot create two payout transfers');
 console.log('PASS: fixed $3 payout exactly once, retry after Stripe timeout, hostile fee, provider mismatch, concurrent requests, zero replay writes');
})().catch(e=>{console.error(e);process.exitCode=1});
