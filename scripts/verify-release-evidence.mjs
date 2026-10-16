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
const required=['insurance','productionConfiguration','stripe','screeningProvider','firebase','scheduler','routingTolls','emailSupport','phoneVerification','documentStorage','push','iosPhysicalDevices','androidPhysicalDevice','sandboxPaymentLifecycle','marketCommissioning','stagingLoad','uxRubric'];
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
// Founder launch decision: Smart Travel is visibly unavailable, not an active
// public-transit product. Audit the actual client and server pause in the exact
// candidate release rather than demanding live OTP, GTFS, or transit journeys.
const mobileConfig=fs.readFileSync('src/config.ts','utf8');
const serverSource=fs.readFileSync('backend/server.js','utf8');
const reserveSource=fs.readFileSync('app/reserve.tsx','utf8');
if (!/SMART_TRAVEL_NEW_BOOKINGS_ENABLED\s*=\s*false\s*;/.test(mobileConfig) ||
    !/SMART_TRAVEL_NEW_BOOKINGS_ENABLED\s*=\s*false\s*;/.test(serverSource) ||
    !serverSource.includes("code: 'smart_travel_paused'") ||
    !reserveSource.includes('disabled={!smart || !SMART_TRAVEL_NEW_BOOKINGS_ENABLED}')) {
  failures.push('Smart Travel: new booking must be paused in both app and server');
}
// A completed Stripe sandbox booking is the prelaunch money test. Never require
// public Travelers or live-money charges to substantiate this evidence.
const sandbox=m.gates?.sandboxPaymentLifecycle?.details||{};
if(sandbox.mode!=='stripe_test') failures.push('sandboxPaymentLifecycle: must identify Stripe test mode');
if(sandbox.signedAppBookingConfirmed!==true) failures.push('sandboxPaymentLifecycle: signed-device booking not confirmed');
if(sandbox.quotePaymentDispatchReconciled!==true) failures.push('sandboxPaymentLifecycle: sandbox quote/payment/dispatch reconciliation absent');
if(sandbox.refundAndRetryVerified!==true) failures.push('sandboxPaymentLifecycle: refund/retry proof absent');

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
for(const k of ['jurisdictionReviewed','permitsAndRestrictedPlacesReviewed','pricingEvidenceReviewed','regulatoryEconomicsReviewed','routingValidated','tollAuthoritiesReviewed','paymentsValidated','stressValidated']) if(mc[k]!==true) failures.push('marketCommissioning: '+k+' was not attested true');
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

