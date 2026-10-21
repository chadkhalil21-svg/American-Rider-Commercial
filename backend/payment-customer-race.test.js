'use strict';
// No Stripe network, no real Customer, no card numbers. Synthetic concurrent
// Traveler requests model the search-index lag at first Wallet use.
const assert = require('node:assert/strict');
const Module = require('node:module');
const realLoad = Module._load;
const originalKey = process.env.STRIPE_SECRET_KEY;
process.env.STRIPE_SECRET_KEY = 'sk_test_synthetic_user_journey';
let createCalls = 0;
const keys = new Map();
const fakeStripe = {
  customers: {
    async search() { return {data:[]}; }, // deliberate eventual-consistency lag
    async create(body,options) {
      createCalls++;
      assert.ok(body.metadata.uid);
      assert.match(options.idempotencyKey,/^ar_traveler_[0-9a-f]{40}$/);
      const prior = keys.get(options.idempotencyKey);
      if (prior) {
        assert.equal(body.metadata.uid,prior.metadata.uid);
        return prior;
      }
      // Allow concurrent callers to overlap.
      await Promise.resolve();
      const result = {id:'cus_synthetic_'+keys.size,metadata:body.metadata};
      keys.set(options.idempotencyKey,result);
      return result;
    },
  },
};
Module._load = function(request,parent,isMain) {
  if (request === 'stripe') return () => fakeStripe;
  return realLoad.apply(this,arguments);
};
let payments;
try { payments = require('./payments'); }
finally { Module._load = realLoad; }
(async()=>{
  for(let pass=0;pass<2;pass++) {
    const uid='synthetic_traveler_'+pass;
    const clients=await Promise.all(Array.from({length:12},
      ()=>payments.customerForTraveler({uid,email:'synthetic@example.invalid'})));
    assert.equal(new Set(clients.map(x=>x.id)).size,1,
      'twelve overlapping Wallet/checkout requests must share one Stripe Customer');
    assert.equal(createCalls,pass*2+1,'only one create attempt in the in-flight window');
    const again=await payments.customerForTraveler({uid,email:'synthetic@example.invalid'});
    assert.equal(again.id,clients[0].id,'idempotent create retry resolves same Customer');
    assert.equal(createCalls,pass*2+2);
  }
  await assert.rejects(payments.customerForTraveler({uid:''}),/authenticated Traveler/);
  assert.equal(keys.size,2,'separate identities cannot be joined to the same Customer');
  console.log('PASS TWICE: concurrency coalesced; stable Stripe idempotency across search lag; different Travelers isolated; no live money');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{
  if(originalKey===undefined)delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY=originalKey;
});
