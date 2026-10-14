'use strict';
// Prove actual code configuration WITHOUT fabricating any external evidence.
const assert=require('node:assert/strict');
const {markets}=require('./markets');
const {regionById}=require('./regions');
const {manifestFor,readinessFor}=require('./market-readiness');
const {mappedConfiguredSubcontrols}=require('./market-runtime-controls');
const names=['fl-miami-dade','fl-broward','fl-palm-beach'];
for(let pass=0;pass<2;pass++)for(const name of names){
  const market=markets().find(m=>m.id===name),region=regionById(market.regionId);
  const manifest=manifestFor(market,region);
  const checks=mappedConfiguredSubcontrols(manifest);
  assert.equal(checks.length,3);
  assert.deepEqual(checks.map(x=>x.domain),[
    'pricing_and_taxes','routing_and_toll_rights','disclosure_and_retention'
  ]);
  assert.ok(checks.every(x=>x.verified && !x.domainSatisfied && x.outstanding));
  const state=readinessFor({market,region,providerMissing:['screening_provider']});
  assert.deepEqual(state.mappedConfiguredSubcontrols,checks);
  for(const check of checks)
    assert.ok(!state.missing.some(x=>x.id===check.domain),
      'retired regional records do not appear among outstanding items');
  for(const domain of ['company_insurance_bound','payment_and_reconciliation',
    'provider_contracts','safety_coverage','accessible_service',
    'qualified_operator_supply','backup_restore_drill','device_and_release_tests'])
    assert.ok(!state.missing.some(x=>x.id===domain),domain);
  assert.equal(state.readyToActivate,false);
  assert.ok(state.missing.some(x=>x.id==='provider:screening_provider'));
  const altered=manifestFor(market,{...region,tollPolicy:{status:'unverified',failClosed:false}});
  assert.deepEqual(mappedConfiguredSubcontrols(altered),[]);
  assert.equal(readinessFor({market,region:{...region,
    geographyEvidence:{status:'unverified'}}}).readyToActivate,false);
}
console.log('PASS twice: South Florida code provenance mapped; no external attestation or regional launch bypass');
