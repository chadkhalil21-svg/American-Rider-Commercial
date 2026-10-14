'use strict';

// Operator duty is individual. Regional service availability is checked separately
// from this account/Stripe transaction; no county approval record is consulted.
async function setFleetOnlineIfOpen({db, operatorId, fleetUpdate}) {
  if (!db || !operatorId || !fleetUpdate) return false;
  return db.runTransaction(async (tx) => {
    const closure=await tx.get(db.collection('account_closures').doc(String(operatorId)));
    if (closure.exists && closure.data()?.closingAt) return false;

    // Do not let a delayed GPS/online heartbeat overturn a more recent signed
    // Stripe downgrade. A fresh provider check may restore payout eligibility.
    if (fleetUpdate.available === true && fleetUpdate.payoutsEnabled === true) {
      const current=await tx.get(db.collection('operators').doc(String(operatorId)));
      const latest=current.exists ? current.data() || {} : {};
      if (latest.payoutsEnabled === false &&
          Number(latest.stripeCheckedAt || 0) >= Number(fleetUpdate.stripeCheckedAt || 0)) {
        return false;
      }
    }
    tx.set(db.collection('operators').doc(String(operatorId)),fleetUpdate,{merge:true});
    return true;
  });
}
module.exports={setFleetOnlineIfOpen};
