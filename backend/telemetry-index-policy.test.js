'use strict';
// Safety check: never exempt a field used in indexed app/backend queries.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const manifest=require('../firestore.indexes.json');
const fields=['opLat','opLng','opAt','stillSince','monitorSeen'];
for(const fieldPath of fields){
 const overrides=manifest.fieldOverrides.filter(x=>x.collectionGroup==='rides'&&x.fieldPath===fieldPath);
 assert.equal(overrides.length,1,fieldPath+' exemption missing or duplicated');
 assert.deepEqual(overrides[0].indexes,[]);
 assert.ok(!manifest.indexes.some(x=>x.collectionGroup==='rides'&&
   x.fields.some(y=>y.fieldPath===fieldPath)),'cannot exempt a queried composite field');
}
assert.ok(manifest.fieldOverrides.some(x=>x.collectionGroup==='pricing_quote_views'&&
  x.fieldPath==='expiresAt'&&x.ttl===true&&x.indexes.length===0),'existing TTL retained');
const violations=[];
function walk(dir){
 for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
   if(['node_modules','.git','.expo','.next','dist','build','coverage'].includes(entry.name))continue;
   const filename=path.join(dir,entry.name);
   if(entry.isDirectory()){walk(filename);continue;}
   if(!/\.(?:js|cjs|mjs|ts|tsx)$/.test(filename)||filename===__filename)continue;
   const source=fs.readFileSync(filename,'utf8');
   for(const field of fields){
     const re=new RegExp("(?:\\bwhere\\b|\\borderBy\\b)\\s*\\(\\s*['\\x22]"+field+"['\\x22]");
     if(re.test(source))violations.push(path.relative(ROOT,filename)+':'+field);
   }
 }
}
walk(ROOT);
assert.deepEqual(violations,[],'automatic location-field index is required by live source');
console.log('PASS single-field telemetry index policy: source query scan, composite indexes and TTL intact.');
