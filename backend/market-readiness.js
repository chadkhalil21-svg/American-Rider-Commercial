// One national admission engine. Geography is not permission to sell transportation.
// This module is deliberately independent of Express, Stripe and any provider network call.
const { createHash } = require('node:crypto');
const { regionAdmissionProblems } = require('./market-admission');
const { forState: insuranceForState } = require('./insurance-jurisdictions');
const { evidenceProblem } = require('./market-evidence-diagnosis');
const {configuredControls,mappedConfiguredSubcontrols}=require('./market-runtime-controls');
const founderDeclarations = require('./founder-platform-declarations.json');

const SCHEMA_VERSION = 3;
// The eleven former regional document attestations are RETIRED as admission
// prerequisites. They are neither renamed nor auto-filled with synthetic proof.
// Configured FL already verifies the remaining three built-in rule types in code.
// Live external provider health, Operator qualification and authorization still
// have independent runtime checks; this is not a statement of legal clearance.
const REQUIRED_EVIDENCE = Object.freeze([
  'jurisdiction_authority', 'operator_insurance_process', 'screening_agreement',
]);
const ONBOARDING_EVIDENCE = Object.freeze([...REQUIRED_EVIDENCE]);
const ONBOARDING_PROVIDERS = new Set(['stripe_live_key', 'screening_provider', 'firebase_admin', 'ops_auth']);
const COLLECTION = 'market_admission';

function manifestFor(market, region) {
  if (!market || !region || market.regionId !== region.id) return null;
  const source = {
    schemaVersion: SCHEMA_VERSION, marketId: market.id, regionId: region.id,
    countyFips: market.fips, timezone: region.timezone,
    jurisdiction: region.jurisdiction, geographyEvidence: region.geographyEvidence,
    tollPolicy: region.tollPolicy, marketFips: region.marketFips,
    insurance: insuranceForState(region.jurisdiction?.stateCode)?.source || null,
    requiredEvidence: REQUIRED_EVIDENCE,
  };
  const version = createHash('sha256').update(JSON.stringify(source)).digest('hex');
  const sourceProblems = regionAdmissionProblems(region);
  if (market.status !== 'active') sourceProblems.push(`${market.id}: geographic market is not configured active`);
  if (!region.activeMarketFips?.includes(market.fips)) sourceProblems.push(`${market.id}: county is not in the region activation set`);
  if (!region.timezone) sourceProblems.push(`${market.id}: time zone is absent`);
  return { ...source, version, sourceProblems };
}

function requirementsFor(manifest, record = {}, now = Date.now(), providerMissing = [], level = 'commercial') {
  if (!manifest) return [{ id: 'source', reason: 'No configured market or service region' }];
  const missing = manifest.sourceProblems.map((reason) => ({ id: 'source', reason }));
  if (record.fleetCleanupPending) missing.push({ id: 'fleet_cleanup', reason: 'Operator availability cleanup after a market pause has not completed' });
  // No mandatory eleven-domain market_admission document checklist.
  // The remaining built-in controls are validated at their proper runtime
  // boundaries; never infer the presence of a real external insurer or CRA.
  const redundant=new Set(configuredControls(manifest));
  for (const id of level === 'onboarding' ? ONBOARDING_EVIDENCE : REQUIRED_EVIDENCE) {
    if(redundant.has(id))continue;
    const problem=evidenceProblem(id,record.evidence?.[id],manifest.version,now);
    if(problem)missing.push(problem);
  }
  for (const id of providerMissing) missing.push({ id: `provider:${id}`, code:'production_verification_missing', reason: `Production dependency is unavailable or its verification has not been recorded: ${id}` });
  return missing;
}


// Founder approval is a policy decision, not an external clearance.
// This is deliberately not consumed by requirementsFor() or activateRegion().
function founderDeclaredFrameworks(manifest, missing) {
  if (!manifest || manifest.regionId !== founderDeclarations.regionId ||
      manifest.sourceProblems.length || configuredControls(manifest).length === 0) return [];
  const outstanding = new Map(missing.map(problem => [problem.id, problem.code || 'verification_required']));
  return founderDeclarations.domains.map(domain => ({
    domain,
    policyDecision: 'founder_finalized',
    policySatisfied: true, // Founder-authorized internal policy, NOT external commissioning.
    marketEvidenceState: REQUIRED_EVIDENCE.includes(domain)
      ? (outstanding.get(domain) || 'verified_record') : 'retired_from_region_admission',
    approvalGrantsMarketAccess: false,
  }));
}

function readinessFor({ market, region, record = {}, now = Date.now(), providerMissing = [] }) {
  const manifest = manifestFor(market, region);
  const missing = requirementsFor(manifest, record, now, providerMissing);
  const onboardingMissing = requirementsFor(manifest, record, now,
    providerMissing.filter((id) => ONBOARDING_PROVIDERS.has(id)), 'onboarding');
  const versionCurrent = record.manifestVersion === manifest?.version;
  const active = record.status === 'active' && versionCurrent && missing.length === 0;
  const onboarding = (record.status === 'onboarding' || record.status === 'active') &&
    versionCurrent && onboardingMissing.length === 0;
  return {
    marketId: market?.id || null, manifestVersion: manifest?.version || null,
    status: active ? 'active' : onboarding ? 'onboarding' : 'waitlist',
    storedStatus: record.status || 'waitlist', readyToOnboard: onboardingMissing.length === 0,
    readyToActivate: missing.length === 0, onboardingMissing, missing,
    evidenceCount: REQUIRED_EVIDENCE.length-configuredControls(manifest).length,
    enforcedInCode: configuredControls(manifest),
    mappedConfiguredSubcontrols: mappedConfiguredSubcontrols(manifest),
    founderDeclaredFrameworks: founderDeclaredFrameworks(manifest, missing),
    // A separate, explicit policy-plane result. Do NOT feed this into
    // requirementsFor(), readyToActivate, or paid-Travel authorization.
    executivePolicyReadinessSatisfied:
      founderDeclaredFrameworks(manifest, missing).length === founderDeclarations.domains.length,
    // Regional activation reads the county state plus runtime provider conditions.
    // It never requires individual users/ or operators/ documents. Those are
    // checked at qualification, duty, dispatch and acceptance, not here.
    readinessScope: {
      level: 'regional_platform',
      individualOperatorRowsRequired: false,
      operatorEligibilityCheckedAtRuntime: true,
      configuredMarket: !!manifest && manifest.sourceProblems.length === 0,
      platformEvidenceComplete: missing.length === 0,
    },
    fleetCleanupPending: !!record.fleetCleanupPending,
  };
}

async function inspectMarket({ db, market, region, providerMissing = [], now = Date.now() }) {
  if (!db || !market) return readinessFor({ market, region, providerMissing: ['database'], now });
  try {
    const snap = await db.collection(COLLECTION).doc(market.id).get();
    return readinessFor({ market, region, record: snap.exists ? snap.data() : {}, providerMissing, now });
  } catch {
    return readinessFor({ market, region, providerMissing: ['database'], now });
  }
}

function validEvidenceInput(domain, input) {
  if (!REQUIRED_EVIDENCE.includes(domain)) return null;
  const reference = String(input?.reference || '').trim().slice(0, 500);
  const issuer = String(input?.issuer || '').trim().slice(0, 120);
  const validUntil = Number(input?.validUntil);
  if (reference.length < 8 || issuer.length < 3 || !Number.isSafeInteger(validUntil)) return null;
  return { reference, issuer, validUntil };
}

// A named, MFA-authenticated Operations user may register an externally verified reference.
// Recording evidence pauses an active market; a separate readiness check and activation is needed.
async function recordEvidence({ db, market, region, domain, input, actor, expectedVersion, now = Date.now() }) {
  const proof = validEvidenceInput(domain, input);
  const manifest = manifestFor(market, region);
  if (!db || !manifest || !actor || !proof || proof.validUntil <= now) return { ok: false, code: 'invalid_evidence' };
  if (expectedVersion !== manifest.version) return { ok: false, code: 'stale_manifest' };
  const ref = db.collection(COLLECTION).doc(market.id);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref); const prior = snap.exists ? snap.data() : {};
    tx.set(ref, {
      evidence: { ...(prior.evidence || {}), [domain]: { ...proof, manifestVersion: manifest.version,
        verifiedBy: actor, reviewedAt: now } },
      status: 'paused', updatedAt: now, updatedBy: actor,
      ...(prior.status === 'active' || prior.status === 'onboarding'
        ? { fleetCleanupPending: true, fleetCleanupCursor: null } : {}),
    }, { merge: true });
    tx.create(db.collection('audit_log').doc(), {
      at: now, action: 'market_evidence_recorded', marketId: market.id,
      domain, manifestVersion: manifest.version,
      actor: { name: actor, method: 'named_ops_mfa' }, reference: proof.reference,
    });
    return { ok: true, status: 'paused' };
  });
}

// Authenticate and review a source ONCE if it actually covers every county.
// Do not infer that a policy, report, or contract covers every jurisdiction.
async function recordRegionEvidence({ db, entries, domain, input, actor, expectedVersions, now = Date.now() }) {
  if (!db || !Array.isArray(entries) || !entries.length || entries.length > 25 ||
      !actor || !/^[A-Za-z0-9_@.:-]{3,100}$/.test(String(actor)) ||
      !expectedVersions || typeof expectedVersions !== 'object' ||
      Array.isArray(expectedVersions) || input?.allCountiesVerified !== true) {
    return {ok:false,code:'invalid_region_evidence_request'};
  }
  const proof=validEvidenceInput(domain,input);
  if (!proof || proof.validUntil <= now) return {ok:false,code:'invalid_evidence'};
  const ids=new Set(),prepared=[];
  let regionId=null,region=null;
  for(const entry of entries){
    const manifest=manifestFor(entry?.market,entry?.region);
    if(!manifest || !entry?.market?.id || ids.has(entry.market.id) ||
        (regionId!==null&&regionId!==entry.region.id) ||
        expectedVersions[entry.market.id]!==manifest.version)
      return {ok:false,code:'stale_or_invalid_region_manifest'};
    regionId=entry.region.id;
    region=entry.region;
    ids.add(entry.market.id);
    prepared.push({market:entry.market,manifest,ref:db.collection(COLLECTION).doc(entry.market.id)});
  }
  const configured=new Set(region?.activeMarketFips||[]);
  if(ids.size!==configured.size||configured.size===0||
      prepared.some(e=>!configured.has(e.market.fips)))
    return {ok:false,code:'partial_region_not_allowed'};
  return db.runTransaction(async tx=>{
    // No changes until ALL market snapshots are read and verified.
    const snapshots=await Promise.all(prepared.map(p=>tx.get(p.ref)));
    const targetMarkets=prepared.map(p=>p.market.id).sort();
    const evidence={
      reference:proof.reference,issuer:proof.issuer,validUntil:proof.validUntil,
      verifiedBy:String(actor),reviewedAt:now,scope:'verified_complete_region',
      coveredMarkets:targetMarkets,
    };
    for(let i=0;i<prepared.length;i++){
      const p=prepared[i],prior=snapshots[i].exists?snapshots[i].data():{};
      tx.set(p.ref,{
        evidence:{...(prior.evidence||{}),[domain]:{...evidence,manifestVersion:p.manifest.version}},
        status:'paused',updatedAt:now,updatedBy:String(actor),
        ...(['active','onboarding'].includes(prior.status)
          ? {fleetCleanupPending:true,fleetCleanupCursor:null}:{}),
      },{merge:true});
    }
    tx.create(db.collection('audit_log').doc(),{
      at:now,action:'region_evidence_recorded',regionId,marketIds:targetMarkets,
      domain,actor:{name:String(actor),method:'named_ops_mfa'},reference:proof.reference,
    });
    return {ok:true,code:'region_evidence_recorded',regionId,
      marketIds:targetMarkets,status:'paused'};
  });
}

async function activateMarket({ db, market, region, actor, expectedVersion, providerMissing = [], now = Date.now() }) {
  if (!db || !market || !actor || !expectedVersion) return { ok: false, code: 'invalid_request' };
  const manifest = manifestFor(market, region);
  if (!manifest || expectedVersion !== manifest.version) return { ok: false, code: 'stale_manifest' };
  const ref = db.collection(COLLECTION).doc(market.id);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref); const prior = snap.exists ? snap.data() : {};
    const checked = readinessFor({ market, region, record: prior, providerMissing, now });
    if (!checked.readyToActivate) return { ok: false, code: 'market_not_ready', ...checked };
    tx.set(ref, { status: 'active', manifestVersion: manifest.version,
      activatedAt: now, activatedBy: actor, updatedAt: now }, { merge: true });
    tx.create(db.collection('audit_log').doc(), {
      at: now, action: 'market_activated', marketId: market.id, manifestVersion: manifest.version,
      actor: { name: actor, method: 'named_ops_mfa' },
    });
    return { ok: true, status: 'active', manifestVersion: manifest.version };
  });
}


/**
 * One-command admission for an already configured service region.
 * All market proofs are re-read in a single transaction and every market must pass.
 * This never manufactures evidence, treats a proposal as a licence, or authorizes an
 * unconfigured state. A single failure means ZERO new county activations.
 */
async function activateRegion({ db, entries, actor, expectedVersions, providerMissing = [], auditMethod = 'named_ops_mfa', intentRequestedAt = null, founderCommandId = null, now = Date.now() }) {
  if (!db || !actor || !Array.isArray(entries) || !entries.length || entries.length > 100 ||
      !expectedVersions || typeof expectedVersions !== 'object' || Array.isArray(expectedVersions))
    return { ok: false, code: 'invalid_region_request' };
  // A versioned GitHub release can carry a founder instruction but cannot
  // undo a later deliberate market pause or impersonate an MFA session.
  if (!['named_ops_mfa','oauth_delegated_mfa','founder_gitops_release'].includes(auditMethod) ||
      (auditMethod === 'founder_gitops_release' &&
       (!Number.isSafeInteger(intentRequestedAt)||intentRequestedAt<=0||intentRequestedAt>now||
        !/^founder-open-[a-z0-9-]{4,80}$/.test(String(founderCommandId||'')))))
    return {ok:false,code:'invalid_admission_authority'};
  const ids = new Set(), prepared = [];
  let regionId = null;
  for (const entry of entries) {
    const { market, region } = entry || {};
    const manifest = manifestFor(market, region);
    if (!manifest || !market?.id || ids.has(market.id) || !region?.id ||
        (regionId && regionId !== region.id))
      return { ok: false, code: 'invalid_region_markets' };
    ids.add(market.id);
    regionId = region.id;
    if (expectedVersions[market.id] !== manifest.version)
      return { ok: false, code: 'stale_manifest', marketId: market.id };
    prepared.push({ market, region, manifest, ref: db.collection(COLLECTION).doc(market.id) });
  }
  return db.runTransaction(async (tx) => {
    // Firestore requires all transaction reads to precede writes.
    const snapshots = await Promise.all(prepared.map((p) => tx.get(p.ref)));
    if (auditMethod === 'founder_gitops_release' && snapshots.some(
      snap => snap.exists && Number(snap.data()?.pausedAt) >= intentRequestedAt
    )) return {ok:false,code:'market_paused_after_founder_instruction',regionId};

    const checked = prepared.map((p, i) => ({
      marketId: p.market.id,
      state: readinessFor({
        market: p.market, region: p.region,
        record: snapshots[i].exists ? snapshots[i].data() : {},
        providerMissing, now,
      }),
    }));
    const blocked = checked.filter((c) => !c.state.readyToActivate);
    if (blocked.length) {
      // Report each unique issue once and identify the affected counties.
      const grouped = new Map();
      for (const b of blocked) for (const missing of b.state.missing) {
        const key = missing.id + ':' + missing.reason;
        if (!grouped.has(key)) grouped.set(key, { id: missing.id, code: missing.code || 'unspecified', reason: missing.reason, markets: [] });
        grouped.get(key).markets.push(b.marketId);
      }
      return {
        ok: false, code: 'region_not_ready', regionId,
        ready: checked.length - blocked.length, total: checked.length,
        blockedMarkets: blocked.map((b) => b.marketId),
        missing: [...grouped.values()],
      };
    }
    const newlyOpened = [];
    for (let i = 0; i < prepared.length; i++) {
      const { market, manifest, ref } = prepared[i];
      const prior = snapshots[i].exists ? snapshots[i].data() : {};
      if (prior.status === 'active' && prior.manifestVersion === manifest.version) continue;
      tx.set(ref, {
        status: 'active', manifestVersion: manifest.version,
        activatedAt: now, activatedBy: actor, updatedAt: now,
      }, { merge: true });
      tx.create(db.collection('audit_log').doc(), {
        at: now, action: 'market_activated', marketId: market.id,
        regionId, manifestVersion: manifest.version,
        actor: { name: actor, method: auditMethod },
        ...(auditMethod === 'founder_gitops_release' ? {founderCommandId} : {}),
      });
      newlyOpened.push(market.id);
    }
    return {
      ok: true, code: newlyOpened.length ? 'region_activated' : 'already_active',
      regionId, status: 'active', marketIds: [...ids], newlyOpened,
    };
  });
}

async function authorizeOnboarding({ db, market, region, actor, expectedVersion, providerMissing = [], now = Date.now() }) {
  if (!db || !market || !actor || !expectedVersion) return { ok: false, code: 'invalid_request' };
  const manifest = manifestFor(market, region);
  if (!manifest || expectedVersion !== manifest.version) return { ok: false, code: 'stale_manifest' };
  const ref = db.collection(COLLECTION).doc(market.id);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref); const prior = snap.exists ? snap.data() : {};
    const checked = readinessFor({ market, region, record: prior, providerMissing, now });
    if (!checked.readyToOnboard) return { ok: false, code: 'onboarding_not_ready', ...checked };
    if (checked.status === 'active') return { ok: false, code: 'already_active' };
    tx.set(ref, { status: 'onboarding', manifestVersion: manifest.version,
      onboardingAt: now, onboardingBy: actor, updatedAt: now }, { merge: true });
    tx.create(db.collection('audit_log').doc(), { at: now, action: 'market_onboarding_authorized',
      marketId: market.id, manifestVersion: manifest.version,
      actor: { name: actor, method: 'named_ops_mfa' } });
    return { ok: true, status: 'onboarding', manifestVersion: manifest.version };
  });
}

async function pauseMarket({ db, market, actor, reason, auditMethod = 'named_ops_mfa', now = Date.now() }) {
  if (!db || !market || !actor || String(reason || '').trim().length < 8) return { ok: false, code: 'reason_required' };
  const ref = db.collection(COLLECTION).doc(market.id);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || !['active', 'onboarding'].includes(snap.data().status)) return { ok: false, code: 'not_active' };
    tx.update(ref, { status: 'paused', pausedAt: now, pausedBy: actor, pauseReason: String(reason).slice(0, 500),
      fleetCleanupPending: true, fleetCleanupCursor: null });
    tx.create(db.collection('audit_log').doc(), {
      at: now, action: 'market_paused', marketId: market.id,
      actor: { name: actor, method: ['named_ops_mfa','oauth_delegated_mfa'].includes(auditMethod) ? auditMethod : 'named_ops_mfa' }, reason: String(reason).slice(0, 500),
    });
    return { ok: true, status: 'paused' };
  });
}

module.exports = { SCHEMA_VERSION, REQUIRED_EVIDENCE, ONBOARDING_EVIDENCE,
  manifestFor, requirementsFor, readinessFor, inspectMarket, recordEvidence, recordRegionEvidence,
  activateMarket, activateRegion, authorizeOnboarding, pauseMarket };
