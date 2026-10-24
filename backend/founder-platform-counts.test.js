'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {founderPlatformCounts,overviewMarkup}=require('./founder-platform-counts');
const counts={
 users:83,operators:17,rides:214,recruiter_accounts:3,
};
const log=[],fail=new Set();
function db(){
  return {collection:collection=>{
    log.push({collection,kind:'collection'});
    return {
      count:()=>({get:async()=>{
        if(fail.has(collection))throw Error('private diagnostic should not escape');
        return {data:()=>({count:counts[collection]})};
      }}),
      where(field,op,value){
        assert.equal(op,'==');
        assert.ok((collection==='operators'&&field==='available'&&value===true)||
          (collection==='rides'&&field==='status'&&value==='completed'));
        return {count:()=>({get:async()=>{
          if(fail.has(collection))throw Error('temporary_failure');
          return {data:()=>({count:collection==='operators'?5:104})};
        }})};
      }
    };
  }};
}
(async()=>{
  const data=await founderPlatformCounts(db());
  assert.equal(data.ok,true);
  assert.equal(data.counts.registeredAccountProfiles,83);
  assert.equal(data.counts.operatorProfiles,17);
  assert.equal(data.counts.operatorsReportingAvailable,5);
  assert.equal(data.counts.completedTravelRecords,104);
  assert.equal(data.counts.recruiterAccounts,3);
  assert.equal(log.length,5,'Five Firestore index count calls, no unbounded document downloads');
  assert.equal(overviewMarkup(data).includes('83'),true);
  assert.match(overviewMarkup(data),/not distinct Traveler-only/);
  fail.add('operators');
  const partial=await founderPlatformCounts(db());
  assert.equal(partial.ok,false);
  assert.equal(partial.counts.operatorProfiles,null);
  assert.equal(partial.counts.registeredAccountProfiles,83);
  assert.match(overviewMarkup(partial),/Unavailable is not zero/);
  assert.doesNotMatch(overviewMarkup(partial),/temporary_failure|private diagnostic/);
  assert.equal((await founderPlatformCounts(null)).reason,'database_unavailable');
  const source=fs.readFileSync(require('node:path').join(__dirname,'ops.js'),'utf8');
  assert.match(source,/app\.get\('\/ops\/overview',async\(req,res\)=>\{/);
  assert.match(source,/if\(!signedIn\(req\)\|\|opsAuthMode\(\)!=='named'\)/);
  assert.match(source,/Cache-Control','private, no-store/);
  assert.match(source,/\/ops\/overview">Platform Overview/);
  console.log('PASS national Founder aggregate overview: role-overlap honesty, five indexed reads, secure route and partial failure');
})().catch(e=>{console.error(e);process.exitCode=1});
