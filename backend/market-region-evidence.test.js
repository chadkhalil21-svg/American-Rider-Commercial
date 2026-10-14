'use strict';
const assert=require('node:assert/strict');
const {markets}=require('./markets');
const {regionById}=require('./regions');
const {manifestFor,recordRegionEvidence,readinessFor,REQUIRED_EVIDENCE}=require('./market-readiness');
const fs=require('node:fs');
const path=require('node:path');
const region=regionById('fl-southeast');
const entries=markets().filter(m=>m.regionId===region.id)
  .map(market=>({market,region}));
assert.equal(entries.length,3);
const versions=Object.fromEntries(entries.map(({market,region})=>[market.id,manifestFor(market,region).version]));
const now=1800000000000;
function memoryDb() {
 const data=new Map(),writes=[];
 let serial=0;
 return {data,writes,collection(coll){return {doc(id){const key=coll+'/'+(id||'audit-'+(++serial));
  return {key,get:async()=>({exists:data.has(key),data:()=>data.get(key)})};}};},
 async runTransaction(fn) {
  const changes=[];let writeStarted=false;
  const tx={get:ref=>{assert.equal(writeStarted,false,'all reads before all writes');return ref.get();},
    set:(ref,val,opts)=>{writeStarted=true;changes.push({ref,val,opts});},
    create:(ref,val)=>{writeStarted=true;changes.push({ref,val});},
  };
  const out=await fn(tx);
  for(const change of changes) {
   if(change.opts?.merge) {
    data.set(change.ref.key,{...(data.get(change.ref.key)||{}),...change.val});
   } else {
    assert.equal(data.has(change.ref.key),false);
    data.set(change.ref.key,change.val);
   }
   writes.push(change.ref.key);
  }
  return out;
 }};
}
const input={reference:'verified-regional-external-reference',issuer:'Independent named issuer',
  validUntil:now+86400000,allCountiesVerified:true};
(async()=>{
 for(let pass=0;pass<2;pass++){
  const db=memoryDb();
  const invoke=(opts={})=>recordRegionEvidence({db,entries,domain:'disclosure_and_retention',
    input,actor:'named_ops',expectedVersions:versions,now,...opts});
  assert.equal((await invoke({input:{...input,allCountiesVerified:false}})).code,'invalid_region_evidence_request');
  assert.equal((await invoke({input:{...input,validUntil:now-1}})).code,'invalid_evidence');
  assert.equal((await invoke({actor:''})).code,'invalid_region_evidence_request');
  assert.equal((await invoke({domain:'manufactured_permission'})).code,'invalid_evidence');
  assert.equal((await invoke({expectedVersions:{...versions,[entries[0].market.id]:'stale'}})).code,
    'stale_or_invalid_region_manifest');
  assert.equal((await invoke({entries:entries.slice(0,2)})).code,'partial_region_not_allowed');
  assert.equal((await invoke({entries:[entries[0],entries[0],entries[2]]})).code,
    'stale_or_invalid_region_manifest');
  assert.equal(db.writes.length,0,'invalid request never mutates');
  const ok=await invoke();
  assert.equal(ok.ok,true);
  assert.equal(ok.marketIds.length,3);
  assert.equal(db.writes.length,4,'3 market documents and one shared audit');
  for(const {market,region} of entries) {
    const saved=db.data.get('market_admission/'+market.id);
    assert.equal(saved.evidence.disclosure_and_retention.scope,'verified_complete_region');
    assert.deepEqual(saved.evidence.disclosure_and_retention.coveredMarkets,
      entries.map(e=>e.market.id).sort());
    assert.equal(saved.evidence.disclosure_and_retention.manifestVersion,versions[market.id]);
    const state=readinessFor({market,region,record:saved,now});
    assert.equal(state.status,'waitlist','one source does NOT turn on paid bookings');
    assert.equal(state.missing.length,state.evidenceCount-1);
  }
  assert.equal(db.data.get('audit_log/audit-1').action,'region_evidence_recorded');
  assert.equal(db.data.get('audit_log/audit-1').actor.method,'named_ops_mfa');
  // A newly reviewed source must pause the active fleet, not quietly
  // grant a new long-lived approval or bypass the founder pause.
  for(const {market} of entries)db.data.get('market_admission/'+market.id).status='active';
  const changed=await invoke({domain:'operator_insurance_process'});
  assert.equal(changed.ok,true);
  assert.equal(db.writes.length,8);
  for(const {market,region} of entries){
    const saved=db.data.get('market_admission/'+market.id);
    assert.equal(saved.status,'paused');
    assert.equal(saved.fleetCleanupPending,true);
    assert.equal(readinessFor({market,region,record:saved,now}).readyToActivate,false);
  }
 }
 const server=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
 const ui=fs.readFileSync(path.join(__dirname,'market-readiness-ui.js'),'utf8');
 assert.equal(server.includes("app.post('/ops/markets/regions/:regionId/evidence'"),false,
   'obsolete per-county evidence recording route is not mounted in the commercial backend');
 assert.match(ui,/id="region-evidence-form"/);
 assert.match(ui,/allCountiesVerified:true/);
 assert.match(ui,/Independent review confirms this exact source covers Miami-Dade, Broward and Palm Beach/);
 console.log('PASS twice: scoped 3-county real evidence re-use, no forged permits, atomic audit, still-blocked paid Travel, pause cleanup');
})().catch(e=>{console.error(e);process.exitCode=1;});
