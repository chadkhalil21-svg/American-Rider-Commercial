'use strict';
// Keep Travel/safety sweeps at their existing one-minute cadence.
// Routine administrative checks are intentionally less frequent to bound idle database cost.
// Live eligibility checks remain authoritative at booking, dispatch and on-duty operations.
const PERIOD_MS = Object.freeze({
  pushReceipts: 5 * 60_000, // Expo first receipt available about 15 minutes after send
  screening: 6 * 60 * 60_000, // expiry is independently enforced at every acceptance; this is notification/review only
  insuranceMonitoring: 30 * 60_000,
  founderMarketIntent: 10 * 60_000, // at most 3 admission reads every ten minutes while intent is pending
  operatorFees: 6 * 60 * 60_000,
  recruiterBankPayouts: 60 * 60_000, // optional due-only, no second scheduler
  recruiterPayoutReservations: 60 * 60_000, // threshold-crossing candidates, bounded one index
  recruiterAccrual: 60_000, // only when the paid program is actually commissioned
  recruiterRelease: 60_000, // bounded due queue; single index, zero reads while disabled
  recruiterReserve: 60 * 60_000, // batch once per hour when fully commissioned
  familyAgeOut: 60 * 60_000,
  marketReference: 24 * 60 * 60_000,
  accountDeletion: 60 * 60_000,
});
function createSweepCadence(periods = PERIOD_MS) {
  const last = new Map();
  function due(name, now = Date.now()) {
    const period = periods[name];
    if (!Number.isFinite(period) || period < 60_000) throw new Error('Invalid maintenance cadence');
    const previous = last.get(name);
    if (Number.isFinite(previous) && now >= previous && now - previous < period) return false;
    last.set(name, now);
    return true;
  }
  function run(name, work, now = Date.now()) {
    if (!due(name, now)) return Promise.resolve({ ok:true, skipped:'cadence', nextDueAt:last.get(name)+periods[name] });
    return Promise.resolve().then(work);
  }
  return { due, run };
}
const quotaError = value => /(?:RESOURCE_EXHAUSTED|Quota exceeded)/i.test(String(value?.reason || value?.error || value?.message || value || ''));
function createQuotaBackoff() {
  let attempts = 0, retryAfter = 0;
  return {
    blocked(now = Date.now()) { return now < retryAfter; },
    remainingMs(now = Date.now()) { return Math.max(0, retryAfter - now); },
    failure(now = Date.now()) {
      attempts = Math.min(attempts + 1, 5);
      retryAfter = now + Math.min(10 * 60_000, 5 * 60_000 * (2 ** (attempts - 1)));
      return retryAfter;
    },
    clear() { attempts = 0; retryAfter = 0; },
  };
}
module.exports = { PERIOD_MS, createSweepCadence, quotaError, createQuotaBackoff };
