'use strict';
/**
 * Read-only Stripe Connect fee ESTIMATE. Not an invoice and never authorizes
 * debiting an Operator's earnings. Only actual provider fees and signed fee
 * terms may ever be collected. Stripe's published rates are adjustable.
 * https://stripe.com/connect/pricing
 */
const DEFAULTS=Object.freeze({
  monthlyActiveAccountCents:200,
  standardPayoutBps:25,
  standardPayoutFixedCents:25,
  fundsRoutingBps:25,
  instantAdditionalBps:100,
});
function ceilBps(cents,bps){return Math.ceil((cents*bps)/10000)}
function monthOf(timestamp) {
  if(!Number.isSafeInteger(timestamp) || timestamp<=0)throw Error('invalid Stripe payout timestamp');
  return new Date(timestamp).toISOString().slice(0,7);
}
function previewPayoutFees(payouts,{fees=DEFAULTS,pricing='platform_handles'}={}){
  if(pricing!=='platform_handles' && pricing!=='stripe_handles')throw Error('unknown Stripe fee pricing model');
  if(!Array.isArray(payouts))throw Error('payouts must be array');
  if(payouts.length>100000)throw Error('payout simulation batch too large');
  const seen=new Map(),months=new Map();
  for(const payout of payouts){
    if(!payout || !/^po_[A-Za-z0-9]+$/.test(payout.id||''))throw Error('invalid payout id');
    if(!Number.isSafeInteger(payout.amountCents)||payout.amountCents<0)throw Error('invalid payout amount');
    if(payout.currency!=='usd')throw Error('USD only');
    if(!['paid','failed','canceled','pending'].includes(payout.status))throw Error('unknown payout status');
    if(!['standard','instant'].includes(payout.method))throw Error('unknown payout method');
    const fingerprint=[payout.amountCents,payout.currency,payout.method,payout.createdAt].join(':');
    if(seen.has(payout.id)){
      if(seen.get(payout.id)!==fingerprint)throw Error('conflicting duplicate payout');
      continue;
    }
    seen.set(payout.id,fingerprint);
    if(payout.status!=='paid')continue;
    const month=monthOf(payout.createdAt);
    const m=months.get(month)||{month,payouts:0,amountCents:0,
      monthlyActiveAccountCents:0,standardPayoutCents:0,
      fundsRoutingCents:0,instantAdditionalCents:0};
    m.payouts++;m.amountCents+=payout.amountCents;
    if(pricing==='platform_handles'){
      m.monthlyActiveAccountCents=fees.monthlyActiveAccountCents;
      m.standardPayoutCents+=ceilBps(payout.amountCents,fees.standardPayoutBps)+fees.standardPayoutFixedCents;
      m.fundsRoutingCents+=ceilBps(payout.amountCents,fees.fundsRoutingBps);
    }
    // Stripe's Instant fee is not waived under either public pricing model.
    if(payout.method==='instant')m.instantAdditionalCents+=ceilBps(payout.amountCents,fees.instantAdditionalBps);
    months.set(month,m);
  }
  return [...months.values()].sort((a,b)=>a.month.localeCompare(b.month)).map(m=>({
    ...m,estimatedTotalCents:m.monthlyActiveAccountCents+m.standardPayoutCents+
      m.fundsRoutingCents+m.instantAdditionalCents,
    providerInvoiceVerified:false,earningsDebitAuthorized:false
  }));
}
function previewNetEarnings({grossOperatorEarningsCents,authorizedDueCents}){
  if(!Number.isSafeInteger(grossOperatorEarningsCents)||grossOperatorEarningsCents<0||
     !Number.isSafeInteger(authorizedDueCents)||authorizedDueCents<0)throw Error('invalid cents');
  const candidate=Math.min(grossOperatorEarningsCents,authorizedDueCents);
  return {grossOperatorEarningsCents,candidateDeductionCents:candidate,
    hypotheticalNetEarningsCents:grossOperatorEarningsCents-candidate,
    unpaidFutureObligationCents:authorizedDueCents-candidate,
    actualCollectionAuthorized:false};
}
module.exports={DEFAULTS,previewPayoutFees,previewNetEarnings};
