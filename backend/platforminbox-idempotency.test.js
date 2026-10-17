'use strict';
// Safe local Firestore mocks. No push notifications, accounts or external money.
const assert = require('node:assert/strict');
const { postPlatformMessage } = require('./platforminbox');

const docs = new Map();
let next = 0;
let pushes = 0;
const fakeDb = {
  collection: (name) => {
    assert.equal(name, 'users');
    return {
      doc: (uid) => ({
        collection: (coll) => {
          assert.equal(coll, 'platform_messages');
          return {
            doc: (id) => {
              const documentId = id || 'random_' + ++next;
              return {
                id: documentId,
                create: async (message) => {
                  const key = uid + '/' + documentId;
                  if (docs.has(key)) {
                    const e = new Error('ALREADY_EXISTS'); e.code = 6; throw e;
                  }
                  docs.set(key, message);
                  return true;
                },
              };
            },
          };
        },
      }),
    };
  },
};
const push = async () => { pushes++; return { ok: true }; };
(async () => {
  const base = {
    uid:'operatorA', category:'support', title:'Lost item report',
    body:'Please inspect the vehicle', idempotencyKey:'lost-report:report1:operatorA',
    action:{ screen:'/operator/lost-item?itemId=report1' },
  };
  const [first, replay] = await Promise.all([
    postPlatformMessage(base, { database:fakeDb, sendPush:push }),
    postPlatformMessage(base, { database:fakeDb, sendPush:push }),
  ]);
  assert.ok(first.ok && replay.ok);
  assert.equal([first, replay].filter(r => r.reused === true).length, 1);
  assert.equal(docs.size, 1, 'only one durable notice can exist after simultaneous retries');
  assert.equal(pushes, 1, 'only the winning creation sends a push');

  const again = await postPlatformMessage(base, { database:fakeDb, sendPush:push });
  assert.ok(again.ok && again.reused);
  assert.equal(pushes, 1);

  await postPlatformMessage({ ...base, uid:'operatorB' }, { database:fakeDb, sendPush:push });
  assert.equal(docs.size, 2, 'a different Operator receives their own durable report');
  await postPlatformMessage({ ...base, idempotencyKey:'lost-report:report2:operatorA' },
    { database:fakeDb, sendPush:push });
  assert.equal(docs.size, 3, 'a different Lost Item report is not suppressed');

  await postPlatformMessage({ ...base, idempotencyKey:null },
    { database:fakeDb, sendPush:push });
  await postPlatformMessage({ ...base, idempotencyKey:null },
    { database:fakeDb, sendPush:push });
  assert.equal(docs.size, 5, 'ordinary unrelated inbox messages remain independently deliverable');

  const invalid = await postPlatformMessage({ ...base, idempotencyKey:'X'.repeat(241) },
    { database:fakeDb, sendPush:push });
  assert.equal(invalid.ok, false, 'reject an oversized caller-supplied retry identity');
  assert.equal(docs.size, 5, 'invalid retry identity has no side effects');
  console.log('PASS: stable account-scoped inbox identity, concurrent replay, ordinary messages and invalid keys');
})().catch(err => { console.error(err); process.exitCode = 1; });
