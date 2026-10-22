'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {scheduledExceptionIdempotencyKey, scheduledExceptionTicket,
  alertScheduledException, listScheduledExceptions, scheduledExceptionsPage}
  = require('./scheduled-exception');

(async()=>{
  const original={travelerUid:'u1',travelerEmail:'',tripNo:'AR-123',
    dep:'Pickup',dest:'Destination'};
  const key=scheduledExceptionIdempotencyKey('reservation-1');
  assert.match(key,/^scheduled-review-[a-f0-9]{32}$/);
  assert.equal(key,scheduledExceptionIdempotencyKey('reservation-1'));
  assert.notEqual(key,scheduledExceptionIdempotencyKey('reservation-2'));
  assert.throws(()=>scheduledExceptionIdempotencyKey('a/b'));

  const ticket=scheduledExceptionTicket({reservationId:'reservation-1',
    reservation:original,reason:'Prepare failed before payment'});
  assert.equal(ticket.uid,'u1');
  assert.equal(ticket.kind,'support');
  assert.equal(ticket.category,'scheduled-travel');
  assert.equal(ticket.idempotencyKey,key);
  assert.match(ticket.description,/No provider payment reference was confirmed/);
  assert.doesNotMatch(ticket.description,/charged|refunded successfully/i);
  const held=scheduledExceptionTicket({reservationId:'reservation-1',
    reservation:original,rideId:'ride-1',paymentIntentId:'pi_bound',
    reason:'Stale provider outcome'});
  assert.match(held.description,/pi_bound/);
  assert.match(held.description,/verify its actual held, captured, released or refunded state/);
  assert(!held.description.includes('REFUND IS OWED'));
  assert.throws(()=>scheduledExceptionTicket({reservationId:'x',reservation:{}}));

  let calls=0;
  const filed=await alertScheduledException({reservationId:'reservation-1',
    reservation:original,reason:'Case needed',
    fileTicket:async t=>{calls++;assert.equal(t.idempotencyKey,key);
      return {ok:true,caseNo:'AR-C-UNITTEST'};}});
  assert.equal(calls,1);
  assert.equal(filed.caseNo,'AR-C-UNITTEST');

  const rows=Array.from({length:63},(_,i)=>({
    id:'r'+String(i).padStart(3,'0'),status:i===2?'dispatched':'needs_attention',
    tripNo:'TRIP'+i,dispatchError:i===0?'<script>alert(1)</script>':'needs review',
    paymentCapturePolicy:'manual_v1',
    authorizedCents:2900,chargedCents:0,caseNo:'',
  }));
  let totalRead=0;
  const store=new Map(rows.map(r=>[r.id,r]));
  const coll={
    where(field,op,value){assert.equal(field,'status');assert.equal(op,'==');assert.equal(value,'needs_attention');return this;},
    orderBy(field,dir){assert.equal(field,'__name__');assert.equal(dir,'asc');return this;},
    startAfter(snapshot){this.cursor=snapshot.id;return this;},
    limit(n){assert(n<=51);const cursor=this.cursor;return {async get(){
      const eligible=[...store.values()].filter(r=>r.status==='needs_attention')
        .filter(r=>!cursor||r.id>cursor).sort((a,b)=>a.id.localeCompare(b.id)).slice(0,n);
      totalRead+=eligible.length;
      return {docs:eligible.map(r=>({id:r.id,data:()=>r}))};
    }};},
    doc(id){return {get:async()=>({id,exists:store.has(id),data:()=>store.get(id)})};}
  };
  const db={collection(name){assert.equal(name,'scheduled_rides');return Object.create(coll)}};
  // First page is bounded to 26 reads; no unordered fleet scan, polling or
  // extra snapshot listeners even when there are many older unresolved cases.
  const first=await listScheduledExceptions(db,{limit:25});
  assert.equal(first.rows.length,25);assert(first.next);
  assert.equal(first.rows[0].paymentState,'authorization_or_provider_review');
  assert(totalRead<=26);
  first.rows[0].atMs=Date.parse('2026-10-22T15:00:00Z');
  const page=scheduledExceptionsPage(first);
  assert(!page.includes('<script>'), 'Founder HTML must escape stored exception messages');
  assert(page.includes('&lt;script&gt;'));
  const second=await listScheduledExceptions(db,{after:first.next,limit:25});
  assert.equal(second.rows.length,25);
  assert(!second.rows.some(r=>first.rows.some(a=>a.id===r.id)));
  await assert.rejects(listScheduledExceptions(db,{after:'bad/path'}),/Invalid reservation cursor/);
  assert.equal((await listScheduledExceptions(db,{after:second.next,limit:25})).rows.length,12);

  const server=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
  const ops=fs.readFileSync(path.join(__dirname,'ops.js'),'utf8');
  assert.match(server,/app\.get\('\/ops\/scheduled-exceptions', requireOps/);
  assert.match(server,/if\(opsAuthMode\(\)!=='named'\)/);
  assert(ops.includes('href="/ops/scheduled-exceptions"'));
  assert.match(server,/listScheduledExceptions\(adminDb\(\)/);
  assert.match(server,/return res\.status\(503\).*Do not assume the queue is clear/);

  console.log('PASS event-driven scheduled Operations cases and bounded authenticated aged-exception view');
})().catch(e=>{console.error(e);process.exitCode=1});
