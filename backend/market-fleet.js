'use strict';
// Only configured service geography controls where an eligible Operator can go on duty.
// Individual account closure and signed payout restrictions remain atomic.
async function setGeographicFleetOnline({ db, operatorId, fleetUpdate, markets }) {
  if (!db || !operatorId || !fleetUpdate || !Array.isArray(markets) || !markets.length ||
      markets.some((market) => market?.status !== 'active')) return false;
  return db.runTransaction(async (tx) => {
    const closure = await tx.get(db.collection('account_closures').doc(String(operatorId)));
    if (closure.exists && closure.data()?.closingAt) return false;
    const operatorRef = db.collection('operators').doc(String(operatorId));
    const current = await tx.get(operatorRef);
    const existing = current.exists ? current.data() || {} : {};
    // A newer provider-authorized downgrade defeats an earlier GPS renewal.
    if (fleetUpdate.available === true && fleetUpdate.payoutsEnabled === true &&
        existing.payoutsEnabled === false &&
        Number(existing.stripeCheckedAt || 0) >= Number(fleetUpdate.stripeCheckedAt || 0))
      return false;
    tx.set(operatorRef, fleetUpdate, { merge: true });
    return true;
  });
}

async function setFleetOnlineIfOpen({ db, operatorId, fleetUpdate }) {
  if (!db || !operatorId || !fleetUpdate) return false;
  return db.runTransaction(async (tx) => {
    const closure = await tx.get(db.collection('account_closures').doc(String(operatorId)));
    if (closure.exists && closure.data()?.closingAt) return false;
    tx.set(db.collection('operators').doc(String(operatorId)), fleetUpdate, { merge: true });
    return true;
  });
}

module.exports = { setGeographicFleetOnline, setFleetOnlineIfOpen };
