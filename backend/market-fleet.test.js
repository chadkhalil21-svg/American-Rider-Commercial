const assert = require('node:assert/strict');
const fs = require('node:fs');
const admission = require('./market-readiness');
const fleet = require('./market-fleet');
const { markets, marketFor } = require('./markets');
const { regionById } = require('./regions');
const market = markets().find((m) => m.id === 'fl-miami-dade');
const region = regionById(market.regionId);
const now = 1_800_000_000_000;
const version = admission.manifestFor(market,region).version;
const evidence = Object.fromEntries(admission.REQUIRED_EVIDENCE.map((id)=>[id,{
  reference:'independent-record-'+id, issuer:'Carrier or authority', verifiedBy:'named-ops',
  reviewedAt:now-100,validUntil:now+90_000,manifestVersion:version,
}]));
assert.equal(marketFor({lat:25.775,lng:-80.191})?.id,market.id);
function fakeDb() {
 const rows = new Map(); const versions = new Map(); let beforeCommit = null;
 const set = (key,patch,merge=false) => {rows.set(key,merge?{...rows.get(key),...patch}:patch);versions.set(key,(versions.get(key)||0)+1);};
 const ref = (col,id) => ({id,key:`${col}/${id}`,
  async get(){return {exists:rows.has(this.key),data:()=>rows.get(this.key)};},
  async set(patch,options){set(this.key,patch,options?.merge);},
 });
 const db={rows,set,collection(col){return {
  doc(id){return ref(col,id||'audit-'+(rows.size+1));},
  where(field,op,value){let cursor=null,limit=Infinity;return {
   orderBy(name){assert.equal(name,'__name__');return this;},
   startAfter(id){cursor=id;return this;},
   limit(n){limit=n;return this;},
   async get(){const docs=[...rows.entries()].filter(([key,d])=>key.startsWith(col+'/')&&d[field]===value)
      .sort(([a],[b])=>a.localeCompare(b)).filter(([key])=>!cursor||key.slice(col.length+1)>cursor)
      .slice(0,limit).map(([key,data])=>({id:key.slice(col.length+1),ref:ref(col,key.slice(col.length+1)),data:()=>data}));
    return {docs};}
  };}
 };},
 batch(){const writes=[];return {set(r,p,o){writes.push([r,p,o]);},async commit(){for(const [r,p,o] of writes)set(r.key,p,o?.merge);}};},
 async runTransaction(fn){for(let attempt=0;attempt<3;attempt++){
  const reads=new Map(),writes=[];
  const tx={async get(r){const snap=await r.get();reads.set(r.key,versions.get(r.key)||0);return snap;},
   set(r,p,o){writes.push([r,p,o]);},update(r,p){writes.push([r,p,{merge:true}]);},
   create(r,p){writes.push([r,p,{merge:false}]);}};
  const result=await fn(tx);
  if(beforeCommit&&writes.some(([r])=>r.key.startsWith('operators/'))){const callback=beforeCommit;beforeCommit=null;callback();}
  if([...reads].some(([key,v])=>(versions.get(key)||0)!==v))continue;
  for(const [r,p,o] of writes)set(r.key,p,o?.merge);
  return result;
 }throw new Error('transaction conflict');},
 setBeforeCommit(fn){beforeCommit=fn;}
 };return db;
}
(async()=>{
 const db=fakeDb();const key=`market_admission/${market.id}`;
 db.set(key,{status:'active',manifestVersion:version,evidence});
 db.set('operators/op1',{marketId:market.id,available:true,lat:25.775,lng:-80.191});
 db.set('operators/op2',{marketId:'fl-broward',available:true,lat:26.12,lng:-80.14});
 db.set('operators/op3',{available:true,lat:25.775,lng:-80.191}); // legacy fleet, no marketId
 db.setBeforeCommit(()=>db.set(key,{...db.rows.get(key),status:'paused',fleetCleanupPending:true}));
 assert.equal(await fleet.setGeographicFleetOnline({db,operatorId:'op1',fleetUpdate:{available:true},markets:[market],now}),true,
   'county approval records do not control Operator duty in an active geographic market');
 assert.equal(db.rows.get('operators/op1').available,true,'the geographic duty transaction succeeds');
 assert.equal((await admission.inspectMarket({db,market,region,now})).readyToActivate,false);
 const first=await fleet.deactivateMarketFleet({db,market,maxPages:1,now});
 assert.deepEqual({done:first.done,offlined:first.offlined},{done:true,offlined:2});
 assert.equal(db.rows.get('operators/op1').available,false);
 assert.equal(db.rows.get('operators/op3').available,false,'legacy GPS-only on-duty fleet is also cleared');
 assert.equal(db.rows.get('operators/op2').available,true,'another county is untouched');
 assert.equal(db.rows.get(key).fleetCleanupPending,false);
 assert.equal((await admission.inspectMarket({db,market,region,now})).readyToActivate,true);
 assert.equal(await fleet.setGeographicFleetOnline({db,operatorId:'op1',fleetUpdate:{available:true},markets:[market],now}),true,
   'the stale regional record does not block an eligible Operator');
 // The HTTP refusal path marks the Operator unavailable before a closing-account retry.
 db.set('operators/op1',{...db.rows.get('operators/op1'),available:false});
 db.set(key,{status:'active',manifestVersion:version,evidence,fleetCleanupPending:false});
 db.set('account_closures/op1',{closingAt:now,state:'closing'});
 assert.equal(await fleet.setGeographicFleetOnline({db,operatorId:'op1',fleetUpdate:{available:true},markets:[market],now}),false,
   'a closing Operator cannot reactivate in a commercially active market');
 assert.equal(await fleet.setFleetOnlineIfOpen({db,operatorId:'op1',fleetUpdate:{available:true}}),false,
   'test/development duty cannot bypass the same closing tombstone');
 assert.equal(db.rows.get('operators/op1').available,false);
 const onlineRoute=fs.readFileSync(require.resolve('./server.js'),'utf8').split("app.post('/operator/online'")[1]?.split("app.post('/operator/offline'")[0];
 assert.ok(onlineRoute,'Operator online route must be present');
 assert.ok(onlineRoute.indexOf("db.collection('account_closures')")>=0 &&
   onlineRoute.indexOf("db.collection('account_closures')")<onlineRoute.indexOf('connectAccountStatus('),
   'the inexpensive closing-account preflight must precede the external Stripe readiness check');
 db.set('account_closures/op1',{closingAt:0,state:'open'});
 db.setBeforeCommit(()=>db.set('account_closures/op1',{closingAt:now,state:'closing'}));
 assert.equal(await fleet.setGeographicFleetOnline({db,operatorId:'op1',fleetUpdate:{available:true},markets:[market],now}),false,
   'a concurrently written closing fence forces the duty transaction to retry and refuse');
 assert.equal(db.rows.get('operators/op1').available,false);
 // A signed Connect downgrade concurrent with a stale positive GPS heartbeat must win.
 db.set('account_closures/op1',{closingAt:0,state:'open'});
 db.set(key,{status:'active',manifestVersion:version,evidence,fleetCleanupPending:false});
 const verifiedAt=now-1_000;
 db.set('operators/op1',{marketId:market.id,available:true,
   payoutsEnabled:true,stripeAccountId:'acct_operator_1',stripeCheckedAt:verifiedAt});
 db.setBeforeCommit(()=>{
   db.set('operators/op1',{...db.rows.get('operators/op1'),
     payoutsEnabled:false,available:false,stripeCheckedAt:verifiedAt+1});
 });
 const oldRenewal=await fleet.setGeographicFleetOnline({
   db,operatorId:'op1',fleetUpdate:{available:true,
     payoutsEnabled:true,stripeAccountId:'acct_operator_1',stripeCheckedAt:verifiedAt},
   markets:[market],now,
 });
 assert.equal(oldRenewal,false,'transaction must not resurrect a newer signed Stripe restriction');
 assert.equal(db.rows.get('operators/op1').available,false,
   'Operator remains unavailable after the raced webhook');
 db.set('operators/op1',{marketId:market.id,available:false,payoutsEnabled:false,
   stripeCheckedAt:verifiedAt+1}); // legacy signed webhook record without account ID
 assert.equal(await fleet.setGeographicFleetOnline({
   db,operatorId:'op1',fleetUpdate:{available:true,payoutsEnabled:true,
     stripeAccountId:'acct_operator_1',stripeCheckedAt:verifiedAt},
   markets:[market],now,
 }),false,'old fleet records without account ID must also preserve newer downgrades');
 // A subsequent actual Stripe retrieval is newer than the hold and can restore
 // availability. This cannot be achieved by an old cached GPS heartbeat.
 const verifiedRecovery=await fleet.setGeographicFleetOnline({
   db,operatorId:'op1',fleetUpdate:{available:true,
     payoutsEnabled:true,stripeAccountId:'acct_operator_1',stripeCheckedAt:verifiedAt+2},
   markets:[market],now,
 });
 assert.equal(verifiedRecovery,true,'a genuinely more recent provider check can recover duty');
 assert.equal(db.rows.get('operators/op1').available,true);
 console.log('PASS market pause, account-closure and Stripe webhook/renewal races serialize');
})().catch(e=>{console.error(e);process.exitCode=1;});
