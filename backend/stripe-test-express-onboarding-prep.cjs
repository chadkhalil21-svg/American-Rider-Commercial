'use strict';
// Founder-authorized, TEST-ONLY preparation of one disposable Express recipient.
// Never creates a real account, accepts Stripe terms on behalf of a human, or
// sends money. CI may rerun; an account fingerprint + Stripe idempotency prevent
// unlimited recipients being created across retries.
const fs=require('node:fs'), Stripe=require('stripe');
const {safeSandboxSecretKey}=require('./stripe-test-key-policy');
const key=safeSandboxSecretKey(process.env.STRIPE_TEST_SECRET_KEY);
if(!key){console.error('STOP: Protected Stripe TEST-only credential not supplied');process.exit(2);}
const stripe=new Stripe(key,{apiVersion:'2024-06-20',maxNetworkRetries:1,timeout:25000});
const TAG='ar_test_express_operator_20261029_v1';
const out={schema:1,mode:'TEST_ONLY',purpose:'express_operator_transfer_recipient_preparation',
  accountId:null,type:null,transferCapability:null,detailsSubmitted:null,requirementsDue:[],
  status:'NOT_CHECKED',remediation:null,realMoney:false};
const save=()=>{fs.mkdirSync('artifacts/stripe-test-travel',{recursive:true});
 fs.writeFileSync('artifacts/stripe-test-travel/test-express-onboarding.json',
 JSON.stringify(out,null,2)+'\n');};
(async()=>{
 try{
  const b=await stripe.balance.retrieve();
  if(b?.livemode!==false)throw Error('NOT_SANDBOX');
  const accounts=await stripe.accounts.list({limit:100});
  let recipient=accounts.data.find(a=>a.type==='express'&&a.capabilities?.transfers==='active');
  if(recipient){
   out.status='EXISTING_ACTIVE_TEST_RECIPIENT';
  }else{
   recipient=accounts.data.find(a=>a.type==='express'&&a.metadata?.ar_qa_test_recipient===TAG);
   if(!recipient){
    recipient=await stripe.accounts.create({
     type:'express',country:'US',business_type:'individual',
     email:'operator-test-20261029@example.invalid',
     capabilities:{transfers:{requested:true}},
     metadata:{ar_qa_test_recipient:TAG,ar_qa_only:'true'},
    },{idempotencyKey:'ar_qa_create_test_express_20261029_v1'});
    out.status='NEW_TEST_RECIPIENT_NEEDS_ONBOARDING';
   }else out.status='EXISTING_TEST_RECIPIENT_NEEDS_ONBOARDING';
  }
  if(!recipient?.id?.startsWith('acct_'))throw Error('ACCOUNT_CREATION_UNCONFIRMED');
  recipient=await stripe.accounts.retrieve(recipient.id);
  if(recipient.livemode!==false||recipient.type!=='express')throw Error('ACCOUNT_NOT_TEST_EXPRESS');
  out.accountId=recipient.id;
  out.type=recipient.type;out.transferCapability=recipient.capabilities?.transfers||'missing';
  out.detailsSubmitted=recipient.details_submitted===true;
  out.requirementsDue=(recipient.requirements?.currently_due||[]).map(String);
  if(recipient.capabilities?.transfers==='active'){
   out.status='TEST_TRANSFER_RECIPIENT_READY';
   console.log('PASS: TEST Express recipient has active transfers:',recipient.id);
  }else{
   out.status='TEST_EXPRESS_REQUIRES_HOSTED_ONBOARDING';
   out.remediation='Use the Stripe TEST/Sandbox dashboard to complete Stripe-hosted onboarding for this test Express connected account. This code cannot accept Stripe terms or represent a person.';
   console.log('ACTION REQUIRED: Stripe TEST Express recipient created/found:',recipient.id);
   console.log('STRIPE TRANSFERS:',out.transferCapability,'; details submitted:',out.detailsSubmitted);
   console.log('Current provider-required fields:',out.requirementsDue.join(', ')||'not itemized');
   console.log('No payment charge, transfer, payout or live account change created by this preparatory step.');
  }
 }catch(e){
  out.status='ERROR';
  out.errorCode=String(e.code||e.type||e.message||'unknown').slice(0,140);
  console.error('TEST recipient preparation failed:',out.errorCode);
  process.exitCode=1;
 }finally{save();}
})().catch(e=>{out.status='ERROR';out.errorCode=String(e.code||'unhandled');save();process.exitCode=1;});
