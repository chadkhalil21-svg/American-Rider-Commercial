'use strict';
// Optional work remembers successful execution ACROSS Cloud Run instance restarts.
// Required safety/booking/settlement sweeps are never paced by this helper.
// The caller MUST hold the shared operations_sweep leader lease to prevent
// concurrent execution of these noncritical jobs across multiple API instances.
const { PERIOD_MS } = require('./sweepcadence');
const COLLECTION = 'system_maintenance_cadence';
const FAILED_RETRY_MS = 5 * 60_000;
async function durableMaintenance({ db, name, work, now = Date.now() }) {
  const period = PERIOD_MS[name];
  if (!db || typeof db.runTransaction !== 'function')
    throw new Error('Database unavailable for durable maintenance');
  if (!Number.isSafeInteger(now) || !Number.isFinite(period) || period < 60_000 ||
      typeof work !== 'function')
    throw new Error('Invalid durable maintenance task');
  const ref = db.collection(COLLECTION).doc(name);
  const result = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const prior = snap.exists ? snap.data() || {} : {};
    const successfulAt = Number(prior.lastSucceededAt || 0);
    if (successfulAt > 0 && now >= successfulAt && now - successfulAt < period)
      return { due: false, nextDueAt: successfulAt + period };
    const attemptedAt = Number(prior.lastAttemptAt || 0);
    if (attemptedAt > 0 && now >= attemptedAt && now - attemptedAt < FAILED_RETRY_MS)
      return { due: false, nextDueAt: attemptedAt + FAILED_RETRY_MS };
    // Only the latest attempt time is committed before the provider call.
    // A failure must not count as a successful 30-minute/day-long sweep.
    tx.set(ref, { lastAttemptAt: now }, { merge: true });
    return { due: true };
  });
  if (!result.due)
    return { ok: true, skipped: 'cadence', nextDueAt: result.nextDueAt };
  const outcome = await work();
  // Most optional jobs return a status object. A provider failure is not a
  // successful sweep; back off five minutes then retry automatically.
  if (outcome?.ok === false) return outcome;
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (Number(snap.exists ? snap.data()?.lastAttemptAt : NaN) === now)
      tx.set(ref, { lastSucceededAt: now }, { merge: true });
  });
  return outcome;
}
module.exports = { durableMaintenance, COLLECTION, FAILED_RETRY_MS };
