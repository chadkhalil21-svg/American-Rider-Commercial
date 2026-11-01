'use strict';
const assert=require('node:assert/strict');
const {computeOperatorFleetEconomics: forecast}=require('./fleet-economics-forecast');
const expected={
  50:{travels:3000,remainder:1701,expense:6369},
  100:{travels:6000,remainder:5042,expense:11098},
  200:{travels:12000,remainder:11703,expense:20577},
  500:{travels:30000,remainder:31674,expense:49026},
  1000:{travels:60000,remainder:64965,expense:96435},
};
for(const [label,row] of Object.entries(expected)){
  const n=Number(label),r=forecast(n);
  assert.equal(r.activeOperators,n*.60);
  assert.equal(r.travelsMonthly,row.travels,'travel forecasts must derive from utilization, not registrations');
  assert(Math.abs(r.remainderUsd-row.remainder)<1,'monthly modeled remainder: '+n);
  assert(Math.abs(r.totalExpenseUsd-row.expense)<1,'monthly modeled full expense budget: '+n);
  assert(Math.abs(r.totalExpenseUsd-r.grossRevenueUsd+r.remainderUsd)<1e-6);
  assert.equal(r.expenses.connectActiveUsd,r.accountFeeCollectedUsd,
    'only actually recovered account fees can be netted against billed active accounts');
  assert(r.expenses.reservedRiskUsd===r.travelsMonthly*.25);
  assert(r.expenses.paidMapsUsd>=20,'full-commercial tile usage is budgeted');
  assert.equal(r.payouts,r.activeOperators*20,'Stripe Express unmodified default is daily rolling, not weekly');
  const weekly=forecast(n,{payoutsPerActiveMonth:4});
  assert(Math.abs(weekly.totalExpenseUsd-r.totalExpenseUsd+r.activeOperators*4)<1e-6,
    'weekly schedule saves $4 per active monthly account, never assumed as live');
  const bare=forecast(n,{corporateBaseUsd:0,corporatePerRegisteredOperatorUsd:0});
  assert(Math.abs(bare.remainderUsd-r.remainderUsd-r.expenses.corporateBudgetUsd)<1e-6,
    'sole-founder infrastructure-only view is not identical to total-company net profit');
  assert.equal(bare.unverifiedFullCompanyExpenses,true);
  assert(r.expenses.emailUsd>=20,'provider daily limits are not mistaken for commercial plan');
}
const noFallback=forecast(50,{mapBudgetMode:'openFreeMapOnly'});
assert.equal(noFallback.expenses.paidMapsUsd,0);
assert.equal(noFallback.unverifiedFullCompanyExpenses,true,
  'zero tile invoice is not proof of commercial outage resilience');
assert.equal(forecast(200,{mapBudgetMode:'starterStandby'}).expenses.paidMapsUsd,20,
  'standby subscription is a budget, not live implementation');
assert(forecast(1000).expenses.paidMapsUsd < 420,
  'choose cheaper professional plan instead of permanently using Starter overage');
for(const n of [10000,50000]){
  const tier={backendUsd:400*n/1000,routingUsd:768*n/1000,monitoringUsd:160*n/1000};
  const r=forecast(n,{tiers:tier});
  assert.equal(r.travelsMonthly,n*60);
  assert(r.remainderUsd>0 && r.unverifiedFullCompanyExpenses,
    'million-scale arithmetic is NOT a million-concurrent production load test or net profit guarantee');
}
const weak=forecast(50,{activeFraction:.20,travelsPerActiveDay:2});
assert.equal(weak.travelsMonthly,400);
assert(weak.remainderUsd<-1300 && !weak.breakEven,'fixed expenses cause losses even with registered Operators');
const zero=forecast(50,{activeFraction:0});
assert(zero.remainderUsd<0&&!zero.breakEven&&zero.remainderPerTravelUsd===null,'no guaranteed profit without completed Travels');
const insuranceStress=forecast(50,{corporateBaseUsd:5000});
assert(insuranceStress.remainderUsd<0,'company-level insurance/regulatory obligations can reverse a positive estimate');
const collectionsFail=forecast(100,{collectionFraction:0});
assert.equal(collectionsFail.accountFeeCollectedUsd,0);
assert(Math.abs(forecast(100).remainderUsd-collectionsFail.remainderUsd-120)<1e-6,
  'active Stripe account fees are paid whether or not recoveries succeed');
// New analysis never guesses actual recovery. As provider-confirmed deductions
// become available, the platform's billed Connect cost is offset ONCE, with
// separate monthly-account collection preserved and no Traveler fee change.
const fullyCollected=forecast(100,{connectFeeRecoveryFraction:1});
const defaultRecovery=forecast(100);
const expectedTransactionRecovery=defaultRecovery.expenses.connectPercentUsd+defaultRecovery.expenses.payoutFixedUsd;
assert.equal(fullyCollected.connectTransactionFeeCollectedUsd,expectedTransactionRecovery);
assert.equal(fullyCollected.netCompanyConnectExpenseUsd,0);
assert(Math.abs(fullyCollected.remainderUsd-defaultRecovery.remainderUsd-expectedTransactionRecovery)<1e-6);
assert.equal(defaultRecovery.connectTransactionFeeCollectedUsd,0,
  'a provider TEST transfer is not evidence of production payout fee collections');
const partialRecovery=forecast(100,{connectFeeRecoveryFraction:.5,collectionFraction:.5});
assert(Math.abs(partialRecovery.netCompanyConnectExpenseUsd-
  (defaultRecovery.expenses.connectActiveUsd+expectedTransactionRecovery)*.5)<1e-6,
  'failed monthly AND transaction fee collections remain company expenses');
const noCollections=forecast(100,{connectFeeRecoveryFraction:0,collectionFraction:0});
assert.equal(noCollections.netCompanyConnectExpenseUsd,
  defaultRecovery.expenses.connectActiveUsd+expectedTransactionRecovery);
assert.throws(()=>forecast(50,{connectFeeRecoveryFraction:1.2}),/fractions/);
const moreRides=forecast(100,{travelsPerActiveDay:8});
assert(moreRides.travelsMonthly===9600 && moreRides.expenses.cardUsd>forecast(100).expenses.cardUsd);
assert.throws(()=>forecast(75),/paid capacity tier/);
assert.throws(()=>forecast(50,{activeFraction:1.2}),/fractions/);
assert.throws(()=>forecast(50,{corporateBaseUsd:-100}),/nonnegative/);
console.log('PASS verified-vs-unverified Connect recovery modeling, 50/100/200/500/1000 cohort model, no-ride loss, idle utilization stress, $2 account fee collections, optimized paid-tile tiers/default-daily and weekly-payout variations, maps/Firestore/email/vendor accounting, 10K/50K cohort scenario (not load cert), demand increase, missing capacity tier and corporate insurance stress');
