'use strict';
// No live Firestore/Stripe or Traveler data. Regression for photographed Cancel trap.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const {cancelTravel}=require('./travelmoney');
async function onePass(){
 const app=read('app/ride.tsx');
 const ctx=read('src/state/RideContext.tsx');
 assert(app.includes('Leaving the view never tells the server to cancel an existing booking'),
   'unavailable dispatch has a distinct non-cancelling Home exit');
  assert(/<Pressable accessibilityRole="button" onPress=\{\(\) => router\.dismissTo\('\/'\)\} hitSlop=\{8\}\s+style=\{\{ minHeight: 44, justifyContent: 'center' \}\}>/.test(app),
   'return Home must work before opening Cancel confirmation');
 assert.equal((app.match(/accessibilityRole="button" onPress=\{\(\) => router\.dismissTo\('\/'\)\}/g)||[]).length,3,
   'pre-cancel dispatch failure and both post-failure states each offer Return Home');
 assert.equal((app.match(/t\('traveler\.contactSupport'\)/g)||[]).length,2,
   'support must be available for either failed Cancel state');
 assert(ctx.includes("if (paymentRef.current.status !== 'idle' || preparedIdRef.current) return false"),
   'only truly unprepared/unpaid Travel may exit without server confirmation');
 assert(ctx.includes('dispatchGenerationRef.current++;'),
   'late prepare must never start PaymentSheet after Cancel');
 assert(ctx.includes('if (!result.ok) return false'),
   'do not abandon a possibly paid Travel following a server failure');
 for(const language of ['en','es','fr','de','it']){
  const txt=read('src/i18n/'+language+'.ts');
  assert(/cancelFailed:\s*["']/.test(txt),'localized uncertain outcome required for '+language);
 }
 const ride={travelerUid:'traveler',status:'awaiting_assignment',paymentIntentId:'pi_synthetic'};
 const readRef={
  async get(){return {exists:true,data:()=>structuredClone(ride)};},
  async set(fields){Object.assign(ride,fields);},
  async update(fields){Object.assign(ride,fields);}
 };
 const db={collection(name){assert.equal(name,'rides');return {doc(id){assert.equal(id,'ride_synthetic');return readRef}};},
  runTransaction:async fn=>fn({get:x=>x.get(),update:(x,v)=>x.update(v)})};
 const deps={
  refundableFor:async()=>({cents:2000,reason:null}),
  refundTravel:async()=>({ok:false,error:'synthetic provider timeout'}),
 };
 const out=await cancelTravel({db,uid:'traveler',rideId:'ride_synthetic',deps});
 assert.equal(out.status,202,'committed cancellation is not undone by refund provider outage');
 assert.equal(out.body.ok,true);
 assert.equal(out.body.refundPending,true);
 assert.equal(out.body.refunded,false,'no claim of completed refund');
 assert.equal(ride.status,'cancelled');
 assert.equal(ride.refundPending,true,'durable owed refund remains');
 assert.equal(ride.refundId,undefined,'no fictitious refund id');
 const cases=[
  ['Stripe not configured',false,{}],
  ['payment lookup throws',true,{refundableFor:async()=>{throw Error('provider offline')}}],
  ['unpaid-intent cancellation throws',true,{refundableFor:async()=>({cents:0,reason:'provider unknown'}),cancelUnpaidIntent:async()=>{throw Error('provider offline')}}],
  ['refund API throws after cancel commit',true,{refundableFor:async()=>({cents:2000}),refundTravel:async()=>{throw Error('refund timeout')}}],
 ];
 for(const [name,stripeConfigured,caseDeps] of cases){
  Object.assign(ride,{status:'awaiting_assignment',paymentIntentId:'pi_synthetic',refundId:null,refundPending:false,cancelledFrom:null});
  const result=await cancelTravel({db,uid:'traveler',rideId:'ride_synthetic',stripeConfigured,deps:caseDeps});
  assert.equal(result.status,202,name+': cancellation already committed, awaiting refund proof');
  assert.equal(result.body.cancelled,true,name);
  assert.equal(result.body.refundPending,true,name);
  assert.equal(result.body.refunded,false,name);
  assert.equal(ride.status,'cancelled',name);
  assert.equal(ride.refundPending,true,name);
  assert.equal(ride.refundId,null,name+': no invented provider receipt');
 }
}
(async()=>{await onePass();await onePass();console.log('PASS twice: Cancel exits, missing Stripe, provider exceptions and durable pending-refund truth');})()
 .catch(e=>{console.error(e);process.exitCode=1;});
