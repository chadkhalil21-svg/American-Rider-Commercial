'use strict';
const assert=require('node:assert/strict');
const {noShowEligibility,WAIT_MS,FEE_CENTS}=require('./noshow');
const now=1_790_390_000_000;
const ride={operatorId:'operator',status:'arrived',arrivedAt:now-WAIT_MS-5000,
 pickupContactAt:now-3000,pickupContactBy:'operator',pickupLat:25.7617,pickupLng:-80.1918};
const operator={currentRideId:'trip',lat:25.7617,lng:-80.1918,onlineAt:now-1000};
const check=(name,r,o,uid='operator',at=now)=>{const out=noShowEligibility({ride:r,operator:o,rideId:'trip',uid,now:at});assert.equal(out.ok,false,name);};
assert.deepEqual(noShowEligibility({ride,operator,rideId:'trip',uid:'operator',now}),
 {ok:true,status:200,feeCents:FEE_CENTS});
check('different operator',ride,operator,'stranger');
check('too early',{...ride,arrivedAt:now-WAIT_MS+1000},operator);
check('missing contact',{...ride,pickupContactAt:null},operator);
check('contact from other operator',{...ride,pickupContactBy:'stranger'},operator);
check('contact before arrived',{...ride,pickupContactAt:ride.arrivedAt-1},operator);
check('already boarded',{...ride,status:'onboard'},operator);
check('already cancelled',{...ride,status:'cancelled'},operator);
check('operator fault',{...ride,operatorAtFault:true},operator);
check('wrong current travel',ride,{...operator,currentRideId:'another'});
check('stale location',ride,{...operator,onlineAt:now-130000});
check('far from pickup',ride,{...operator,lat:25.77});
check('scheduled pickup',{...ride,scheduledFor:now+360000},operator);
check('no recorded arrival',{...ride,arrivedAt:null},operator);
check('no malformed coordinates',{...ride,pickupLat:null},operator);
console.log('PASS 15 deterministic no-show fee eligibility cases; no Stripe or device side effects');
