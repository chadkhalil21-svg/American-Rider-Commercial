'use strict';
// Pre-settlement, read-only fee offset planner. Actual fee evidence must come
// from authenticated Stripe data, not a price table or the Operator's device.
// This intentionally NEVER calls Stripe or mutates a payout. The durable
// payout-transfer guard must later reserve/finalize these obligations atomically
// with provider transfer creation, before enabling real deductions.
const {currentConnectFeeConsent}=require('./connect-fee-consent');
const ELIGIBLE_KINDS=new Set(['monthly_active_account','bank_payout','funds_routing','instant_payout']);

function planVerifiedConnectOffsets({grossShareCents,operatorId,accountId,consent,obligations=[],now=Date.now()}) {
  if(!Number.isSafeInteger(grossShareCents)||grossShareCents<=0 ||
     !operatorId || !/^acct_[A-Za-z0-9]+$/.test(String(accountId))||
     !Array.isArray(obligations)||obligations.length>80) throw Error('invalid Connect offset input');
  const empty={grossShareCents,transferCents:grossShareCents,withheldCents:0,
    allocations:[],collectionAuthorizedByThisPlan:false};
  if(!currentConnectFeeConsent(consent,now))return empty;
  let remainingGross=Math.max(0,grossShareCents-1); // Never create a zero-cent transfer.
  const seen=new Set(),allocations=[];
  for(const obligation of [...obligations].sort((a,b)=>
    (a?.incurredAt||0)-(b?.incurredAt||0) || String(a?.id||'').localeCompare(String(b?.id||'')))) {
    if(!obligation || obligation.status!=='due' || obligation.uid!==operatorId ||
       obligation.accountId!==accountId || obligation.currency!=='usd' ||
       !ELIGIBLE_KINDS.has(obligation.kind) ||
       !['stripe_authenticated_balance_transaction','stripe_authenticated_platform_earnings_report'].includes(obligation.source) ||
       !obligation.providerFeeConfirmed || obligation.providerFeePayer!=='application' ||
       !obligation.pricingOwnerConfirmed || obligation.feePaidDirectlyByOperator===true ||
       (obligation.source==='stripe_authenticated_balance_transaction'
         ? !/^txn_[A-Za-z0-9]+$/.test(String(obligation.providerBalanceTransactionId||''))
         : !(obligation.kind==='monthly_active_account' &&
             /^frr_[A-Za-z0-9]+$/.test(String(obligation.providerReportRunId||'')) &&
             /^20\d{2}-(0[1-9]|1[0-2])$/.test(String(obligation.billingMonth||'')) &&
             obligation.providerBalanceTransactionId==null)) ||
       !Number.isSafeInteger(obligation.amountCents) || obligation.amountCents<=0 ||
       !Number.isSafeInteger(obligation.recoveredCents) || obligation.recoveredCents<0 ||
       obligation.recoveredCents>obligation.amountCents ||
       !Number.isSafeInteger(obligation.incurredAt) ||
       obligation.incurredAt<consent.acceptedAt || obligation.incurredAt>now ||
       !obligation.id || remainingGross<=0) continue;
    const sourceKey=(obligation.source==='stripe_authenticated_platform_earnings_report'
      ? obligation.accountId+':'+obligation.billingMonth : obligation.providerBalanceTransactionId)+':'+obligation.kind;
    if(seen.has(sourceKey))continue; // Same provider fee cannot be recovered twice.
    seen.add(sourceKey);
    const due=obligation.amountCents-obligation.recoveredCents;
    const recoverCents=Math.min(due,remainingGross);
    if(recoverCents<=0)continue;
    allocations.push({obligationId:String(obligation.id),
      providerBalanceTransactionId:obligation.providerBalanceTransactionId||null,
      providerReportRunId:obligation.providerReportRunId||null,recoverCents});
    remainingGross-=recoverCents;
  }
  const withheldCents=allocations.reduce((sum,o)=>sum+o.recoverCents,0);
  return {grossShareCents,transferCents:grossShareCents-withheldCents,
    withheldCents,allocations,collectionAuthorizedByThisPlan:false};
}
module.exports={planVerifiedConnectOffsets};
