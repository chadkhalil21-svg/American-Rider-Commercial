#!/usr/bin/env node
'use strict';
// Financial planning only: not live quote/billing logic. Never call a simulation "actual net profit".
// Reuses the RELEASE pricing engine so no fake payout percentage, processor fee or risk reserve.
const { economicsFor, minimumPlatformFeeCents, OPERATING_OVERHEAD_ALLOWANCE_CENTS } = require('../backend/economics');
const NONNEG = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const REQUIRED_EXPENSES = Object.freeze([
  'cloudRun', 'firestore', 'render', 'resend', 'r2AndTiles', 'scheduler', 'logsAndMonitoring',
  'operatorAccountShortfall', 'payoutAllowanceShortfall', 'support', 'marketing',
  'corporateInsuranceAndLegal', 'accountingAndPermits', 'other'
]);
const DEFAULT_ASSUMPTIONS = Object.freeze({
  searchesPerSession: 5,
  routeQuotesPerSession: 0.5,
  autosuggestUSDPer1000: 3, routingUSDPer1000: 1, tollAddOnUSDPer1000: 5
});
function estimate({
  completedTravels,
  completionFraction,
  fareCents = 1750,
  cardCountry = 'US',
  tollCents = 0,
  governmentFeeCents = 0,
  demand = DEFAULT_ASSUMPTIONS,
  fixedMonthlyUSD = {},
  variableUSDPerTravel = {},
} = {}) {
  if(!Number.isSafeInteger(completedTravels) || completedTravels < 1)throw Error('completedTravels must be positive integer');
  if(!Number.isFinite(completionFraction)||completionFraction<=0||completionFraction>1)throw Error('completionFraction must be between 0 and 1');
  for(const [k,n] of Object.entries(demand))if(!NONNEG(n))throw Error('bad demand input '+k);
  for(const k of Object.keys(DEFAULT_ASSUMPTIONS))if(!NONNEG(demand[k]))throw Error('missing demand input '+k);
  const sessions=completedTravels/completionFraction;
  const autocompleteRequests=sessions*demand.searchesPerSession;
  const routeQuotes=sessions*demand.routeQuotesPerSession;
  const hereUSD=(autocompleteRequests*demand.autosuggestUSDPer1000 +
    routeQuotes*(demand.routingUSDPer1000+demand.tollAddOnUSDPer1000))/1000;
  const feeCents=minimumPlatformFeeCents({travelCostCents:fareCents,cardCountry,tollCents,governmentFeeCents});
  const economics=economicsFor({travelCostCents:fareCents,platformFeeCents:feeCents,cardCountry,tollCents,governmentFeeCents});
  // Remove the model's ASSUMED 25c overhead once, then replace it with estimated CASH expense.
  // Retain the original 25c risk reserve and the fixed Connect payout allowance.
  const contributionBeforeActualOverheadPerTravel=(economics.platformContributionCents +
    OPERATING_OVERHEAD_ALLOWANCE_CENTS)/100;
  let listedFixed=0,listedVariable=0;
  const missing=[];
  for(const name of REQUIRED_EXPENSES) {
    const f=fixedMonthlyUSD[name], v=variableUSDPerTravel[name];
    if(f === undefined && v === undefined)missing.push(name);
    if(f !== undefined){if(!NONNEG(f))throw Error('invalid fixed '+name);listedFixed+=f;}
    if(v !== undefined){if(!NONNEG(v))throw Error('invalid variable '+name);listedVariable+=v*completedTravels;}
  }
  const otherUSD=listedFixed+listedVariable;
  const knownExpenseUSD=hereUSD+otherUSD;
  const possibleContributionUSD=contributionBeforeActualOverheadPerTravel*completedTravels-knownExpenseUSD;
  return {
    sessions, autocompleteRequests, routeQuotes, hereUSD, otherUSD, knownExpenseUSD,
    overheadAllowanceUSD:completedTravels*OPERATING_OVERHEAD_ALLOWANCE_CENTS/100,
    knownExpensePerTravelUSD:knownExpenseUSD/completedTravels,
    withinOverheadAllowance:knownExpenseUSD<=completedTravels*OPERATING_OVERHEAD_ALLOWANCE_CENTS/100,
    platformFeeUSD:feeCents/100, operatorShareUSD:economics.operatorGets/100,
    platformGrossUSD:economics.platformGrossCents/100,
    modeledContributionAfterProvisionsUSD:economics.platformContributionCents/100,
    contributionBeforeActualOverheadPerTravel,
    possibleContributionUSD, // A ceiling, not actual net profit if any expense unknown.
    missingExpenses:missing,
    actualNetProfitCertifiable:missing.length===0 ? false : false, // Invoice verification STILL required even with fields filled.
    evidence:'MODEL ONLY; no live HERE tariff, booking conversion, bank invoices or corporate expenses are known'
  };
}
if(require.main===module){
  for(const n of [500,2500,10000,100000,1000000]){
    const a=estimate({completedTravels:n,completionFraction:0.10});
    process.stdout.write(JSON.stringify({travels:n,sessions:a.sessions,hereUSD:a.hereUSD,
      perTravelUSD:a.knownExpensePerTravelUSD,missing:a.missingExpenses.length})+'\n');
  }
}
module.exports={estimate,DEFAULT_ASSUMPTIONS,REQUIRED_EXPENSES};
