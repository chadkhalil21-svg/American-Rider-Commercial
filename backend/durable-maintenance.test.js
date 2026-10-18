'use strict';
const assert=require('node:assert/strict');
const {durableMaintenance,COLLECTION}=require('./durable-maintenance');
const {PERIOD_MS}=require('./sweepcadence');
const store=new Map();
const db={
  collection(name){
    assert.equal(name,COLLECTION);
    return {doc(id){return {id};}};
  },
  async runTransaction(work){
    const updates=[];
    const tx={
      async get(ref){return {exists:store.has(ref.id),data:()=>store.get(ref.id)};},
      set(ref,data,{merge}={}){updates.push({ref,data,merge});}
    };
    const outcome=await work(tx);
    for(const u of updates)store.set(u.ref.id,u.merge?{...store.get(u.ref.id),...u.data}:u.data);
    return outcome;
  }
};
(async()=>{
for(let pass=0;pass<2;pass++){
  store.clear();
  let calls=0;
  const now=Date.UTC(2026,9,18,3,0,0);
  const work=async()=>{calls++;return {ok:true,runs:calls};};
  assert.deepEqual(await durableMaintenance({db,name:'screening',work,now}),{ok:true,runs:1});
  assert.equal((await durableMaintenance({db,name:'screening',work,now:now+60_000})).skipped,'cadence');
  assert.equal(calls,1,'simulated new server process does not rerun expensive optional job');
  assert.equal((await durableMaintenance({db,name:'screening',work,now:now+PERIOD_MS.screening})).runs,2);
  assert.equal((await durableMaintenance({db,name:'marketReference',work,now:now+60_000})).runs,3,
    'one maintenance type cannot prevent unrelated work');
  assert.equal((await durableMaintenance({db,name:'marketReference',work,now:now+PERIOD_MS.marketReference-1})).skipped,'cadence');
  assert.equal((await durableMaintenance({db,name:'marketReference',work,now:now+PERIOD_MS.marketReference+60_000})).runs,4);
  // A later instance must not get blocked forever when its wall clock moves back.
  assert.equal((await durableMaintenance({db,name:'screening',work,now:now-60_000})).runs,5);
  assert.rejects(()=>durableMaintenance({db:null,name:'screening',work,now}),/Database unavailable/);
  await assert.rejects(durableMaintenance({db,name:'unknown',work,now}),/Invalid/);
}
console.log('PASS twice: Cloud Run process replacement cannot reset shared maintenance timing, while unrelated work continues.');
})().catch(e=>{console.error(e);process.exitCode=1;});
