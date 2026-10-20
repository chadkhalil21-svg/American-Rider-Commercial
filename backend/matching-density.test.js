'use strict';
// Real dispatch-engine regression, run twice. No Firebase, Render, network or live Travelers.
const assert=require('node:assert/strict');
const {matchOperator, distanceMiles}=require('./matching');
const {DISCLOSURE_VERSION}=require('./disclosure');

const NOW=1792252800000; // fixed clock; all fresh Operators use the same timestamp
const pickup={lat:25.7617,lng:-80.1918};
function valid(id,n=0){
  return {id,lat:pickup.lat+0.0001*n,lng:pickup.lng+0.0001*n,
    available:true,onlineAt:NOW,insuranceExpiry:'2099-12-31',
    disclosureVersion:DISCLOSURE_VERSION,commissioned:true,
    screeningCheckedAt:NOW,documentBlocked:false,screeningBlocked:false,
    currentRideId:null,classes:['Standard','Large Vehicle'],
    verifiedVehicleClasses:['Standard','Large Vehicle']}; // synthetic approved fleet evidence
}
// Simple independent oracle: filter using the documented eligibility checks and
// sort for the smallest geographic distance. Production must avoid this sort.
function oracle(operators,{className='Standard',screening=true,queue=false}={}){
  return operators.filter(o=>o.available && (!o.currentRideId || (queue && o.queueEligible===true && !o.nextRideId))
    && Number.isFinite(o.onlineAt) && NOW-o.onlineAt<=5*60000 && !o.screeningBlocked
    && (!screening || !!o.screeningCheckedAt)
    && o.insuranceExpiry==='2099-12-31'
    && o.disclosureVersion===DISCLOSURE_VERSION && o.commissioned===true && !o.documentBlocked
    && (className==='Standard'||((o.classes||[]).includes(className)
      && (o.verifiedVehicleClasses||[]).includes(className))))
    .map(o=>({o,d:distanceMiles(pickup,o)}))
    .filter(x=>Number.isFinite(x.d))
    .sort((a,b)=>a.d-b.d)[0]?.o.id ?? null;
}
for(let pass=0;pass<2;pass++){
  const n=12000;
  const fleet=Array.from({length:n},(_,i)=>valid('operator-'+i,1+i%800));
  // Different eligibility failures exercise every server-side safety condition.
  for(let i=0;i<n;i++){
    if(i%13===0)fleet[i].available=false;
    if(i%17===0)fleet[i].onlineAt=NOW-600000;
    if(i%19===0)fleet[i].screeningBlocked=true;
    if(i%23===0)fleet[i].screeningCheckedAt=null;
    if(i%29===0)fleet[i].insuranceExpiry='2020-01-01';
    if(i%31===0)fleet[i].disclosureVersion='old';
    if(i%37===0)fleet[i].commissioned=false;
    if(i%41===0)fleet[i].documentBlocked=true;
    if(i%43===0)fleet[i].classes=['Standard'];
    if(i%47===0)fleet[i].currentRideId='already-booked';
  }
  for(const opts of [
    {className:'Standard',screening:true,queue:false},
    {className:'Large Vehicle',screening:true,queue:false},
    {className:'Standard',screening:false,queue:true}
  ]){
    const expected=oracle(fleet,opts);
    const actual=matchOperator(fleet,pickup,opts.className,{
      requireScreening:opts.screening,allowQueued:opts.queue,now:NOW});
    assert.equal(actual?.operator.id??null,expected);
  }
  assert.equal(matchOperator([valid('tie-first',0),valid('tie-second',0)],pickup,'Standard',
    {requireScreening:true,now:NOW}).operator.id,'tie-first',
  'equal-distance ties retain the original first candidate');
  assert.equal(matchOperator([valid('stale',0),valid('valid',9)].map((o,i)=>i===0?{...o,onlineAt:NOW-600000}:o),
    pickup,'Standard',{requireScreening:true,now:NOW}).operator.id,'valid');
  assert.equal(matchOperator([],pickup,'Standard',{requireScreening:true,now:NOW}),null);
  assert.equal(matchOperator([{...valid('forged-special'),verifiedVehicleClasses:['Standard']}],
    pickup,'Large Vehicle',{requireScreening:true,now:NOW}),null,
    'client-declared class without independent server verification is never eligible');
  assert.equal(matchOperator([{...valid('invalid',0),lat:NaN}],pickup,'Standard',{requireScreening:true,now:NOW}),null);
  const queueFleet=[{...valid('queue',0),currentRideId:'active',queueEligible:true},valid('free',10)];
  assert.equal(matchOperator(queueFleet,pickup,'Standard',{requireScreening:true,allowQueued:false,now:NOW}).operator.id,'free');
  assert.equal(matchOperator(queueFleet,pickup,'Standard',{requireScreening:true,allowQueued:true,now:NOW}).operator.id,'queue');
}
console.log('PASS twice: 12,000-Operator dense matching preserves nearest verified eligibility and ties; runtime capacity remains unmeasured.');
