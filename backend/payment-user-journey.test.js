'use strict';
// End-to-end synthetic Traveler Wallet -> Add -> Set Default -> Remove ->
// Checkout / cancel / native exception, exercising the real app-side module.
// No device automation, user credentials, production endpoints, real funds.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const source=fs.readFileSync(path.join(__dirname,'../src/backend/payments.ts'),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{
  target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS
}}).outputText;
const events=[],methods=[];
let mode='live',initFailure=null,presentFailure=null,throwInit=false,throwPresent=false,
  missingMode=false,missingIntentId=false,os='android',sheetAction='setup';
const stripeNative={
  async initPaymentSheet(settings){
    events.push({kind:'sheet-init',settings});
    if(throwInit)throw Error('synthetic native initialization rejection');
    return initFailure?{error:{message:initFailure}}:{};
  },
  async presentPaymentSheet(){
    events.push({kind:'sheet-present'});
    if(throwPresent)throw Error('synthetic native wallet rejection');
    if(presentFailure)return {error:presentFailure};
    if(sheetAction==='setup'&&!methods.some(x=>x.id==='pm_Synthetic111')){
      methods.push({id:'pm_Synthetic111',type:'card',brand:'visa',last4:'4242',
        expMonth:12,expYear:2029,wallet:null,country:'US',isDefault:false});
    }
    return {};
  },
  async retrievePaymentIntent(){return {paymentIntent:{paymentMethod:{
    Card:{brand:'visa',last4:'4242'}}}};},
  async isPlatformPaySupported(){return true;}
};
async function mockFetch(url,opts={}){
  const suffix=String(url).replace('https://synthetic.local','');
  events.push({kind:'fetch',url:suffix,method:opts.method||'GET'});
  if(suffix==='/config')throw Error('unexpected second /config request during sheet');
  if(suffix==='/payment-methods')return {ok:true,json:async()=>({methods})};
  if(suffix==='/payment-methods/setup-intent')return {ok:true,json:async()=>({
    clientSecret:'seti_fixture_secret_abc',customerId:'cus_Synthetic',
    ephemeralKeySecret:'ek_fixture',...(missingMode?{}:{mode})})};
  if(suffix==='/payment-methods/default'){
    const id=JSON.parse(opts.body).paymentMethodId;
    methods.forEach(m=>m.isDefault=m.id===id);
    return {ok:true,json:async()=>({methods})};
  }
  if(suffix.startsWith('/payment-methods/')){
    const id=decodeURIComponent(suffix.split('/').pop());
    const i=methods.findIndex(m=>m.id===id);
    if(i>=0)methods.splice(i,1);
    return {ok:true,json:async()=>({methods})};
  }
  if(suffix==='/create-payment-intent'){
    sheetAction='checkout';
    return {ok:true,json:async()=>({
      clientSecret:'pi_Synthetic123_secret_abc',
      ...(!missingIntentId?{paymentIntentId:'pi_Synthetic123'}:{}),
      customerId:'cus_Synthetic',ephemeralKeySecret:'ek_fixture',
      ...(missingMode?{}:{mode}),breakdown:{travelerPays:2100}
    })};
  }
  throw Error('unexpected route '+suffix);
}
const module={exports:{}};
const context={module,exports:module.exports,fetch:mockFetch,console,
  require(name){
    if(name==='@stripe/stripe-react-native')return stripeNative;
    if(name==='react-native')return {Platform:{get OS(){return os;}}};
    if(name==='../config')return {PAYMENT_SERVER_URL:'https://synthetic.local'};
    if(name==='../firebase')return {auth:{currentUser:{getIdToken:async()=> 'synthetic_token'}}};
    if(name==='../i18n')return {t:key=>key};
    throw Error('unexpected module '+name);
  }};
vm.runInNewContext(js,context);
const p=module.exports;
const lastSheet=()=>events.filter(e=>e.kind==='sheet-init').at(-1)?.settings;
const reset=()=>{events.length=0;methods.length=0;mode='live';initFailure=null;presentFailure=null;
  throwInit=false;throwPresent=false;missingMode=false;missingIntentId=false;
  os='android';sheetAction='setup';};
(async()=>{
  for(let pass=0;pass<2;pass++){
    reset();
    assert.equal((await p.fetchPaymentMethods()).methods.length,0);
    assert.equal((await p.addPaymentMethod()).ok,true);
    assert.equal((await p.fetchPaymentMethods()).methods.length,1);
    assert.equal(lastSheet().googlePay.testEnv,false,'live Google Pay must not turn into test');
    assert.equal(events.filter(x=>x.url==='/config').length,0,'no redundant config call');
    const def=await p.setDefaultPaymentMethod('pm_Synthetic111');
    assert.equal(def.ok,true);assert.equal(def.methods[0].isDefault,true);
    const pay=await p.payForRide({destination:'Miami International Airport',rideId:'ride_synthetic'});
    assert.equal(pay.ok,true);assert.equal(pay.paymentIntentId,'pi_Synthetic123');
    assert.equal(pay.amountCents,2100);assert.equal(pay.methodLabel,'Visa ····4242');
    assert.equal(lastSheet().googlePay.testEnv,false);
    assert.equal(lastSheet().allowsDelayedPaymentMethods,false);
    assert.equal((await p.removePaymentMethod('pm_Synthetic111')).ok,true);
    assert.equal((await p.fetchPaymentMethods()).methods.length,0);
    assert.equal(events.filter(x=>x.url==='/config').length,0);

    reset();mode='test';
    assert.equal((await p.addPaymentMethod()).ok,true);
    assert.equal(lastSheet().googlePay.testEnv,true,'test backend must not use live Google Pay');
    reset();os='ios';mode='live';
    assert.equal((await p.addPaymentMethod()).ok,true);
    assert.equal(lastSheet().applePay.merchantCountryCode,'US');

    reset();presentFailure={code:'Canceled',message:'Canceled'};
    const canceled=await p.addPaymentMethod();
    assert.equal(canceled.ok,false);assert.equal(canceled.canceled,true);
    assert.equal(canceled.error,undefined);
    reset();initFailure='API key was missing';
    assert.equal((await p.addPaymentMethod()).error,'traveler.errPaymentUnavailableNoCharge');
    reset();throwInit=true;
    assert.equal((await p.addPaymentMethod()).error,'traveler.errPaymentUnavailableNoCharge');
    reset();throwPresent=true;
    assert.equal((await p.addPaymentMethod()).error,'traveler.errPaymentUnavailableNoCharge');

    reset();missingMode=true;
    assert.equal((await p.addPaymentMethod()).ok,false);
    assert.equal(events.filter(e=>e.kind==='sheet-init').length,0,'unknown mode cannot show sheet');
    reset();missingIntentId=true;
    assert.equal((await p.payForRide({destination:'Airport'})).ok,false);
    assert.equal(events.filter(e=>e.kind==='sheet-init').length,0,'missing intent identity cannot collect');
    reset();missingMode=true;
    assert.equal((await p.payForRide({destination:'Airport'})).ok,false);
    assert.equal(events.filter(e=>e.kind==='sheet-init').length,0);
    reset();throwPresent=true;
    assert.equal((await p.payForRide({destination:'Airport'})).error,
      'traveler.errPaymentUnavailableNoCharge');
    reset();presentFailure={code:'Canceled',message:'User closed'};
    const canceledCheckout=await p.payForRide({destination:'Airport'});
    assert.equal(canceledCheckout.ok,false);assert.equal(canceledCheckout.canceled,true);
  }
  const server=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
  assert.ok(server.includes('res.json({ ...result, feeLines: result.breakdown.feeLines, mode: keyMode })'));
  assert.ok(server.includes('return res.json({ ...setup, mode: keyMode })'));
  console.log('PASS TWICE: simulated new Traveler, add card, list, default, $21 checkout, delete; Apple Pay/Google Pay mode; cancellations, native failures, unknown mode, no extra /config; zero external calls');
})().catch(e=>{console.error(e);process.exitCode=1});
