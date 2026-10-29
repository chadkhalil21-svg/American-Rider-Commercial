'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {encodeGeohash,nearbyOperatorCandidates}=require('./geooperators');
const {matchOperator,presenceStale}=require('./matching');
const {DISCLOSURE_VERSION}=require('./disclosure');
const fixture=fs.readFileSync('backend/native-commercial-qa-fixture.cjs','utf8');
const refresh=fs.readFileSync('backend/native-commercial-qa-refresh-presence.cjs','utf8');
const android=fs.readFileSync('scripts/native-commercial-android-runner.sh','utf8');
const ios=fs.readFileSync('.github/workflows/native-qa-fixed-layout-full-journeys.yml','utf8');
assert.match(fixture,/geohash:encodeGeohash\(25\.7617,-80\.1918,7\)/,'QA fleet must be discoverable by the real geohash index');
assert.match(refresh,/isolatedNativeQa\(\)/,'QA refresh must fail outside local emulators');
assert.match(refresh,/o\.qaOnly,true/,'QA refresh must refuse real Operators');
assert.match(refresh,/ref\.update\(\{onlineAt:now\}\)/,'Only presence may be refreshed');
assert.match(android,/node backend\/native-commercial-qa-refresh-presence\.cjs/,'Android must refresh after emulated boot');
assert.match(ios,/node backend\/native-commercial-qa-refresh-presence\.cjs/,'iOS must refresh after Xcode compilation');
const geohash=encodeGeohash(25.7617,-80.1918,7);
assert.ok(typeof geohash==='string'&&geohash.length===7);
const op={id:'native-qa-operator',uid:'native-qa-operator',available:true,onlineAt:Date.now(),commissioned:true,disclosureVersion:DISCLOSURE_VERSION,insuranceExpiry:'2099-01-01',lat:25.7617,lng:-80.1918,geohash,vehicleClass:'Standard'};
assert.equal(presenceStale(op),false);
assert.equal(matchOperator([op],{lat:25.7617,lng:-80.1918})?.operator?.id,'native-qa-operator');
assert.equal(presenceStale({...op,onlineAt:Date.now()-360000}),true,'Never relax the 5-minute production cutoff');
// Reproduce the real two-tier indexed dispatch query without relaxing its
// server-side filters. This caught the prior false-positive test fixture:
// a record can pass matchOperator but be invisible to geohash discovery.
async function verifyDiscovery() {
  const db={collection(name){
    assert.equal(name,'operators');
    return {where(field,operator,value){
      assert.equal(field,'available');
      assert.equal(operator,'==');
      assert.equal(value,true);
      return {orderBy(sortField){
        assert.equal(sortField,'geohash');
        return {startAt(prefix){
          return {endAt(end){
            const query={
              limit(count){this.max=count;return this;},
              async get(){
                const docs=op.available && typeof op.geohash==='string' &&
                  op.geohash >= prefix && op.geohash <= end
                  ?[{id:op.id,data:()=>op}]:[];
                return {docs};
              }
            };
            return query;
          }};
        }};
      }};
    }};
  }};
  const pickup={lat:25.7617,lng:-80.1918};
  assert.equal((await nearbyOperatorCandidates(db,pickup)).length,1,
    'Actual indexed geohash query must locate seeded disposable Operator');
  const discovered=await nearbyOperatorCandidates(db,pickup);
  assert.equal(matchOperator(discovered,pickup)?.operator?.id,op.id,
    'The same Operator must pass authoritative eligibility after index search');
}
verifyDiscovery().then(()=>console.log('PASS: QA geohash discovery, current presence, and unchanged 5-minute production cutoff'))
  .catch(e=>{console.error(e);process.exitCode=1;});
