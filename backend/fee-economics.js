'use strict';
// A single standard all-in cancellation SERVICE fee, not a card-usage surcharge.
// Do not enable until real Connect economics, accessibility and published Terms
// have been verified. Operator must receive exactly $3 without fee deductions.
const OPERATOR_NET_CENTS = 300;
const STANDARD_CANCELLATION_GROSS_CENTS = 400;
function feeBreakdown({grossCents=STANDARD_CANCELLATION_GROSS_CENTS,
  processingRate=0.029, processingFixedCents=30,
  connectPayoutRate=0.0025, connectPayoutFixedCents=25}={}) {
  if(!Number.isSafeInteger(grossCents)||grossCents<0||
    ![processingRate,processingFixedCents,connectPayoutRate,connectPayoutFixedCents].every(x=>Number.isFinite(x)&&x>=0))
    return {ok:false,reason:'invalid_economic_assumptions'};
  const processingCents=Math.round(grossCents*processingRate)+Math.round(processingFixedCents);
  // Connect fees here are an illustration. Fees can be per payout, NOT per travel.
  const connectAllocationCents=Math.round(OPERATOR_NET_CENTS*connectPayoutRate)+Math.round(connectPayoutFixedCents);
  const residualCents=grossCents-OPERATOR_NET_CENTS-processingCents-connectAllocationCents;
  return {ok:true,grossCents,operatorNetCents:OPERATOR_NET_CENTS,
    processingCents,connectAllocationCents,residualCents,costCovered:residualCents>=0};
}
function cancellationCapturePlan({authorizedCents,feeEligible,disclosureAccepted=false,
  operatorEligible=false,feeCents=STANDARD_CANCELLATION_GROSS_CENTS}={}) {
  if(!Number.isSafeInteger(authorizedCents)||authorizedCents<=0)
    return {action:'review',reason:'missing_authorization'};
  if(!feeEligible) return {action:'void',captureCents:0,operatorCents:0};
  if(!disclosureAccepted||!operatorEligible)
    return {action:'review',reason:'fee_not_proven'};
  if(feeCents!==STANDARD_CANCELLATION_GROSS_CENTS)
    return {action:'review',reason:'unpublished_or_wrong_fee'};
  if(authorizedCents<feeCents)
    return {action:'review',reason:'authorization_smaller_than_disclosed_fee'};
  return {action:'capture',captureCents:feeCents,operatorCents:OPERATOR_NET_CENTS,
    reason:'disclosed_verified_cancellation'};
}
module.exports={OPERATOR_NET_CENTS,STANDARD_CANCELLATION_GROSS_CENTS,feeBreakdown,cancellationCapturePlan};
