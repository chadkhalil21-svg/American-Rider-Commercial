'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const fleet = require('./market-fleet');
const now = 1_800_000_000_000;

function fakeDb() {
  const rows=new Map(),versions=new Map();
  let beforeCommit=null;
  const set=(key,patch,merge=false)=>{
    rows.set(key,merge?{...rows.get(key),...patch}:patch);
    versions.set(key,(versions.get(key)||0)+1);
  };
  const ref=(collection,id)=>({key:collection+'/'+id,async get(){
    return {exists:rows.has(this.key),data:()=>rows.get(this.key)};
  }});
  const db={rows,set,
    collection(c){return {doc(id){return ref(c,id);}};},
    async runTransaction(fn){
      for(let attempt=0;attempt<3;attempt++){
        const reads=new Map(),writes=[];
        const tx={
          async get(r){const snap=await r.get();reads.set(r.key,versions.get(r.key)||0);return snap;},
          set(r,patch,opt){writes.push([r,patch,opt]);},
        };
        const result=await fn(tx);
        if(beforeCommit&&writes.length){const callback=beforeCommit;beforeCommit=null;callback();}
        if([...reads].some(([k,n])=>(versions.get(k)||0)!==n))continue;
        for(const [r,p,opt] of writes)set(r.key,p,opt?.merge===true);
        return result;
      }
      throw new Error('transaction conflict');
    },
    setBeforeCommit(fn){beforeCommit=fn;},
  };
  return db;
}
(async()=>{
  for(let pass=1;pass<=2;pass++){
    const db=fakeDb();
    const live={available:true,payoutsEnabled:true,stripeAccountId:'acct_1',stripeCheckedAt:now};
    assert.equal(await fleet.setFleetOnlineIfOpen({db,operatorId:'op1',fleetUpdate:live}),true);
    assert.equal(db.rows.get('operators/op1').available,true);

    db.set('account_closures/op1',{closingAt:now});
    assert.equal(await fleet.setFleetOnlineIfOpen({db,operatorId:'op1',fleetUpdate:live}),false,
      'a closing account cannot return to duty');
    db.set('account_closures/op1',{closingAt:0});
    db.setBeforeCommit(()=>db.set('account_closures/op1',{closingAt:now}));
    assert.equal(await fleet.setFleetOnlineIfOpen({db,operatorId:'op1',fleetUpdate:live}),false,
      'closure concurrent with heartbeat causes transaction retry and refusal');

    db.set('account_closures/op1',{closingAt:0});
    db.set('operators/op1',{available:true,payoutsEnabled:true,stripeCheckedAt:now});
    db.setBeforeCommit(()=>db.set('operators/op1',{
      available:false,payoutsEnabled:false,stripeCheckedAt:now+1,
    }));
    assert.equal(await fleet.setFleetOnlineIfOpen({db,operatorId:'op1',fleetUpdate:live}),false,
      'newly downgraded Stripe account cannot be revived by stale GPS heartbeat');
    assert.equal(db.rows.get('operators/op1').available,false);

    db.set('operators/op1',{available:false,payoutsEnabled:false,stripeCheckedAt:now+1});
    assert.equal(await fleet.setFleetOnlineIfOpen({db,operatorId:'op1',fleetUpdate:live}),false,
      'newer payout hold remains decisive even on legacy fleet records');
    assert.equal(await fleet.setFleetOnlineIfOpen({db,operatorId:'op1',
      fleetUpdate:{...live,stripeCheckedAt:now+2}}),true,
      'fresh provider confirmation may restore individual duty');
    assert.equal(db.rows.get('operators/op1').available,true);
  }

  const text=fs.readFileSync(path.join(__dirname,'market-fleet.js'),'utf8');
  assert.doesNotMatch(text,/market_admission|setAdmittedFleetOnline|deactivateMarketFleet|sweepPausedMarketFleet/);
  const server=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
  assert.match(server,/setFleetOnlineIfOpen\(\{db,operatorId:req\.uid,fleetUpdate\}\)/);
  assert.doesNotMatch(server,/setAdmittedFleetOnline\(/);
  console.log('PASS twice: independent Operator duty, concurrent closure and signed payout holds; no county admission reads');
})().catch(e=>{console.error(e);process.exitCode=1;});
