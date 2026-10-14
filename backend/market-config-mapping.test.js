'use strict';
const assert=require('node:assert/strict');
const {markets}=require('./markets');
const {regionById}=require('./regions');
const names=['fl-miami-dade','fl-broward','fl-palm-beach'];
for(let pass=1;pass<=2;pass++)for(const id of names){
  const market=markets().find(m=>m.id===id);
  const region=regionById(market.regionId);
  assert.equal(market.status,'active');
  assert.ok(region.activeMarketFips.includes(market.fips));
  assert.equal(region.geographyEvidence.status,'verified');
  assert.equal(region.tollPolicy.failClosed,true);
  assert.equal(region.jurisdiction.stateCode,'FL');
  assert.equal(region.jurisdiction.screeningYears,3);
}
console.log('PASS twice: active South Florida counties inherit one configured region');
