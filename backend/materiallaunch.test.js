const assert = require('node:assert/strict');
const { selectAdverseItemIds } = require('./adverse');
const { eventDocId, backoffMs } = require('./providerqueue');
const { accountFeeQuote, monthKey, previousMonth } = require('./operatorfees');
const { economicsFor, minimumPlatformFeeCents, MIN_PLATFORM_CONTRIBUTION_CENTS, CONNECT_FIXED_ALLOWANCE_CENTS } = require('./economics');

let pass = 0;
function t(name, fn) {
  try { fn(); console.log('✓', name); pass++; }
  catch (e) { console.error('✗', name, '\n ', e.message); process.exitCode = 1; }
}

// FCRA bridge: provider evidence is mapped to American Rider's concrete statutory reason;
// an unrelated item cannot be selected simply because the provider said "consider".
t('adverse items map concrete statutory reasons', () => {
  const out = selectAdverseItemIds([
    { id: 'a', text: 'Driving while license suspended' },
    { id: 'b', text: 'Unrelated dismissed record' },
  ], ['Driving on a suspended or revoked license']);
  assert.equal(out.ok, true);
  assert.deepEqual(out.ids, ['a']);
});
t('unmapped statutory reason fails closed', () => {
  const out = selectAdverseItemIds([{ id: 'x', text: 'Unrelated record' }], ['sexual offender registry']);
  assert.equal(out.ok, false);
  assert.deepEqual(out.ids, []);
});

// Durable inbox keys are provider-scoped, so Stripe evt_1 cannot collide with Checkr evt_1.
t('provider event ids are stable and provider scoped', () => {
  assert.equal(eventDocId('stripe', 'evt_1'), 'stripe:evt_1');
  assert.equal(eventDocId('checkr', 'evt_1'), 'checkr:evt_1');
});
t('provider retry backoff grows and caps', () => {
  assert.equal(backoffMs(1), 5000);
  assert.ok(backoffMs(5) > backoffMs(1));
  assert.equal(backoffMs(100), 15 * 60_000);
});

// Current policy: the $2 payout-active account cost has no Travel-volume waiver;
// collection requires express Operator consent and never reduces the 99% Fare share.
t('operator active-account cost has no 20-Travel waiver', () => {
  assert.equal(accountFeeQuote(19, true).waived, false);
  assert.equal(accountFeeQuote(19, true).costCents, 200);
  assert.equal(accountFeeQuote(20, true).waived, false);
  assert.equal(accountFeeQuote(20, true).costCents, 200);
  assert.equal(accountFeeQuote(0, false).waived, true);
});
t('operator account charge recovers processing rather than losing money', () => {
  const us = accountFeeQuote(1, true, 'US');
  const unknown = accountFeeQuote(1, true, null);
  assert.ok(us.totalCents > 200);
  assert.equal(us.processingCents, us.totalCents - 200);
  assert.ok(unknown.totalCents >= us.totalCents, 'unknown card must not be priced cheaper than domestic');
});
t('UTC month accounting is deterministic', () => {
  assert.equal(monthKey(Date.UTC(2026, 8, 25)), '2026-09');
  assert.equal(previousMonth(Date.UTC(2026, 8, 25)), '2026-08');
});

// Traveler pricing no longer socializes the $2 monthly active-account fee. It retains a
// conservative 6c fixed payout allowance and still satisfies the 75c contribution invariant.
t('traveler economics excludes monthly Connect account fee', () => {
  assert.equal(CONNECT_FIXED_ALLOWANCE_CENTS, 6);
});
t('75c modeled transaction contribution still holds every cent $3-$500', () => {
  for (const country of ['US', 'GB', null]) {
    for (let fare = 300; fare <= 50000; fare++) {
      const fee = minimumPlatformFeeCents({ travelCostCents: fare, cardCountry: country });
      const e = economicsFor({ travelCostCents: fare, platformFeeCents: fee, cardCountry: country });
      assert.ok(e.platformContributionCents >= MIN_PLATFORM_CONTRIBUTION_CENTS, `${country} fare=${fare} fee=${fee} contribution=${e.platformContributionCents}`);
    }
  }
});

console.log(`\n${pass} material-hardening tests passed`);
