'use strict';
const assert=require('node:assert/strict');
const {estimate}=require('../scripts/full-infrastructure-contribution.cjs');
const {retrieve,params}=require('../scripts/fdot-toll-road-inventory.cjs');

const early=estimate({completedTravels:500,completionFraction:0.10});
assert.equal(early.sessions,5000);
assert.equal(early.autocompleteRequests,25000);
assert.equal(early.routeQuotes,2500);
assert.equal(early.hereUSD,90);
assert.equal(early.platformFeeUSD,2.50);
assert.equal(early.modeledContributionAfterProvisionsUSD,1.14);
assert.equal(early.actualNetProfitCertifiable,false);
assert.ok(early.missingExpenses.includes('corporateInsuranceAndLegal'));
const mature=estimate({completedTravels:500,completionFraction:0.25});
assert.equal(mature.hereUSD,36);
assert.equal(estimate({completedTravels:1000000,completionFraction:0.25}).hereUSD,72000);
assert.throws(()=>estimate({completedTravels:0,completionFraction:0.25}));
assert.throws(()=>estimate({completedTravels:50,completionFraction:0}));

const fixed={render:7,cloudRun:20,firestore:8,resend:0,r2AndTiles:3,scheduler:0,logsAndMonitoring:5};
const stressed=estimate({completedTravels:500,completionFraction:0.10,fixedMonthlyUSD:fixed});
const improved=estimate({completedTravels:500,completionFraction:0.25,fixedMonthlyUSD:fixed});
assert.equal(stressed.knownExpenseUSD,133);
assert.equal(stressed.withinOverheadAllowance,false,'HERE + other vendor placeholders exceed 25-cent shared overhead');
assert.equal(improved.knownExpenseUSD,79);
assert.equal(improved.withinOverheadAllowance,true);
assert.equal(stressed.missingExpenses.includes('support'),true,'never pass unknown corporate costs as fully loaded');
assert.ok(stressed.possibleContributionUSD>0,'positive partial contribution is NOT net profit');

const feature=id=>({type:'Feature',properties:{OBJECTID:id,ROADWAY:'TOLL'},geometry:{type:'LineString',coordinates:[[-80.1,25.1],[-80.2,25.2]]}});
let calls=[];
const mock=async url=>{
  calls.push(String(url));
  const offset=Number(new URL(url).searchParams.get('resultOffset'));
  const records=offset===0?[feature(11),feature(12)]:[feature(13)];
  return {ok:true,json:async()=>({type:'FeatureCollection',features:records})};
};
(async()=>{
  assert.match(params(0,2),/resultRecordCount=2/);
  const out=await retrieve({fetchImpl:mock,pageSize:2});
  assert.equal(out.manifest.records,3);
  assert.equal(out.manifest.certifiedGantryCoverage,false);
  assert.equal(out.manifest.verifiedMoneyRates,false);
  assert.equal(out.manifest.permittedForTravelerTollPricing,false);
  assert.equal(calls.length,2);
  await assert.rejects(retrieve({fetchImpl:async()=>({ok:false})}),/unavailable/);
  await assert.rejects(retrieve({fetchImpl:async()=>({ok:true,json:async()=>({type:'FeatureCollection',features:[{type:'Feature',properties:{OBJECTID:1},geometry:null}]})})}),/Malformed/);
  console.log('PASS: full cost sensitivity, missing expense guard, FDOT bounded read-only pagination and no billable rate');
})().catch(e=>{console.error(e);process.exitCode=1;});
