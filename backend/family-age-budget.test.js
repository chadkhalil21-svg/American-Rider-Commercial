'use strict';
// No production database or real minor: synthetic large Family age-out campaign.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const now=Date.UTC(2026,9,15,12);
const rows={family_links:{},scheduled_rides:{}};
for(let i=0;i<105;i++)rows.family_links['age_'+String(i).padStart(3,'0')]={status:'active',teenDob:'2008-10-15'};
rows.family_links.young={status:'active',teenDob:'2011-10-15'};
rows.family_links.revoke={status:'revoked',teenDob:'2008-10-15'};
for(let i=0;i<2010;i++)rows.scheduled_rides['reservation_'+String(i).padStart(4,'0')]=
 {status:'reserved',party:{familyLinkId:'age_001',teen:true}};
let maxFamilyPage=0,familyQueries=0,revokedDuringSweep=false;
const ref=(col,id)=>({id,
 async get(){
  if(col==='family_links'&&id==='age_002'&&!revokedDuringSweep){
   revokedDuringSweep=true;
   rows.family_links[id].status='revoked';
  }
  return {exists:!!rows[col]?.[id],data:()=>structuredClone(rows[col][id])};
 },
 async set(v,{merge}={}){rows[col][id]=merge?{...rows[col][id],...v}:v;},
 async update(v){Object.assign(rows[col][id],v)}
});
function query(col,filters=[],limit=null){return {
 where(f,o,v){return query(col,[...filters,[f,o,v]],limit)},
 limit(n){return query(col,filters,n)},
 async get(){
  if(col==='family_links'){
   familyQueries++;
   assert(filters.some(([f,o,v])=>f==='status'&&o==='=='&&v==='active'));
   assert(filters.some(([f,o,v])=>f==='teenDob'&&o==='<='&&v==='2008-10-15'));
   assert(Number.isInteger(limit)&&limit<=101);
   maxFamilyPage=Math.max(maxFamilyPage,limit);
  }
  if(col==='scheduled_rides'){
   assert(filters.some(([f])=>f==='party.familyLinkId'),'all reserved reads must be Family-scoped');
   assert(Number.isInteger(limit)&&limit<=100);
  }
  const docs=Object.keys(rows[col]||{}).filter(id=>filters.every(([f,o,v])=>{
   const a=f.split('.').reduce((x,k)=>x?.[k],rows[col][id]);
   return o==='=='?a===v:o==='<='&&typeof a==='string'&&a<=v;
  })).sort().slice(0,limit??Infinity).map(id=>({id,ref:ref(col,id),data:()=>structuredClone(rows[col][id])}));
  return {docs};
 }
};}
const db={collection:col=>({doc:id=>ref(col,id),where:(f,o,v)=>query(col).where(f,o,v)}),
 runTransaction:async cb=>cb({get:x=>x.get(),update:(x,v)=>x.update(v)})};
const adminPath=require.resolve(path.join(__dirname,'firebase-admin.js'));
const previousAdmin=require.cache[adminPath];
require.cache[adminPath]={id:adminPath,filename:adminPath,loaded:true,
 exports:{adminDb:()=>db,adminStatus:()=>({reason:null})}};
const familyPath=require.resolve(path.join(__dirname,'family.js')),previousFamily=require.cache[familyPath];
delete require.cache[familyPath];
(async()=>{try{
 const {sweepFamilyAgeOut}=require('./family');
 const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'..','firestore.indexes.json'),'utf8'));
 assert(manifest.indexes.some(x=>x.collectionGroup==='family_links'&&x.queryScope==='COLLECTION'&&
  x.fields[0]?.fieldPath==='status'&&x.fields[0]?.order==='ASCENDING'&&
  x.fields[1]?.fieldPath==='teenDob'&&x.fields[1]?.order==='ASCENDING'),
  'bounded age-out query needs declared composite index');
 const first=await sweepFamilyAgeOut({now});
 assert.equal(first.ok,false,'age-out beyond the bounded work budget must remain visible');
 assert.equal(rows.family_links.age_001.status,'active','a partially drained Family must be revisited');
 assert.equal(rows.family_links.age_002.status,'revoked','a concurrent guardian revocation must not be undone');
 assert.equal(Object.values(rows.scheduled_rides).filter(x=>x.status==='reserved').length,10);
 assert.equal(rows.family_links.young.status,'active');
 const second=await sweepFamilyAgeOut({now});
 assert.equal(second.ok,true,'subsequent bounded sweep must finish all remaining work');
 assert.equal(rows.family_links.age_001.status,'aged_out');
 assert.equal(Object.values(rows.scheduled_rides).filter(x=>x.status==='reserved').length,0);
 assert.equal(rows.family_links.age_002.status,'revoked');
 assert.equal(rows.family_links.young.status,'active');
 assert.equal(maxFamilyPage,101);
 assert(familyQueries===2);
 console.log('PASS 105 due Families, 2010 reservations, bounded 101-row DOB index, deferred work resumed, concurrent guardian revocation preserved');
}finally{
 if(previousAdmin)require.cache[adminPath]=previousAdmin;else delete require.cache[adminPath];
 if(previousFamily)require.cache[familyPath]=previousFamily;else delete require.cache[familyPath];
}})().catch(e=>{console.error(e);process.exitCode=1;});