'use strict';
// Transactional, verified-fee offset against the next earned Travel.
// NEVER query, reserve or deduct unless explicitly enabled after provider
// pricing/reporting and signed Operator terms are commissioned in production.
const {planVerifiedConnectOffsets}=require('./connect-fee-offset-plan');
const MAX_CANDIDATES=12;
function enabled(env=process.env){return env.CONNECT_VERIFIED_FEE_RECOVERY==='enabled';}
async function prepareOffset({db,tx,ride,accountId,grossCents,now,env=process.env}) {
  const none={transferCents:grossCents,withheldCents:0,allocations:[],reserve:()=>{}};
  if(!enabled(env))return none;
  if(!ride?.operatorId)throw Error('operator identity missing for fee recovery');
  const userRef=db.collection('users').doc(ride.operatorId);
  const query=db.collection('operator_connect_fee_obligations')
    .where('uid','==',ride.operatorId).where('status','==','due')
    .orderBy('incurredAt').limit(MAX_CANDIDATES);
  // Both data sources are read inside the same Firestore transaction before
  // changing money or obligation state. No monthly full-account scan.
  const [userSnap,feesSnap]=await Promise.all([tx.get(userRef),tx.get(query)]);
  const user=userSnap.exists?userSnap.data()||{}:{};
  if(user.stripeAccountId!==accountId) return none;
  if(!feesSnap || !Array.isArray(feesSnap.docs))throw Error('provider fee query unavailable');
  const rows=feesSnap.docs.map(d=>({id:d.id,...d.data()}));
  const plan=planVerifiedConnectOffsets({grossShareCents:grossCents,
    operatorId:ride.operatorId,accountId,consent:user.stripeFeeConsent,
    obligations:rows,now});
  const refs=new Map(feesSnap.docs.map(d=>[d.id,d.ref]));
  for(const entry of plan.allocations) if(!refs.has(entry.obligationId))
    throw Error('fee allocation source missing');
  return {...plan,reserve:()=>{
    for(const entry of plan.allocations) tx.set(refs.get(entry.obligationId),{
      status:'reserved',reservedRideId:ride.id,reservedCents:entry.recoverCents,
      reservedAt:now
    },{merge:true});
  }};
}
async function finalizeOffset({db,tx,ledger,rideId,transferId,now=Date.now()}) {
  const rows=ledger.feeAllocations||[];
  if(!Array.isArray(rows)||rows.length>MAX_CANDIDATES)throw Error('invalid reserved fee allocations');
  // Firestore transactions require reading every document before writing any.
  const docs=await Promise.all(rows.map(x=>tx.get(
    db.collection('operator_connect_fee_obligations').doc(x.obligationId))));
  const updates=[];
  for(let i=0;i<rows.length;i++){
    const alloc=rows[i],snap=docs[i],d=snap.exists?snap.data()||{}:null;
    if(!d||d.status!=='reserved'||d.reservedRideId!==rideId||
       d.reservedCents!==alloc.recoverCents ||
       (d.providerBalanceTransactionId||null)!==(alloc.providerBalanceTransactionId||null) ||
       (d.providerReportRunId||null)!==(alloc.providerReportRunId||null) ||
       d.uid!==ledger.operatorId || d.accountId!==ledger.accountId ||
       !Number.isSafeInteger(d.recoveredCents) ||
       d.recoveredCents+alloc.recoverCents>d.amountCents)
      throw Error('reserved fee recovery requires reconciliation');
    const recoveredCents=d.recoveredCents+alloc.recoverCents;
    updates.push([snap.ref,{status:recoveredCents===d.amountCents?'collected':'due',
      recoveredCents,reservedRideId:null,reservedCents:null,
      collectedTransferId:transferId,collectedAt:now}]);
  }
  return ()=>{for(const [ref,data] of updates)tx.set(ref,data,{merge:true});};
}
module.exports={enabled,prepareOffset,finalizeOffset,MAX_CANDIDATES};
