'use strict';
// A single authoritative account-creation claim per Operator.
// A Stripe request may succeed even when its response or Firestore write fails.
// Never open a second Express account just because the first outcome is unknown.
const { randomUUID } = require('node:crypto');
const { currentConnectFeeConsent } = require('./connect-fee-consent');
const MAX_SAFE_RETRY_MS = 23 * 60 * 60 * 1000; // Stripe idempotency may expire after 24h.

async function reserveConnectAccount({ db, uid, now = Date.now() }) {
  if (!db || !uid || !Number.isFinite(now)) throw Error('Operator account authority unavailable');
  const ref = db.collection('users').doc(String(uid));
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const u = snap.exists ? snap.data() || {} : {};
    // Recheck consent under the same transaction that grants creation authority.
    if (!currentConnectFeeConsent(u.stripeFeeConsent, now))
      return { blocked: 'payout_fee_consent_required' };
    if (u.stripeAccountId) return { existingAccountId: String(u.stripeAccountId) };
    if (u.stripeAccountCreationKey) {
      const age = now - Number(u.stripeAccountCreationStartedAt);
      // Do not reset an uncertain claim after the provider's idempotency window:
      // doing so can create a duplicate live payout account.
      if (!Number.isFinite(age) || age < 0 || age >= MAX_SAFE_RETRY_MS)
        return { blocked: 'account_creation_reconciliation_required' };
      return { creationKey: String(u.stripeAccountCreationKey), reused: true };
    }
    const creationKey = 'ar_connect_' + randomUUID().replace(/-/g, '');
    tx.set(ref, {
      stripeAccountCreationKey: creationKey,
      stripeAccountCreationStartedAt: now,
    }, { merge: true });
    return { creationKey, reused: false };
  });
}

async function saveConnectedAccount({ db, uid, account, creationKey, now = Date.now() }) {
  if (!db || !uid || !/^acct_[A-Za-z0-9]+$/.test(String(account?.id || '')))
    throw Error('Stripe account identity unavailable');
  const ref = db.collection('users').doc(String(uid));
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw Error('Operator account record unavailable');
    const u = snap.data() || {};
    if (u.stripeAccountId) {
      if (String(u.stripeAccountId) !== String(account.id))
        throw Error('Conflicting connected account: reconciliation required');
      return { accountId: account.id, alreadySaved: true };
    }
    if (!creationKey || u.stripeAccountCreationKey !== creationKey)
      throw Error('Connected account claim changed: reconciliation required');
    tx.set(ref, { stripeAccountId: account.id, stripeAccountAt: now }, { merge: true });
    return { accountId: account.id, alreadySaved: false };
  });
}

module.exports = { reserveConnectAccount, saveConnectedAccount, MAX_SAFE_RETRY_MS };
