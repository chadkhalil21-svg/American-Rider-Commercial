'use strict';
const assert=require('node:assert/strict');
const {forEachBounded}=require('./bounded-tasks');
(async()=>{
 for(let pass=0;pass<2;pass++){
   const expected=Array.from({length:3000},(_,i)=>i);
   const done=new Set();let inflight=0,peak=0;
   await forEachBounded(expected,8,async(x)=>{
     inflight++;peak=Math.max(peak,inflight);
     await new Promise(resolve=>setImmediate(resolve));
     assert.equal(done.has(x),false,'no duplicate work');
     done.add(x);inflight--;
   });
   assert.equal(done.size,expected.length,'must verify every queued candidate');
   assert.equal(peak,8,'a dense fleet may not send thousands of simultaneous checks');
   assert.ok(peak<=8);
   let steps=0;
   await forEachBounded([],8,async()=>{steps++;});
   assert.equal(steps,0);
   await assert.rejects(forEachBounded(null,8,()=>{}));
   await assert.rejects(forEachBounded(expected,0,()=>{}));
   await assert.rejects(forEachBounded(expected,1,null));
   let started=0,completed=0,active=0;
   await assert.rejects(forEachBounded([1,2,3,4,5,6],2,async x=>{
     started++;active++;
     try{
       await new Promise(resolve=>setImmediate(resolve));
       if(x===3)throw Error('synthetic rejected read');
     } finally { completed++;active--; }
   }),/synthetic rejected read/);
   // A rejected worker may stop taking NEW jobs, but all jobs already started
   // must settle before the helper returns. Safety does not imply skip-free on error.
   assert.equal(completed,started,'no unobserved in-flight work after rejection');
   assert.equal(active,0);
   assert.ok(started>=3&&started<=6);
 }
 console.log('PASS twice: all 3,000 candidate checks processed, concurrency bounded at eight, no detached tasks.');
})().catch(e=>{console.error(e);process.exitCode=1;});
