'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {markets}=require('./markets');
const {regionById}=require('./regions');
const {manifestFor,readinessFor,REQUIRED_EVIDENCE}=require('./market-readiness');
const {configuredControls,VERIFIED_CONTROLS}=require('./market-runtime-controls');
const {continuingStatus}=require('./insurance-monitoring');
const {coverageUnsafeForNewTravel}=require('./insurance-horizon');
const {screeningCurrent}=require('./screening');
const names=['fl-miami-dade','fl-broward','fl-palm-beach'];
const {marketChecklistPage}=require('./market-readiness-ui');
const independent=['company_insurance_bound','payment_and_reconciliation',
  'qualified_operator_supply','backup_restore_drill','device_and_release_tests',
  'accessible_service','safety_coverage','routing_and_toll_rights'];
for(let pass=1;pass<=2;pass++){
  for(const id of names) {
    const market=markets().find(x=>x.id===id), region=regionById(market.regionId);
    const manifest=manifestFor(market,region);
    assert.deepEqual(configuredControls(manifest),VERIFIED_CONTROLS);
    assert.equal(manifest.sourceProblems.length,0);
    const result=readinessFor({market,region,providerMissing:['screening_provider']});
    assert.equal(result.readyToActivate,false);
    assert.equal(result.evidenceCount,REQUIRED_EVIDENCE.length-3);
    assert.deepEqual(result.enforcedInCode,VERIFIED_CONTROLS);
    for(const x of VERIFIED_CONTROLS)
      assert.ok(!result.missing.some(m=>m.id===x),'duplicate regional paperwork must not block '+x);
    for(const x of independent)
      assert.ok(result.missing.some(m=>m.id===x),'genuine external/field proof remains '+x);
    assert.ok(result.missing.some(m=>m.id==='provider:screening_provider'));
    // A completed code/configuration run is not evidence that a carrier exists.
    const record={status:'active',manifestVersion:manifest.version,evidence:{}};
    assert.equal(readinessFor({market,region,record,providerMissing:[]}).status,'waitlist');
    assert.equal(readinessFor({market,region,record,providerMissing:[]}).readyToActivate,false);
    const tampered=manifestFor(market,{...region,geographyEvidence:{status:'unverified'}});
    assert.deepEqual(configuredControls(tampered),[],'unverified jurisdiction cannot use the exemption');
    const spoof={...manifest,jurisdiction:{...manifest.jurisdiction,stateCode:'XX'}};
    assert.deepEqual(configuredControls(spoof),[],'unknown state cannot inherit Florida exemption');
  }
  assert.equal(continuingStatus({}).ok,false,'Operator without insurer status stays blocked');
  assert.equal(coverageUnsafeForNewTravel(null),true,'Operator without valid expiry stays blocked');
  assert.equal(screeningCurrent(null),false,'Operator without actual screening result stays blocked');
  const states=names.map(id=>{
    const market=markets().find(x=>x.id===id),region=regionById(market.regionId);
    return {market,state:readinessFor({market,region,providerMissing:['screening_provider']})};
  });
  const page=marketChecklistPage(states,{production:true});
  for(const id of VERIFIED_CONTROLS)
    assert.ok(!page.includes('<option value="'+id+'">'),
      'do not prompt the founder for another document of '+id);
  assert.ok(page.includes('<option value="company_insurance_bound">'),
    'real company insurance evidence still requires a verified record');
  assert.ok(page.includes('<option value="device_and_release_tests">'),
    'real physical-device evidence still requires a verified record');
  const server=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
  assert.match(server,/if \(!screeningReady\(\)\) missing.push\('screening_provider'\)/,
    'independent production screening handoff remains a hard launch gate');
  assert.doesNotMatch(server,/providerMissing: productionReadiness\(\).missing/,
    'regional evidence paperwork must not gate geographically active bookings');
  assert.match(server,/function requireServedPickup/,'paid Travel checks configured geography');
  assert.doesNotMatch(server,/requireAdmittedPickup/,'no additional county approval is required for paid Travel');
}
console.log('PASS twice: eliminate 3 redundant regional forms in all counties; retain external carrier, screening, funds, safety, mobile and unknown-state gates');
