'use strict';
// Real Stripe TEST-only verification of a disposable connected account's
// manual payout schedule. No live money, no actual bank payout, no customer.
const fs=require('node:fs');
const crypto=require('node:crypto');
const Stripe=require('stripe');
const {safeSandboxSecretKey}=require('./stripe-test-key-policy');
const secret=safeSandboxSecretKey(process.env.STRIPE_TEST_SECRET_KEY);
if(!secret){console.error('STOP: Stripe TEST secret only');process.exit(2);}
const stripe=new Stripe(secret,{apiVersion:'2024-06-20',maxNetworkRetries:1,timeout:25000});
const tag=crypto.randomBytes(10).toString('hex');
const report={kind:'STRIPE_TEST_MANUAL_PAYOUT_SCHEDULE',mode:'TEST_ONLY',
  commit:process.env.GITHUB_SHA||null,liveMoney:false,bankPayoutTested:false,
  recipient:'DISPOSABLE_TEST_ACCOUNT',steps:[],result:'FAIL'};
let accountId=null;
function step(name,pass){report.steps.push({name,status:pass?'PASS':'FAIL'});
  console.log((pass?'PASS':'FAIL')+' '+name);
  if(!pass)throw Error('Stripe TEST verification failed: '+name);
}
function save(){fs.mkdirSync('artifacts/operator-manual-payout-test',{recursive:true});
  fs.writeFileSync('artifacts/operator-manual-payout-test/evidence.json',
    JSON.stringify(report,null,2)+'\n');}
(async()=>{
 try{
  const balance=await stripe.balance.retrieve();
  step('Actual Stripe TEST API authenticated',balance.livemode===false);
  const a=await stripe.accounts.create({
   type:'express',country:'US',
   email:'manual-qa-'+tag+'@example.invalid',
   capabilities:{transfers:{requested:true}},
   metadata:{american_rider_test:'manual_payout_schedule',testRun:tag},
  },{idempotencyKey:'ar_test_manual_account_'+tag});
  accountId=a.id;
  console.log('TEST account metadata',JSON.stringify({object:a.object,type:a.type,country:a.country,livemode:a.livemode===true}));
  step('Disposable Stripe TEST account created',a.livemode!==true&&a.object==='account'&&a.type==='express'
    &&/^acct_[A-Za-z0-9]+$/.test(a.id));
  const updated=await stripe.accounts.update(accountId,{
   settings:{payouts:{schedule:{interval:'manual'}}}
  });
  step('Stripe TEST accepts manual connected-account schedule',
    updated.livemode!==true&&updated.settings?.payouts?.schedule?.interval==='manual');
  const actual=await stripe.accounts.retrieve(accountId);
  step('Stripe persisted manual schedule on the same account',
    actual.livemode!==true&&actual.settings?.payouts?.schedule?.interval==='manual');
  // A second update is NOT required. Our production applyAutomaticSchedule
  // additionally checks unchanged state and does not send duplicate API calls.
  report.result='PASS';
  console.log('PASS Stripe TEST manual payout configuration; no bank payout or fee incurred');
 }catch(err){
  report.errorCode=String(err.code||err.type||'unknown').slice(0,100);
  report.errorSummary=String(err.message||'').slice(0,180);
  console.error('FAIL Stripe TEST payout scheduling: '+report.errorCode+': '+report.errorSummary);
  process.exitCode=1;
 }finally{
  if(accountId){
   try{
    const deleted=await stripe.accounts.del(accountId);
    if(deleted.deleted!==true){report.result='FAIL';process.exitCode=1;}
    report.steps.push({name:'Deleted disposable TEST connected account',status:deleted.deleted?'PASS':'FAIL'});
   }catch(e){report.result='FAIL';process.exitCode=1;
    report.cleanupError=String(e.code||e.message||'unknown').slice(0,120);
    console.error('FAIL cleaning TEST account '+report.cleanupError);
   }
  }
  save();
 }
})().catch(e=>{console.error('FAIL unexpected TEST error '+String(e.message||e).slice(0,150));process.exitCode=1;save();});
