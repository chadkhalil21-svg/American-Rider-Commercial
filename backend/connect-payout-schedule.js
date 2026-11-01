'use strict';
// A platform-controlled payout cadence. Existing accounts are never bulk-changed.
// Founder prefers on-demand standard or Instant payouts chosen in Stripe Express.
// Switch only after the Express manual-payout controls and bank reconciliation
// are independently certified on a real eligible connected account.
// Stripe Accounts v1: settings.payouts.schedule.weekly_anchor.
// https://docs.stripe.com/connect/manage-payout-schedule

const WEEKDAYS = new Set(['monday','tuesday','wednesday','thursday','friday','saturday','sunday']);

function desiredAutomaticSchedule(env = process.env) {
  // Keep production's preexisting behavior UNTIL Stripe Express Manual payouts
  // and the revised commission bank reconciliation are independently verified.
  // An explicit, jointly gated manual choice is safe to prepare before release.
  const interval = String(env.CONNECT_STANDARD_PAYOUT_INTERVAL || 'weekly').trim().toLowerCase();
  if (interval === 'manual') {
    if (String(env.CONNECT_OPERATOR_CHOICE_PAYOUTS_VERIFIED || '') !== '1')
      throw Error('Operator-controlled manual payouts require independently verified Stripe Express controls');
    if (String(env.CONNECT_MANUAL_REFERRAL_RECONCILIATION_VERIFIED || '') !== '1')
      throw Error('manual referral bank reconciliation must be independently verified');
    return {interval: 'manual'};
  }
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
