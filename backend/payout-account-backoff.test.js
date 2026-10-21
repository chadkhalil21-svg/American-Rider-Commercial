'use strict';
const assert=require('node:assert/strict');
const {deferAccountLookup,RETRY_WAIT_MS,CODE}=require('./payout-account-backoff');
const now=1800000000000;
const base={needsPayout:true,payoutPending:true,payoutBlockedCode:CODE,
 payoutCheckedAt:now-1000};
assert.equal(RETRY_WAIT_MS,15*60*1000);
assert.equal(deferAccountLookup(base,now),true);
assert.equal(deferAccountLookup({...base,payoutCheckedAt:now-RETRY_WAIT_MS},now),false);
assert.equal(deferAccountLookup({...base,payoutBlockedCode:'transfer_provider_ambiguous'},now),false);
assert.equal(deferAccountLookup({...base,payoutPending:false},now),false);
assert.equal(deferAccountLookup({...base,needsPayout:false},now),false);
assert.equal(deferAccountLookup({...base,payoutCheckedAt:now+1},now),false);
assert.equal(deferAccountLookup({...base,payoutCheckedAt:null},now),false);
for(let minute=0;minute<1440;minute++){
 const last=Math.floor((minute-1)/15)*15; // previous check; the due minute is not cached
 const record={...base,payoutCheckedAt:now+last*60000};
 assert.equal(deferAccountLookup(record,now+minute*60000),minute%15!==0);
}
console.log('PASS: stuck Connect account receives 15-minute automatic retry, never caches approval or misses a due retry');
