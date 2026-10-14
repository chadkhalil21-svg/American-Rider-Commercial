'use strict';
const assert = require('node:assert/strict');
const M = require('./market-readiness');
const { markets } = require('./markets');
const { regionById } = require('./regions');
const ids = ['fl-miami-dade', 'fl-broward', 'fl-palm-beach'];
const rows = ids.map(id => {
  const market = markets().find(m => m.id === id);
  assert.ok(market, id);
  const region = regionById(market.regionId);
  assert.equal(region.id, 'fl-southeast');
  assert.deepEqual(M.manifestFor(market, region).sourceProblems, []);
  return { market, region };
});
const now = 1_800_000_000_000;
const versions = Object.fromEntries(rows.map(({market,region}) => [
  market.id, M.manifestFor(market,region).version,
]));
const evidenceFor = id => Object.fromEntries(M.REQUIRED_EVIDENCE.map(domain => [
  domain, { reference:'independently-audited-'+domain+'-'+id, issuer:'Actual issuer',
    verifiedBy:'named-reviewer', reviewedAt:now-10_000, validUntil:now+86_400_000,
    manifestVersion:versions[id] },
]));

function testDb() {
  const documents = new Map();
  let serial = 0, transactions = 0, writes = 0;
  const db = {
    documents,
    get transactions(){return transactions;},
    get writes(){return writes;},
    collection(coll) {return {doc(id) {
      const key = coll+'/'+(id||'audit-'+(++serial));
      return {key,get:async()=>({
        exists:documents.has(key),data:()=>documents.get(key),
      })};
    }}},
    async runTransaction(fn) {
      transactions++;
      const pending = [];
      let writesStarted = false;
      const tx = {
        get: async ref => {
          assert.ok(!writesStarted,'Firestore transaction reads must precede writes');
          return ref.get();
        },
        set: (ref,obj,{merge}={}) => {
          writesStarted = true;
          pending.push({kind:'set',ref,obj,merge});
        },
        create: (ref,obj) => {
          writesStarted = true;
          pending.push({kind:'create',ref,obj});
        },
      };
      const outcome=await fn(tx);
      for(const item of pending){
        if(item.kind==='create')assert.ok(!documents.has(item.ref.key));
        const prior=documents.get(item.ref.key);
        documents.set(item.ref.key,item.merge?{...prior,...item.obj}:item.obj);
        writes++;
      }
      return outcome;
    },
  };
  return db;
}
function seed(db,blocked=null) {
  for(const id of ids){
    const evidence=evidenceFor(id);
    if(id===blocked)delete evidence.company_insurance_bound;
    db.documents.set('market_admission/'+id, {
      status:'waitlist', manifestVersion:versions[id], evidence,
    });
  }
}
const run = (db,extra={}) => M.activateRegion({
  db, entries:rows, actor:'named-ops',expectedVersions:versions, now, ...extra,
});
(async () => {
  // One missing clearance blocks all three; no tentative writes, no leaked
  // permission, and the response describes the unique blocker once.
  {
    const db=testDb();seed(db,ids[1]);
    const result=await run(db);
    assert.equal(result.ok,false);
    assert.equal(result.code,'region_not_ready');
    assert.equal(result.ready,2);
    assert.deepEqual(result.blockedMarkets,[ids[1]]);
    assert.deepEqual(result.missing.filter(x=>x.id==='company_insurance_bound')
      .map(x=>x.markets),[[ids[1]]]);
    assert.equal(db.writes,0);
    for(const id of ids)assert.equal(db.documents.get('market_admission/'+id).status,'waitlist');
    // Repairing a real company-insurance reference is separate from this operation; no synthetic
    // data may be written by the activation function itself.
    db.documents.get('market_admission/'+ids[1]).evidence=evidenceFor(ids[1]);
    const ok=await run(db);
    assert.equal(ok.ok,true);
    assert.equal(ok.code,'region_activated');
    assert.deepEqual(ok.newlyOpened,ids);
    assert.equal(db.writes,6,'three admission records + three audit records');
    assert.equal([...db.documents.values()].filter(x=>x.action==='market_activated').length,3);
    const again=await run(db);
    assert.equal(again.code,'already_active');
    assert.deepEqual(again.newlyOpened,[]);
    assert.equal(db.writes,6,'idempotent repeat creates no further audit');
  }
  {
    const db=testDb();seed(db);
    const missing=await run(db,{providerMissing:['screening_provider']});
    assert.equal(missing.code,'region_not_ready');
    assert.equal(missing.missing.filter(x=>x.id==='provider:screening_provider').length,1,
      'shared provider dependency grouped once');
    assert.deepEqual(missing.missing.find(x=>x.id==='provider:screening_provider').markets,ids);
    assert.equal(db.writes,0);
    const stale=await run(db,{expectedVersions:{...versions,[ids[1]]:'old'}});
    assert.equal(stale.code,'stale_manifest');assert.equal(db.writes,0);
    assert.equal((await run(db,{actor:null})).code,'invalid_region_request');
    assert.equal((await run(db,{entries:[rows[0],rows[0]]})).code,'invalid_region_markets');
  }
  {
    const db=testDb();seed(db);
    db.documents.get('market_admission/'+ids[0]).status='active';
    const ok=await run(db);
    assert.deepEqual(ok.newlyOpened,ids.slice(1));
    assert.equal(db.writes,4,'already-active county is not touched again');
    db.documents.get('market_admission/'+ids[2]).fleetCleanupPending=true;
    const no=await run(db);
    assert.equal(no.code,'region_not_ready','pending shutdown is never bypassed');
  }
  {
    const db=testDb();seed(db);
    db.documents.get('market_admission/'+ids[0]).evidence.device_and_release_tests.validUntil=now-1;
    assert.equal((await run(db)).code,'region_not_ready','expiry blocks group');
    assert.equal(db.writes,0);
  }
  // GitHub-declared founder commands have their own immutable audit identity.
  // A pause after the instruction overrides any automatic resumption.
  {
    const db=testDb();seed(db);
    const actor='github:chadkhalil21-svg';
    const founderCommandId='founder-open-fl-southeast-20261013';
    const staleIntentAt=now-60_000;
    db.documents.get('market_admission/'+ids[0]).pausedAt=now-1_000;
    const denied=await run(db,{actor,auditMethod:'founder_gitops_release',
      founderCommandId,intentRequestedAt:staleIntentAt});
    assert.equal(denied.code,'market_paused_after_founder_instruction');
    assert.equal(db.writes,0);
    const approved=await run(db,{actor,auditMethod:'founder_gitops_release',
      founderCommandId,intentRequestedAt:now-500});
    assert.equal(approved.code,'region_activated');
    const audits=[...db.documents.values()].filter(x=>x.action==='market_activated');
    assert.equal(audits.length,3);
    assert.ok(audits.every(x=>x.actor.name===actor &&
      x.actor.method==='founder_gitops_release' && x.founderCommandId===founderCommandId));
    assert.equal((await run(db,{actor,auditMethod:'founder_gitops_release'})).code,
      'invalid_admission_authority','GitHub path requires a dated founder order');
    assert.equal((await run(db,{actor,auditMethod:'invented_privilege'})).code,
      'invalid_admission_authority','cannot invent a new admission authority');
    assert.equal(db.writes,6,'all deny cases have zero mutations');
  }
  const server = require('fs').readFileSync(require('path').join(__dirname,'server.js'),'utf8');
  assert.equal(server.includes("app.post('/ops/markets/regions/:regionId/activate'"),false,
    'old county admission endpoint retired');
  assert.equal(server.includes("app.get('/ops/markets', requireOps"),true,
    'Operations now displays configured service geography without admission forms');
  assert.doesNotMatch(server,/requireAdmittedPickup|requireAdmittedTravel/,
    'commercial booking never calls the obsolete market admission middleware');
  console.log('PASS legacy admission engine unit invariants isolated from commercial runtime');
})().catch(e=>{console.error(e);process.exitCode=1;});
