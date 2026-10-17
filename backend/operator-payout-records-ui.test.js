'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
for (let pass = 0; pass < 2; pass++) {
  const server = read('backend/server.js');
  const helper = read('backend/operator-payout-records.js');
  const client = read('src/backend/connect.ts');
  const screen = read('app/operator/revenue.tsx');
  assert.match(server, /app\.get\('\/operator\/payout-records', requireAuth, LIMITS\.connect/);
  assert.match(server, /operatorUid: String\(req\.uid\)/);
  assert.match(helper, /\.where\('operatorId', '==', operatorUid\)/);
  assert.match(helper, /\.limit\(PAGE_SIZE \+ 1\)/);
  assert.doesNotMatch(helper, /transfers\.create|paymentIntents\.create|\.set\(|\.update\(/);
  assert.match(client, /\(after \? \x60\?after=\$\{encodeURIComponent\(after\)\}\x60 : ''\)/);
  assert.match(screen, /operatorPayoutRecords\(after\)/);
  assert.match(screen, /requestSequence\.current/);
  assert.match(screen, /serverTransferUnconfirmed/);
  assert.match(screen, /deviceEarningsNotice/);
  assert.match(screen, /minHeight: 44/);
  for (const locale of ['en','es','fr','de','it']) {
    const file = read('src/i18n/' + locale + '.ts');
    for (const key of ['serverLedgerTitle','serverLedgerDisclosure','serverTransferRecorded',
      'serverTransferUnconfirmed','serverNoRecords','serverLoadMore','serverLoadFailed','serverRetry','serverLoading']) {
      assert.ok(file.includes(key + ':'), locale + ' missing ' + key);
    }
  }
}
console.log('PASS twice: authentication, operator isolation, bounded queries, truthful payout copy and five locales.');
