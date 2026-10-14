'use strict';
const assert=require('node:assert/strict');
const declarations=require('./founder-platform-declarations.json');
const {markets}=require('./markets');
const {regionById}=require('./regions');
const {readinessFor,REQUIRED_EVIDENCE}=require('./market-readiness');
const ids=['fl-miami-dade','fl-broward','fl-palm-beach'];
const external=['company_insurance_bound','payment_and_reconciliation',
 'safety_coverage','device_and_release_tests','backup_restore_drill'];
for(let pass=0;pass<2;pass++) for(const id of ids){
 const market=markets().find(m=>m.id===id), region=regionById('fl-southeast');
 const state=readinessFor({market,region,providerMissing:['screening_provider']});
 assert.equal(state.founderDeclaredFrameworks.length,11);
 assert.deepEqual(state.founderDeclaredFrameworks.map(x=>x.domain),declarations.domains);
 assert.ok(state.founderDeclaredFrameworks.every(x=>
   x.policyDecision==='founder_finalized' &&
   x.policySatisfied===true &&
   x.marketEvidenceState==='retired_from_region_admission' &&
   x.approvalGrantsMarketAccess===false));
 assert.equal(state.executivePolicyReadinessSatisfied,true);
 assert.equal(state.readinessScope.individualOperatorRowsRequired,false);
 assert.equal(state.readyToActivate,false);
 assert.equal(state.status,'waitlist');
 for(const name of external) assert.ok(!state.missing.some(x=>x.id===name));
 assert.ok(state.missing.some(x=>x.id==='provider:screening_provider'));
 const tampered={...region,geographyEvidence:{status:'not_verified'}};
 assert.deepEqual(readinessFor({market,region:tampered}).founderDeclaredFrameworks,[]);
 assert.equal(readinessFor({market,region:tampered}).executivePolicyReadinessSatisfied,false);
}
assert.equal(new Set(declarations.domains).size,11);
assert.ok(declarations.domains.every(x=>!REQUIRED_EVIDENCE.includes(x)));
assert.equal(REQUIRED_EVIDENCE.length,3);
console.log('PASS twice: founder-policy declarations and retired regional evidence records remain distinct from provider readiness');
