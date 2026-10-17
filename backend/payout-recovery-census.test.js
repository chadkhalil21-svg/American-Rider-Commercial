'use strict';

const assert = require('node:assert/strict');
const { classifyRecordedPayout, censusOperatorPage } = require('./payout-recovery-census');

function fakeDatabase(records) {
  const stats = { reads: 0, maxPage: 0, writes: 0 };
  const db = {
    collection(collection) {
      assert.equal(collection, 'rides');
      return {
        where(field, comparison, uid) {
          assert.equal(field, 'operatorId');
          assert.equal(comparison, '==');
          let after = null;
          let maximum = 100;
          const query = {
            orderBy(fieldPath) {
              assert.ok(fieldPath, 'document-id ordering required');
              return query;
            },
            limit(value) {
              maximum = value;
              return query;
            },
            startAfter(id) {
              after = id;
              return query;
            },
            async get() {
              assert.ok(maximum <= 100, 'query must be bounded');
              const all = records.filter(r => r.value.operatorId === uid && (!after || r.id > after));
              const page = all.slice(0, maximum);
              stats.reads += page.length;
              stats.maxPage = Math.max(stats.maxPage, page.length);
              return { docs: page.map(x => ({ id: x.id, data: () => x.value })) };
            },
            set() {
              stats.writes++;
              throw new Error('A payout census must never write to Firestore');
            },
          };
          return query;
        },
      };
    },
  };
  return { db, stats };
}

async function verify() {
  assert.equal(classifyRecordedPayout({ status: 'cancelled', paymentIntentId: 'pi_a' }), 'not_payable_history');
  assert.equal(classifyRecordedPayout({ status: 'completed' }), 'not_payable_history');
  assert.equal(classifyRecordedPayout({ status: 'completed', paymentIntentId: 'pi_a', transferId: 'tr_a' }), 'transfer_recorded');
  assert.equal(classifyRecordedPayout({ status: 'completed', paymentIntentId: 'pi_a', payoutPending: true }), 'pending_reconciliation');
  assert.equal(classifyRecordedPayout({ status: 'completed', paymentIntentId: 'pi_a', payoutPending: false }), 'missing_transfer_identity');
  assert.equal(classifyRecordedPayout({ status: 'completed', paymentIntentId: 'pi_a' }), 'legacy_unclassified');

  const rows = Array.from({ length: 301 }, (_, i) => {
    const status = i % 11 === 0 ? 'cancelled' : 'completed';
    const paid = i % 6 === 0;
    const prior = i % 3 === 0 ? { payoutPending: true } : i % 3 === 1 ? { payoutPending: false } : {};
    return {
      id: 'ride_' + String(i).padStart(6, '0'),
      value: { operatorId: 'operator_A', status, paymentIntentId: 'pi_' + i,
        ...(paid ? { transferId: 'tr_' + i } : {}),
        ...prior },
    };
  });
  rows.push({ id: 'ride_other', value: { operatorId: 'operator_B', status: 'completed', paymentIntentId: 'pi_other' } });
  const { db, stats } = fakeDatabase(rows);

  let afterId = null;
  let total = 0;
  const seen = new Set();
  const totals = {
    not_payable_history: 0, transfer_recorded: 0, pending_reconciliation: 0,
    missing_transfer_identity: 0, legacy_unclassified: 0,
  };
  for (let pages = 0; pages < 10; pages++) {
    const page = await censusOperatorPage({ db, operatorId: 'operator_A', afterId, pageSize: 50 });
    assert.equal(page.readOnly, true);
    assert.ok(page.examined <= 50);
    total += page.examined;
    for (const [status, count] of Object.entries(page.counts)) totals[status] += count;
    for (const candidate of page.candidates) {
      assert.ok(!seen.has(candidate.rideId), 'cursor may not duplicate a ride');
      seen.add(candidate.rideId);
      assert.ok(candidate.rideId !== 'ride_other');
    }
    if (!page.hasMore) break;
    assert.ok(page.nextCursor && page.nextCursor !== afterId, 'cursor must advance');
    afterId = page.nextCursor;
  }
  assert.equal(total, 301, 'all old records are visited, not just recent 50/100');
  assert.equal(Object.values(totals).reduce((a, b) => a + b, 0), 301);
  assert.ok(totals.legacy_unclassified > 0, 'old records without payoutPending cannot disappear');
  assert.ok(totals.missing_transfer_identity > 0, 'payoutPending false is not proof of payment');
  assert.equal(stats.maxPage, 50);
  assert.equal(stats.reads, 301);
  assert.equal(stats.writes, 0);
  await assert.rejects(censusOperatorPage({ db, operatorId: 'operator_A', pageSize: 101 }), /Page size/);
  await assert.rejects(censusOperatorPage({ db, operatorId: '' }), /Operator UID/);
}
(async () => {
  await verify();
  await verify();
  console.log('PASS twice: bounded read-only reconciliation census, legacy debt categories, exact cursor coverage.');
})().catch(e => { console.error(e); process.exitCode = 1; });
