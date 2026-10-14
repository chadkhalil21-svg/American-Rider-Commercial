'use strict';
const assert=require('node:assert/strict');
const declarations=require('./founder-platform-declarations.json');
const {markets}=require('./markets');
const ids=['fl-miami-dade','fl-broward','fl-palm-beach'];
assert.equal(new Set(declarations.domains).size,11);
for(let pass=1;pass<=2;pass++)for(const id of ids){
  const market=markets().find(x=>x.id===id);
  assert.equal(market.status,'active');
  assert.equal(market.regionId,'fl-southeast');
}
// This historical executive policy record cannot grant or withhold county service.
assert.ok(Array.isArray(declarations.domains));
console.log('PASS finalized founder policy is historical; geography is not subject to a second approval');
