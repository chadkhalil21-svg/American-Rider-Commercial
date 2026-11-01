'use strict';
const assert=require('node:assert/strict');
const {verifiedSelectedCard}=require('./selected-card-issuer');
const pm='pm_SelectCard1234',customer='cus_Traveler1234';
const client=card=>({paymentMethods:{retrieve:async id=>{assert.equal(id,pm);return card;}}});
(async()=>{
 const base={id:pm,type:'card',customer,card:{country:'US',brand:'visa'}};
 const args={stripe:client(base),customerId:customer,paymentMethodId:pm};
 assert.deepEqual(await verifiedSelectedCard(args),{ok:true,paymentMethodId:pm,cardCountry:'US'});
 assert.equal((await verifiedSelectedCard({...args,stripe:client({...base,card:{country:'GB'}})})).cardCountry,'GB');
 for(const bad of [
   {...base,customer:'cus_OtherPerson'}, {...base,type:'us_bank_account'},
   {...base,card:{country:null}}, {...base,id:'pm_Different1234'},
 ])assert.equal((await verifiedSelectedCard({...args,stripe:client(bad)})).ok,false);
 assert.equal((await verifiedSelectedCard({...args,paymentMethodId:'pm_fake/bad'})).ok,false);
 assert.equal((await verifiedSelectedCard({...args,stripe:{paymentMethods:{retrieve:async()=>{throw Error('unavailable');}}}})).ok,false);
 console.log('PASS authenticated Stripe-owned card issuer: domestic, international, rejection and outage; no real money');
})().catch(e=>{console.error(e);process.exitCode=1;});
