'use strict';

/**
 * Cross-system Operator payout guard.
 *
 * A Stripe idempotency key alone is NOT a permanent exactly-once guarantee.
 * A Firestore transaction records an attempt before Stripe is contacted. Once
 * an attempt is recorded, ONLY reconciliation can complete it: absence of a
 * transfer is never permission to create a second transfer automatically.
 *
 * Legacy Travels lacking payoutLedgerVersion are NOT silently marked safe.
 * Their source-of-truth Stripe transfers require a separate historical census.
 */
const {fromConfig,fundingForRide}=require('./recruiter-finance-policy');
const VERSION = 1;
const {prepareOffset,finalizeOffset}=require('./verified-connect-fee-transfer');
const uncertain = (code = 'payout_reconciliation_required') => ({
  ok: false, code, retryable: false, unconfirmed: true,
  error: 'Operator transfer requires verified reconciliation before another payment attempt.',
});
const groupFor = (rideId) => 'ar_travel_' + String(rideId || '');

function checkTransfer(transfer, { rideId, paymentIntentId, operatorStripeAccount, chargeId, amountCents, group }) {
  return !!transfer && typeof transfer.id === 'string' &&
    transfer.currency === 'usd' &&
    transfer.transfer_group === group &&
    transfer.destination === operatorStripeAccount &&
    transfer.source_transaction === chargeId &&
    transfer.amount === amountCents &&
    transfer.metadata?.rideId === rideId &&
    transfer.metadata?.paymentIntentId === paymentIntentId &&
    transfer.reversed !== true && Number(transfer.amount_reversed || 0) === 0;
}

async function transferOnce({
  db, rideId, paymentIntentId, expectedUid, operatorStripeAccount, chargeId,
  amountCents, platformTake, paidWith, findTransfers, createTransfer, now = Date.now(),
}) {
  if (!db || typeof db.runTransaction !== 'function' || !/^[a-f0-9]{40}$/.test(String(rideId || '')) ||
    !paymentIntentId || !expectedUid || !operatorStripeAccount || !chargeId ||
    !Number.isSafeInteger(amountCents) || amountCents <= 0 ||
    typeof findTransfers !== 'function' || typeof createTransfer !== 'function')
    return uncertain('payout_authority_missing');

  const ref = db.collection('rides').doc(rideId);
  const ledgerRef = db.collection('payout_ledger').doc(rideId);
  const group = groupFor(rideId);
  let initial;
  try {
    initial = await db.runTransaction(async tx => {
      const rideSnap = await tx.get(ref);
      const ride = rideSnap.exists ? rideSnap.data() || {} : null;
      if (!ride || ride.status !== 'completed' ||
        ride.payoutLedgerVersion !== VERSION ||
        ride.paymentIntentId !== paymentIntentId ||
        ride.travelerUid !== String(expectedUid) || !ride.operatorId)
        return { code: 'legacy_or_invalid_payout' };
      const ledgerSnap = await tx.get(ledgerRef);
      const ledger = ledgerSnap.exists ? ledgerSnap.data() || {} : null;
      if (ledger && (ledger.paymentIntentId !== paymentIntentId ||
        ledger.accountId !== operatorStripeAccount || ledger.chargeId !== chargeId ||
        (ledger.grossAmountCents ?? ledger.amountCents) !== amountCents || ledger.operatorId !== ride.operatorId))
        return { code: 'payout_identity_conflict' };
      if (ride.transferId) {
        if (ledger?.transferId && ledger.transferId !== ride.transferId)
          return { code: 'payout_identity_conflict' };
        return { already: ride.transferId, transferAmountCents: Number(ride.operatorPaidCents) || amountCents,
          feeWithheldCents:Number(ride.operatorFeesWithheldCents)||0 };
      }
      if (ledger) return { newAttempt:false,transferAmountCents:ledger.amountCents,
        feeWithheldCents:ledger.feeWithheldCents||0 };
      const fee=await prepareOffset({db,tx,ride:{...ride,id:rideId},
        accountId:operatorStripeAccount,grossCents:amountCents,now});
      tx.create(ledgerRef, {
        version: VERSION, rideId, operatorId: ride.operatorId, paymentIntentId,
        accountId: operatorStripeAccount, chargeId,
        grossAmountCents:amountCents,amountCents:fee.transferCents,
        feeWithheldCents:fee.withheldCents,feeAllocations:fee.allocations,group,
        state: 'unconfirmed', startedAt: now,
      });
      fee.reserve();
      return {newAttempt:true,transferAmountCents:fee.transferCents,
        feeWithheldCents:fee.withheldCents};
    });
  } catch {
    return uncertain('payout_ledger_unavailable');
  }

  if (initial.code) return uncertain(initial.code);
  if (initial.already) return {
    ok: true, alreadySettled: true, transferId: initial.already,
    amountCents: initial.transferAmountCents, operatorGets: amountCents,
    feeWithheldCents: initial.feeWithheldCents,
    platformTake, paidWith,
  };

  const transferAmountCents=initial.transferAmountCents;
  if(!Number.isSafeInteger(transferAmountCents)||transferAmountCents<=0||
     transferAmountCents>amountCents)return uncertain('verified_fee_transfer_amount_invalid');

  // Read-only Stripe verification MUST happen before a new payout, too.
  // A timeout or ambiguous transfer identity must never authorize money.
  let existing;
  try {
    const found = await findTransfers(group);
    if (!found || !Array.isArray(found.data) || found.has_more ||
      found.data.length > 1) return uncertain('payout_provider_ambiguous');
    existing = found.data[0] || null;
  } catch {
    return uncertain('payout_provider_unavailable');
  }
  if (existing && !checkTransfer(existing, {
    rideId, paymentIntentId, operatorStripeAccount, chargeId, amountCents:transferAmountCents, group,
  })) return uncertain('payout_provider_mismatch');

  // If a previous attempt was initiated, the only safe automatic action is
  // verifying an existing Stripe transfer, never creating another one.
  if (!existing && !initial.newAttempt) return uncertain('payout_attempt_unconfirmed');

  let transfer = existing;
  if (!transfer) {
    try {
      transfer = await createTransfer(group,transferAmountCents);
    } catch {
      // Stripe may have completed the transfer before the request timed out.
      return uncertain('payout_creation_unconfirmed');
    }
    if (!checkTransfer(transfer, {
      rideId, paymentIntentId, operatorStripeAccount, chargeId, amountCents:transferAmountCents, group,
    })) return uncertain('payout_created_identity_unconfirmed');
  }

  try {
    const done = await db.runTransaction(async tx => {
      const [rideSnap, ledgerSnap] = await Promise.all([tx.get(ref), tx.get(ledgerRef)]);
      if (!rideSnap.exists || !ledgerSnap.exists) return false;
      const ride = rideSnap.data() || {}, ledger = ledgerSnap.data() || {};
      if (ride.status !== 'completed' || ride.paymentIntentId !== paymentIntentId ||
        ride.operatorId !== ledger.operatorId ||
        ledger.accountId !== operatorStripeAccount || ledger.chargeId !== chargeId ||
        ledger.amountCents !== transferAmountCents ||
        (ledger.grossAmountCents??ledger.amountCents)!==amountCents ||
        (ride.transferId && ride.transferId !== transfer.id) ||
        (ledger.transferId && ledger.transferId !== transfer.id)) return false;
      // Inspect all claimed provider-fee records before writing either the
      // operator's settled transfer or the recovered fee. Any inconsistency
      // leaves the payout unconfirmed for safe reconciliation.
      const finalizeFees=await finalizeOffset({db,tx,ledger,rideId,transferId:transfer.id});
      // Only after the actual Operator transfer is verified may a funded
      // recruiter reward enter its durable, due-only queue. Existing fares
      // and payouts are unchanged unless a signed campaign is activated.
      const recruiterProgram=fromConfig(key=>process.env[key]);
      const referralBudget=fundingForRide(ride,recruiterProgram);

      tx.set(ledgerRef, {
        state: 'transferred', transferId: transfer.id, verifiedAt: Date.now(),
      }, { merge: true });
      tx.set(ref, {
        transferId: transfer.id, operatorPaidCents: transferAmountCents,
        operatorGrossCents: amountCents,
        operatorFeesWithheldCents:ledger.feeWithheldCents||0,
        platformTakeCents: platformTake, payoutPending: false,
        payoutBlockedReason: null, needsPayout: false,
        settledAt: Date.now(),
        ...(recruiterProgram.enabled?{
          referralAvailableCents:referralBudget,
          referralAccrualPending:referralBudget>0,
          referralProgramVersion:recruiterProgram.version,
        }:{}),
        ...(paidWith ? { paidWith } : {}),
      }, { merge: true });
      finalizeFees();
      return true;
    });
    if (!done) return uncertain('payout_reconciliation_conflict');
  } catch {
    // Reconciliation on a later attempt will rediscover the Stripe transfer.
    return uncertain('payout_record_unconfirmed');
  }
  return {ok:true,transferId:transfer.id,amountCents:transferAmountCents,
    operatorGets:amountCents,feeWithheldCents:initial.feeWithheldCents||0,
    platformTake,paidWith,reconciled:!!existing};
}
module.exports = { transferOnce, checkTransfer, groupFor, VERSION };
