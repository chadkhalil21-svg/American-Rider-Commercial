'use strict';
// An Operator unable to receive a Connect transfer stays owed, but do not
// re-read their account and rewrite the same blocked status every minute.
// Only negative account evidence can use this cooldown. Payout success is
// never inferred from a stale cache.
const RETRY_WAIT_MS=15*60*1000;
const CODE='connect_account_unavailable';
function deferAccountLookup(ride,now=Date.now()){
  const at=Number(ride?.payoutCheckedAt);
  return ride?.needsPayout===true && ride?.payoutPending===true &&
    ride?.payoutBlockedCode===CODE &&
    Number.isFinite(at) && at>0 && at<=now &&
    now-at<RETRY_WAIT_MS;
}
module.exports={RETRY_WAIT_MS,CODE,deferAccountLookup};
