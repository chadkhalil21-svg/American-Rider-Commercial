'use strict';
const assert=require('node:assert/strict');
const {recordOperatorMarketSelection}=require('./operator-onboarding-start');
const store=new Map();
let writes=0;
function fakeDb(){
  return {collection:name=>{
    assert.equal(name,'users');
    return {doc:id=>({id})};
  },runTransaction:async callback=>callback({
    get:async ref=>({exists:store.has(ref.id),data:()=>store.get(ref.id)}),
    set:(ref,patch,{merge})=>{
      assert.equal(merge,true);
      writes++;
      store.set(ref.id,{...(store.get(ref.id)||{}),...patch});
    },
  })};
}
(async()=>{
 const db=fakeDb(),now=Date.UTC(2026,9,24,12);
 const active={id:'fl-miami-dade',status:'active'};
 const later={id:'fl-broward',status:'active'};
 const closed={id:'co-denver',status:'waitlist'};
 const first=await recordOperatorMarketSelection({db,uid:'new',market:active,via:'declared',now});
 assert.equal(first.firstActiveSelection,true);
 assert.equal(store.get('new').operatorOnboardingStartedAt,now);
 const repeat=await recordOperatorMarketSelection({db,uid:'new',market:later,via:'declared',now:now+86400000});
 assert.equal(repeat.firstActiveSelection,false);
 assert.equal(store.get('new').operatorOnboardingStartedAt,now,'immutable on return visits');
 const beforeRepeat=writes,priorMarket=store.get('new').operatingMarket;
 const unchanged=await recordOperatorMarketSelection({
   db,uid:'new',market:later,via:'declared',now:now+2*86400000,
 });
 assert.equal(unchanged.firstActiveSelection,false);
 assert.equal(writes,beforeRepeat,'repeated unchanged market must avoid a billable write');
 assert.deepEqual(store.get('new').operatingMarket,priorMarket,'unchanged selection retains prior timestamp');
 const beforeChanged=writes;
 await recordOperatorMarketSelection({db,uid:'new',market:active,via:'declared',now:now+3*86400000});
 assert.equal(writes,beforeChanged+1,'a genuine market selection change still writes once');
 await recordOperatorMarketSelection({db,uid:'wait',market:closed,via:'declared',now});
 assert.equal(store.get('wait').operatorOnboardingStartedAt,undefined,'unopened area cannot begin Operator onboarding');
 await recordOperatorMarketSelection({db,uid:'wait',market:active,via:'declared',now:now+10});
 assert.equal(store.get('wait').operatorOnboardingStartedAt,undefined,
   'a legacy prior market-selection record must not be relabeled as a new recruit');
 store.set('legacy',{qualification:{qualified:true},stripeAccountId:'acct_existing'});
 const legacy=await recordOperatorMarketSelection({db,uid:'legacy',market:active,via:'declared',now});
 assert.equal(legacy.firstActiveSelection,false);
 assert.equal(store.get('legacy').operatorOnboardingStartedAt,undefined);
 await assert.rejects(recordOperatorMarketSelection({db,uid:'',market:active,via:'declared',now}),/invalid_operator/);
 console.log('PASS first active market enrollment only, immutable retries, closed area, legacy conservatism');
})().catch(e=>{console.error(e);process.exitCode=1});
