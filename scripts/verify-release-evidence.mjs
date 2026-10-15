import fs from 'node:fs';

const [path, expectedSha] = process.argv.slice(2);
if (!path || !expectedSha) {
  console.error('usage: npm run release:evidence -- <evidence.json> <full-candidate-sha>');
  process.exit(2);
}
let m;
try { m = JSON.parse(fs.readFileSync(path, 'utf8')); }
catch (e) { console.error('release evidence unreadable:', e.message); process.exit(2); }

const failures=[];
if (!/^[0-9a-f]{40}$/i.test(expectedSha)) failures.push('expected candidate SHA must be a full 40-character git SHA');
if (m.candidateSha !== expectedSha) failures.push('manifest candidateSha does not equal candidate under review');
if (!m.environment || !/production/i.test(m.environment)) failures.push('environment must identify production/production-validation');
const required=['insurance','productionConfiguration','stripe','screeningProvider','firebase','scheduler','routingTolls','transit','emailSupport','phoneVerification','documentStorage','push','iosPhysicalDevices','androidPhysicalDevice','smartTravelLive','liveMoneyReconciliation','marketCommissioning','stagingLoad','uxRubric'];
for (const name of required) {
  const g=m.gates?.[name];
  if (!g) { failures.push(name+': missing gate'); continue; }
  if (g.result !== 'pass') failures.push(name+': result is not pass');
  if (!g.executedAt || Number.isNaN(Date.parse(g.executedAt))) failures.push(name+': missing/invalid UTC execution timestamp');
  if (!String(g.executor||'').trim()) failures.push(name+': executor missing');
  if (!String(g.reviewer||'').trim()) failures.push(name+': independent reviewer missing');
  if (!Array.isArray(g.evidence) || !g.evidence.some(x=>String(x||'').trim())) failures.push(name+': durable evidence reference missing');
}
const pc=m.gates?.productionConfiguration?.details||{};
if (pc.deployedSha !== expectedSha) failures.push('productionConfiguration: deployedSha differs from candidate');
if (pc.healthOperationalReady !== true) failures.push('productionConfiguration: /health operationalReady was not attested true');
if (!Array.isArray(pc.operationalMissing) || pc.operationalMissing.length) failures.push('productionConfiguration: operationalMissing must be []');
const ux=m.gates?.uxRubric?.details||{};
for (const k of [
  'completeScreenInventoryReviewed','travelerCriticalPathsReviewed','operatorCriticalPathsReviewed',
  'familyTeenCriticalPathsReviewed','smartTravelCriticalPathsReviewed',
  'emptyLoadingErrorOfflineRestartStatesReviewed','terminologyAndCopyReviewed',
  'firstClassRubricReviewed','accessibilityReviewed','smallAndLargeDeviceLayoutsReviewed',
  'noPlaceholderOrSimulatedProductionExperience'
]) if (ux[k] !== true) failures.push('uxRubric: '+k+' was not attested true');
const ins=m.gates?.insurance?.details||{};
for (const k of ['jurisdiction','statuteReviewed','disclosureVersion']) if (!String(ins[k]||'').trim()) failures.push('insurance: '+k+' missing');
for (const k of ['jurisdictionRuleReviewed','continuingStatusMonitoringValidated','adverseStatusLockoutValidated','directProviderConfirmationValidated','englishDisclosureReviewed']) {
  if (ins[k] !== true) failures.push('insurance: '+k+' was not attested true');
}
const langs=new Set(ins.translationsReviewed||[]);
for (const lang of ['ES','FR','IT','DE']) if (!langs.has(lang)) failures.push('insurance: '+lang+' disclosure not reviewed');

const mc=m.gates?.marketCommissioning?.details||{};
if(!Array.isArray(mc.activeRegions)||!mc.activeRegions.length) failures.push('marketCommissioning: activeRegions missing');
for(const k of ['jurisdictionReviewed','permitsAndRestrictedPlacesReviewed','pricingEvidenceReviewed','holdoutValidationPassed','regulatoryEconomicsReviewed','routingValidated','tollAuthoritiesReviewed','paymentsValidated','stressValidated']) if(mc[k]!==true) failures.push('marketCommissioning: '+k+' was not attested true');
const load=m.gates?.stagingLoad?.details||{};
if(!String(load.travelRateProfile||'').trim()) failures.push('stagingLoad: travelRateProfile missing');
for(const k of ['p50Ms','p95Ms','p99Ms','errorRate','firestoreReadsPerDispatch','tollFallbackRate']) if(!Number.isFinite(Number(load[k]))||Number(load[k])<0) failures.push('stagingLoad: '+k+' missing/invalid');
if(load.providerQuotasReviewed!==true) failures.push('stagingLoad: providerQuotasReviewed was not attested true');

if (failures.length) {
  console.error('COMMERCIAL RELEASE EVIDENCE: FAIL');
  for (const f of failures) console.error(' - '+f);
  process.exit(1);
}
console.log('COMMERCIAL RELEASE EVIDENCE: PASS');
console.log('candidate '+expectedSha);
console.log(required.length+' external gates have evidence and independent review');

