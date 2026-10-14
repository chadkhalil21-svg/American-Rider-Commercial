// Pausing paid offers is atomic with the booking and on-duty transactions. Clearing the
// denormalized fleet availability flag is separately retryable, bounded operational work.
const { marketFor } = require('./markets');
const PAGE_SIZE = 200;
const MAX_PAGES = 5;

// The county must be served geographically. Individual Operator and payout checks
// remain independent. An Operations admission record is not read here.
async function setGeographicFleetOnline({ db, operatorId, fleetUpdate, markets }) {
  if (!db || !operatorId || !fleetUpdate || !Array.isArray(markets) || !markets.length ||
      markets.some((m) => m?.status !== 'active')) return false;
  return db.runTransaction(async (tx) => {
    const closure = await tx.get(db.collection('account_closures').doc(String(operatorId)));
    if (closure.exists && closure.data()?.closingAt) return false;
    const opRef = db.collection('operators').doc(String(operatorId));
    const current = await tx.get(opRef);
    const status = current.exists ? current.data() || {} : {};
    // A newer signed payout downgrade must defeat a stale GPS renewal.
    if (fleetUpdate.available === true && fleetUpdate.payoutsEnabled === true &&
        status.payoutsEnabled === false &&
        Number(status.stripeCheckedAt || 0) >= Number(fleetUpdate.stripeCheckedAt || 0))
      return false;
    tx.set(opRef, fleetUpdate, { merge: true });
    return true;
  });
}

async function setFleetOnlineIfOpen({db,operatorId,fleetUpdate}) {
  if(!db||!operatorId||!fleetUpdate)return false;
  return db.runTransaction(async(tx)=>{
    const closure=await tx.get(db.collection('account_closures').doc(String(operatorId)));
    if(closure.exists&&closure.data()?.closingAt)return false;
    tx.set(db.collection('operators').doc(String(operatorId)),fleetUpdate,{merge:true});
    return true;
  });
}

async function deactivateMarketFleet({ db, market, maxPages = MAX_PAGES, now = Date.now() }) {
  if (!db || !market) return { ok: false, reason: 'market/database unavailable' };
  const ref = db.collection('market_admission').doc(market.id);
  const starting = await ref.get();
  if (!starting.exists || starting.data().status !== 'paused' || !starting.data().fleetCleanupPending) {
    return { ok: false, reason: 'market not awaiting fleet cleanup' };
  }
  let cursor = starting.data().fleetCleanupCursor || null;
  let offlined = 0;
  const pages = Math.max(1, Math.min(MAX_PAGES, Number(maxPages) || MAX_PAGES));
  for (let i = 0; i < pages; i++) {
    const before = cursor;
    let query = db.collection('operators').where('available', '==', true).orderBy('__name__');
    if (cursor) query = query.startAfter(cursor);
    const page = await query.limit(PAGE_SIZE).get();
    const batch = db.batch();
    let changed = 0;
    for (const doc of page.docs) {
      const fleet = doc.data();
      const sameMarket = fleet.marketId
        ? fleet.marketId === market.id
        : marketFor({ lat: Number(fleet.lat), lng: Number(fleet.lng) })?.id === market.id;
      if (!sameMarket) continue;
      batch.set(doc.ref || db.collection('operators').doc(doc.id),
        { available: false, offDutyReason: 'market_paused', offDutyAt: now }, { merge: true });
      changed++;
    }
    if (changed) await batch.commit();
    offlined += changed;
    cursor = page.docs.at(-1)?.id || cursor;
    const done = page.docs.length < PAGE_SIZE;
    const checkpoint = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const rec = snap.exists ? snap.data() : {};
      if (rec.status !== 'paused' || !rec.fleetCleanupPending || (rec.fleetCleanupCursor || null) !== before) return false;
      tx.update(ref, { fleetCleanupPending: !done, fleetCleanupCursor: done ? null : cursor,
        fleetCleanupAt: now, fleetOfflined: (Number(rec.fleetOfflined) || 0) + changed });
      return true;
    });
    if (!checkpoint) return { ok: false, reason: 'fleet cleanup superseded; recheck market', offlined };
    if (done) return { ok: true, done: true, offlined };
  }
  return { ok: true, done: false, offlined, cursor };
}

async function sweepPausedMarketFleet({ db, marketById, limit = 4 } = {}) {
  if (!db || typeof marketById !== 'function') return { ok: false, reason: 'market/database unavailable' };
  const snap = await db.collection('market_admission').where('fleetCleanupPending', '==', true)
    .limit(Math.min(4, Math.max(1, Number(limit) || 4))).get();
  const results = [];
  for (const doc of snap.docs) {
    const market = marketById(doc.id);
    if (!market) { results.push({ id: doc.id, ok: false, reason: 'unknown market needs Operations review' }); continue; }
    try { results.push({ id: doc.id, ...await deactivateMarketFleet({ db, market }) }); }
    catch (e) { results.push({ id: doc.id, ok: false, reason: e.message }); }
  }
  return { ok: results.every((r) => r.ok), considered: snap.docs.length, results,
    saturated: snap.docs.length >= 4 };
}
module.exports = { PAGE_SIZE, MAX_PAGES, setGeographicFleetOnline, setFleetOnlineIfOpen,
  deactivateMarketFleet, sweepPausedMarketFleet };
