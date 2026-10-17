'use strict';
// Index-only commissioning contract. This test never reaches production Firebase.
const assert=require('node:assert/strict');
const manifest=require('../firestore.indexes.json');
const expected=[
  ['rides',[['operatorId','ASCENDING'],['status','ASCENDING']]],
  ['family_links',[['status','ASCENDING'],['teenDob','ASCENDING']]],
];
for(const [name,fields] of expected){
  const exact=manifest.indexes.filter(x=>x.collectionGroup===name && x.queryScope==='COLLECTION' &&
    JSON.stringify(x.fields.map(f=>[f.fieldPath,f.order]))===JSON.stringify(fields));
  assert.equal(exact.length,1,name+' index must appear exactly once');
}
assert.equal(manifest.indexes.length,19,'existing 17 plus two new indexes');
console.log('PASS index-only manifest: two new indexes, no writes to Firebase');
