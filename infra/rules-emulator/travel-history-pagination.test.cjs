'use strict';
// Production query shape exercised twice against a REAL LOCAL Firestore emulator.
// Proves stable descending cursor pagination, account isolation and bounded reads.
// This does not prove production indexes READY or mobile touch gestures.
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const backendRequire = createRequire(path.join(__dirname, '../../backend/package.json'));
const { initializeApp, getApps } = backendRequire('firebase-admin/app');
const { getFirestore } = backendRequire('firebase-admin/firestore');
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Requires local Firestore emulator');
if (!getApps().length) initializeApp({ projectId: 'demo-american-rider' });
const db = getFirestore();
const PAGE_SIZE = 25;

(async () => {
  for (let pass = 1; pass <= 2; pass++) {
    const owner = 'traveler-history-paging-test-' + pass;
    const rows = [];
    for (let i = 0; i < 113; i++) {
      // Tie the timestamp every third Travel; the implicit Firestore document ID
      // ordering must still make the cursor stable with no duplicate/omitted row.
      rows.push({ id: 'history-' + pass + '-' + String(i).padStart(4, '0'),
        travelerUid: owner, createdAt: 1792000000000 + Math.floor(i / 3),
        costCents: i + 100, status: 'completed' });
    }
    const batch = db.batch();
    for (const row of rows) {
      const { id, ...fields } = row;
      batch.set(db.collection('rides').doc(id), fields);
    }
    batch.set(db.collection('rides').doc('history-other-' + pass),
      { travelerUid: 'another-traveler', createdAt: 2000000000000, costCents: 99999 });
    await batch.commit();
    try {
      const seen = [];
      let cursor = null;
      let pages = 0;
      for (;;) {
        const q = db.collection('rides').where('travelerUid', '==', owner)
          .orderBy('createdAt', 'desc').limit(PAGE_SIZE + 1);
        const snapshot = await (cursor ? q.startAfter(cursor) : q).get();
        const visible = snapshot.docs.slice(0, PAGE_SIZE);
        seen.push(...visible.map(d => d.id));
        pages++;
        assert.ok(visible.length <= PAGE_SIZE, 'Never show unbounded account history');
        if (snapshot.docs.length <= PAGE_SIZE) break;
        assert.equal(visible.length, PAGE_SIZE);
        cursor = visible[visible.length - 1];
        assert.ok(pages < 7);
      }
      assert.equal(pages, 5);
      assert.equal(seen.length, rows.length);
      assert.equal(new Set(seen).size, rows.length, 'Cursor must not duplicate records');
      assert.deepEqual([...seen].sort(), rows.map(r => r.id).sort());
      assert.ok(seen.every(id => id.startsWith('history-' + pass + '-')),
        'No other account Travel may enter a page');
      console.log('PASS emulator Travel cursor pass ' + pass + ': 113 records, 5 bounded pages, ties, isolation');
    } finally {
      const all = [...rows.map(row => row.id), 'history-other-' + pass];
      for (let i = 0; i < all.length; i += 400) {
        const cleanup = db.batch();
        for (const id of all.slice(i, i + 400)) cleanup.delete(db.collection('rides').doc(id));
        await cleanup.commit();
      }
    }
  }
})().catch(err => { console.error(err); process.exitCode = 1; }).finally(async () => {
  await db.terminate();
});
