'use strict';
// One pure versioned contract used at new duty and offer acceptance.
// Payouts already owed remain payable independently of consent to NEW terms.
const FEE_CONSENT_VERSION = 'connect-fees-2026-10';
const ACCOUNT_COST_CENTS = 200;
function currentConnectFeeConsent(consent, now = Date.now()) {
  return !!consent && consent.version === FEE_CONSENT_VERSION &&
    consent.approvedSeparatelyBilledFees === true &&
    consent.accountMonthlyUsd === ACCOUNT_COST_CENTS / 100 &&
    Number.isSafeInteger(consent.acceptedAt) && consent.acceptedAt > 0 &&
    consent.acceptedAt <= now;
}
module.exports = { FEE_CONSENT_VERSION, ACCOUNT_COST_CENTS, currentConnectFeeConsent };
