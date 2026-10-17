'use strict';
const assert = require('node:assert/strict');
const { operatorPayoutRecords, statusForCompletedTravel, PAGE_SIZE } = require('./operator-payout-records');

function mockDb(rows) {
  let reads = 0;
  let writes = 0;
  return {
    db: {
      collection(name) {
        assert.equal(name, 'rides');
        return {
          where(field, operator, uid) {
            assert.equal(field, 'operatorId');
            assert.equal(operator, '==');
            const query = {
              cursor: null, take: null,
              orderBy(fieldName) { assert.ok(fieldName); return this; },
              limit(n) { this.take = n; return this; },
              startAfter(v) { this.cursor = v; return this; },
              async get() {
                assert.equal(this.take, PAGE_SIZE + 1);
                const docs = rows.filter(x => x.value.operatorId === uid &&
                  (!this.cursor || x.id > this.cursor)).slice(0, this.take);
                reads += docs.length;
                return { docs: docs.map(x => ({ id: x.id, data: () => x.value })) };
              },
            };
            return query;
          },
          set() { writes++; throw new Error('Read-only endpoint must never write'); },
        };
      },
    },
    get reads() { return reads; },
    get writes() { return writes; },
  };
}
async function exercise() {
  assert.equal(statusForCompletedTravel({ status: 'cancelled', transferId: 'tr_1' }), null);
  assert.deepEqual(statusForCompletedTravel({ status: 'completed', transferId: 'tr_1', operatorPaidCents: 1999 }),
    { kind: 'transfer_recorded', cents: 1999 });
  assert.deepEqual(statusForCompletedTravel({ status: 'completed', payoutPending: false }),
    { kind: 'reconciliation_needed', cents: null });
  assert.deepEqual(statusForCompletedTravel({ status: 'completed', transferId: 'tr_1' }),
    { kind: 'reconciliation_needed', cents: null });

  const rows = Array.from({ length: 81 }, (_, i) => ({
    id: 'ride_' + String(i).padStart(4, '0'),
    value: {
      operatorId: 'own_operator',
      status: i % 7 === 0 ? 'cancelled' : 'completed',
      tripNo: 'AR-' + i,
      ...(i % 3 === 0 ? { transferId: 'tr_' + i, operatorPaidCents: 1850 } : {}),
    },
  }));
  rows.push({ id: 'zzz_other_operator', value: { operatorId: 'other_operator', status: 'completed', transferId: 'tr_x', operatorPaidCents: 999999 } });
  const mock = mockDb(rows);
  let nextCursor = null, pages = 0, records = [], seen = new Set();
  do {
    const r = await operatorPayoutRecords({ db: mock.db, operatorUid: 'own_operator', after: nextCursor });
    pages++;
    assert.equal(r.ok, true);
    assert.equal(r.scope, 'one_page_of_server_records');
    assert.ok(!Object.prototype.hasOwnProperty.call(r, 'allTimeTotal'));
    for (const x of r.records) {
      assert.ok(!seen.has(x.rideId), 'must not repeat a page');
      assert.ok(x.tripNo !== 'other_operator');
      seen.add(x.rideId);
    }
    records.push(...r.records);
    if (!r.hasMore) break;
    assert.ok(r.nextCursor && nextCursor !== r.nextCursor);
    nextCursor = r.nextCursor;
  } while (pages < 10);
  assert.equal(pages, 3);
  assert.equal(records.length, rows.filter(x => x.value.status === 'completed' && x.value.operatorId === 'own_operator').length);
  assert.ok(records.some(x => x.status === 'reconciliation_needed'));
  assert.ok(records.some(x => x.status === 'transfer_recorded'));
  assert.ok(mock.reads <= 81 + pages, 'must read only bounded pages');
  assert.equal(mock.writes, 0);
  await assert.rejects(operatorPayoutRecords({ db: mock.db, operatorUid: '' }), /Authenticated/);
  await assert.rejects(operatorPayoutRecords({ db: mock.db, operatorUid: 'own_operator', after: 'a/b' }), /cursor/);
}
(async () => {
  await exercise();
  await exercise();
  console.log('PASS twice: authenticated bounded Operator payout records, no transfers or invented bank balance.');
})().catch(e => { console.error(e); process.exitCode = 1; });
