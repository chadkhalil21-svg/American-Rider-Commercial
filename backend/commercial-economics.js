'use strict';
// Decision model: scenario arithmetic, NEVER live revenue, Cloud Billing, insurance or legal proof.
// All baseline fare splits are imported from the platform's actual pricing function.
const {economicsFor,OPERATING_OVERHEAD_ALLOWANCE_CENTS}=require('./economics');

const PRICES=Object.freeze({
  firestoreReadPer100k:0.03,firestoreWritePer100k:0.09,
  dailyFreeReads:50000,dailyFreeWrites:20000,
  cloudCpuPerSecond:0.000024,cloudMemoryPerGibSecond:0.0000025,
  cloudRequestsPerMillion:0.40,
  monthlyFreeCpuSeconds:180000,monthlyFreeGibSeconds:360000,monthlyFreeRequests:2000000,
});
const DEFAULT=Object.freeze({
  days:30,travelsPerDay:50,operatorsOnDutyDaily:30,dutyHoursEach:8,
  presencePeriodSeconds:90,
  fareCents:1750,platformFeeCents:250,internationalShare:0.05,
  firestoreReadsPerTravel:100,firestoreWritesPerTravel:40,
  otherReadsPerDay:2500,otherWritesPerDay:500,
  requestsPerTravel:20,otherRequestsPerDay:1000,
  billableInstanceSecondsPerTravel:8,otherBillableInstanceSecondsPerDay:180,
  cloudMemoryGib:1,
  nonCloudVariableUsdPerTravel:0.10,
  assumedFixedMonthlyUsd:2000,
  useFreeTiers:true,
});
function nonneg(n,name) {
  if(typeof n!=='number'||!Number.isFinite(n)||n<0)throw Error(name+' must be a nonnegative finite number');
  return n;
}
function money(n){return Math.round((n+Number.EPSILON)*100)/100;}
function evaluate(overrides={}) {
  if(!overrides||typeof overrides!=='object'||Array.isArray(overrides))throw Error('options must be an object');
  for(const k of Object.keys(overrides)) if(!(k in DEFAULT))throw Error('unsupported economics input: '+k);
  const a={...DEFAULT,...overrides};
  for(const [k,v] of Object.entries(a)) if(k!=='useFreeTiers') nonneg(v,k);
  if(!Number.isInteger(a.days)||a.days<1||a.days>366)throw Error('days out of range');
  if(!Number.isInteger(a.fareCents)||!Number.isInteger(a.platformFeeCents))throw Error('fare and fee require whole cents');
  if(a.internationalShare>1)throw Error('internationalShare must not exceed 1');
  if(a.presencePeriodSeconds<=0)throw Error('presence period must be positive');
  if(a.useFreeTiers!==true&&a.useFreeTiers!==false)throw Error('useFreeTiers must be boolean');
  const rides=a.travelsPerDay*a.days;
  const domestic=economicsFor({travelCostCents:a.fareCents,platformFeeCents:a.platformFeeCents,cardCountry:'US'});
  const international=economicsFor({travelCostCents:a.fareCents,platformFeeCents:a.platformFeeCents,cardCountry:'GB'});
  // Its $0.25 "operating overhead allowance" is a PLACEHOLDER, not a measured cost.
  // Add it back, then subtract all specified actual monthly operations below ONCE.
  // Keep the $0.25 contingency reserve, Stripe fees and Operator 99% deducted.
  const transactionRoomUsd=((1-a.internationalShare)*(domestic.platformContributionCents+OPERATING_OVERHEAD_ALLOWANCE_CENTS)+
    a.internationalShare*(international.platformContributionCents+OPERATING_OVERHEAD_ALLOWANCE_CENTS))/100;
  const presenceWritesPerDay=Math.ceil(a.operatorsOnDutyDaily*a.dutyHoursEach*3600/a.presencePeriodSeconds);
  const readsDaily=a.travelsPerDay*a.firestoreReadsPerTravel+a.otherReadsPerDay;
  const writesDaily=a.travelsPerDay*a.firestoreWritesPerTravel+a.otherWritesPerDay+presenceWritesPerDay;
  const billedReadsDaily=Math.max(0,readsDaily-(a.useFreeTiers?PRICES.dailyFreeReads:0));
  const billedWritesDaily=Math.max(0,writesDaily-(a.useFreeTiers?PRICES.dailyFreeWrites:0));
  const firestoreUsd=a.days*(billedReadsDaily*PRICES.firestoreReadPer100k/100000+
    billedWritesDaily*PRICES.firestoreWritePer100k/100000);
  const requests=a.days*(a.travelsPerDay*a.requestsPerTravel+a.otherRequestsPerDay);
  const instanceSeconds=a.days*(a.travelsPerDay*a.billableInstanceSecondsPerTravel+a.otherBillableInstanceSecondsPerDay);
  const gibSeconds=instanceSeconds*a.cloudMemoryGib;
  const cloudRunUsd=
    Math.max(0,instanceSeconds-(a.useFreeTiers?PRICES.monthlyFreeCpuSeconds:0))*PRICES.cloudCpuPerSecond+
    Math.max(0,gibSeconds-(a.useFreeTiers?PRICES.monthlyFreeGibSeconds:0))*PRICES.cloudMemoryPerGibSecond+
    Math.max(0,requests-(a.useFreeTiers?PRICES.monthlyFreeRequests:0))*PRICES.cloudRequestsPerMillion/1e6;
  const fixed=a.assumedFixedMonthlyUsd;
  const otherVariable=rides*a.nonCloudVariableUsdPerTravel;
  const totalCost=fixed+otherVariable+firestoreUsd+cloudRunUsd;
  const room=rides*transactionRoomUsd;
  const result=room-totalCost;
  const approximateBreakEvenTravels=transactionRoomUsd>a.nonCloudVariableUsdPerTravel?
    Math.ceil((fixed+a.days*(a.otherReadsPerDay*PRICES.firestoreReadPer100k/100000+
      (a.otherWritesPerDay+presenceWritesPerDay)*PRICES.firestoreWritePer100k/100000))/
      (transactionRoomUsd-a.nonCloudVariableUsdPerTravel)):null;
  return {
    scenarioType:'SYNTHETIC_ESTIMATE_NOT_LIVE_PROFIT',travelsMonthly:rides,
    travelerTotalUsd:domestic.travelerPays/100,
    domesticModeledContributionUsd:domestic.platformContributionCents/100,
    internationalModeledContributionUsd:international.platformContributionCents/100,
    transactionRoomBeforeActualOverheadUsd:money(transactionRoomUsd),
    presenceWritesPerDay,firestoreReadsPerDay:readsDaily,firestoreWritesPerDay:writesDaily,
    cloudRequestsMonthly:requests,cloudInstanceSecondsMonthly:instanceSeconds,
    firestoreCostUsd:money(firestoreUsd),cloudRunCostUsd:money(cloudRunUsd),
    otherVariableCostUsd:money(otherVariable),assumedFixedMonthlyUsd:money(fixed),
    availableBeforeActualOverheadUsd:money(room),
    modeledOperatingResultUsd:money(result),
    approximateBreakEvenTravelsPerMonth:approximateBreakEvenTravels,
    freeTierAssumed:a.useFreeTiers,
  };
}
module.exports={DEFAULT,PRICES,evaluate};
