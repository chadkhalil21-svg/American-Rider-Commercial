'use strict';
const assert = require('node:assert/strict');
const { insuranceReminderPlan, sendInsuranceReminder, sweepInsuranceMonitoring,
  continuingStatus, DAY_MS, STATUS_MAX_AGE_MS } = require('./insurance-monitoring');
const NOW = Date.parse('2026-10-10T18:00:00Z');
const user = () => ({ insuranceMonitoring: {
  status: 'verified_active', lastVerifiedAt: NOW - 61 * DAY_MS,
  nextVerificationDueAt: NOW - DAY_MS, policyNumber: 'SYNTHETIC-123',
  effectiveDate: '2026-01-01', expirationDate: '2027-01-01',
} });
function database(initial = user()) {
  let value = structuredClone(initial), cursor, lock = Promise.resolve();
  const stats = { transactions: 0, writes: 0 };
  const ref = { id: 'operator', get: async () => ({ exists: value !== null,
    data: () => structuredClone(value) }) };
  const query = { where: () => query, orderBy: () => query, startAfter: () => query,
    limit: () => query, get: async () => ({ docs: value ? [await ref.get().then(s => ({ ...s, id: ref.id }))] : [] }) };
  const db = {
    collection(name) {
      if (name === 'users') return { ...query, doc: () => ref };
      assert.equal(name, 'insurance_monitor_cursor');
      return { doc: () => ({ get: async () => ({ exists: !!cursor, data: () => cursor }),
        set: async v => { cursor = v; } }) };
    },
    runTransaction(fn) {
      const task = lock.then(async () => {
        stats.transactions++;
        const pending = [];
        const result = await fn({ get: r => r.get(), update: (r, patch) => {
          assert.equal(r, ref);
          assert.deepEqual(Object.keys(patch), ['insuranceReminder'], 'notification must never write eligibility');
          pending.push(patch);
        } });
        for (const patch of pending) { value = { ...value, ...structuredClone(patch) }; stats.writes++; }
        return result;
      });
      lock = task.catch(() => {});
      return task;
    },
  };
  return { db, stats, read: () => value, change: fn => { value = fn(value); } };
}
async function main() {
  const fixture = database(); let sent = 0;
  const notify = async () => ({ ok: true, id: `ticket-${++sent}` });
  const sweep = now => sweepInsuranceMonitoring({ db: fixture.db, notify, now });
  const before = structuredClone(fixture.read().insuranceMonitoring);
  assert.equal((await sweep(NOW)).reminded, 1);
  // Regression: the old scheduler sent on every pass, including after restart.
  for (let i = 1; i <= 1000; i++) assert.equal((await sweep(NOW + i * 60_000)).reminded, 0);
  assert.equal(sent, 1);
  assert.equal(fixture.stats.transactions, 2, 'suppressed sweeps incur no reminder transactions');
  assert.deepEqual(fixture.read().insuranceMonitoring, before);
  assert.equal(continuingStatus(fixture.read(), NOW).ok, false);

  const concurrent = database(); let calls = 0;
  const results = await Promise.all(Array.from({ length: 30 }, () => sendInsuranceReminder({
    db: concurrent.db, uid: 'operator', now: NOW,
    notify: async () => { calls++; return { ok: true, id: 'ticket' }; },
  })));
  assert.equal(calls, 1); assert.equal(results.filter(r => r.ok).length, 1);

  const failing = database(); let failedCalls = 0;
  const retry = now => sendInsuranceReminder({ db: failing.db, uid: 'operator', now,
    notify: async () => { failedCalls++; return { ok: false }; } });
  assert.equal((await retry(NOW)).ok, false);
  assert.equal((await retry(NOW + 1)).skipped, true);
  await retry(NOW + 15 * 60_000);
  await retry(NOW + 75 * 60_000);
  await retry(NOW + 80 * 60_000);
  assert.equal(failedCalls, 3, 'failure retries are bounded, never every sweep');
  assert.equal(failing.read().insuranceReminder.stages.due.acceptedAt, undefined);
  const malformed = database();
  assert.equal((await sendInsuranceReminder({ db: malformed.db, uid: 'operator', now: NOW,
    notify: async () => ({ ok: true }) })).ok, false, 'no ticket means no recorded acceptance');

  const attested = database();
  attested.change(u => ({ ...u, insuranceMonitoring: { ...u.insuranceMonitoring, operatorAttestedAt: NOW } }));
  assert.equal(insuranceReminderPlan(attested.read(), NOW), null);
  const staleAt = attested.read().insuranceMonitoring.lastVerifiedAt + STATUS_MAX_AGE_MS + 1;
  let staleBody;
  await sendInsuranceReminder({ db: attested.db, uid: 'operator', now: staleAt,
    notify: async x => { staleBody = x.body; return { ok: true, id: 'stale-ticket' }; } });
  assert.match(staleBody, /Obtain current insurer or broker confirmation/);
  assert.equal(insuranceReminderPlan(attested.read(), staleAt + DAY_MS), null);
  assert.equal(continuingStatus(attested.read(), staleAt).ok, false);

  // A new verified cycle gets its own reminders; an old accepted reminder does not hide it.
  fixture.change(u => ({ ...u, insuranceMonitoring: { ...u.insuranceMonitoring,
    lastVerifiedAt: NOW, nextVerificationDueAt: NOW + 60 * DAY_MS } }));
  assert.equal(insuranceReminderPlan(fixture.read(), NOW), null);
  assert.ok(insuranceReminderPlan(fixture.read(), NOW + 61 * DAY_MS));
  for (const status of ['cancelled', 'unverified', 'pending_cancellation', 'coverage_reduced']) {
    const u = user(); u.insuranceMonitoring.status = status;
    assert.equal(insuranceReminderPlan(u, NOW), null);
  }
  // Fresh transaction data overrides the old query snapshot after a provider response.
  const changed = database();
  assert.ok(insuranceReminderPlan(changed.read(), NOW));
  changed.change(u => ({ ...u, insuranceMonitoring: { ...u.insuranceMonitoring, lastVerifiedAt: NOW } }));
  assert.equal((await sendInsuranceReminder({ db: changed.db, uid: 'operator', now: NOW,
    notify: async () => { throw new Error('must not send'); } })).skipped, true);

  const broken = database(); broken.db.runTransaction = async () => { throw new Error('database unavailable'); };
  let attempted = false;
  const report = await sweepInsuranceMonitoring({ db: broken.db, now: NOW,
    notify: async () => { attempted = true; } });
  assert.equal(attempted, false, 'no untracked push when claim cannot persist');
  assert.equal(report.reminded, 0); assert.equal(report.failed[0].reason, 'insurance_reminder_unavailable');
  console.log('PASS: bounded insurance reminders, repeated sweeps, concurrent claims, retries, stale grace and unchanged eligibility');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
