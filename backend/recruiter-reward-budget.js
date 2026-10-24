'use strict';
// Immutable booking-time funding snapshot. No Firestore reads, quote changes,
// subscriptions or external calls. Never create a financial promise on a fee
// that cannot cover both invited roles while preserving the platform margin.
const {economicsFor}=require('./economics');
const {PROGRAM}=require('./referral-accrual');
const MAX_TWO_ROLES_CENTS=30;
const BANK_PAYOUT_ALLOWANCE_CENTS=2; // amortized platform cost for two $0.15 rewards
const valid=n=>Number.isSafeInteger(n)&&n>=0;
function fundedRecruiterSnapshot(priced,{enabled=false}={}){
  if(enabled!==true)return {};
  const fare=priced?.travelCostCents,total=priced?.travelerPays;
  const government=priced?.governmentFeeCents??0,toll=priced?.tollCents??0;
  if(!valid(fare)||fare===0||!valid(total)||!valid(government)||!valid(toll)||
     total<fare+government+toll)return {referralAvailableCents:0,referralProgramVersion:PROGRAM.version};
  const fee=total-fare-government-toll;
  try{
    // Unknown issuer is international-costed, never assumed to be cheaper.
    const e=economicsFor({travelCostCents:fare,platformFeeCents:fee,
      governmentFeeCents:government,tollCents:toll,
      cardCountry:priced?.cardCountry??null,
      transactionCount:1,referralReserveCents:MAX_TWO_ROLES_CENTS});
    const funded=e.platformContributionCents>=
      e.requiredContributionCents+BANK_PAYOUT_ALLOWANCE_CENTS;
    return {referralAvailableCents:funded?MAX_TWO_ROLES_CENTS:0,
      referralProgramVersion:PROGRAM.version};
  }catch{return {referralAvailableCents:0,referralProgramVersion:PROGRAM.version};}
}
module.exports={fundedRecruiterSnapshot};
