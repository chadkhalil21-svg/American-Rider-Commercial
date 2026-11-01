'use strict';
// Management planning ONLY — not a quote, a charge, a production load test,
// a provider contract, an insurance certificate, or an authorization to launch.
// Published provider rates: Stripe Connect, Firestore Standard (regional),
// Resend Pro + overages, Stadia commercial Starter, DigitalOcean Droplets,
// Render. Consumption, staff, corporate and capacity ladder are SCENARIOS.
const DEFAULT_TIERS=Object.freeze({
  50:{backendUsd:25,routingUsd:96,monitoringUsd:30},
  100:{backendUsd:50,routingUsd:96,monitoringUsd:40},
  200:{backendUsd:100,routingUsd:192,monitoringUsd:60},
  500:{backendUsd:200,routingUsd:384,monitoringUsd:100},
  1000:{backendUsd:400,routingUsd:768,monitoringUsd:160},
});
function nonNegativeNumber(value,label){if(!Number.isFinite(value)||value<0)throw new RangeError(label+' must be finite and nonnegative');return value;}
function computeOperatorFleetEconomics(registeredOperators,overrides={}){
  if(!Number.isSafeInteger(registeredOperators)||registeredOperators<0)throw new RangeError('registeredOperators must be a nonnegative integer');
  const opt={activeFraction:.60,operatingDays:20,travelsPerActiveDay:5,
    // Stripe Express connected accounts have daily rolling payouts by default
    // unless an actual account payout schedule says otherwise.
    payoutsPerActiveMonth:20,
    // Budget full paid tile usage; current live app has OpenFreeMap ONLY.
    // The provider backup is NOT connected; mode is financial sensitivity.
    mapBudgetMode:'optimizedCommercial',
    hoursPerActiveDay:6,mapCreditsPerTravel:500,mapCreditsPerDutyDay:400,
    emailsPerTravel:2,readsPerTravel:100,writesPerTravel:40,
    presenceWritesPerActiveDay:360,otherOperationsCentsPerTravel:17,
    presenceBudgetUsdPerHour:.035,corporateBaseUsd:1500,
    corporatePerRegisteredOperatorUsd:3,collectionFraction:1,
    // Financial-model toggle ONLY: zero until actual Operator-paid payout/routing
    // fee collections are proven. Do not set production fee flags from this.
    connectFeeRecoveryFraction:0,
    ...overrides};
  for(const [key,value] of Object.entries(opt))if(!['tiers','mapBudgetMode'].includes(key))nonNegativeNumber(value,key);
  if(!['optimizedCommercial','openFreeMapOnly','starterStandby'].includes(opt.mapBudgetMode))throw new RangeError('unknown map budget mode');
  if(opt.activeFraction>1||opt.collectionFraction>1||opt.connectFeeRecoveryFraction>1)throw new RangeError('fractions must be <= 1');
  const tier=opt.tiers||DEFAULT_TIERS[registeredOperators];
  if(!tier)throw new RangeError('specify paid capacity tier for this cohort, no unverified infinite scaling');
  for(const [key,value] of Object.entries(tier))nonNegativeNumber(value,key);
  const active=registeredOperators*opt.activeFraction;
  const travels=active*opt.operatingDays*opt.travelsPerActiveDay;
  const monthlyHours=active*opt.operatingDays*opt.hoursPerActiveDay;
  const cardUsd=travels*.88,connectPercentUsd=travels*.09;
  const connectActiveUsd=active*2,accountFeeCollectedUsd=connectActiveUsd*opt.collectionFraction;
  const payoutFixedUsd=active*opt.payoutsPerActiveMonth*.25;
  // Keep Stripe platform-paid Connect debits on the expense side for an honest
  // audit. Count Operator reimbursement ONLY on the collection side of the
  // scenario, independently of the existing $2/month account-fee collection.
  const connectTransactionFeeCollectedUsd=(connectPercentUsd+payoutFixedUsd)*opt.connectFeeRecoveryFraction;
  const netCompanyConnectExpenseUsd=connectActiveUsd+connectPercentUsd+payoutFixedUsd-
    accountFeeCollectedUsd-connectTransactionFeeCollectedUsd;
  const reservedRiskUsd=travels*.25; // earmarked provision, not vendor cash
  const otherVariableUsd=travels*opt.otherOperationsCentsPerTravel/100;
  const operatorDutyUsd=monthlyHours*opt.presenceBudgetUsdPerHour;
  const mapCredits=travels*opt.mapCreditsPerTravel+active*opt.operatingDays*opt.mapCreditsPerDutyDay;
  const paidMapsUsd=opt.mapBudgetMode==='openFreeMapOnly'?0:
    opt.mapBudgetMode==='starterStandby'?20:
    Math.min(
      20+Math.max(0,mapCredits-1_000_000)*.03/1000,
      80+Math.max(0,mapCredits-7_500_000)*.02/1000,
      250+Math.max(0,mapCredits-25_000_000)*.015/1000,
    );
  const emailCount=travels*opt.emailsPerTravel;
  const emailUsd=20+Math.max(0,emailCount-50000)*.90/1000;
  const avgReadDaily=travels*opt.readsPerTravel/30;
  const avgWriteDaily=(travels*opt.writesPerTravel+
    active*opt.operatingDays*opt.presenceWritesPerActiveDay)/30;
  const firestoreUsd=30*(Math.max(0,avgReadDaily-50000)*.03/100000+
    Math.max(0,avgWriteDaily-20000)*.09/100000);
  const infrastructureUsd=tier.backendUsd+tier.routingUsd+tier.monitoringUsd;
  const corporateBudgetUsd=opt.corporateBaseUsd+
    registeredOperators*opt.corporatePerRegisteredOperatorUsd;
  const expenses={cardUsd,connectPercentUsd,connectActiveUsd,payoutFixedUsd,
    reservedRiskUsd,otherVariableUsd,operatorDutyUsd,paidMapsUsd,
    emailUsd,firestoreUsd,infrastructureUsd,corporateBudgetUsd};
  const totalExpenseUsd=Object.values(expenses).reduce((x,y)=>x+y,0);
  const platformTravelRevenueUsd=travels*2.67;
  const grossRevenueUsd=platformTravelRevenueUsd+accountFeeCollectedUsd+connectTransactionFeeCollectedUsd;
  const remainderUsd=grossRevenueUsd-totalExpenseUsd;
  return {registeredOperators,activeOperators:active,
    travelsDaily:travels/30,travelsMonthly:travels,
    mapCredits,emailCount,payouts:active*opt.payoutsPerActiveMonth,
    platformTravelRevenueUsd,accountFeeCollectedUsd,connectTransactionFeeCollectedUsd,
    netCompanyConnectExpenseUsd,grossRevenueUsd,
    expenses,totalExpenseUsd,remainderUsd,
    remainderPerTravelUsd:travels?remainderUsd/travels:null,
    breakEven:remainderUsd>=0,
    // Actual legal/company coverage costs have not been obtained. This is a
    // scenario, never a certified net income statement.
    unverifiedFullCompanyExpenses:true,
    assumptions:opt};
}
module.exports={computeOperatorFleetEconomics,DEFAULT_TIERS};
