'use strict';
// Preserve the existing indexed (status, atMs) ordered dispatch query, but never
// fetch a distant future reservation merely to filter it out in JavaScript.
// All timestamps are server-owned milliseconds, not phone-provided due flags.
const WAITING_STATE_INTERVAL_MS=5*60*1000;
function dueReservationsQuery(db,now,windowMs,limit){
  if(!Number.isSafeInteger(now)||!Number.isSafeInteger(windowMs)||windowMs<0||
      !Number.isSafeInteger(limit)||limit<1)throw new RangeError('invalid scheduled sweep bounds');
  return db.collection('scheduled_rides')
    .where('status','==','reserved')
    .where('atMs','<=',now+windowMs)
    .orderBy('atMs','asc')
    .limit(limit);
}
// A waiting reservation remains eligible to be evaluated EVERY scheduled sweep.
// Only the repeated diagnostic write is reduced. A changed reason or missing
// checkpoint is recorded immediately; unchanged explanations refresh at most
// once in five minutes, so full-document listeners are not notified needlessly.
function shouldWriteWaitingState(prior,reason,now){
  if(typeof reason!=='string'||!Number.isSafeInteger(now))throw new TypeError('invalid waiting state');
  if(prior?.lastSweepResult!==reason)return true;
  const last=Number(prior?.lastSweepAt);
  return !Number.isFinite(last)||last<=0||last>now||now-last>=WAITING_STATE_INTERVAL_MS;
}
module.exports={dueReservationsQuery,shouldWriteWaitingState,WAITING_STATE_INTERVAL_MS};
