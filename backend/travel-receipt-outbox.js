'use strict';
// A durable, single-Travel electronic receipt queue. A completed, confirmed
// paid Travel may be receipted independently of Operator Connect payout.
// No customer collection scans; one bounded, indexed dueAt query per sweep.
// Resend idempotency is 24 hours, so Firestore is the authoritative journal.
const { randomUUID } = require('node:crypto');
const COL = 'travel_receipt_outbox';
const LEASE_MS = 90_000;
// A daily sending quota can reset 24 hours after a failure. Do not dead-letter
// legitimate paid receipts in a few hours because today's provider quota ended.
const MAX_ATTEMPTS = 16;
const RETRY_CAP_MS = 24 * 60 * 60_000;
const validId = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id);
const validEmail = email => typeof email === 'string' && email.length <= 254 &&
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
function paidCompletion(ride) {
  if (!ride || ride.status !== 'completed' || !ride.paymentIntentId ||
      !Number.isSafeInteger(ride.costCents) || ride.costCents <= 0 ||
      ride.synthetic === true || ride.operatorDemo === true ||
      ride.refunded === true || ride.refundPending === true) return false;
  if (ride.paymentCapturePolicy === 'manual_v1')
    return ride.authorizationState === 'captured' &&
      Number.isFinite(ride.capturedAt) && ride.capturedAt > 0;
  return Number.isFinite(ride.paidAt) && ride.paidAt > 0;
}
function frozenReceipt(ride) {
  return {
    tripNo: String(ride.tripNo || '').slice(0,128),
    costCents: ride.costCents,
    dep: String(ride.dep || '').slice(0,350),
    dest: String(ride.dest || '').slice(0,350),
    miles: Number.isFinite(ride.miles) ? ride.miles : null,
    onboardAt: Number.isFinite(ride.onboardAt) ? ride.onboardAt : null,
    completedAt: Number.isFinite(ride.completedAt) ? ride.completedAt :
      Number.isFinite(ride.dropoffAt) ? ride.dropoffAt : null,
    createdAt: Number.isFinite(ride.createdAt) ? ride.createdAt : null,
  };
}
async function enqueueTravelReceipt({db,rideId,ride,to,now=Date.now()}={}) {
  if (!db || !validId(rideId) || !Number.isSafeInteger(now) || now <= 0)
    return {ok:false,reason:'invalid_request'};
  if (!paidCompletion(ride)) return {ok:false,reason:'payment_not_confirmed'};
  if (!validEmail(to)) return {ok:false,reason:'no_verified_receipt_address'};
  try {
    return await db.runTransaction(async tx => {
      const ref=db.collection(COL).doc(rideId);
      const old=await tx.get(ref);
      if (old.exists) return {ok:true,duplicate:true,status:old.data().status};
      tx.create(ref,{
        rideId,to,receipt:frozenReceipt(ride),status:'queued',
        attempts:0,nextAttemptAt:now,createdAt:now,
        idempotencyKey:'travel-receipt/'+rideId,
      });
      tx.set(db.collection('rides').doc(rideId),
        {receiptQueuedAt:now,receiptQueuePending:false},{merge:true});
      return {ok:true,status:'queued'};
    });
  } catch {
    return {ok:false,reason:'receipt_queue_unavailable'};
  }
}
function retryDelay(attempt) {
  return Math.min(RETRY_CAP_MS,60_000*Math.pow(2,Math.min(11,Math.max(0,attempt-1))));
}
async function sweepTravelReceipts({db,sendReceipt,now=Date.now(),limit=20}={}) {
  if (!db || typeof sendReceipt !== 'function' || !Number.isSafeInteger(now) ||
      !Number.isInteger(limit) || limit<1 || limit>50)
    return {ok:false,reason:'invalid_request'};
  try {
    const snapshot=await db.collection(COL).where('nextAttemptAt','<=',now)
      .orderBy('nextAttemptAt').limit(limit).get();
    let accepted=0,retried=0,dead=0,considered=0;
    for (const doc of snapshot.docs) {
      considered++;
      const ref=db.collection(COL).doc(doc.id),claimId=randomUUID();
      const claim=await db.runTransaction(async tx => {
        const snap=await tx.get(ref);
        const item=snap.exists?snap.data():null;
        if (!item || !['queued','retry','sending'].includes(item.status) ||
            !Number.isFinite(item.nextAttemptAt) || item.nextAttemptAt>now ||
            !validId(item.rideId) || !validEmail(item.to))return null;
        if (item.attempts>=MAX_ATTEMPTS) {
          tx.update(ref,{status:'dead',nextAttemptAt:null,lastError:'exhausted_retries'});
          return null;
        }
        tx.update(ref,{status:'sending',claimId,attempts:item.attempts+1,
          nextAttemptAt:now+LEASE_MS});
        return {...item,attempts:item.attempts+1,claimId};
      });
      if (!claim) continue;
      let outcome;
      try {outcome=await sendReceipt({
        to:claim.to,rideId:claim.rideId,
        receipt:claim.receipt,idempotencyKey:claim.idempotencyKey,
      });}
      catch {outcome={ok:false,reason:'provider_unavailable'};}
      await db.runTransaction(async tx => {
        const fresh=await tx.get(ref);
        const row=fresh.exists?fresh.data():null;
        if (!row || row.claimId!==claimId || row.status!=='sending') return;
        if (outcome?.ok===true) {
          tx.update(ref,{status:'accepted',nextAttemptAt:null,claimId:null,
            providerAcceptedAt:now,providerMessageId:String(outcome.id||'').slice(0,150),
            lastError:null});
          tx.set(db.collection('rides').doc(claim.rideId),
            {receiptSentAt:now,receiptQueuePending:false,receiptFailed:null},{merge:true});
          accepted++;
        } else {
          const lastError=String(outcome?.reason||'email_provider_unavailable').slice(0,150);
          // A provider daily/monthly send quota is a capacity limit, not an
          // undeliverable Traveler. Preserve the receipt across quota reset
          // and alert Operations rather than exhausting retries in one day.
          const quotaHold=/(?:daily|monthly).*(?:quota|limit)|(?:quota|limit).*(?:daily|monthly)/i.test(lastError);
          const terminal=!quotaHold&&claim.attempts>=MAX_ATTEMPTS;
          tx.update(ref,{status:terminal?'dead':'retry',claimId:null,
            attempts:quotaHold?Math.min(MAX_ATTEMPTS-1,claim.attempts):claim.attempts,
            nextAttemptAt:terminal?null:now+(quotaHold?24*60*60_000:retryDelay(claim.attempts)),
            lastError,lastFailedAt:now});
          tx.set(db.collection('rides').doc(claim.rideId),
            {receiptFailed:lastError,receiptQueuePending:!terminal},{merge:true});
          if(terminal)dead++;else retried++;
        }
      });
    }
    return {ok:true,considered,accepted,retried,dead};
  } catch {
    return {ok:false,reason:'receipt_queue_sweep_unavailable'};
  }
}
module.exports={COL,MAX_ATTEMPTS,paidCompletion,enqueueTravelReceipt,sweepTravelReceipts,retryDelay};
