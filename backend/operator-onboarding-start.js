'use strict';
// One server-recorded first selection of an ACTIVE Operator service market.
// This is an enrollment-start event, never a claim of screening, insurance,
// payout eligibility, qualification or completed commercial onboarding.
async function recordOperatorMarketSelection({db,uid,market,via,now=Date.now()}) {
  if (!db || !uid || !market?.id || !Number.isSafeInteger(now) || now<=0)
    throw new Error('invalid_operator_market_selection');
  const ref=db.collection('users').doc(String(uid));
  return db.runTransaction(async tx=>{
    const snap=await tx.get(ref);
    const previous=snap.exists ? (snap.data()||{}) : {};
    // Never re-label existing Operators as fresh recruits merely because
    // they revisit the market selector after a reporting deployment.
    const alreadyStarted=Boolean(
      previous.operatorOnboardingStartedAt ||
      previous.operatingMarket?.id ||
      previous.documents ||
      previous.qualification ||
      previous.stripeAccountId ||
      previous.screening ||
      previous.insuranceMonitoring
    );
    const firstActiveSelection=market.status==='active' && !alreadyStarted;
    // A repeated unchanged selection is a read-only transaction. Avoid charging
    // another document write and avoid updating an unnecessary market timestamp.
    // Genuine changes still persist, but never reset first onboarding start.
    if (!firstActiveSelection && previous.operatingMarket?.id===market.id &&
        previous.operatingMarket?.via===via)
      return {firstActiveSelection:false};
    const patch={operatingMarket:{id:market.id,via,at:now}};
    if (firstActiveSelection) patch.operatorOnboardingStartedAt=now;
    tx.set(ref,patch,{merge:true});
    return {firstActiveSelection};
  });
}
module.exports={recordOperatorMarketSelection};
