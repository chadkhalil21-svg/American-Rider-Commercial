'use strict';
// Entirely offline. No Stripe credentials, linked accounts, bank records or writes.
const assert=require('node:assert/strict');
const Module=require('node:module');
const originalLoad=Module._load;
const previousKey=process.env.STRIPE_SECRET_KEY;
process.env.STRIPE_SECRET_KEY='sk_test_offline_connect_contract';
const calls={create:[],retrieve:[]};
let failedRetrieve=null, failNewOnce=false;
const accounts=new Map();
const byKey=new Map();
const stripe={
  accounts:{
    retrieve:async id=>{
      calls.retrieve.push(id);
      if(failedRetrieve)throw failedRetrieve;
      if(!accounts.has(id)){const e=new Error('Stripe missing');e.statusCode=404;throw e;}
      return accounts.get(id);
    },
    create:async (data,options)=>{
      calls.create.push({data,options});
      assert.match(options?.idempotencyKey||'',/^ar_connect_account_v1_[a-f0-9]{64}$/);
      if(!byKey.has(options.idempotencyKey)){
        const acct={id:'acct_synthetic_'+(byKey.size+1),metadata:data.metadata};
        byKey.set(options.idempotencyKey,acct);
        accounts.set(acct.id,acct);
      }
      if(failNewOnce){failNewOnce=false;throw Error('Stripe response lost after creation');}
      return byKey.get(options.idempotencyKey);
    },
  },
};
try {
  Module._load=function(request,parent,isMain){
    if(request==='stripe')return ()=>stripe;
    return originalLoad.apply(this,arguments);
  };
  const {connectAccountFor}=require('./payments');
  Module._load=originalLoad;
  (async()=>{
    const old={id:'acct_saved',metadata:{uid:'operator_1'}};
    accounts.set(old.id,old);
    assert.equal((await connectAccountFor({uid:'operator_1',existingAccountId:old.id})).id,old.id);
    assert.equal(calls.create.length,0);
    for(const failure of [Object.assign(Error('Stripe timeout'),{statusCode:503}),
      Object.assign(Error('temporarily not found'),{statusCode:404})]){
      failedRetrieve=failure;
      await assert.rejects(
        ()=>connectAccountFor({uid:'operator_1',existingAccountId:old.id}),/timeout|not found/);
      assert.equal(calls.create.length,0,'no error may create a replacement account');
    }
    failedRetrieve=null;
    await assert.rejects(
      ()=>connectAccountFor({uid:'operator_2',existingAccountId:old.id}),
      /identity requires reconciliation/);
    assert.equal(calls.create.length,0);
    failNewOnce=true;
    await assert.rejects(
      ()=>connectAccountFor({uid:'new_operator',email:'synthetic@example.invalid'}),
      /response lost/);
    const first=await connectAccountFor({uid:'new_operator',email:'synthetic@example.invalid'});
    const second=await connectAccountFor({uid:'new_operator',email:'synthetic@example.invalid'});
    assert.equal(first.id,second.id);
    assert.equal(calls.create.length,3,'new operator retries use the same Stripe key');
    assert.equal(new Set(calls.create.map(x=>x.options.idempotencyKey)).size,1);
    assert.equal(calls.create[0].data.metadata.uid,'new_operator');
    assert.equal(accounts.size,2,'a timed-out response and retries create only one synthetic account');
    console.log('PASS: Connect account lookup outages never replace a saved account; metadata/identity checks; first account Stripe-idempotent retries after lost response');
  })().catch(e=>{console.error(e);process.exitCode=1;});
} catch(e) {
  Module._load=originalLoad;
  throw e;
} finally {
  if(previousKey===undefined)delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY=previousKey;
}
