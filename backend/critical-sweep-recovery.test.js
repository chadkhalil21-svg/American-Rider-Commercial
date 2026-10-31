'use strict';
const assert=require('node:assert/strict');
const {NAMES,OPTIONAL,settleSweepJobs,createCriticalRecoveryGate}=require('./critical-sweep-recovery');
const CRITICAL=NAMES.filter(n=>!OPTIONAL.includes(n));
(async()=>{
 assert.equal(NAMES.length,16);
 assert.ok(OPTIONAL.includes('operatorFeeEvidence'),'Stripe reporting must pause under quota');
 assert.ok(OPTIONAL.includes('operatorMonthlyFeeEvidence'),'Monthly account billing must pause under quota');
 assert.ok(OPTIONAL.includes('pushReceipts'),'receipt polling pauses during quota recovery');
 assert.ok(CRITICAL.includes('monitor'));
 assert.ok(CRITICAL.includes('bookingRecovery'));
 assert.ok(CRITICAL.includes('settlements'));
 assert.ok(CRITICAL.includes('providerEvents'));
 assert.ok(CRITICAL.includes('screening'));
 assert.ok(CRITICAL.includes('insuranceMonitoring'));
 assert.ok(CRITICAL.includes('familyAgeOut'));
 const calls=[];
 const jobs=Object.fromEntries(NAMES.map(name=>[name,async()=>{calls.push(name);return {ok:true,name};}]));
 const normal=await settleSweepJobs(jobs);
 assert.deepEqual(Object.keys(normal),NAMES,'exactly one result for every sweep job');
 assert.deepEqual(calls.sort(),[...NAMES].sort());
 calls.length=0;
 const critical=await settleSweepJobs(jobs,{criticalOnly:true});
 assert.deepEqual(calls.sort(),[...CRITICAL].sort(),'recovery must do every critical job');
 assert.ok(OPTIONAL.every(name=>critical[name].skipped==='optional_paused_during_quota_recovery'));
 assert.ok(CRITICAL.every(name=>critical[name].ok===true));
 const failedJobs={...jobs,monitor:async()=>{throw Error('8 RESOURCE_EXHAUSTED quota');},
   bookingRecovery:async()=>({ok:true,refunds:1})};
 const faulty=await settleSweepJobs(failedJobs,{criticalOnly:true});
 assert.equal(faulty.monitor.ok,false);
 assert.match(faulty.monitor.reason,/RESOURCE_EXHAUSTED/);
 assert.equal(faulty.bookingRecovery.refunds,1,'monitor exception cannot stop financial recovery');
 assert.equal(faulty.settlements.ok,true);
 assert.ok(OPTIONAL.every(name=>faulty[name].skipped),'optional work remains paused even on critical failure');
 const gate=createCriticalRecoveryGate({intervalMs:60000});
 const epoch=Date.parse('2026-10-12T00:00:00Z');
 assert.equal(gate.mode({now:epoch,blocked:false}),'normal');
 assert.equal(gate.mode({now:epoch,blocked:true}),'critical');
 for(let i=0;i<10000;i++)
   assert.equal(gate.mode({now:epoch+i%59999,blocked:true}),'wait',
      '10k rapid timer/web calls cannot multiply backend probes');
 assert.equal(gate.mode({now:epoch+60000,blocked:true}),'critical');
 assert.equal(gate.mode({now:epoch+60001,blocked:true}),'wait');
 assert.equal(gate.mode({now:epoch+61000,blocked:false}),'normal','healthy DB restores normal workload');
 assert.equal(gate.mode({now:epoch+62000,blocked:true}),'critical','new outage probes promptly');

 // Two end-to-end synthetic campaigns: simulate Firestore returning quota,
 // recovering after 60 seconds, and optional jobs resuming only after
 // successful critical work. No live Firestore writes or real Stripe actions.
 for(let campaign=0;campaign<2;campaign++){
   const g=createCriticalRecoveryGate({intervalMs:60000});
   let safety=0,refund=0,optional=0,leaseChecks=0;
   const work=Object.fromEntries(NAMES.map(name=>[name,async()=>{
     if(name==='monitor')safety++;
     if(name==='bookingRecovery')refund++;
     if(OPTIONAL.includes(name))optional++;
     return {ok:true};
   }]));
   for(let minute=0;minute<30;minute++){
     const now=epoch+minute*60000;
     const mode=g.mode({blocked:minute<=2,now});
     if(mode==='wait')continue;
     leaseChecks++;
     if(minute===0)continue; // one failed Firestore transaction: no jobs
     const result=await settleSweepJobs(work,{criticalOnly:mode==='critical'});
     assert.ok(CRITICAL.every(name=>result[name].ok===true));
     if(minute<=2)assert.ok(OPTIONAL.every(name=>result[name].skipped));
   }
   assert.equal(safety,29,'after initial failed DB lease, safety resumes after 60 sec');
   assert.equal(refund,29,'refund processing resumes after 60 sec');
   assert.equal(optional,27*OPTIONAL.length,'noncritical tasks wait until healthy');
   assert.equal(leaseChecks,30,'no more than one lease probe per minute per instance');
 }
 // Stress 10,000 all-critical job groups with a no-op in-memory backend;
 // this checks predictable fanout and error independence, not Firestore cost.
 let times=0;
 const fast=Object.fromEntries(NAMES.map(name=>[name,async()=>{times++;return {ok:true};}]));
 for(let k=0;k<10000;k++)await settleSweepJobs(fast,{criticalOnly:true});
 assert.equal(times,10000*CRITICAL.length);
 console.log('PASS twice: 30-minute quota recovery with safety/refunds resumed within 60s; 10K no-storm invocations; 10K critical batches');
})().catch(e=>{console.error(e);process.exitCode=1;});
