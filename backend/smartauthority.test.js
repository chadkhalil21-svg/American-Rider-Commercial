const assert=require('node:assert/strict');
const { journeyFor, authoritativeFare }=require('./fareauthority');

function dbWith(rows){
  return {
    collection(){
      const q = {
        filters: [],
        where(field, op, value){ this.filters.push([field,value]); return this; },
        limit(){ return this; },
        async get(){
          const matches=rows.filter((x)=>this.filters.every(([k,v])=>String(x[k]||'')===String(v)));
          return { docs: matches.map((x)=>({ id:'a'.repeat(40), data:()=>x })) };
        },
      };
      return q;
    },
  };
}

(async()=>{
  const FIXED_NOW=Date.parse('2026-10-15T12:00:00Z');
  const base={travelerUid:'u',tripNo:'AR-1',paymentIntentId:'pi',status:'completed',completedAt:FIXED_NOW-1000,travelCostCents:1000,governmentFeeCents:0,tollCents:0,party:{mode:'teen',travelerName:'Ava',teenUid:'teen1',guardianUid:'u',familyLinkId:'fam1'}};
  const owned=await journeyFor({db:dbWith([base]),uid:'u',journeyNo:'AR-1',now:FIXED_NOW}); assert.ok(owned); assert.equal(owned.leg1RideId,'a'.repeat(40)); assert.deepEqual(owned.party,base.party,'leg 2 must inherit the authoritative first-leg party');
  assert.equal(await journeyFor({db:dbWith([{...base,journeyNo:'AR-0'}]),uid:'u',journeyNo:'AR-1'}),null,'leg 2 cannot become a new leg 1');
  assert.equal(await journeyFor({db:dbWith([{...base,status:'accepted'}]),uid:'u',journeyNo:'AR-1'}),null,'unfinished leg cannot subsidize leg 2');
  assert.equal(await journeyFor({db:dbWith([{...base,paymentIntentId:null}]),uid:'u',journeyNo:'AR-1'}),null,'unpaid leg cannot subsidize leg 2');
  assert.equal(await journeyFor({db:dbWith([{...base,travelerUid:'other'}]),uid:'u',journeyNo:'AR-1'}),null,'another Booker cannot reference this leg');
  assert.equal(await journeyFor({db:dbWith([{...base,journey:{journeyNo:'AR-0'}}]),uid:'u',journeyNo:'AR-1',now:FIXED_NOW}),null,'second car stored inside journey cannot become a new first car');
  assert.equal(await journeyFor({db:dbWith([{...base,smartContinuationRideId:'b'.repeat(40)}]),uid:'u',journeyNo:'AR-1',now:FIXED_NOW}),null,'claimed first leg cannot be reused');
  assert.equal(await journeyFor({db:dbWith([{...base,completedAt:FIXED_NOW-49*3600000}]),uid:'u',journeyNo:'AR-1',now:FIXED_NOW}),null,'stale first leg cannot create a subsidized new Travel');
  assert.equal(await journeyFor({db:dbWith([{...base,completedAt:FIXED_NOW+1}]),uid:'u',journeyNo:'AR-1',now:FIXED_NOW}),null,'future completion cannot establish a paid first leg');
  const invalid=await authoritativeFare({body:{pickup:{lat:25.76,lng:-80.19},dest:{lat:25.77,lng:-80.20},journeyNo:'AR-1'},uid:'u',db:dbWith([]),cardCountryFor:async()=> 'US'});
  assert.equal(invalid.invalidJourney,true,'named but invalid journey must fail closed rather than receive ordinary pricing');
  const server=require('node:fs').readFileSync(require('node:path').join(__dirname,'server.js'),'utf8');
  assert.ok(server.includes("const partyResult = priced.journey?.party"),'dispatch must prefer the recorded first-leg party over client party fields');
  console.log('✓ Smart Travel journey reference is owned, paid, completed, party-frozen, non-chainable and fail-closed');
})().catch(e=>{console.error(e);process.exitCode=1});
