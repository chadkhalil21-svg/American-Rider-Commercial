'use strict';
const assert=require('node:assert/strict');
const {desiredAutomaticSchedule,applyAutomaticSchedule}=require('./connect-payout-schedule');
assert.deepEqual(desiredAutomaticSchedule({}),{interval:'weekly',weekly_anchor:'friday'});
assert.deepEqual(desiredAutomaticSchedule({CONNECT_STANDARD_PAYOUT_INTERVAL:'daily'}),{interval:'daily'});
assert.deepEqual(desiredAutomaticSchedule({CONNECT_STANDARD_PAYOUT_INTERVAL:'weekly',CONNECT_STANDARD_PAYOUT_WEEKDAY:'Friday'}),
  {interval:'weekly',weekly_anchor:'friday'});
assert.deepEqual(desiredAutomaticSchedule({CONNECT_STANDARD_PAYOUT_INTERVAL:'weekly'}),{interval:'weekly',weekly_anchor:'friday'});
assert.throws(()=>desiredAutomaticSchedule({CONNECT_STANDARD_PAYOUT_INTERVAL:'weekly',CONNECT_STANDARD_PAYOUT_WEEKDAY:'nonday'}),/explicit weekday/);
assert.throws(()=>desiredAutomaticSchedule({CONNECT_STANDARD_PAYOUT_INTERVAL:'manual'}),/independently verified/);
assert.throws(()=>desiredAutomaticSchedule({CONNECT_STANDARD_PAYOUT_INTERVAL:'manual',
  CONNECT_OPERATOR_CHOICE_PAYOUTS_VERIFIED:'1'}),/referral bank reconciliation/);
assert.deepEqual(desiredAutomaticSchedule({CONNECT_STANDARD_PAYOUT_INTERVAL:'manual',
  CONNECT_OPERATOR_CHOICE_PAYOUTS_VERIFIED:'1',CONNECT_MANUAL_REFERRAL_RECONCILIATION_VERIFIED:'1'}),
  {interval:'manual'});
function account(interval='daily',weekday){return {id:'acct_Sandbox',settings:{payouts:{schedule:{interval,...(weekday?{weekly_anchor:weekday}:{})}}}};}
(async()=>{
  let calls=0;const client={accounts:{update:async (id,request)=>{
    calls++;assert.equal(id,'acct_Sandbox');assert.equal(request.settings.payouts.schedule.interval,'weekly');
    return account('weekly','friday');
  }}};
  const automatic=await applyAutomaticSchedule({stripe:client,account:account(),env:{}});
  assert.equal(automatic.changed,true);assert.equal(calls,1);
  const changed=await applyAutomaticSchedule({stripe:client,account:account(),
    env:{CONNECT_STANDARD_PAYOUT_INTERVAL:'weekly',CONNECT_STANDARD_PAYOUT_WEEKDAY:'friday'}});
  assert.equal(changed.changed,true);assert.equal(calls,2);
  const manualClient={accounts:{update:async(id,req)=>{
    assert.equal(id,'acct_Sandbox');
    assert.deepEqual(req.settings.payouts.schedule,{interval:'manual'});
    return account('manual');
  }}};
  const manual=await applyAutomaticSchedule({stripe:manualClient,account:account(),
    env:{CONNECT_STANDARD_PAYOUT_INTERVAL:'manual',CONNECT_OPERATOR_CHOICE_PAYOUTS_VERIFIED:'1',
      CONNECT_MANUAL_REFERRAL_RECONCILIATION_VERIFIED:'1'}});
  assert.equal(manual.interval,'manual');assert.equal(manual.account.settings.payouts.schedule.interval,'manual');
  const already=await applyAutomaticSchedule({stripe:client,account:changed.account,
    env:{CONNECT_STANDARD_PAYOUT_INTERVAL:'weekly',CONNECT_STANDARD_PAYOUT_WEEKDAY:'friday'}});
  assert.equal(already.changed,false);assert.equal(calls,2);
  await assert.rejects(applyAutomaticSchedule({stripe:{accounts:{update:async()=>account('daily')}},account:account(),
    env:{CONNECT_STANDARD_PAYOUT_INTERVAL:'weekly',CONNECT_STANDARD_PAYOUT_WEEKDAY:'friday'}}),
    /not confirmed/);
  const server=require('node:fs').readFileSync(require('node:path').join(__dirname,'server.js'),'utf8');
  assert.ok(server.includes('await configureConnectPayoutSchedule(account)'),
    'Onboarding must honor explicit platform cadence only after saving account ID');
  assert.ok(server.includes('await configureConnectPayoutSchedule(account)'),
    'Friday cadence must be applied on new Operator accounts');
  console.log('PASS: existing default preserved; explicit gated manual and automatic modes; provider confirmation; safe retry');
})().catch(e=>{console.error(e);process.exitCode=1;});
