'use strict';
/*
 * Synthetic, reproducible scale analysis. NO live invoice, quote, or profitability certificate.
 * Every usage multiplier below is a visible hypothesis; operators, non-booking searches,
 * latency, storage, email delivery, traffic peaking, and provider fee regime require measurement.
 * Current production mail is Resend. SES is a proposed alternate, NOT connected.
 */
const { economicsFor, OPERATING_OVERHEAD_ALLOWANCE_CENTS } = require('./economics');
const RATES=Object.freeze({
  firestoreReadPer100k:0.03,firestoreWritePer100k:0.09,firestoreStoredGibMonth:0.146,
  cloudCpuPerSec:0.000024,cloudGibPerSec:0.0000025,cloudRequestPerMillion:0.40,
  r2StoredGibMonth:0.015,r2ClassAPerMillion:4.50,r2ClassBPerMillion:0.36,
  publicNetworkGiB:0.12,
  sesEmailPerThousand:0.10,
});
const CONFIG=Object.freeze({
 days:30,fareCents:1750,platformFeeCents:250,domesticCardFraction:0.95,
 operatorsPerDailyTravel:0.5,operatorHoursDaily:8,presenceSeconds:90,
 readsPerTravel:100,writesPerTravel:40,readsPerPresence:5,
 otherReadsDaily:2500,otherWritesDaily:500,requestsPerTravel:20,otherRequestsDaily:1000,
 cpuSecondsPerTravel:8,cpuSecondsPerPresence:0.2,otherCpuSecondsDaily:180,
 cpuCount:1,memoryGiB:1,
 // Send invoices and operator notices + a small allowance for new registration/insurance notices.
 // Firebase's built-in verification emails are independent and free within their auth quota.
 customEmailsPerTravel:2.12,
 // Estimated server response payload, not a measured network/Firestore total.
 outgoingKiBPerServerRequest:1,
 // Size of a completed Travel record retained for 90 days, plus operator profiles.
 storedTravelKiB:10,travelRetentionDays:90,operatorProfileKiB:5,
 storedOperatorDocsPerOnDutyOperator:3,storedOperatorDocumentMiB:1,
 r2ClassAOpsPerTravel:0.02,r2ClassBOpsPerTravel:0.10,
 // The $2/month fee is modeled as UNRECOVERED until actual Operator consent AND collection.
 recoveredActiveAccountFraction:0,
 otherFixedMonthlyUsd:0,legacyRenderMonthlyUsd:7,
 emailsProvider:'ses_proposed',
 // HERE prices and request counts are NOT in this model. Report separately as UNKNOWN.
 hereSearchesPerTravel:6,hereTollFallbackFraction:0.1,
 peakToAverageRequests:8,
});
const nonneg=(value,name)=>{
 if(typeof value!=='number'||!Number.isFinite(value)||value<0)throw Error(name+' must be nonnegative finite');
 return value;
};
const round=x=>Math.round((x+Number.EPSILON)*100)/100;
function simulate(travelsPerDay,options={}){
 if(!Number.isInteger(travelsPerDay)||travelsPerDay<0)throw Error('travelsPerDay must be nonnegative integer');
 for(const k of Object.keys(options))if(!(k in CONFIG))throw Error('unknown input '+k);
 const a={...CONFIG,...options};
 for(const [k,v] of Object.entries(a))if(k!=='emailsProvider')nonneg(v,k);
 if(!['ses_proposed','resend_free_current','resend_pro_alternative'].includes(a.emailsProvider))
  throw Error('unknown email provider');
 if(!(a.domesticCardFraction<=1&&a.recoveredActiveAccountFraction<=1))
  throw Error('fractions must be <= 1');
 if(a.presenceSeconds<=0||a.days<=0)throw Error('positive days and presenceSeconds required');
 const monthlyTravels=travelsPerDay*a.days;
 const dailyOnDutyOperators=Math.ceil(travelsPerDay*a.operatorsPerDailyTravel);
 const checkinsDaily=Math.ceil(dailyOnDutyOperators*a.operatorHoursDaily*3600/a.presenceSeconds);
 const readsDaily=travelsPerDay*a.readsPerTravel+a.otherReadsDaily+checkinsDaily*a.readsPerPresence;
 const writesDaily=travelsPerDay*a.writesPerTravel+a.otherWritesDaily+checkinsDaily;
 const firestoreReadsUsd=a.days*Math.max(0,readsDaily-50000)*RATES.firestoreReadPer100k/100000;
 const firestoreWritesUsd=a.days*Math.max(0,writesDaily-20000)*RATES.firestoreWritePer100k/100000;
 const storedFirestoreGiB=(travelsPerDay*a.travelRetentionDays*a.storedTravelKiB+
   dailyOnDutyOperators*a.operatorProfileKiB)/(1024*1024);
 const firestoreStorageUsd=Math.max(0,storedFirestoreGiB-1)*RATES.firestoreStoredGibMonth;
 const runRequestsDaily=travelsPerDay*a.requestsPerTravel+a.otherRequestsDaily+checkinsDaily;
 const runRequestsMonthly=runRequestsDaily*a.days;
 const cpuSecondsMonthly=a.days*(travelsPerDay*a.cpuSecondsPerTravel+
   checkinsDaily*a.cpuSecondsPerPresence+a.otherCpuSecondsDaily)*a.cpuCount;
 const memoryGiBSecondsMonthly=cpuSecondsMonthly*a.memoryGiB/a.cpuCount;
 const cloudRunUsd=Math.max(0,cpuSecondsMonthly-180000)*RATES.cloudCpuPerSec+
   Math.max(0,memoryGiBSecondsMonthly-360000)*RATES.cloudGibPerSec+
   Math.max(0,runRequestsMonthly-2000000)*RATES.cloudRequestPerMillion/1e6;
 // Only the hypothetical Cloud Run service response data, not full network billed activity.
 const outgoingGiB=runRequestsMonthly*a.outgoingKiBPerServerRequest/(1024*1024);
 const cloudRunOutboundUsd=Math.max(0,outgoingGiB-1)*RATES.publicNetworkGiB;
 const r2StoredGiB=dailyOnDutyOperators*a.storedOperatorDocsPerOnDutyOperator*
   a.storedOperatorDocumentMiB/1024;
 const r2ClassA=monthlyTravels*a.r2ClassAOpsPerTravel;
 const r2ClassB=monthlyTravels*a.r2ClassBOpsPerTravel;
 const r2Usd=Math.ceil(Math.max(0,r2StoredGiB-10))*RATES.r2StoredGibMonth+
   Math.ceil(Math.max(0,r2ClassA-1000000)/1e6)*RATES.r2ClassAPerMillion+
   Math.ceil(Math.max(0,r2ClassB-10000000)/1e6)*RATES.r2ClassBPerMillion;
 const customEmailsMonthly=Math.ceil(monthlyTravels*a.customEmailsPerTravel);
 const peakEmailsDaily=Math.ceil(travelsPerDay*a.customEmailsPerTravel);
 const resendFreeExceeded=customEmailsMonthly>3000||peakEmailsDaily>100;
 let emailUsd=null;
 if(a.emailsProvider==='ses_proposed')emailUsd=customEmailsMonthly*RATES.sesEmailPerThousand/1000;
 if(a.emailsProvider==='resend_free_current')emailUsd=resendFreeExceeded?null:0;
 if(a.emailsProvider==='resend_pro_alternative')
   emailUsd=20+Math.ceil(Math.max(0,customEmailsMonthly-50000)/1000)*0.90;
 const domestic=economicsFor({travelCostCents:a.fareCents,platformFeeCents:a.platformFeeCents,cardCountry:'US'});
 const intl=economicsFor({travelCostCents:a.fareCents,platformFeeCents:a.platformFeeCents,cardCountry:'GB'});
 const roomPerTravelCents=(domestic.platformContributionCents+OPERATING_OVERHEAD_ALLOWANCE_CENTS)*a.domesticCardFraction+
   (intl.platformContributionCents+OPERATING_OVERHEAD_ALLOWANCE_CENTS)*(1-a.domesticCardFraction);
 const grossPlatformMonthlyUsd=monthlyTravels*(domestic.platformGrossCents/100);
 const monthlyCardProcessingUsd=monthlyTravels*
   (domestic.cardProcessingCents*a.domesticCardFraction+intl.cardProcessingCents*(1-a.domesticCardFraction))/100;
 const monthlyConnectAccountUsd=dailyOnDutyOperators*2*(1-a.recoveredActiveAccountFraction);
 const estimatedNamedRuntimeUsd=firestoreReadsUsd+firestoreWritesUsd+firestoreStorageUsd+
   cloudRunUsd+cloudRunOutboundUsd+r2Usd+a.legacyRenderMonthlyUsd+a.otherFixedMonthlyUsd+
   (emailUsd??0);
 const marginAfterNamedUsd=monthlyTravels*roomPerTravelCents/100-
   monthlyConnectAccountUsd-estimatedNamedRuntimeUsd;
 return Object.freeze({
  kind:'SYNTHETIC_NOT_ACTUAL_PROFIT',
  travelsPerDay,monthlyTravels,dailyOnDutyOperators,checkinsDaily,
  databaseReadsDaily:readsDaily,databaseWritesDaily:writesDaily,
  cloudRunRequestsMonthly:runRequestsMonthly,
  avgServerRequestsPerSecond:round(runRequestsDaily/86400),
  estimatedPeakRequestsPerSecond:round(runRequestsDaily*a.peakToAverageRequests/86400),
  customEmailsMonthly,peakEmailsDaily,emailsProvider:a.emailsProvider,
  emailCanMeetModeledVolume:a.emailsProvider!=='resend_free_current'||!resendFreeExceeded,
  estimatedMonthlyCardProcessingUsd:round(monthlyCardProcessingUsd),
  estimatedGrossPlatformRevenueUsd:round(grossPlatformMonthlyUsd),
  transactionContributionBeforeRuntimeUsd:round(monthlyTravels*roomPerTravelCents/100),
  estimatedAccountCostIfUnrecoveredUsd:round(monthlyConnectAccountUsd),
  firestoreUsd:round(firestoreReadsUsd+firestoreWritesUsd+firestoreStorageUsd),
  cloudRunUsd:round(cloudRunUsd),
  assumedCloudRunOutboundUsd:round(cloudRunOutboundUsd),
  r2Usd:round(r2Usd),emailUsd:emailUsd===null?null:round(emailUsd),
  legacyRenderUsd:a.legacyRenderMonthlyUsd,
  estimatedNamedRuntimeUsd:emailUsd===null?null:round(estimatedNamedRuntimeUsd),
  residualBeforeUnpricedCostsUsd:emailUsd===null?null:round(marginAfterNamedUsd),
  hereAutosuggestCallsToPriceMonthly:monthlyTravels*a.hereSearchesPerTravel,
  hereTollFallbackCallsToPriceMonthly:Math.ceil(monthlyTravels*a.hereTollFallbackFraction),
  hereCostUsd:null,routingHostingUsd:null,voiceAndSmsUsd:null,
  legalInsuranceAndScreeningUsd:null,customerAcquisitionUsd:null,
  freeMapTileUptimeNotGuaranteed:true,
  actualCompanyNetProfitUsd:null,
 });
}
function standardScenarios(options={}){
 return [5,10,50,100,1000,10000,50000,100000].map(n=>simulate(n,options));
}
module.exports={RATES,CONFIG,simulate,standardScenarios};
