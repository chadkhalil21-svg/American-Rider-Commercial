'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {dueReservationsQuery,shouldWriteWaitingState,WAITING_STATE_INTERVAL_MS}=require('./scheduled-query-budget');
const indexManifest=require('../firestore.indexes.json');
const scheduler=fs.readFileSync(path.join(__dirname,'scheduler.js'),'utf8');
const windowMs=25*60*1000,now=Date.UTC(2026,9,17,12,0,0);
const dueFields=['status:ASCENDING','atMs:ASCENDING'];
const indexes=indexManifest.indexes.filter(i=>i.collectionGroup==='scheduled_rides' &&
  dueFields.every((x,k)=>i.fields[k]?.fieldPath+':'+i.fields[k]?.order===x));
assert.equal(indexes.length,1,'existing (status, atMs) index is enough; no duplicate required');
assert.match(scheduler,/dueReservationsQuery\(db, now, WINDOW_MS, RESERVED_SCAN_LIMIT\)/);
assert.match(scheduler,/touchWaiting\(db, id, r, 'no operator available', now\)/);
assert.match(scheduler,/touchWaiting\(db, id, r, 'market admission unavailable', now\)/);
assert.match(scheduler,/touchWaiting\(db, id, r,\s*`holding/);
function fakeDb(rows){
  const metrics={calls:0,returned:0,filters:[],limit:0,ordering:null};
  const collection={where(field,op,value){metrics.filters.push({field,op,value});return this;},
    orderBy(field,order){metrics.ordering={field,order};return this;},
    limit(n){metrics.limit=n;return this;},
    async get(){
      metrics.calls++;
      const list=rows.filter(row=>metrics.filters.every(q=>{
        if(q.op==='==')return row[q.field]===q.value;
        if(q.op==='<=')return row[q.field]<=q.value;
        throw Error('unexpected query');
      })).sort((a,b)=>a.atMs-b.atMs).slice(0,metrics.limit);
      metrics.returned+=list.length;
      return {docs:list.map(row=>({id:row.id,data:()=>row}))};
    }};
  return {metrics,collection:()=>collection};
}
(async()=>{
for(let pass=0;pass<2;pass++){
  const distant=Array.from({length:500},(_,i)=>({id:'future-'+i,status:'reserved',atMs:now+windowMs+3600000+i*60000}));
  const rows=[{id:'overdue',status:'reserved',atMs:now-60000},
    {id:'due',status:'reserved',atMs:now+windowMs},
    {id:'not-reserved',status:'cancelled',atMs:now},...distant];
  const db=fakeDb(rows);
  const q=dueReservationsQuery(db,now,windowMs,100);
  const snap=await q.get();
  assert.deepEqual(snap.docs.map(d=>d.id),['overdue','due'],
    'no reservation due by the inclusive boundary is missed');
  assert.equal(db.metrics.returned,2,'do not read 500 distant-future reservations');
  assert.deepEqual(db.metrics.filters,[
    {field:'status',op:'==',value:'reserved'},
    {field:'atMs',op:'<=',value:now+windowMs}]);
  assert.deepEqual(db.metrics.ordering,{field:'atMs',order:'asc'});
  assert.equal(db.metrics.limit,100,'bound backlog without silently limiting total processing across sweeps');
  const empty=fakeDb(distant);
  assert.equal((await dueReservationsQuery(empty,now,windowMs,100).get()).docs.length,0,
    'zero due reservations yields no returned documents');
  const dense=Array.from({length:150},(_,i)=>({id:'due-'+i,status:'reserved',atMs:now+i}));
  assert.equal((await dueReservationsQuery(fakeDb(dense),now,windowMs,100).get()).docs.length,100,
    'a due backlog remains capped; the existing saturation alert must fire');
  assert.equal(shouldWriteWaitingState({},'no operator available',now),true);
  const waiting={lastSweepAt:now,lastSweepResult:'no operator available'};
  assert.equal(shouldWriteWaitingState(waiting,'no operator available',now+60000),false);
  assert.equal(shouldWriteWaitingState(waiting,'no operator available',now+WAITING_STATE_INTERVAL_MS-1),false);
  assert.equal(shouldWriteWaitingState(waiting,'no operator available',now+WAITING_STATE_INTERVAL_MS),true);
  assert.equal(shouldWriteWaitingState(waiting,'market admission unavailable',now+60000),true,
    'new safety/market blocking information is never delayed');
  assert.equal(shouldWriteWaitingState({lastSweepAt:now+600000,lastSweepResult:'no operator available'},
    'no operator available',now),true,'an invalid future checkpoint must not suppress updates');
  assert.equal(shouldWriteWaitingState({lastSweepAt:0,lastSweepResult:'no operator available'},
    'no operator available',now),true,'legacy pending reservation is stamped once');
  assert.throws(()=>dueReservationsQuery(fakeDb([]),Infinity,windowMs,100),/invalid/);
  assert.throws(()=>shouldWriteWaitingState({},null,now),/invalid/);
}
console.log('PASS twice: due-only index limits far-future reads; identical waiting notes avoid repeated writes with full reevaluation.');
})().catch(e=>{console.error(e);process.exitCode=1;});
