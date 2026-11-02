'use strict';
// Booking-time referral liability for the two genuinely attributed roles.
// This is an expense of American Rider, not a per-Travel profit test.
// Quote/booking validation still fails closed for malformed monetary inputs.
// Exact funded cash, settled payment, identity, caps and payout safeguards
// remain separate from the obligation to reward a qualifying referral.
const {PROGRAM}=require('./referral-accrual');
const MAX_TWO_ROLES_CENTS=30;
const MIN_PLATFORM_FEE_CENTS=250;
const valid=n=>Number.isSafeInteger(n)&&n>=0;
function fundedRecruiterSnapshot(priced,{enabled=false}={}){
  if(enabled!==true)return {};
  const fare=priced?.travelCostCents,total=priced?.travelerPays;
  const government=priced?.governmentFeeCents??0,toll=priced?.tollCents??0;
  if(!valid(fare)||fare===0||!valid(total)||!valid(government)||!valid(toll)||
     total<fare+government+toll+MIN_PLATFORM_FEE_CENTS)
    return {referralAvailableCents:0,referralProgramVersion:PROGRAM.version};
  // A validated Travel can support both contracted commissions. Low margin
  // is funded from the platform's aggregate referral budget, never a silent
  // forfeiture by an eligible recruiter or a reduction in Operator earnings.
  return {referralAvailableCents:MAX_TWO_ROLES_CENTS,
    referralProgramVersion:PROGRAM.version};
}
module.exports={fundedRecruiterSnapshot};
