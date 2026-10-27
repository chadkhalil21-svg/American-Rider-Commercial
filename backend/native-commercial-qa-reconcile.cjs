'use strict';
// Independently query the SAME local-emulator Travel and real Stripe TEST objects
// after both native Maestro role scripts have interacted with the app.
// A green emulator navigation script is NOT proof of settlement without this.
const assert=require('node:assert/strict');
const {isolatedNativeQa}=require('./native-qa-isolation');
const {adminDb}=require('./firebase-admin');
const Stripe=require('stripe');
async function main(){
  assert.equal(isolatedNativeQa(),true,'Never query production Firestore for QA reconciliation');
  assert.match(process.env.STRIPE_SECRET_KEY||'',/^sk_test_/,'A sandbox key is required');
  const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);
  assert.equal((await stripe.balance.retrieve()).livemode,false,'Refuse live Stripe account');
  const db=adminDb();assert.ok(db,'Local Firestore unavailable');
  const records=await db.collection('rides').where('travelerUid','==','native-qa-traveler').limit(10).get();
  const rows=records.docs.map(d=>({id:d.id,...d.data()}));
  assert.equal(rows.length,1,'Exactly one locally booked test Travel required, not just screens');
  const ride=rows[0];
  assert.equal(ride.status,'completed','Native Operator did not complete the booked Travel');
  assert.equal(ride.operatorId,'native-qa-operator','Wrong operator fulfilled the Travel');
  assert.ok(ride.paymentIntentId?.startsWith('pi_'),'No travel-linked provider authorization');
  assert.ok(ride.transferId?.startsWith('tr_'),'No settled Operator transfer');
  const pi=await stripe.paymentIntents.retrieve(ride.paymentIntentId,{expand:['latest_charge']});
  assert.equal(pi.livemode,false,'Payment is not sandbox');
  assert.equal(pi.status,'succeeded','Stripe TEST payment not captured');
  assert.ok(pi.amount_received>0,'Stripe has no captured proceeds');
  assert.equal(String(pi.metadata?.rideId||''),String(ride.id),'Provider PaymentIntent belongs to different Travel');
  const transfer=await stripe.transfers.retrieve(ride.transferId);
  assert.equal(transfer.livemode,false,'Operator transfer not sandbox');
  assert.ok(transfer.amount>0,'Operator transfer amount missing');
  const account=(await db.collection('users').doc('native-qa-operator').get()).data()?.stripeAccountId;
  assert.equal(transfer.destination,account,'Transfer did not reach the intended TEST Connect account');
  assert.ok(!ride.operatorDemo&&!ride.synthetic,'A demo flag cannot certify commercial eligibility');
  console.log('PASS: one mobile-booked, native-Operator-completed, Stripe TEST captured and transferred Travel');
  console.log(JSON.stringify({platform:process.env.AR_NATIVE_PLATFORM,rideId:ride.id,
    paymentIntentId:pi.id,transferId:transfer.id,amountCapturedCents:pi.amount_received,
    transferredCents:transfer.amount,mode:'test'},null,2));
  console.log('NOT VERIFIED: real insurance/commercial regulatory authorization, external bank arrival, physical iPhone/Android wallet entitlement');
}
main().catch(e=>{console.error('NATIVE FULL COMMERCIAL JOURNEY FAILED:',e.message);process.exitCode=1;});
