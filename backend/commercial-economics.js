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
  r2FreeStorageGibMonths:10,r2FreeClassA:1000000,r2FreeClassB:10000000,
  r2StoragePerGibMonth:0.015,r2ClassAPerMillion:4.50,r2ClassBPerMillion:0.36,
});
const DEFAULT=Object.freeze({
  days:30,travelsPerDay:50,operatorsOnDutyDaily:30,dutyHoursEach:8,
  presencePeriodSeconds:90,
  fareCents:1750,platformFeeCents:250,internationalShare:0.05,
  firestoreReadsPerTravel:100,firestoreWritesPerTravel:40,
  // /operator/online passes through Cloud Run and performs at least five distinct
  // Firestore document gets per renewal. Model FIVE as a conservative lower bound,
  // and 0.20 active vCPU-seconds as an EXPLICIT synthetic timing assumption.
  firestoreReadsPerPresenceRenewal:5,
  billableInstanceSecondsPerPresenceRenewal:0.20,
  otherReadsPerDay:2500,otherWritesPerDay:500,
  requestsPerTravel:20,otherRequestsPerDay:1000,
  billableInstanceSecondsPerTravel:8,otherBillableInstanceSecondsPerDay:180,
  cloudMemoryGib:1,
  // Zero here means no verified billed charge supplied, NOT that the real cost is zero.
  nonCloudVariableUsdPerTravel:0,
  assumedFixedMonthlyUsd:0,
  activePayoutAccountsMonthly:0,
  recoveredAccountFeeFraction:0,
  monthlyResendEmailCount:0,
  peakDailyResendEmailCount:0,
  // Explicit existing service plan, not a speculative corporate overhead allowance.
  // Set to $0 only after retiring the legacy Render API and validating callbacks.
  legacyRenderApiMonthlyUsd:7,
  cloudSchedulerJobs:1,
  // Existing Cloudflare R2 private document storage, usually free for small usage.
  r2StorageGibMonths:0,r2ClassARequestsMonthly:0,r2ClassBRequestsMonthly:0,
  // Request counts must be measured separately from completed Travels. HERE vendor
  // contract unit prices are UNKNOWN by default and MUST NOT be invented as $0.
  hereAutosuggestRequestsMonthly:0,hereTollRequestsMonthly:0,
  hereAutosuggestUsdPer1000:null,hereTollUsdPer1000:null,
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
  for(const [k,v] of Object.entries(a)) if(k!=='useFreeTiers'&&v!==null) nonneg(v,k);
  for(const k of ['hereAutosuggestUsdPer1000','hereTollUsdPer1000'])
    if(a[k]!==null) nonneg(a[k],k);
  if(!Number.isInteger(a.days)||a.days<1||a.days>366)throw Error('days out of range');
  if(!Number.isInteger(a.cloudSchedulerJobs))throw Error('cloudSchedulerJobs must be an integer');
  if(!Number.isInteger(a.fareCents)||!Number.isInteger(a.platformFeeCents))throw Error('fare and fee require whole cents');
  if(a.internationalShare>1)throw Error('internationalShare must not exceed 1');
  if(a.recoveredAccountFeeFraction>1)throw Error('recoveredAccountFeeFraction must not exceed 1');
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
  const readsDaily=a.travelsPerDay*a.firestoreReadsPerTravel+a.otherReadsPerDay+
    presenceWritesPerDay*a.firestoreReadsPerPresenceRenewal;
  const writesDaily=a.travelsPerDay*a.firestoreWritesPerTravel+a.otherWritesPerDay+presenceWritesPerDay;
  const billedReadsDaily=Math.max(0,readsDaily-(a.useFreeTiers?PRICES.dailyFreeReads:0));
  const billedWritesDaily=Math.max(0,writesDaily-(a.useFreeTiers?PRICES.dailyFreeWrites:0));
  const firestoreUsd=a.days*(billedReadsDaily*PRICES.firestoreReadPer100k/100000+
    billedWritesDaily*PRICES.firestoreWritePer100k/100000);
  const requests=a.days*(a.travelsPerDay*a.requestsPerTravel+a.otherRequestsPerDay+presenceWritesPerDay);
  const instanceSeconds=a.days*(a.travelsPerDay*a.billableInstanceSecondsPerTravel+a.otherBillableInstanceSecondsPerDay+
    presenceWritesPerDay*a.billableInstanceSecondsPerPresenceRenewal);
  const gibSeconds=instanceSeconds*a.cloudMemoryGib;
  const cloudRunUsd=
    Math.max(0,instanceSeconds-(a.useFreeTiers?PRICES.monthlyFreeCpuSeconds:0))*PRICES.cloudCpuPerSecond+
    Math.max(0,gibSeconds-(a.useFreeTiers?PRICES.monthlyFreeGibSeconds:0))*PRICES.cloudMemoryPerGibSecond+
    Math.max(0,requests-(a.useFreeTiers?PRICES.monthlyFreeRequests:0))*PRICES.cloudRequestsPerMillion/1e6;
  const fixed=a.assumedFixedMonthlyUsd;
  const otherVariable=rides*a.nonCloudVariableUsdPerTravel;
  // Stripe charges $2 per account in a month with a bank/debit-card payout.
  // Recovery is a separate Operator payment, and must not be presumed collected
  // until their explicit fee consent and actual provider charge are verified.
  const accountFees=a.activePayoutAccountsMonthly*2;
  const accountFeesRecovered=accountFees*a.recoveredAccountFeeFraction;
  // Resend free tier covers up to 3,000 emails and 100 per day. That daily
  // threshold is not inferable from monthly volume; switch to Pro if exceeded.
  const resendUsd=a.monthlyResendEmailCount<=3000&&a.peakDailyResendEmailCount<=100?0:
    a.monthlyResendEmailCount<=50000?20:20+Math.ceil((a.monthlyResendEmailCount-50000)/1000)*0.90;
  // Google Cloud Scheduler: 3 scheduled jobs/month free per billing account;
  // additional job costs $0.10/month. The number of executions does not change that charge.
  const cloudSchedulerUsd=Math.max(0,a.cloudSchedulerJobs-(a.useFreeTiers?3:0))*0.10;
  const renderLegacyUsd=a.legacyRenderApiMonthlyUsd;
  const r2Usd=Math.max(0,a.r2StorageGibMonths-(a.useFreeTiers?PRICES.r2FreeStorageGibMonths:0))*PRICES.r2StoragePerGibMonth+
    Math.max(0,a.r2ClassARequestsMonthly-(a.useFreeTiers?PRICES.r2FreeClassA:0))*PRICES.r2ClassAPerMillion/1e6+
    Math.max(0,a.r2ClassBRequestsMonthly-(a.useFreeTiers?PRICES.r2FreeClassB:0))*PRICES.r2ClassBPerMillion/1e6;
  const hereAutosuggestUsd=a.hereAutosuggestRequestsMonthly===0?0:
    a.hereAutosuggestUsdPer1000===null?null:a.hereAutosuggestRequestsMonthly*a.hereAutosuggestUsdPer1000/1000;
  const hereTollUsd=a.hereTollRequestsMonthly===0?0:
    a.hereTollUsdPer1000===null?null:a.hereTollRequestsMonthly*a.hereTollUsdPer1000/1000;
  const pricedHereUsd=(hereAutosuggestUsd??0)+(hereTollUsd??0);
  const hereUsageUnpriced=hereAutosuggestUsd===null||hereTollUsd===null;
  const totalCost=fixed+otherVariable+firestoreUsd+cloudRunUsd+accountFees-accountFeesRecovered+resendUsd+
    cloudSchedulerUsd+renderLegacyUsd+r2Usd+pricedHereUsd;
  const room=rides*transactionRoomUsd;
  const result=room-totalCost;
  const approximateBreakEvenTravels=transactionRoomUsd>a.nonCloudVariableUsdPerTravel?
    Math.ceil((fixed+accountFees-accountFeesRecovered+resendUsd+cloudSchedulerUsd+renderLegacyUsd+r2Usd+pricedHereUsd+a.days*(a.otherReadsPerDay*PRICES.firestoreReadPer100k/100000+
      (a.otherWritesPerDay+presenceWritesPerDay)*PRICES.firestoreWritePer100k/100000))/
      (a.days*(transactionRoomUsd-a.nonCloudVariableUsdPerTravel))):null;
  return {
    scenarioType:'SYNTHETIC_ESTIMATE_NOT_LIVE_PROFIT',travelsMonthly:rides,
    travelerTotalUsd:domestic.travelerPays/100,
    domesticModeledContributionUsd:domestic.platformContributionCents/100,
    internationalModeledContributionUsd:international.platformContributionCents/100,
    transactionRoomBeforeActualOverheadUsd:money(transactionRoomUsd),
    presenceWritesPerDay,presenceCloudRequestsMonthly:presenceWritesPerDay*a.days,
    assumedPresenceInstanceSecondsMonthly:money(presenceWritesPerDay*a.days*a.billableInstanceSecondsPerPresenceRenewal),
    firestoreReadsPerDay:readsDaily,firestoreWritesPerDay:writesDaily,
    cloudRequestsMonthly:requests,cloudInstanceSecondsMonthly:instanceSeconds,
    firestoreCostUsd:money(firestoreUsd),cloudRunCostUsd:money(cloudRunUsd),
    otherVariableCostUsd:money(otherVariable),assumedFixedMonthlyUsd:money(fixed),
    accountFeeUsd:money(accountFees),operatorRecoveredAccountFeeUsd:money(accountFeesRecovered),
    resendUsd:money(resendUsd),
    cloudSchedulerUsd:money(cloudSchedulerUsd),legacyRenderApiUsd:money(renderLegacyUsd),
    r2Usd:money(r2Usd),hereAutosuggestUsd:hereAutosuggestUsd===null?null:money(hereAutosuggestUsd),
    hereTollUsd:hereTollUsd===null?null:money(hereTollUsd),hereUsageUnpriced,
    knownServiceCostsUsd:money(firestoreUsd+cloudRunUsd+resendUsd+cloudSchedulerUsd+renderLegacyUsd+r2Usd+pricedHereUsd),
    availableBeforeActualOverheadUsd:money(room),
    modeledOperatingResultUsd:money(result),
    modeledResultBeforeUnpricedCostsUsd:money(result),
    economicsStatus:'NOT NET PROFIT: synthetic 0.20s/operator check-in, minimum 5 Firestore reads/check-in, plus unpriced HERE, egress/logs, support, insurance, legal and actual invoices',
    approximateBreakEvenTravelsPerDay:approximateBreakEvenTravels,
    freeTierAssumed:a.useFreeTiers,
  };
}
module.exports={DEFAULT,PRICES,evaluate};
