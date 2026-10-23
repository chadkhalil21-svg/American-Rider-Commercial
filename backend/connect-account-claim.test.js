'use strict';
// Full OFFLINE Stripe Connect recovery test: never calls Stripe, Firestore or a real Operator.
const assert = require('node:assert/strict');
const { currentConnectFeeConsent, FEE_CONSENT_VERSION } = require('./connect-fee-consent');
const { reserveConnectAccount, saveConnectedAccount, MAX_SAFE_RETRY_MS } = require('./connect-account-claim');
const start=Date.parse('2026-10-23T00:00:00.000Z');
const consent={ version:FEE_CONSENT_VERSION,approvedSeparatelyBilledFees:true,
  accountMonthlyUsd:2,acceptedAt:start-1000 };
assert(currentConnectFeeConsent(consent,start));
const users=new Map();
let queue=Promise.resolve();
const db={
  collection: name => {
    assert.equal(name,'users');
    return { doc:id=>({id}) };
  },
  // Serialize this fake Firestore transaction as the real server does for one
  // document. A rejected operation must not prevent later transactions.
  runTransaction:fn=>{
    const result=queue.then(()=>fn({
      get:async ref=>({exists:users.has(ref.id),data:()=>structuredClone(users.get(ref.id))}),
      set:(ref,patch,opts)=>{
        assert.deepEqual(opts,{merge:true});
        users.set(ref.id,{...(users.get(ref.id)||{}),...patch});
      },
    }));
    queue=result.then(()=>undefined,()=>undefined);
    return result;
  },
};
const uid='operator-synthetic';
users.set(uid,{stripeFeeConsent:consent});
(async()=>{
  assert.deepEqual(await reserveConnectAccount({db,uid:'unknown',now:start}),
    {blocked:'payout_fee_consent_required'},'a user without consent cannot open an account');

  const [first,concurrent]=await Promise.all([
    reserveConnectAccount({db,uid,now:start}),
    reserveConnectAccount({db,uid,now:start+1}),
  ]);
  assert.match(first.creationKey,/^ar_connect_[a-f0-9]{32}$/);
  assert.equal(concurrent.creationKey,first.creationKey,'parallel enrollment uses one provider identity');
  assert.equal(concurrent.reused,true);
  assert.equal(users.get(uid).stripeAccountId,undefined,'a claim does not invent a Stripe account');
  const third=await reserveConnectAccount({db,uid,now:start+1000});
  assert.equal(third.creationKey,first.creationKey,'an interrupted request must resume one claim');

  // A Stripe timeout after creating an Express account will be retried with
  // the same idempotency key. The second call cannot replace it with a new one.
  const stripePath=require.resolve('stripe');
  let retrievalThrows=false,createCalls=0,retrieveCalls=0;
  const fakeStripe={accounts:{
    retrieve:async id=>{
      retrieveCalls++;
      if(retrievalThrows)throw Error('synthetic Stripe 503');
      return {id};
    },
    create:async (fields,opts)=>{
      createCalls++;
      assert.equal(fields.metadata.uid,uid);
      assert.equal(opts.idempotencyKey,first.creationKey);
      return {id:'acct_TestOperator123'};
    },
  }};
  require.cache[stripePath]={id:stripePath,filename:stripePath,loaded:true,
    exports:()=>fakeStripe,children:[],paths:[]};
  process.env.STRIPE_SECRET_KEY='sk_test_synthetic_not_a_real_key';
  const {connectAccountFor}=require('./payments');
  await assert.rejects(()=>connectAccountFor({uid,email:'synthetic@example.invalid'}),
    /safely reserved/,'unclaimed signup cannot create a payout account');
  assert.equal(createCalls,0);
  const created=await connectAccountFor({uid,email:'synthetic@example.invalid',
    creationKey:first.creationKey});
  assert.equal(created.id,'acct_TestOperator123');
  assert.equal(createCalls,1);

  await saveConnectedAccount({db,uid,account:created,creationKey:first.creationKey,now:start+2000});
  assert.equal(users.get(uid).stripeAccountId,created.id);
  const saved=await saveConnectedAccount({db,uid,account:created,
    creationKey:first.creationKey,now:start+3000});
  assert.equal(saved.alreadySaved,true);
  await assert.rejects(()=>saveConnectedAccount({db,uid,
    account:{id:'acct_AnotherAccount'},creationKey:first.creationKey,now:start+3001}),
    /Conflicting connected account/);
  assert.equal(users.get(uid).stripeAccountId,created.id);
  const existing=await reserveConnectAccount({db,uid,now:start+3000});
  assert.equal(existing.existingAccountId,created.id);
  assert.equal((await connectAccountFor({uid,existingAccountId:created.id})).id,created.id);
  // The returned account object is the preserved original account, not another creation.
  assert.equal(createCalls,1);
  retrievalThrows=true;
  await assert.rejects(()=>connectAccountFor({uid,existingAccountId:created.id}),
    /synthetic Stripe 503/);
  assert.equal(createCalls,1,'Stripe outages may not create second accounts');
  assert.equal(users.get(uid).stripeAccountId,created.id);
  assert.equal(retrieveCalls,2);

  const old='operator-stale-synthetic';
  users.set(old,{stripeFeeConsent:consent, stripeAccountCreationKey:first.creationKey,
    stripeAccountCreationStartedAt:start});
  assert.deepEqual(await reserveConnectAccount({db,uid:old,
    now:start+MAX_SAFE_RETRY_MS}),{blocked:'account_creation_reconciliation_required'},
    'never retry a possibly-created provider account beyond its idempotency window');
  assert.equal(createCalls,1);
  console.log('PASS: parallel first-time Connect, interrupted creation, stable idempotency, authoritative account identity, provider 503 fail-closed, 23h expiry and no duplicate creation');
})().catch(e=>{console.error(e);process.exitCode=1});
