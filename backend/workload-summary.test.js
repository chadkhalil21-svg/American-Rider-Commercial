'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {summarizeBackgroundWork,createBackgroundReporter,observeBackgroundWork}=require('./workload-summary');
const {NAMES}=require('./critical-sweep-recovery');
const {singleFlight}=require('./sweep-singleflight');
let t=10_000_000,events=[];
const reporter=createBackgroundReporter({intervalMs:60_000,now:()=>t,emit:(...args)=>events.push(args)});
const snapshot={
  scheduled:{ok:true,considered:0,dispatched:[{rideId:'secret-id',travelerName:'private'}]},
  monitor:{ok:false,activeTravelsRead:12,reason:'private exception data',emergencies:[{coordinates:'private'}]},
  screening:{ok:true,skipped:'cadence'},
  bookingRecovery:{ok:true,scanned:2,overCapacity:false,pending:['private-travel-id']},
};
assert.equal(reporter(snapshot),true);
assert.equal(reporter(snapshot),false);
t+=60_000;
assert.equal(reporter(snapshot),true);
assert.equal(events.length,2);
const summaries=events.map(e=>e.join(' '));
for(const row of summaries){
 assert.ok(row.includes('"activeTravelsRead":12'));
 for(const secret of ['secret-id','travelerName','coordinates','private exception','private-travel-id'])
  assert.ok(!row.includes(secret),'No personal details in operations telemetry');
}
const report=summarizeBackgroundWork(snapshot);
assert.equal(report.bookingRecovery.scanned,2);
assert.equal(report.screening.skipped,'cadence');
assert.equal(report.monitor.failed,true);
assert.deepEqual(Object.keys(report).sort(),Object.keys(snapshot).sort());
assert.throws(()=>createBackgroundReporter({intervalMs:0}),/Invalid telemetry interval/);

async function verifyWiring() {
 const complete=Object.fromEntries(NAMES.map(name=>[name,{ok:true}]));
 let clock=0;const lines=[];
 const record=createBackgroundReporter({now:()=>clock,emit:line=>lines.push(JSON.parse(line))});
 const failure={...complete,monitor:{ok:false,reason:'PRIVATE_ERROR',skipped:'PRIVATE_ID'},PRIVATE_JOB:{ok:false}};
 assert.equal(record(complete),true);
 assert.equal(record(complete),false);
 clock+=60_000;
 assert.equal(record(failure),true,'a failed sweep bypasses the hourly success throttle');
 assert.equal(lines[1].severity,'ERROR');
 assert.equal(lines[1].jobs.monitor.skipped,'other');
 assert.equal(JSON.stringify(lines).includes('PRIVATE_'),false);
 assert.equal(record(failure),false,'same incident state is throttled');
 assert.equal(record({ok:true,skipped:'another server owns this sweep'}),false);
 assert.equal(record(failure),false,'lease contention does not falsely reset an incident');
 clock+=60_000;
 assert.equal(record({ok:false,code:'firestore_quota_backoff',reason:'PRIVATE_ERROR'}),true);
 assert.equal(lines.at(-1).status,'blocked');
 assert.equal(lines.at(-1).severity,'ERROR');
 assert.equal(record(complete),true,'observed recovery is not hidden by the failure throttle');
 assert.equal(lines.at(-1).status,'no_reported_job_failures');
 assert.equal(lines.at(-1).severity,'INFO');
 assert.equal(record({}),true);
 assert.equal(lines.at(-1).status,'incomplete_report');
 assert.equal(lines.at(-1).severity,'WARNING');
 assert.equal(JSON.stringify(lines).includes('PRIVATE_'),false);

 let unlock;let received=0;const observations=[];
 const run=singleFlight(observeBackgroundWork(async ()=>{
   received++;
   await new Promise(resolve=>{unlock=resolve;});
   return failure;
 },value=>observations.push(value)));
 const first=run();
 assert.equal((await run()).skipped,'same-instance sweep already running');
 assert.equal(received,1);assert.equal(observations.length,0);
 unlock();assert.equal(await first,failure);
 assert.deepEqual(observations,[failure]);
 const error=new Error('PRIVATE_ERROR');const rejected=[];
 await assert.rejects(observeBackgroundWork(async()=>{throw error;},value=>rejected.push(value))(),e=>e===error);
 assert.deepEqual(rejected,[{ok:false}]);
 assert.equal(await observeBackgroundWork(async()=>complete,()=>{throw Error('log sink failed');})(),complete);
 await assert.rejects(observeBackgroundWork(async()=>{throw error;},()=>{throw Error('log sink failed');})(),e=>e===error);

 const source=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
 assert.match(source,/const runLeasedSweepsOnce = observeBackgroundWork\(executeLeasedSweeps, reportBackgroundWork\);\s*const runLeasedSweeps = singleFlight\(runLeasedSweepsOnce\);/);
 assert.match(source,/if \(now - lastSweep\.at < 10000 && lastSweep\.report\) \{\s*return res\.json\([^;]+;\s*}\s*const report = await runLeasedSweeps\(\);/);
 console.log('PASS existing background telemetry wiring: privacy, failures/recovery, single-flight, cached response and sink failure');
}
verifyWiring().catch(error=>{console.error(error);process.exitCode=1;});
