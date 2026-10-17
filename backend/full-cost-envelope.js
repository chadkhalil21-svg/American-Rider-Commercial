'use strict';
// Planning-only. No production route imports this module. It does not certify
// throughput, a Firebase invoice, Stripe charges, routing cost or legal overhead.
const { estimate } = require('./duty-capacity-boundary');
const { economicsFor } = require('./economics');

// Google Firestore Standard published us-central1 rates (October 2026).
// The actual deployed database region/edition must be confirmed before budgeting.
const STANDARD_US_CENTRAL = Object.freeze({readPer100kUsd:0.03,writePer100kUsd:0.09});
const DOUBLE_RATE_SENSITIVITY = Object.freeze({readPer100kUsd:0.06,writePer100kUsd:0.18});

function wholeNonnegative(name,value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(name+' must be a nonnegative integer');
  return value;
}
function dollarCost(reads,writes,rates=STANDARD_US_CENTRAL) {
  for (const [key,value] of Object.entries(rates)) {
    if (!Number.isFinite(value) || value < 0) throw new RangeError('Invalid rate '+key);
  }
  return reads*rates.readPer100kUsd/100000 + writes*rates.writePer100kUsd/100000;
}
/**
 * N simultaneous, one-hour Travels means N distinct Travels running for one
 * hour, NOT N new booking requests every second. Always quote a measured
 * server-load test separately from these database operation estimates.
 *
 * GPS publication and duty checks are source-derived envelopes. Monitoring
 * checkpoint updates are a possible high-end, not guaranteed every minute.
 * Two document listeners read each changed Travel, including checkpoints.
 */
function scenario({
  simultaneousTravels=100, travelMinutes=60, operatorsOnDuty=simultaneousTravels,
  connectedScreens=2, dispatchSearchesPerTravel=2,
  documentsPerDispatchSearch=36, gpsPublicationSeconds=30,
  monitoringIntervalMinutes=1,
  rates=STANDARD_US_CENTRAL,
}={}) {
  for (const [name,value] of Object.entries({simultaneousTravels,operatorsOnDuty,
    connectedScreens,dispatchSearchesPerTravel,documentsPerDispatchSearch,
    monitoringIntervalMinutes})) {
    wholeNonnegative(name,value);
  }
  if (!Number.isFinite(travelMinutes) || travelMinutes<=0) throw new RangeError('travelMinutes');
  if (!Number.isFinite(gpsPublicationSeconds) || gpsPublicationSeconds<=0) throw new RangeError('gpsPublicationSeconds');
  if (monitoringIntervalMinutes<=0) throw new RangeError('monitoringIntervalMinutes');
  const base=estimate({
    operatorsOnDuty,hoursOnDuty:travelMinutes/60,
    travelsPerDay:simultaneousTravels,travelMinutes,
    subscribedScreens:connectedScreens,
    dispatchQueriesPerTravel:dispatchSearchesPerTravel,
    dispatchReadsPerQuery:documentsPerDispatchSearch,gpsPublicationSeconds,
  });
  const monitoringChecks=simultaneousTravels*Math.ceil(travelMinutes/monitoringIntervalMinutes);
  const low=Object.freeze({
    reads:base.knownLowerBoundReads+monitoringChecks,
    writes:base.knownLowerBoundWrites,
  });
  const high=Object.freeze({
    reads:low.reads+monitoringChecks*connectedScreens,
    writes:low.writes+monitoringChecks,
  });
  return Object.freeze({
    simultaneousTravels,travelMinutes,operatorsOnDuty,connectedScreens,
    base,monitoringChecks,low,high,
    costUsd:Object.freeze({
      low:dollarCost(low.reads,low.writes,rates),
      high:dollarCost(high.reads,high.writes,rates),
      highPerTravel:simultaneousTravels ? dollarCost(high.reads,high.writes,rates)/simultaneousTravels : 0,
    }),
    included:'GPS, duty renewal, chosen candidate reads, one monitor read per interval, optional monitor checkpoint and connected listeners',
    excluded:'Index entry reads, extra client listeners, reconnects, Security Rules, failed retries, storage, Firebase egress, maps, Stripe, Render, support, compliance, insurance and actual capacity',
    certification:'UNMEASURED illustration only; not a production capacity or complete operating-cost estimate',
  });
}
/**
 * Existing economics already budget a per-Travel operating allowance.
 * Compare illustrative database + allocated hosting + explicitly-entered
 * other variable costs against that allowance WITHOUT changing the live fee.
 * This never establishes that the business is profitable: unpriced legal,
 * insurance, maps, customer care, refunds and unexpected traffic remain.
 */
function operatingAllowanceCheck({
  scenarioResult, monthlyCompletedTravels, monthlyHostingUsd=0,
  otherOperatingUsdPerTravel=0, travelFareCents=1750,
  platformFeeCents=250, cardCountry='US',
}) {
  if (!scenarioResult || !Number.isFinite(scenarioResult.costUsd?.highPerTravel))
    throw new TypeError('scenarioResult required');
  wholeNonnegative('monthlyCompletedTravels',monthlyCompletedTravels);
  if (monthlyCompletedTravels===0) throw new RangeError('monthlyCompletedTravels cannot be zero');
  for(const [name,value] of Object.entries({monthlyHostingUsd,otherOperatingUsdPerTravel})) {
    if(!Number.isFinite(value)||value<0)throw new RangeError(name);
  }
  const economics=economicsFor({
    travelCostCents:travelFareCents,platformFeeCents,cardCountry,
  });
  const infrastructureUsdPerTravel=scenarioResult.costUsd.highPerTravel+
    monthlyHostingUsd/monthlyCompletedTravels+otherOperatingUsdPerTravel;
  return Object.freeze({
    economics,
    infrastructureUsdPerTravel,
    operatingAllowanceUsd:economics.operatingOverheadCents/100,
    uncommittedAllowanceUsd:economics.operatingOverheadCents/100-infrastructureUsdPerTravel,
    feeIncreaseJustified:'not established by these estimates',
    caveat:'Do not raise prices or certify profit from this modeled comparison. Replace inputs with actual bills, then price every remaining cost.',
  });
}
module.exports={STANDARD_US_CENTRAL,DOUBLE_RATE_SENSITIVITY,dollarCost,scenario,operatingAllowanceCheck};