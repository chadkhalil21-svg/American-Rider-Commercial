'use strict';
// Durable, provider-event-driven record of bank payouts. Not a pricing claim
// and NEVER a collection instruction. Uses one document per payout, plus a
// per-Operator monthly summary, instead of scanning everyone every six hours.
const { createHash } = require('node:crypto');
const { FEE_CONSENT_VERSION, currentConnectFeeConsent } = require('./connect-fee-consent');
const MAX_PAGE = 80;
const MAX_PAGES = 2;
function decodePayoutEvent(event) {
  if (!['payout.paid','payout.failed'].includes(event?.type)) throw Error('unsupported payout event');
  const payout=event.data?.object || {};
  const accountId=String(event.account || '');
  if (!/^acct_[A-Za-z0-9]+$/.test(accountId)) throw Error('missing connected Stripe account');
  if (!/^po_[A-Za-z0-9]+$/.test(String(payout.id||''))) throw Error('missing payout id');
  if (!Number.isSafeInteger(payout.amount) || payout.amount<0 || payout.currency!=='usd')
    throw Error('invalid USD payout');
  if (payout.method !== undefined && !['standard','instant'].includes(payout.method))
    throw Error('unknown payout method');
  const eventAt=Number(event.created)*1000;
  const payoutCreatedAt=Number(payout.created)*1000;
  if (!Number.isSafeInteger(eventAt) || eventAt<=0 ||
      !Number.isSafeInteger(payoutCreatedAt)||payoutCreatedAt<=0) throw Error('missing Stripe payout timestamps');
  const status=event.type==='payout.paid' ? 'paid' : 'failed';
  if (payout.status && payout.status!==status) throw Error('provider event and payout status disagree');
  return {payoutId:String(payout.id),accountId,status,amountCents:payout.amount,
    method:payout.method||'unknown',eventAt,payoutCreatedAt,month:new Date(payoutCreatedAt).toISOString().slice(0,7),
    eventId:String(event.id||'')};
}
function documentIdFor({accountId,payoutId}) {
  return createHash('sha256').update(accountId+':'+payoutId).digest('hex');
}
async function recordOperatorPayoutEvent({db,event}) {
  if (!db || typeof db.runTransaction!=='function') throw Error('database required');
  const p=decodePayoutEvent(event);
  const payoutRef=db.collection('operator_connect_payouts').doc(documentIdFor(p));
  const pre=await payoutRef.get();
  if (pre.exists) {
    const v=pre.data()||{};
    if (v.accountId!==p.accountId || v.payoutId!==p.payoutId) throw Error('provider payout identity conflict');
    if (v.eventAt>p.eventAt) return {ok:true,stale:true};
    if (v.eventAt===p.eventAt && v.status===p.status) return {ok:true,duplicate:true};
    if (v.eventAt===p.eventAt && v.status!==p.status) throw Error('ambiguous same-time payout state');
  }
  const users=await db.collection('users').where('stripeAccountId','==',p.accountId).limit(2).get();
  if (users.docs.length>1) throw Error('Stripe account bound to multiple Operators');
  if (!users.docs.length) return {ok:true,ignored:true,reason:'not_our_operator'};
  const user=users.docs[0],uid=user.id;
  const monthRef=db.collection('operator_months').doc(p.month).collection('accounts').doc(uid);
  return db.runTransaction(async tx=>{
    const [oldSnap,monthSnap]=await Promise.all([tx.get(payoutRef),tx.get(monthRef)]);
    const prior=oldSnap.exists ? oldSnap.data()||{} : null;
    const summary=monthSnap.exists ? monthSnap.data()||{} : {};
    if (prior && (prior.accountId!==p.accountId || prior.payoutId!==p.payoutId ||
         prior.uid!==uid || prior.month!==p.month || prior.amountCents!==p.amountCents ||
         prior.method!==p.method)) throw Error('Stripe payout identity changed');
    if (prior?.eventAt > p.eventAt) return {ok:true,stale:true};
    if (prior?.eventAt===p.eventAt && prior.status===p.status) return {ok:true,duplicate:true};
    if (prior?.eventAt===p.eventAt && prior.status!==p.status) throw Error('ambiguous payout transition');
    // No blind migration of legacy account summaries. A missing count may
    // represent bank payouts not yet entered into this per-payout ledger.
    if (summary.payoutSeen && !Number.isSafeInteger(summary.verifiedPayoutCount))
      throw Error('legacy payout month requires one-time historical backfill');
    const delta=(p.status==='paid'?1:0)-(prior?.status==='paid'?1:0);
    const next=(summary.verifiedPayoutCount||0)+delta;
    if (next<0) throw Error('negative payout count');
    const consent=user.data()?.stripeFeeConsent;
    const permitted=currentConnectFeeConsent(consent,p.eventAt) && consent.acceptedAt<=p.eventAt;
    // This is ACTIVITY, not a fee invoice. No fee can be collectible until
    // the actual Connect pricing owner and bill are verified separately.
    tx.set(payoutRef,{...p,uid,feePricingVerified:false,
      feeCollectionAuthorized:false,consentAtPayout:permitted}, {merge:true});
    tx.set(monthRef,{uid,month:p.month,verifiedPayoutCount:next,payoutSeen:next>0,
      payoutActivityUpdatedAt:p.eventAt,
      feeAssessmentState:next>0?'awaiting_provider_fee_evidence':'no_paid_payout',
      ...(p.status==='paid'?{
        firstPayoutAt:Number.isSafeInteger(summary.firstPayoutAt)?
          Math.min(summary.firstPayoutAt,p.eventAt):p.eventAt,
        lastPayoutAt:Math.max(summary.lastPayoutAt||0,p.eventAt)
      }:{})},{merge:true});
    return {ok:true,uid,month:p.month,count:next,activityOnly:true};
  });
}
async function listDueFeeObligations({db,now=Date.now(),pageSize=MAX_PAGE,maxPages=MAX_PAGES}={}) {
  // A bounded, read-only review queue. No background debit and no scans of
  // already-paid accounts. No offset: Firestore bills skipped offset reads.
  if (!db || !Number.isSafeInteger(pageSize)||pageSize<1||pageSize>MAX_PAGE ||
      !Number.isSafeInteger(maxPages)||maxPages<1||maxPages>MAX_PAGES) throw Error('invalid queue options');
  let cursor=null,seen=0,pages=0,due=[];
  for (;pages<maxPages;pages++) {
    let q=db.collection('operator_connect_fee_obligations')
      .where('status','==','due').where('nextReviewAt','<=',now)
      .orderBy('nextReviewAt').limit(pageSize);
    if (cursor) q=q.startAfter(cursor);
    const snap=await q.get();
    for (const d of snap.docs) {
      seen++;
      // Financial action deliberately not implemented until verified exact fees.
      due.push({id:d.id,amountCents:d.data()?.amountCents||null,
        providerEvidenceVerified:d.data()?.providerEvidenceVerified===true});
    }
    if (snap.docs.length<pageSize) break;
    cursor=snap.docs[snap.docs.length-1];
  }
  return {ok:true,scanned:seen,pages:Math.min(maxPages,pages+1),
    morePossible:!!cursor && pages===maxPages,
    due,collectionEnabled:false,providerInvoicesVerified:false};
}
module.exports={decodePayoutEvent,documentIdFor,recordOperatorPayoutEvent,listDueFeeObligations,MAX_PAGE,MAX_PAGES};
