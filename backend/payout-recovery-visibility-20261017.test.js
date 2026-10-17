'use strict';

// Two-pass source regression. This does not replace Stripe sandbox or phone acceptance.
// It protects the contract that *no response* must never be presented as *no debt*.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = (name) => fs.readFileSync(path.join(root, name), 'utf8');

function verify() {
  const bridge = source('src/backend/connect.ts');
  const context = source('src/state/OperatorContext.tsx');
  const revenue = source('app/operator/revenue.tsx');
  const payout = source('app/operator/withdraw.tsx');

  assert.match(bridge, /export type PayoutRecoveryResult\s*=/);
  assert.match(bridge, /\| \{ ok: false; code: string; error: string \}/);
  assert.match(bridge, /!res\.ok \|\| d\?\.ok !== true/);
  assert.match(bridge, /Number\.isSafeInteger\(settled\)/);
  assert.match(bridge, /Number\.isSafeInteger\(centsPaid\)/);
  assert.match(bridge, /!Array\.isArray\(d\.stillOwed\)/);
  const recovery = bridge.match(/export async function settlePendingPayouts\([\s\S]*?\n\}\n/)?.[0];
  assert.ok(recovery, 'The payout recovery method must be present');
  assert.doesNotMatch(recovery, /return\s*\{\s*settled:\s*0/);
  assert.match(recovery, /code: 'recovery_unreachable'/);

  assert.match(context, /payoutRecoveryRequestRef\.current === recoveryRequest/);
  assert.match(context, /userUidRef\.current === recoveryUid/);
  assert.match(context, /result\.ok \? 'checked' : 'unconfirmed'/);
  assert.match(context, /payoutRecoveryStatus,/);
  // Operator A's cached device totals must not appear for Operator B.
  assert.match(context, /AsyncStorage\.getItem\(`\$\{K_REVENUE\}:\$\{uid\}`\)/);
  assert.match(context, /AsyncStorage\.setItem\(`\$\{K_REVENUE\}:\$\{uid\}`/);
  assert.match(context, /revenueOwnerUid === user\.uid \? revenue : EMPTY_REVENUE/);
  assert.match(context, /userUidRef\.current !== uid/);
  assert.doesNotMatch(context, /AsyncStorage\.setItem\(K_REVENUE,/);

  assert.match(revenue, /operator\.deviceEarningsLabel/);
  assert.match(revenue, /operator\.deviceEarningsNotice/);
  assert.match(revenue, /payoutRecoveryStatus === 'unconfirmed'/);
  assert.match(revenue, /operator\.payoutRecoveryUnconfirmed/);
  assert.doesNotMatch(revenue, /traveler\.earnedOnItsWay/);
  for (const key of ['payoutTruthIntro', 'payoutTruthTransfer', 'payoutTruthBank', 'payoutTruthInstant']) {
    assert.match(payout, new RegExp('operator\\.' + key));
  }
  assert.doesNotMatch(payout, /American Rider never holds it\./);

  for (const locale of ['en', 'es', 'fr', 'de', 'it']) {
    const catalog = source(`src/i18n/${locale}.ts`);
    const operator = catalog.match(/^  operator:\s*\{([\s\S]*?)^  \},/m)?.[1];
    assert.ok(operator, locale + ': Operator section not present');
    for (const key of ['deviceEarningsLabel', 'deviceEarningsNotice', 'payoutRecoveryUnconfirmed', 'payoutTruthIntro', 'payoutTruthTransfer', 'payoutTruthBank', 'payoutTruthInstant']) {
      assert.match(operator, new RegExp('^\\s{4}' + key + ':', 'm'), locale + ': key missing or in the wrong translation section: ' + key);
    }
  }
}
verify();
verify();
console.log('PASS twice: payout recovery uncertainty, account isolation and five-language device-earnings disclosure.');
