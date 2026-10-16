'use strict';
// Unit-test the RELEASE-EVIDENCE VALIDATOR with fabricated manifest fixtures.
// Passing this unit test is NOT proof any real launch evidence was collected.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const validator=path.join(root,'scripts/verify-release-evidence.mjs');
const sha='a'.repeat(40);
const gate=(details={})=>({result:'pass',executedAt:'2026-10-16T00:00:00Z',
  executor:'synthetic-fixture',reviewer:'synthetic-fixture',evidence:['fictional unit fixture'],details});
const required=['insurance','productionConfiguration','stripe','screeningProvider','firebase','scheduler',
 'routingTolls','emailSupport','phoneVerification','documentStorage','push',
 'iosPhysicalDevices','androidPhysicalDevice','sandboxPaymentLifecycle',
 'marketCommissioning','stagingLoad','uxRubric'];
const yes=o=>Object.fromEntries(o.map(k=>[k,true]));
const gates=Object.fromEntries(required.map(x=>[x,gate()]));
gates.productionConfiguration=gate({deployedSha:sha,healthOperationalReady:true,operationalMissing:[]});
gates.sandboxPaymentLifecycle=gate({mode:'stripe_test',signedAppBookingConfirmed:true,
 quotePaymentDispatchReconciled:true,refundAndRetryVerified:true});
gates.uxRubric=gate(yes(['completeScreenInventoryReviewed','travelerCriticalPathsReviewed',
 'operatorCriticalPathsReviewed','familyTeenCriticalPathsReviewed','smartTravelCriticalPathsReviewed',
 'emptyLoadingErrorOfflineRestartStatesReviewed','terminologyAndCopyReviewed',
 'firstClassRubricReviewed','accessibilityReviewed','smallAndLargeDeviceLayoutsReviewed',
 'noPlaceholderOrSimulatedProductionExperience']));
gates.insurance=gate({...yes(['jurisdictionRuleReviewed','continuingStatusMonitoringValidated',
 'adverseStatusLockoutValidated','directProviderConfirmationValidated','englishDisclosureReviewed']),
 jurisdiction:'FL',statuteReviewed:'synthetic statute fixture',disclosureVersion:'synthetic-test',
 translationsReviewed:['ES','FR','IT','DE']});
gates.marketCommissioning=gate({...yes(['jurisdictionReviewed','permitsAndRestrictedPlacesReviewed',
 'pricingEvidenceReviewed','regulatoryEconomicsReviewed','routingValidated',
 'tollAuthoritiesReviewed','paymentsValidated','stressValidated']),activeRegions:['fl-southeast']});
gates.stagingLoad=gate({travelRateProfile:'synthetic fixture',
 p50Ms:1,p95Ms:2,p99Ms:3,errorRate:0,firestoreReadsPerDispatch:5,
 tollFallbackRate:0,providerQuotasReviewed:true});
const manifest=()=>({candidateSha:sha,environment:'production-validation-fixture',gates:structuredClone(gates)});
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ar-release-scope-fixture-'));
function evaluate(m){
 const file=path.join(tmp,'fixture.json');fs.writeFileSync(file,JSON.stringify(m));
 return spawnSync(process.execPath,[validator,file,sha],{cwd:root,encoding:'utf8'});
}
try {
 for(let pass=1;pass<=2;pass++){
  const valid=evaluate(manifest());
  assert.equal(valid.status,0,'fictional complete manifest must pass unit validator: '+valid.stderr);
  for(const [modify,reason] of [
   [m=>delete m.gates.sandboxPaymentLifecycle,'sandboxPaymentLifecycle'],
   [m=>m.gates.sandboxPaymentLifecycle.details.mode='live','Stripe test mode'],
   [m=>m.gates.sandboxPaymentLifecycle.details.signedAppBookingConfirmed=false,'signed-device booking'],
   [m=>m.gates.sandboxPaymentLifecycle.details.quotePaymentDispatchReconciled=false,'quote/payment/dispatch'],
   [m=>m.gates.sandboxPaymentLifecycle.details.refundAndRetryVerified=false,'refund/retry'],
   [m=>delete m.gates.screeningProvider,'screeningProvider'],
   [m=>m.gates.insurance.details.directProviderConfirmationValidated=false,'directProviderConfirmationValidated']
  ]){
   const m=manifest();modify(m);const res=evaluate(m);
   assert.notEqual(res.status,0,'must reject missing genuine gate: '+reason);
  }
 }
 const validatorSource=fs.readFileSync(validator,'utf8');
 assert(!validatorSource.includes("'smartTravelLive'"));
 assert(!validatorSource.includes("'liveMoneyReconciliation'"));
 assert(!validatorSource.includes("'holdoutValidationPassed'"));
 assert(!/['"]transit['"]/.test(validatorSource));
 assert(validatorSource.includes("Smart Travel: new booking must be paused"));
 console.log('PASS twice: paused Smart Travel/ordinary launch, sandbox booking proof required, insurer/screening gates retained');
 console.log('BOUNDARY: fictional input fixtures are not true insurer reports, signed-device runs, Stripe objects, or market readiness.');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
