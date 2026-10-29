'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {founderPlatformCounts,overviewMarkup,newYorkBusinessDay}=require('./founder-platform-counts');
const NOW=Date.UTC(2026,9,24,14,0,0);
const expected={users:83,operators:17,rides:214,recruiter_accounts:3};
const log=[],fail=new Set();
function db(){
 const countFor=(collection,conditions)=>({
   get:async()=>{
     if(fail.has(collection))throw Error('private internal diagnostics must not escape');
     const first=conditions[0];
     let count=expected[collection];
     if(collection==='operators'&&first?.field==='available')count=5;
     if(collection==='users'&&first?.field==='operatorOnboardingStartedAt')count=3;
     if(collection==='users'&&first?.field==='qualification.qualifiedAt')count=2;
     if(collection==='recruiter_accounts'&&first?.field==='status')
       count=first.value==='pending_review'?1:first.value==='approved'?2:0;
     if(collection==='rides'&&first?.field==='status')
       count=first.value==='completed'?104:9;
     if(collection==='rides'&&first?.field==='createdAt')count=12;
     if(collection==='rides'&&first?.field==='settledAt')count=7;
     return {data:()=>({count})};
   },
 });
 const chain=(collection,conditions=[])=>({
   count:()=>countFor(collection,conditions),
   where(field,op,value){
     log.push({collection,field,op,value});
     if(field==='available')assert.equal(value,true);
     if(field==='status')assert.ok(op==='=='||op==='in');
     if(['createdAt','settledAt','operatorOnboardingStartedAt','qualification.qualifiedAt'].includes(field)){
       assert.ok(op==='>='||op==='<');
       assert.ok(Number.isSafeInteger(value)&&value>0);
     }
     return chain(collection,[...conditions,{field,op,value}]);
   },
 });
 return {collection:collection=>{log.push({collection,kind:'collection'});return chain(collection);}};
}
(async()=>{
 const day=newYorkBusinessDay(NOW);
 assert.equal(day.date,'2026-10-24');
 assert.equal(day.start,Date.UTC(2026,9,24,4));
 assert.equal(day.end,Date.UTC(2026,9,25,4));
 // Local-day boundary must survive the November daylight-saving transition.
 const fallback=newYorkBusinessDay(Date.UTC(2026,10,1,16));
 assert.equal(fallback.date,'2026-11-01');
 assert.equal(fallback.start,Date.UTC(2026,10,1,4));
 assert.equal(fallback.end,Date.UTC(2026,10,2,5));
 const results=await founderPlatformCounts(db(),{now:NOW});
 assert.equal(results.ok,true);
 assert.equal(results.counts.registeredAccountProfiles,83);
 assert.equal(results.counts.operatorProfiles,17);
 assert.equal(results.counts.operatorsStartedOnboardingToday,3);
 assert.equal(results.counts.operatorsQualifiedToday,2);
 assert.equal(results.counts.operatorsReportingAvailable,5);
 assert.equal(results.counts.activeTravelRecords,9);
 assert.equal(results.counts.completedTravelRecords,104);
 assert.equal(results.counts.travelsCreatedToday,12);
 assert.equal(results.counts.travelsSettledToday,7);
 assert.equal(results.counts.recruiterAccounts,3);
 assert.equal(results.counts.recruitersAwaitingReview,1);
 assert.equal(results.counts.recruitersApprovedRecords,2);
 assert.equal(results.counts.recruitersSuspendedRecords,0);
 assert.equal(log.filter(x=>x.kind==='collection').length,13,'13 bounded indexed count queries; no full-document downloads');
 assert.equal(log.filter(x=>x.collection==='recruiter_accounts'&&x.field==='status').length,3);
 assert.equal(log.filter(x=>x.field==='createdAt').length,2);
 assert.equal(log.filter(x=>x.field==='settledAt').length,2);
 assert.equal(log.filter(x=>x.field==='operatorOnboardingStartedAt').length,2);
 assert.equal(log.filter(x=>x.field==='qualification.qualifiedAt').length,2);
 assert.match(overviewMarkup(results),/2026-10-24/);
 assert.match(overviewMarkup(results),/Travels settled today/);
 assert.match(overviewMarkup(results),/Recruiters awaiting review/);
 assert.match(overviewMarkup(results),/Approved Recruiter records/);
 assert.match(overviewMarkup(results),/Operators beginning onboarding today/);
 assert.match(overviewMarkup(results),/Operators qualifying today/);
 assert.match(overviewMarkup(results),/distinct Traveler-only count/);
 fail.add('operators');
 const partial=await founderPlatformCounts(db(),{now:NOW});
 assert.equal(partial.ok,false);
 assert.equal(partial.counts.operatorProfiles,null);
 assert.equal(partial.counts.registeredAccountProfiles,83);
 assert.match(overviewMarkup(partial),/Unavailable is not zero/);
 assert.doesNotMatch(overviewMarkup(partial),/private internal diagnostics/);
 assert.equal((await founderPlatformCounts(null)).reason,'database_unavailable');
 const ops=fs.readFileSync(require('node:path').join(__dirname,'ops.js'),'utf8');
 assert.match(ops,/app\.get\('\/ops\/overview',async\(req,res\)=>\{/);
 assert.match(ops,/if\(!signedIn\(req\)\|\|opsAuthMode\(\)!=='named'\)/);
 assert.match(ops,/Cache-Control','private, no-store/);
 assert.match(ops,/\/ops\/overview">Platform Overview/);
 console.log('PASS Founder index-based national activity, Eastern day + DST, error truth, bounded reads');
})().catch(e=>{console.error(e);process.exitCode=1});
