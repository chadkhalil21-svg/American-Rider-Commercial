const { randomUUID } = require('crypto');
const { cancellationProgress } = require('./pickup-progress-fee');
const {STANDARD_CANCELLATION_GROSS_CENTS,OPERATOR_NET_CENTS}=require('./fee-economics');
const {noShowEligibility,FEE_CENTS:NO_SHOW_NET_CENTS}=require('./noshow');

// Money on a travel: paying for it, cancelling it, settling it — each decided from the travel
// RECORD, never from what a client names.
//
// WHY THIS FILE EXISTS (independent audit of e26adcb, 22 Sept 2026). Three routes let the
// request choose the authoritative object:
//   /travel/cancel         refunded req.body.paymentIntentId. A traveler owning travels A and B
//                          could cancel A and refund B's payment — refundableFor proved the
//                          payment was theirs, not that it was A's.
//   /create-payment-intent wrote paymentIntentId, paidAt and fees onto req.body.rideId with
//                          admin rights, after creating the charge — onto any traveler's ride,
//                          or onto a ride id that did not exist (set with merge creates one).
//                          Stripe's tripNo came from the body too.
//   /travel/settle         paid out of req.body.paymentIntentId ahead of the travel's own, and
//                          whatever the travel's status — an assigned or cancelled travel could
//                          be settled to its operator.
// The handlers' logic lives here with Firestore and Stripe passed in, so the tests exercise the
// real decisions (travelmoney.test.js).

/** The statuses in which a travel may be paid for: it exists, is this traveler's, and is live. */
const PAYABLE = ['awaiting_payment', 'assigned', 'accepted', 'arrived', 'onboard'];

const fail = (status, error, code) => ({ status, body: { error, ...(code ? { code } : {}) } });

/**
 * Prove a ride may carry this traveler's payment, BEFORE any charge is created.
 * Returns { ok: true, ride, rideRef } or a { status, body } refusal.
 */
async function authorizePaymentRide({ db, uid, rideId }) {
  const id = String(rideId || '');
  if (!id) return fail(400, 'rideId is required', 'ride_required');
  const rideRef = db.collection('rides').doc(id);
  const snap = await rideRef.get();
  if (!snap.exists) return fail(404, 'No such travel', 'no_travel');
  const ride = snap.data();
  if (String(ride.travelerUid) !== String(uid)) return fail(403, 'That travel belongs to another traveler', 'not_yours');
  if (!PAYABLE.includes(String(ride.status))) return fail(409, 'That travel can no longer be paid for', 'not_payable');
  if (!Number.isInteger(ride.travelCostCents) || ride.travelCostCents <= 0 ||
      !Number.isInteger(ride.costCents) || ride.costCents <= 0) {
    return fail(409, 'That travel does not have an authoritative fare', 'fare_untrusted');
  }
  return { ok: true, ride, rideRef };
}

/**
 * Create the charge for a travel the caller owns, and record it on that travel.
 *
 * `create` is payments.js createPaymentIntent with the price already bound in; it is called with
 * the travel's OWN Travel Number and id, never the request's. Refused before Stripe is asked
 * anything when the ride is not the caller's, or already has a payment. The record is an update,
 * which fails rather than creating a ride that does not exist.
 *
 * `resume(paymentIntentId)` (optional) returns the body for continuing an EXISTING, still
 * unpaid intent — a retrieve, never a create — or null when it cannot be resumed.
 */
async function payForTravel({ db, uid, rideId, create, resume = null, now = Date.now() }) {
  const auth = await authorizePaymentRide({ db, uid, rideId });
  if (!auth.ok) return auth;
  const { rideRef } = auth;

  // Claim the payment transition transactionally before Stripe is called. This closes the
  // double-request window where two callers could both observe paymentIntentId as empty.
  const claimId = `pay_${randomUUID()}`;
  const PAYMENT_CLAIM_TTL_MS = 2 * 60 * 1000;
  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(rideRef);
    if (!snap.exists) return { error: fail(404, 'No such travel', 'no_travel') };
    const current = snap.data();
    if (String(current.travelerUid) !== String(uid)) return { error: fail(403, 'That travel belongs to another traveler', 'not_yours') };
    if (!PAYABLE.includes(String(current.status))) return { error: fail(409, 'That travel can no longer be paid for', 'not_payable') };
    if (current.paymentIntentId) return { existing: current };
    const claimAge = now - Number(current.paymentClaimedAt || 0);
    if (current.paymentClaim && claimAge >= 0 && claimAge < PAYMENT_CLAIM_TTL_MS) return { busy: true };
    // A dead process must not strand the Travel forever. After the short lease expires a retry
    // may take the claim; Stripe's Travel+amount idempotency key recovers the already-created
    // intent if the old process died after Stripe accepted it.
    tx.update(rideRef, { paymentClaim: claimId, paymentClaimedAt: now });
    return { ride: current };
  });
  if (claimed.error) return claimed.error;
  if (claimed.existing) {
    if (resume) {
      const again = await resume(claimed.existing.paymentIntentId, claimed.existing);
      if (again) return { status: 200, body: again };
    }
    return fail(409, 'This travel already has a payment', 'already_paid');
  }
  if (claimed.busy) return fail(409, 'Payment is already being prepared for this travel', 'payment_in_progress');

  const ride = claimed.ride;
  try {
    const result = await create({ tripNo: ride.tripNo || null, rideId: String(rideId), ride });
    // Commit only if our claim still owns the transition. Stripe is also Travel-idempotent,
    // so a process retry cannot create a second intent for the same Travel/amount.
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(rideRef);
      if (!snap.exists) throw new Error('Travel disappeared while payment was being prepared');
      const current = snap.data();
      if (current.paymentIntentId && current.paymentIntentId !== result.paymentIntentId) throw new Error('Travel already carries a different payment');
      if (current.paymentClaim !== claimId && !current.paymentIntentId) throw new Error('Payment claim was lost');
      tx.update(rideRef, {
        paymentIntentId: result.paymentIntentId,
        paymentIntentCreatedAt: now,
        paymentCapturePolicy:result.capturePolicy||'captured_legacy',
        governmentFeeCents: result.breakdown?.governmentFeeCents ?? 0,
        feeLines: result.breakdown?.feeLines ?? [],
        paymentClaim: null,
        paymentClaimedAt: null,
      });
    });
    return { status: 200, body: result };
  } catch (e) {
    // Release our claim. Stripe idempotency makes a subsequent retry recover the same intent
    // when Stripe created it before this process failed.
    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(rideRef);
        if (snap.exists && snap.data().paymentClaim === claimId && !snap.data().paymentIntentId) {
          tx.update(rideRef, { paymentClaim: null, paymentClaimedAt: null, paymentError: String(e.message || e) });
        }
      });
    } catch { /* the next request remains safely blocked rather than risking a second charge */ }
    throw e;
  }
}

/**
 * Cancel a travel and refund it — from the travel's OWN payment, whatever the request says.
 *
 * deps: { refundableFor, refundTravel, transferFixed, operatorPayoutAccount }
 */
async function cancelTravel({ db, uid, rideId, deps, stripeConfigured = true, now = Date.now(),
  enableVerifiedProgressFee = false, enableManualCancellationFee = false, operatorNoShowUid = null }) {
  const id = String(rideId || '');
  if (!id) return fail(400, 'rideId is required');
  const rideRef = db.collection('rides').doc(id);
  const snap = await rideRef.get();
  if (!snap.exists) return fail(404, 'No such travel');
  const ride = snap.data();
  const noShowOperator=operatorNoShowUid?String(operatorNoShowUid):null;
  if(noShowOperator&&String(uid)!==noShowOperator)
    return fail(403,'No-show is only authorized for the requesting Operator','wrong_operator');
  if(String(noShowOperator?ride.operatorId:ride.travelerUid)!==String(uid))
    return fail(403,'Caller does not own this Travel','not_yours');
  // Already refunded — say so rather than refunding twice.
  if (ride.refundId) {
    return { status: 200, body: { ok: true, alreadyRefunded: true, refundId: ride.refundId, amountCents: ride.refundedCents || 0 } };
  }
  // Settled travels are finished journeys; cancelling one is a support matter, not this route.
  if (ride.transferId) return fail(409, 'That travel has already been completed and paid out', 'already_settled');

  // A legacy captured-fare cancellation retains a fee ONLY when the server
  // verified it under the commissioned policy and froze that decision at closure.
  // Arrival alone is not proof or permission to charge a fee.
  // Onboard or completed: refused, and directed to Patron Support.
  if (ride.status === 'onboard' || ride.status === 'completed') {
    return fail(409, 'This travel is already underway and cannot be cancelled. Patron Support can settle anything that went wrong with it.', 'travel_underway');
  }

  // Close and release the one-Operator reservation together. A concurrent completion or
  // payment claim cannot be raced by an out-of-date read above.
  const closed = await db.runTransaction(async (tx) => {
    const currentSnap = await tx.get(rideRef);
    if (!currentSnap.exists) return fail(404, 'No such travel');
    const current = currentSnap.data();
    if(String(noShowOperator?current.operatorId:current.travelerUid)!==String(uid))
      return fail(403,'Caller does not own this Travel','not_yours');
    if (current.paymentClaim) return fail(409, 'Payment is still being prepared; retry cancellation shortly', 'payment_in_progress');
    if (['onboard', 'completed'].includes(current.status) || current.transferId) {
      return fail(409, 'This travel is underway or settled', 'travel_underway');
    }
    if (current.status === 'cancelled' && current.refundId) {
      return { status: 200, body: { ok: true, alreadyRefunded: true, refundId: current.refundId } };
    }
    const opRef = current.operatorId ? db.collection('operators').doc(String(current.operatorId)) : null;
    let op = null;
    if (opRef) {
      const opSnap = await tx.get(opRef);
      op = opSnap.exists ? opSnap.data() : null;
    }
    // A no-show can NEVER be declared by merely tapping. The server requires
    // assigned Operator, five minutes, real contact, fresh GPS and not onboard.
    const previousNoShow=noShowOperator&&current.status==='cancelled'&&
      current.noShowBy===noShowOperator&&Number.isSafeInteger(current.noShowAt);
    if(noShowOperator&&!previousNoShow){
      const verified=noShowEligibility({ride:current,operator:op,rideId:id,uid:noShowOperator,now});
      if(!verified.ok)return fail(verified.status,'No-show requirements not established',verified.code);
    }
    if(opRef&&op&&String(op.currentRideId||'')===id)
      tx.update(opRef,{currentRideId:null,reservedAt:null});
    // Evaluate with exactly the Operator snapshot ALREADY fetched to release
    // this reservation. No secondary query, route-service request or GPS writes.
    // OFF by default: final consumer fee terms and Stripe reconciliation must pass
    // review before live charging is enabled.
    // A Stripe outage can leave an already-cancelled Travel pending its refund.
    // Freeze the original fee/evidence once, so a retry cannot reprice the refund
    // based on a newer GPS position or a now-released Operator reservation.
    const priorDecision = current.status === 'cancelled' &&
      Number.isSafeInteger(current.cancellationFeeCents) &&
      current.cancellationFeeCents>=0 && current.cancellationFeeCents<=300
      ? {feeCents:current.cancellationFeeCents,
        reason:String(current.cancellationFeeReason||'previously_recorded'),
        evidence:current.cancellationFeeEvidence||undefined} : null;
    const feeDecision=noShowOperator
      ? {feeCents:NO_SHOW_NET_CENTS,reason:'verified_five_minute_no_show'}
      : enableVerifiedProgressFee
        ? (priorDecision || cancellationProgress({ride:current,operator:op,rideId:id,now})) : null;
    // Fee paid from a manual hold is not today's legacy $3 refund withholding.
    // The new $4 all-in service fee is possible only after BOTH verified evidence
    // and a genuine, upfront Traveler disclosure were already stored.
    // Once closed, retry the ORIGINAL frozen fee. Never re-price after the
    // Operator slot has been released, GPS has aged, or a later flag changes.
    // A pre-captured legacy Travel never gets the newer manual $4 fee.
    // Freeze its independently verified $3/zero outcome atomically with
    // cancellation, so recovery cannot invent a fee after flags, GPS, or
    // Operator availability change. Old cancelled records without an original
    // fee decision fail closed at zero, never retroactively charge.
    const legacyFeeCents=current.paymentCapturePolicy==='manual_v1' ? 0
      : current.status==='cancelled'
        ? (priorDecision?.feeCents ?? 0)
        : enableVerifiedProgressFee
          ? (feeDecision?.feeCents ?? 0)
          : 0;
    const legacyFeeReason=priorDecision?.reason ||
      (current.status==='cancelled'?'unverified_legacy_cancellation'
        : enableVerifiedProgressFee?(feeDecision?.reason||'fee_unverified')
          :'fee_not_commissioned');
    const grossManual=current.status==='cancelled' &&
      Number.isSafeInteger(current.cancellationFeeCaptureCents)
      ? current.cancellationFeeCaptureCents
      : current.paymentCapturePolicy==='manual_v1' &&
        enableManualCancellationFee===true &&
        current.cancellationFeeDisclosureVersion==='net3-allin400-v1' &&
        feeDecision?.feeCents===300
          ? STANDARD_CANCELLATION_GROSS_CENTS : 0;
    tx.update(rideRef, { status: 'cancelled', statusAt: now,
      ...(noShowOperator?{noShowBy:noShowOperator,noShowAt:current.noShowAt||now,
        cancellationFeeCents:NO_SHOW_NET_CENTS,
        cancellationFeeReason:'verified_five_minute_no_show',
        cancellationReason:'traveler_no_show'}:{}),
      ...(current.paymentCapturePolicy==='manual_v1'
        ? {cancellationFeeCaptureCents:grossManual}:{}),
      cancelledFrom: current.cancelledFrom || current.status,
      refundPending: !!current.paymentIntentId,
      ...(current.paymentCapturePolicy!=='manual_v1' ? {
        cancellationFeeCents:legacyFeeCents,
        cancellationFeeReason:legacyFeeReason,
        ...(feeDecision?.evidence ? {cancellationFeeEvidence:feeDecision.evidence} : {}),
      } : !noShowOperator&&enableVerifiedProgressFee ? {
        cancellationFeeCents:feeDecision.feeCents,
        cancellationFeeReason:feeDecision.reason,
        cancellationFeeEvidence:feeDecision.evidence||null,
      } : {}),
    });
    return { current, feeDecision, grossManual, legacyFeeCents };
  });
  if (closed.status) return closed;
  const currentRide = closed.current;
  // Frozen when the Travel first closes. Feature flags must never
  // retroactively change a promised refund or invent an arrival fee.
  const arrivalFee = currentRide.paymentCapturePolicy==='manual_v1'
    ? 0 : closed.legacyFeeCents;

  // THE PAYMENT IS THE TRAVEL'S OWN. Never the request's: see the header.
  const paymentIntentId = String(currentRide.paymentIntentId || '');
  if (!paymentIntentId) return { status: 200, body: { ok: true, refunded: false, reason: 'no payment was taken' } };
  // The transaction above has ALREADY cancelled the Travel and retained refundPending.
  // Provider outages and absent Stripe configuration cannot reverse that outcome.
  const pendingRefund = async (cause) => {
    try { await rideRef.set({ refundPending: true, refundBlockedReason: String(cause || 'Provider reconciliation required').slice(0, 250) }, { merge: true }); }
    catch { /* refundPending was set atomically with cancelled; recovery will retry */ }
    return { status: 202, body: { ok: true, cancelled: true, refundPending: true,
      refunded: false, reason: 'Travel cancelled. Refund pending verification.' } };
  };
  if (!stripeConfigured) return pendingRefund('Stripe payment provider unavailable');

  // The new hold has its OWN fee/void path and must never enter the legacy
  // captured-full-fare refund path. Older paid Travels remain backwards compatible.
  if (currentRide.paymentCapturePolicy==='manual_v1') {
    if(typeof deps.settleUncapturedTravel!=='function')
      return pendingRefund('Manual authorization reconciliation unavailable');
    const gross=Number(closed.grossManual)||0;
    let out;
    try {
      out=await deps.settleUncapturedTravel({
        paymentIntentId,uid:String(currentRide.travelerUid),rideId:id,totalCents:Number(currentRide.costCents),
        action:gross?'fee':'cancel',verifiedFeeCents:gross,now,
      });
    } catch(e) {return pendingRefund(e.message||'Manual authorization unresolved');}
    if(!out?.manual || !out?.ok) return pendingRefund(out?.code||'Manual authorization unconfirmed');
    await rideRef.set({
      refundPending:false,
      // Queue an owed Operator fee BEFORE contacting the payout provider. A crash,
      // missing Stripe account or network timeout must not orphan captured funds.
      // The durable fixed-fee transfer guard clears this after verified success.
      arrivalFeePending:!!gross&&!currentRide.arrivalFeeTransferId,
      authorizationState:out.status==='released'?'released':'captured',
      ...(out.status==='released'
        ? {paymentIntentCancelledAt:now,cancellationFeeCaptureCents:0}
        : {capturedCents:gross,cancellationFeeCaptureCents:gross,
           arrivalFeeCents:OPERATOR_NET_CENTS}),
    },{merge:true});
    let operatorPaymentPending=!!gross&&!currentRide.arrivalFeeTransferId;
    if(gross&&!currentRide.arrivalFeeTransferId) {
      try {
        const {accountId}=await deps.operatorPayoutAccount(db,currentRide.operatorId);
        if(accountId) {
          const paid=await deps.transferFixed({paymentIntentId,
            operatorStripeAccount:accountId,amountCents:OPERATOR_NET_CENTS,
            // A verified Operator may report a no-show, but the Stripe charge
            // always belongs to the Traveler. Bind earned compensation to that payer.
            rideId:id,expectedUid:String(currentRide.travelerUid),
            reference:`verified service cancellation ${currentRide.tripNo||id}`});
          // The guard records new success. On an already-settled retry it
          // returns early; clear a stale pending marker from another caller.
          if(paid.ok) {
            operatorPaymentPending=false;
            if(paid.alreadySettled)
              await rideRef.set({arrivalFeePending:false,
                arrivalFeeBlockedReason:null},{merge:true});
          } else await rideRef.set({arrivalFeePending:true,
            arrivalFeeBlockedReason:paid.code||paid.error||'transfer_failed'},
            {merge:true});
        } else await rideRef.set({
          arrivalFeePending:true,arrivalFeeBlockedReason:'no payout account',
        },{merge:true});
      } catch(e) {
        // The Travel is already cancelled and the $4 capture was verified.
        // Preserve the $3 obligation for the bounded recovery worker.
        await rideRef.set({arrivalFeePending:true,
          arrivalFeeBlockedReason:'compensation_provider_unavailable'},
          {merge:true});
      }
    }
    return {status:200,body:{ok:true,
      authorizationReleased:out.status==='released',capturedCents:gross,
      operatorNetCents:gross?OPERATOR_NET_CENTS:0,
      operatorPaymentPending,refunded:false}};
  }
  let refundable, reason;
  try { ({ cents: refundable, reason } = await deps.refundableFor({ paymentIntentId, expectUid: String(currentRide.travelerUid) })); }
  catch (e) { return pendingRefund(e?.message || e); }
  if (refundable <= 0) {
    let canceled;
    try { canceled = deps.cancelUnpaidIntent
      ? await deps.cancelUnpaidIntent({ paymentIntentId, uid: String(currentRide.travelerUid), rideId: id })
      : { ok: false, reason: reason || 'Payment status requires reconciliation' }; }
    catch (e) { return pendingRefund(e?.message || e); }
    if (canceled.ok) {
      await rideRef.set({ refundPending: false, paymentIntentCancelledAt: now }, { merge: true });
      return { status: 200, body: { ok: true, refunded: false, reason: 'No payment was taken' } };
    }
    return pendingRefund(canceled.reason || reason);
  }

  // The arrival fee is withheld from the refund, never charged separately.
  const withheld = Math.min(arrivalFee, refundable);
  let out;
  try { out = await deps.refundTravel({
    paymentIntentId,
    amountCents: refundable - withheld,
    expectUid: String(currentRide.travelerUid),
    idempotencyKey: `ar_cancel_refund_${id}`,
  }); }
  catch (e) { return pendingRefund(e?.message || e); }
  if (!out.ok) return pendingRefund(out.error);
  await rideRef.set(
    { refundId: out.refundId, refundedCents: out.amountCents, arrivalFeeCents: withheld, refundPending: false, refundedAt: now },
    { merge: true },
  );

  // Pay the arrival fee to the operator who was standing there. Best effort, recorded if owed.
  if (withheld > 0) {
    const { accountId } = await deps.operatorPayoutAccount(db, currentRide.operatorId);
    if (accountId) {
      const paid = await deps.transferFixed({
        paymentIntentId,
        operatorStripeAccount: accountId,
        amountCents: withheld,
        reference: `${enableVerifiedProgressFee ? 'verified cancellation fee' : 'arrival fee'} ${currentRide.tripNo || id}`,
      });
      await rideRef.set(
        paid.ok
          ? { arrivalFeeTransferId: paid.transferId, arrivalFeePaidAt: now }
          : { arrivalFeePending: true, arrivalFeeBlockedReason: paid.error },
        { merge: true },
      );
    } else {
      await rideRef.set({ arrivalFeePending: true, arrivalFeeBlockedReason: 'no payout account' }, { merge: true });
    }
  }
  return { status: 200, body: { ok: true, refunded: true, amountCents: out.amountCents, arrivalFeeCents: withheld, status: out.status } };
}

/**
 * Send the operator their share — only for the caller's own travel, only once it is COMPLETED,
 * and only out of the travel's OWN payment.
 *
 * deps: { operatorPayoutAccount, transferToOperator, sendReceipt(ride) -> { ok, reason } }
 */
async function settleTravel({ db, uid, rideId, deps, now = Date.now() }) {
  const id = String(rideId || '');
  if (!id) return fail(400, 'rideId is required');
  const rideRef = db.collection('rides').doc(id);
  const snap = await rideRef.get();
  if (!snap.exists) return fail(404, 'No such travel');
  const ride = snap.data();
  if (String(ride.travelerUid) !== String(uid)) return fail(403, 'That travel belongs to another traveler');
  if (ride.transferId) return { status: 200, body: { ok: true, alreadySettled: true, transferId: ride.transferId } };
  // SETTLEMENT FOLLOWS COMPLETION. Only the operator's app or the server writes 'completed'
  // (firestore.rules); an assigned, accepted, arrived, onboard or cancelled travel owes nobody
  // its fare yet.
  if (ride.status !== 'completed') return fail(409, 'That travel is not completed', 'not_completed');
  const paymentIntentId = String(ride.paymentIntentId || '');
  if (!paymentIntentId) return fail(400, 'No payment is recorded for this travel', 'no_payment');

  // A legitimately completed manual Travel must CAPTURE before the authorization
  // expires, even if the Operator still needs to finish Connect onboarding.
  // Sending the Operator share remains independently conditional on payout readiness.
  if(ride.paymentCapturePolicy==='manual_v1') {
    if(typeof deps.settleUncapturedTravel!=='function')
      return {status:202,body:{ok:false,pending:true,reason:'capture handler unavailable'}};
    let captured;
    try {captured=await deps.settleUncapturedTravel({
      paymentIntentId,uid:String(uid),rideId:id,totalCents:Number(ride.costCents),
      action:'complete',now,
    });} catch(e) {
      captured={ok:false,code:String(e.message||e)};
    }
    if(!captured?.manual||!captured.ok) {
      await rideRef.set({capturePending:true,captureBlockedReason:captured?.code||'capture_unconfirmed'},
        {merge:true});
      return {status:202,body:{ok:false,pending:true,reason:'capture_reconciliation_pending'}};
    }
    await rideRef.set({capturePending:false,authorizationState:'captured',
      capturedCents:captured.captureCents,capturedAt:now},{merge:true});
  }

  const { accountId, reason } = await deps.operatorPayoutAccount(db, ride.operatorId);
  if (!accountId) {
    await rideRef.set({ payoutPending: true, payoutBlockedReason: reason, payoutCheckedAt: now }, { merge: true });
    return { status: 200, body: { ok: false, code: 'operator_not_payable', owed: true, reason } };
  }

  const out = await deps.transferToOperator({
    paymentIntentId,
    operatorStripeAccount: accountId,
    expectedUid: uid,
    expectedTripNo: ride.tripNo || null,
    rideId: id,
  });
  if (!out.ok) {
    await rideRef.set(
      { payoutPending: true, payoutBlockedReason: out.error || out.code, payoutCheckedAt: now,
        ...(out.unconfirmed ? { needsPayout: false, payoutReconciliationNeeded: true } : {}),
        ...(out.paidWith ? { paidWith: out.paidWith } : {}) },
      { merge: true },
    );
    return { status: out.retryable ? 202 : 502, body: out };
  }
  await rideRef.set(
    {
      transferId: out.transferId,
      needsPayout: false,
      operatorPaidCents: out.amountCents,
      platformTakeCents: out.platformTake,
      payoutPending: false,
      payoutBlockedReason: null,
      settledAt: now,
      ...(out.paidWith ? { paidWith: out.paidWith } : {}),
    },
    { merge: true },
  );
  // The receipt, once.
  if (!ride.receiptSentAt && deps.sendReceipt) {
    const sent = await deps.sendReceipt({ ...ride, completedAt: now });
    await rideRef.set(sent.ok ? { receiptSentAt: now } : { receiptFailed: sent.reason || 'unknown', receiptFailedAt: now }, { merge: true });
  }
  return { status: 200, body: out };
}

module.exports = { PAYABLE, authorizePaymentRide, payForTravel, cancelTravel, settleTravel };
