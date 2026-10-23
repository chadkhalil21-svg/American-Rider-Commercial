'use strict';
// Execute the actual Express onboarding handler with offline provider + Firestore
// doubles. This tests state changes, not a pattern match or live enrollment.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const server=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
const start=server.indexOf("app.post('/connect/onboard'");
const end=server.indexOf('// Explicit consent for new Operators',start);
assert(start>=0&&end>start,'actual Connect onboarding handler required');
const rows=new Map();
let txChain=Promise.resolve(),created=0,retrieved=0,failCreateOnce=false,failRetrieve=false;
const byUid=new Map();
const db={
  collection(name){
    assert.equal(name,'users');
    return {doc(id){return {id};}};
  },
  runTransaction(callback){
    const job=txChain.then(async()=>{
      const tx={
        get:async ref=>({exists:rows.has(ref.id),data:()=>({...rows.get(ref.id)})}),
        set:(ref,update)=>rows.set(ref.id,{...(rows.get(ref.id)||{}),...update}),
      };
      return callback(tx);
    });
    txChain=job.catch(()=>{});
    return job;
  },
};
const post={};
const app={post:(uri,...args)=>{post[uri]=args.at(-1);}};
const context={
  app,db,console,Date,
  keyMode:'live',
  adminDb:()=>db,adminStatus:()=>({reason:'unavailable'}),
  requireAuth:()=>{},LIMITS:{connect:()=>{}},requireActiveOperatingMarket:()=>{},
  operatorRecord:async uid=>({...rows.get(uid)}),
  connectAccountFor:async ({uid,existingAccountId})=>{
    if(existingAccountId){
      retrieved++;
      if(failRetrieve)throw Error('Stripe temporarily unavailable');
      return {id:existingAccountId};
    }
    created++;
    if(!byUid.has(uid))byUid.set(uid,'acct_fixture_'+uid);
    if(failCreateOnce){failCreateOnce=false;throw Error('Stripe created account but response was lost');}
    return {id:byUid.get(uid)};
  },
  configureConnectPayoutSchedule:async()=>{},
  readKey:()=>null,
  connectOnboardingLink:async()=>({url:'https://stripe.example.invalid/offline'}),
  require:name=>{
    if(name==='./connect-fee-consent')return {
      currentConnectFeeConsent:value=>value===true,
    };
    throw Error('unexpected dependency '+name);
  },
};
vm.runInNewContext(server.slice(start,end),context,{filename:'connect-onboard-actual-route.js'});
assert.equal(typeof post['/connect/onboard'],'function');
async function invoke(uid){
  let status=200,data;
  const res={status(n){status=n;return this;},json(obj){data=obj;return this;}};
  const req={uid,email:'synthetic@example.invalid',protocol:'https',get:()=> 'example.invalid'};
  await post['/connect/onboard'](req,res);
  return {status,data};
}
(async()=>{
  rows.set('existing',{stripeFeeConsent:true,stripeAccountId:'acct_existing'});
  failRetrieve=true;
  const outage=await invoke('existing');
  assert.equal(outage.status,502,'a provider outage must be shown as unavailable');
  assert.equal(rows.get('existing').stripeAccountId,'acct_existing');
  assert.equal(created,0,'retrieval outage never creates another Connect account');
  failRetrieve=false;
  assert.equal((await invoke('existing')).data.accountId,'acct_existing');

  rows.set('first',{stripeFeeConsent:true});
  failCreateOnce=true;
  assert.equal((await invoke('first')).status,502);
  assert.ok(rows.get('first').stripeAccountCreateStartedAt,'claim persisted before provider');
  assert.equal(rows.get('first').stripeAccountId,undefined);
  const recovered=await invoke('first');
  assert.equal(recovered.status,200);
  assert.equal(recovered.data.accountId,'acct_fixture_first');
  assert.equal(rows.get('first').stripeAccountCreateStartedAt,null);

  rows.set('concurrent',{stripeFeeConsent:true});
  const both=await Promise.all([invoke('concurrent'),invoke('concurrent')]);
  assert.equal(both[0].status,200);assert.equal(both[1].status,200);
  assert.equal(both[0].data.accountId,both[1].data.accountId);
  assert.equal(rows.get('concurrent').stripeAccountId,'acct_fixture_concurrent');

  rows.set('stale',{stripeFeeConsent:true,
    stripeAccountCreateStartedAt:Date.now()-24*60*60*1000});
  const oldCount=created;
  const stale=await invoke('stale');
  assert.equal(stale.status,409);
  assert.equal(stale.data.code,'connect_account_reconciliation_required');
  assert.equal(created,oldCount,'expired idempotency window never risks a new account');

  rows.set('unconsented',{stripeFeeConsent:false});
  assert.equal((await invoke('unconsented')).status,409);
  assert.equal(created,oldCount,'no consent, no account');
  console.log('PASS: real onboarding route offline: provider outage, safe retry after lost response, concurrent creation, 24h expiry, consent');
})().catch(e=>{console.error(e);process.exitCode=1});
