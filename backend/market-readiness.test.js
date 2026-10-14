const assert = require('node:assert/strict');
const M = require('./market-readiness');
const { markets } = require('./markets');
const { regionById } = require('./regions');
const market = markets().find((m) => m.id === 'fl-miami-dade');
const region = regionById(market.regionId);
const manifest = M.manifestFor(market, region);
assert.equal(manifest.sourceProblems.length, 0);
assert.equal(M.readinessFor({ market, region }).status, 'waitlist');
assert.equal(M.REQUIRED_EVIDENCE.length, 3);
assert.equal(M.readinessFor({ market, region }).missing.length, 0);
assert.equal(M.readinessFor({ market, region }).readyToActivate, true,
  'the eleven former admission records are no longer regional requirements');

const now = 1_800_000_000_000;
const evidence = Object.fromEntries(M.REQUIRED_EVIDENCE.map((id) => [id, {
  reference: `external-record-${id}`, issuer: 'Verified external authority',
  verifiedBy: 'named-ops', reviewedAt: now - 5_000, validUntil: now + 10_000,
  manifestVersion: manifest.version,
}]));
const rec = { status: 'active', manifestVersion: manifest.version, evidence };
const noProofButConfigured = { status: 'active', manifestVersion: manifest.version, evidence: {} };
assert.equal(M.readinessFor({ market, region, record: noProofButConfigured, now }).status,'active',
  'regional activation no longer depends on eleven domain records');
assert.equal(M.readinessFor({ market, region, record: noProofButConfigured,
  now, providerMissing: ['screening_provider'] }).status,'waitlist',
  'real external screening provider condition remains enforced separately');
assert.equal(M.readinessFor({ market, region, record: rec, now }).status, 'active');
assert.equal(M.readinessFor({ market, region, record: rec, now: now + 10_001 }).status, 'active', 'retired evidence is not a regional expiry gate');
assert.equal(M.readinessFor({ market, region, record: { ...rec, manifestVersion: 'old' }, now }).status, 'waitlist', 'source drift stops offers');
assert.equal(M.readinessFor({ market, region, record: rec, now, providerMissing: ['stripe_live_key'] }).status, 'waitlist');
assert.equal(M.readinessFor({ market: null, region: null, now }).status, 'waitlist');

function memoryDb() {
  const data = new Map(); const writes = [];
  const collection = (name) => ({ doc: (id) => {
    id ||= `audit-${writes.length + 1}`;
    const key = `${name}/${id}`;
    return { id, key, async get() { return { exists: data.has(key), data: () => data.get(key) }; } };
  } });
  return { data, writes, collection, async runTransaction(fn) {
    const tx = {
      get: (ref) => ref.get(),
      set: (ref, value, opts) => { data.set(ref.key, opts?.merge ? { ...data.get(ref.key), ...value } : value); writes.push(['set', ref.key]); },
      update: (ref, value) => { data.set(ref.key, { ...data.get(ref.key), ...value }); writes.push(['update', ref.key]); },
      create: (ref, value) => { assert.equal(data.has(ref.key), false); data.set(ref.key, value); writes.push(['create', ref.key]); },
    };
    return fn(tx);
  } };
}
(async () => {
  const db = memoryDb();
  assert.equal((await M.inspectMarket({ db, market, region, now })).status, 'waitlist');
  assert.equal((await M.activateMarket({ db, market, region, actor: 'named-ops', expectedVersion: manifest.version, now })).code, 'market_not_ready');
  for (const id of M.ONBOARDING_EVIDENCE) {
    const out = await M.recordEvidence({ db, market, region, domain: id, actor: 'named-ops',
      expectedVersion: manifest.version, now,
      input: { reference: `external-record-${id}`, issuer: 'Independent issuer', validUntil: now + 10_000 } });
    assert.deepEqual(out, { ok: true, status: 'paused' });
  }
  const staged = await M.authorizeOnboarding({ db, market, region, actor: 'named-ops', expectedVersion: manifest.version, now });
  assert.equal(staged.status, 'onboarding');
  assert.equal((await M.inspectMarket({ db, market, region, now })).status, 'onboarding');
  assert.equal((await M.activateMarket({ db, market, region, actor: 'named-ops', expectedVersion: manifest.version, now, providerMissing: ['screening_provider'] })).code, 'market_not_ready');
  for (const id of ['jurisdiction_authority']) {
    await M.recordEvidence({ db, market, region, domain: id, actor: 'named-ops',
      expectedVersion: manifest.version, now,
      input: { reference: `external-record-${id}`, issuer: 'Independent issuer', validUntil: now + 10_000 } });
  }
  assert.equal(db.data.get(`market_admission/${market.id}`).fleetCleanupPending,true,
    'reviewing evidence while intake is enabled pauses intake and queues fleet cleanup');
  assert.equal((await M.inspectMarket({ db, market, region, now })).readyToActivate,false);
  // The dedicated market-fleet test exercises cleanup; only after that work may Ops reactivate.
  db.data.get(`market_admission/${market.id}`).fleetCleanupPending=false;
  assert.equal((await M.inspectMarket({ db, market, region, now })).readyToActivate, true);
  assert.equal((await M.activateMarket({ db, market, region, actor: 'named-ops', expectedVersion: 'stale', now })).code, 'stale_manifest');
  assert.equal((await M.activateMarket({ db, market, region, actor: 'named-ops', expectedVersion: manifest.version, now, providerMissing: ['stripe'] })).code, 'market_not_ready');
  const activated = await M.activateMarket({ db, market, region, actor: 'named-ops', expectedVersion: manifest.version, now });
  assert.equal(activated.status, 'active');
  assert.equal((await M.inspectMarket({ db, market, region, now })).status, 'active');
  const changedRegion = { ...region, timezone: 'America/New_York-v2' };
  const changed = M.manifestFor(market, changedRegion);
  assert.notEqual(changed.version, manifest.version);
  assert.equal((await M.inspectMarket({ db, market, region: changedRegion, now })).status, 'waitlist');
  assert.equal((await M.activateMarket({ db, market, region: changedRegion, actor: 'named-ops',
    expectedVersion: changed.version, now })).status, 'active');
  assert.equal((await M.recordEvidence({ db, market, region: changedRegion, domain: 'jurisdiction_authority',
    actor: 'named-ops', expectedVersion: manifest.version, now,
    input: { reference: 'old-manifest-review', issuer: 'Independent issuer', validUntil: now+10_000 } })).code, 'stale_manifest');
  const paused = await M.pauseMarket({ db, market, actor: 'named-ops', reason: 'Carrier lapse in this market', now: now + 1 });
  assert.equal(paused.status, 'paused');
  assert.equal(db.data.get(`market_admission/${market.id}`).fleetCleanupPending,true);
  assert.equal((await M.inspectMarket({ db, market, region, now })).status, 'waitlist');
  assert.equal(db.data.get('audit_log/audit-2')?.actor?.name, 'named-ops');
  console.log('PASS versioned market admission, expiry, production dependencies, audited evidence, activate and pause');
})().catch((error) => { console.error(error); process.exitCode = 1; });
