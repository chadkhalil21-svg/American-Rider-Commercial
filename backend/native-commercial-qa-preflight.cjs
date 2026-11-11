'use strict';
// Native commercial TEST preflight. No booking, transfers, capture or production calls.
// Fail closed before allowing native flows to start.
const {isolatedNativeCommercialQa}=require('./native-qa-isolation');
async function main(){
  if(!isolatedNativeCommercialQa()){
    throw Error('Native paid QA refused: require local disposable Firebase, explicit AR_NATIVE_COMMERCIAL_QA=1, sk_test and pk_test; NEVER production.');
  }
  const {safeSandboxSecretKey}=require('./stripe-test-key-policy');
  const key=safeSandboxSecretKey(process.env.STRIPE_SECRET_KEY);
  if(!key)throw Error('Valid Stripe TEST-only credential unavailable');
  const stripe=require('stripe')(key,{apiVersion:'2024-06-20',maxNetworkRetries:1});
  const balance=await stripe.balance.retrieve();
  if(balance?.livemode!==false)throw Error('Stripe API did not independently verify TEST account');
  for(const [name,url] of [
    ['Firebase Auth','http://127.0.0.1:9099/emulator/v1/projects/demo-american-rider-qa/config'],
    ['American Rider backend','http://127.0.0.1:4242/health']
  ]){
    const ctrl=new AbortController();
    const tm=setTimeout(()=>ctrl.abort(),8000);
    try{
      const response=await fetch(url,{signal:ctrl.signal});
      if(!response.ok)throw Error('response '+response.status);
    }catch(e){throw Error(name+' LOCAL QA endpoint missing: '+e.message);}
    finally{clearTimeout(tm);}
  }
  console.log('PASS: TEST Stripe verified by provider; local Firebase/backend reachable; no production key or endpoint.');
  console.log('LIMIT: preflight is not a native booking or paid commercial journey. It only permits the next stage.');
}
main().catch(e=>{console.error('NATIVE_COMMERCIAL_PREFLIGHT=BLOCKED:',e.message);process.exitCode=1;});
