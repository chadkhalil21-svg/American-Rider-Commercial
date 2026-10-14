'use strict';
const assert = require('node:assert/strict');
const { setGeographicFleetOnline, setFleetOnlineIfOpen } = require('./market-fleet');
const { marketFor } = require('./markets');
const ACTIVE = marketFor({lat:25.775,lng:-80.191});
const CLOSED = marketFor({lat:28.5383,lng:-81.3792});
assert.equal(ACTIVE?.status,'active');
assert.notEqual(CLOSED?.status,'active');

function fakeDb() {
  const rows = new Map(), revisions = new Map();
  let conflict = null;
  const set = (key, record, merge=false) => {
    rows.set(key, merge ? {...rows.get(key),...record} : record);
    revisions.set(key,(revisions.get(key)||0)+1);
  };
  const db = {
    rows, set,
    collection(name) { return { doc(id) {
      const key = name + '/' + String(id);
      return { key, async get() {return {exists: rows.has(key),data:()=>rows.get(key)};} };
    }}; },
    setBeforeCommit(fn) {conflict=fn;},
    async runTransaction(callback) {
      for (let attempt=0;attempt<3;attempt++) {
        const reads=new Map(), writes=[];
        const tx={
          async get(ref) {
            const result=await ref.get();
            reads.set(ref.key,revisions.get(ref.key)||0);
            return result;
          },
          set(ref,data,opts) {writes.push([ref.key,data,opts]);}
        };
        const value=await callback(tx);
        if (conflict && writes.length) {const run=conflict;conflict=null;run();}
        if ([...reads].some(([key,version])=>(revisions.get(key)||0)!==version))continue;
        for(const [key,data,opts] of writes)set(key,data,opts?.merge===true);
        return value;
      }
      throw new Error('transaction conflict');
    }
  };
  return db;
}

(async () => {
  const db=fakeDb(), now=1800000000000;
  const request=(stripeCheckedAt)=>({
    available:true,payoutsEnabled:true,stripeAccountId:'acct_example',
    stripeCheckedAt
  });
  db.set('operators/op1',{available:false,payoutsEnabled:true,stripeCheckedAt:now-2000});
  assert.equal(await setGeographicFleetOnline({db,operatorId:'op1',
    fleetUpdate:request(now-1000),markets:[ACTIVE]}),true,
    'active service geography permits individual Operator duty');
  assert.equal(db.rows.get('operators/op1').available,true);

  assert.equal(await setGeographicFleetOnline({db,operatorId:'op1',
    fleetUpdate:request(now),markets:[CLOSED]}),false,
    'unserved geography cannot go on duty');
  assert.equal(await setGeographicFleetOnline({db,operatorId:'op1',
    fleetUpdate:request(now),markets:[]}),false,
    'a service location must be selected');

  db.set('account_closures/op1',{closingAt:now});
  assert.equal(await setGeographicFleetOnline({db,operatorId:'op1',
    fleetUpdate:request(now),markets:[ACTIVE]}),false,
    'a closing account cannot return to duty');
  assert.equal(await setFleetOnlineIfOpen({db,operatorId:'op1',
    fleetUpdate:{available:true}}),false,
    'development duty also honors account closure');

  db.set('account_closures/op1',{closingAt:0});
  db.set('operators/op1',{available:false,payoutsEnabled:true,stripeCheckedAt:now});
  db.setBeforeCommit(()=>db.set('account_closures/op1',{closingAt:now}));
  assert.equal(await setGeographicFleetOnline({db,operatorId:'op1',
    fleetUpdate:request(now+1),markets:[ACTIVE]}),false,
    'concurrent account closure wins over duty renewal');

  db.set('account_closures/op1',{closingAt:0});
  const initial=now;
  db.set('operators/op1',{available:true,payoutsEnabled:true,stripeCheckedAt:initial});
  db.setBeforeCommit(()=>db.set('operators/op1',{
    available:false,payoutsEnabled:false,stripeCheckedAt:initial+1
  }));
  assert.equal(await setGeographicFleetOnline({db,operatorId:'op1',
    fleetUpdate:request(initial),markets:[ACTIVE]}),false,
    'signed Stripe downgrade defeats stale duty heartbeat');
  assert.equal(db.rows.get('operators/op1').available,false);

  assert.equal(await setGeographicFleetOnline({db,operatorId:'op1',
    fleetUpdate:request(initial),markets:[ACTIVE]}),false,
    'previous webhook downgrade still blocks an old renewal');
  assert.equal(await setGeographicFleetOnline({db,operatorId:'op1',
    fleetUpdate:request(initial+2),markets:[ACTIVE]}),true,
    'fresh verified provider status can restore duty');
  console.log('PASS geographic Operator duty, account closure, concurrent Stripe downgrade');
})().catch((error)=>{console.error(error);process.exitCode=1;});
