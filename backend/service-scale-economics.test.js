'use strict';
const assert=require('node:assert/strict');
const {simulate,standardScenarios,CONFIG}=require('./service-scale-economics');
const s=standardScenarios();
assert.deepEqual(s.map(x=>x.travelsPerDay),[5,10,50,100,1000,10000,50000,100000]);
for (const row of s){
 assert.equal(row.monthlyTravels,row.travelsPerDay*30);
 assert.equal(row.actualCompanyNetProfitUsd,null,'cannot certify actual profit');
 assert.equal(row.hereCostUsd,null,'HERE must not silently become free at large scale');
 assert.equal(row.routingHostingUsd,null,'no unverified OSRM/OTP fixed server');
 assert.equal(row.legalInsuranceAndScreeningUsd,null,'no invented insurance or counsel cost');
 assert.equal(row.peakEmailsDaily,Math.ceil(row.travelsPerDay*CONFIG.customEmailsPerTravel));
 assert.equal(row.customEmailsMonthly,Math.ceil(row.monthlyTravels*CONFIG.customEmailsPerTravel));
 assert.equal(row.dailyOnDutyOperators,Math.ceil(row.travelsPerDay*CONFIG.operatorsPerDailyTravel));
 assert(row.estimatedNamedRuntimeUsd!==null,'SES alternative has a modeled pay-per-send cost');
 assert(row.estimatedMonthlyCardProcessingUsd>0);
 assert(row.estimatedGrossPlatformRevenueUsd>row.transactionContributionBeforeRuntimeUsd);
 assert(row.estimatedPeakRequestsPerSecond>=row.avgServerRequestsPerSecond);
}
const noLaunch=simulate(0);
assert.equal(noLaunch.legacyRenderUsd,7);
assert.equal(noLaunch.actualCompanyNetProfitUsd,null);
assert.equal(simulate(50,{emailsProvider:'resend_free_current'}).emailCanMeetModeledVolume,false,
 'two custom emails per paid travel already exceed Resend daily free cap at 50 Travels/day');
assert.equal(simulate(5,{emailsProvider:'resend_free_current'}).emailUsd,0);
assert.equal(simulate(1000,{emailsProvider:'resend_free_current'}).estimatedNamedRuntimeUsd,null,
 'over-quota Resend is NOT a free functioning email delivery service');
const big=simulate(100000);
assert.equal(big.monthlyTravels,3000000);
assert.equal(big.dailyOnDutyOperators,50000);
assert.equal(big.checkinsDaily,16000000);
assert.equal(big.hereAutosuggestCallsToPriceMonthly,18000000);
assert.equal(big.hereTollFallbackCallsToPriceMonthly,300000);
assert(big.estimatedPeakRequestsPerSecond>1500);
assert(big.emailUsd>600 && big.emailUsd<650);
assert(big.firestoreUsd>100 && big.cloudRunUsd>1000);
assert(big.r2Usd>0);
assert(big.estimatedNamedRuntimeUsd>2000);
assert.equal(simulate(100,{emailsProvider:'resend_pro_alternative'}).emailUsd,20);
assert.throws(()=>simulate(-1),/nonnegative integer/);
assert.throws(()=>simulate(10,{unknownOption:1}),/unknown input/);
assert.throws(()=>simulate(10,{presenceSeconds:0}),/positive days/);
assert.throws(()=>simulate(10,{emailsProvider:'made_up'}),/unknown email provider/);
assert.throws(()=>simulate(10,{domesticCardFraction:1.1}),/fractions/);
assert.throws(()=>simulate(10,{operatorHoursDaily:-1}),/nonnegative/);
console.log('PASS 5–100,000 daily Travels: usage metering, duty read amplification, email caps, on-duty counts, explicit provider-unknown costs, no net-profit claims');
