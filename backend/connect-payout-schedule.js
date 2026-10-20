'use strict';
// A platform-controlled payout cadence, NOT an Operator payday selector.
// Default weekly Friday for Operator onboarding by Founder approval.
// Existing accounts are not bulk-changed; weekly does not make pending funds eligible for Instant.
// Stripe Accounts v1: settings.payouts.schedule.weekly_anchor.
// https://docs.stripe.com/connect/manage-payout-schedule

const WEEKDAYS = new Set(['monday','tuesday','wednesday','thursday','friday','saturday','sunday']);

function desiredAutomaticSchedule(env = process.env) {
  // Founder-approved launch default. Existing accounts are reconciled during onboarding;
  // no account is silently mutated merely by loading this module.
  const interval = String(env.CONNECT_STANDARD_PAYOUT_INTERVAL || 'weekly').trim().toLowerCase();
  if (interval === 'daily') return {interval: 'daily'};
  if (interval !== 'weekly') throw Error('unsupported automatic payout cadence');
  const weeklyAnchor = String(env.CONNECT_STANDARD_PAYOUT_WEEKDAY || 'friday').trim().toLowerCase();
  if (!WEEKDAYS.has(weeklyAnchor)) {
    throw Error('weekly automatic payouts require an explicit weekday');
  }
  return {interval: 'weekly', weekly_anchor: weeklyAnchor};
}

async function applyAutomaticSchedule({stripe, account, env = process.env}) {
  const target = desiredAutomaticSchedule(env);
  if (!target) return {changed:false, account, unconfigured:true};
  if (!stripe?.accounts?.update || !account?.id || !/^acct_[A-Za-z0-9]+$/.test(account.id)) {
    throw Error('verified connected account and Stripe client required');
  }
  const existing = account.settings?.payouts?.schedule || {};
  if (existing.interval === target.interval &&
      (target.interval !== 'weekly' || existing.weekly_anchor === target.weekly_anchor)) {
    return {changed:false, account, interval:target.interval};
  }
  // Only a platform-authorized configuration can reach this provider write.
  // This does not alter settlement timing, balances or eligibility for Instant.
  const updated = await stripe.accounts.update(account.id, {
    settings: {payouts: {schedule: target}},
  });
  if (updated?.id !== account.id ||
      updated?.settings?.payouts?.schedule?.interval !== target.interval ||
      (target.interval === 'weekly' &&
       updated?.settings?.payouts?.schedule?.weekly_anchor !== target.weekly_anchor)) {
    throw Error('Stripe payout cadence not confirmed');
  }
  return {changed:true, account:updated, interval:target.interval};
}

module.exports = {desiredAutomaticSchedule, applyAutomaticSchedule};
