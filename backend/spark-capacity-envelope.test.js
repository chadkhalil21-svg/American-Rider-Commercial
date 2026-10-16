'use strict';
const assert=require('node:assert/strict');
const {sparkEnvelope,SPARK_LIMITS}=require('./spark-capacity-envelope');
for(let pass=0;pass<2;pass++){
  assert.deepEqual(SPARK_LIMITS,{reads:50000,writes:20000});
  const empty=sparkEnvelope();
  assert.equal(empty.hypotheticalTravels,500,'100 reads + 40 writes per completed Travel');
  const ten=sparkEnvelope({operators:10});
  assert.equal(ten.operatorRenewals,3200);
  assert.equal(ten.baselineReads,16000);
  assert.equal(ten.baselineWrites,3200);
  assert.equal(ten.hypotheticalTravels,340);
  assert.equal(sparkEnvelope({operators:25}).hypotheticalTravels,100);
  assert.equal(sparkEnvelope({operators:30}).hypotheticalTravels,20);
  const tooMany=sparkEnvelope({operators:35});
  assert.equal(tooMany.baseExceedsSpark,true);
  assert.equal(tooMany.hypotheticalTravels,0);
  const extraIdle=sparkEnvelope({operators:10,idleReads:5000,idleWrites:1500});
  assert.equal(extraIdle.hypotheticalTravels,290);
  const expensive=sparkEnvelope({operators:10,readsPerRenewal:10});
  assert.equal(expensive.hypotheticalTravels,180);
  assert.throws(()=>sparkEnvelope({renewalSeconds:0}));
  assert.throws(()=>sparkEnvelope({operators:-1}));
}
console.log('PASS twice: Firebase Spark read/write headroom scenarios, Operator duty burden, idle costs and invalid workloads — NOT a live-user certification');
