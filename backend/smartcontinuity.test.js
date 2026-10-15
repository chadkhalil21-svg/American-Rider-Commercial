const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const ride=fs.readFileSync(path.join(__dirname,'..','src','state','RideContext.tsx'),'utf8');
const smart=fs.readFileSync(path.join(__dirname,'smart.js'),'utf8');
const { journeyFor }=require('./fareauthority');
const money=fs.readFileSync(path.join(__dirname,'travelmoney.js'),'utf8');

// Process death / restart: journey envelope persists, but it cannot grant authority.
assert.ok(ride.includes("SMART_JOURNEY_STORAGE_KEY = 'american-rider.smart-journey.v1'"));
assert.ok(ride.includes('AsyncStorage.getItem(SMART_JOURNEY_STORAGE_KEY)'),'restart must hydrate Smart Travel continuation');
assert.ok(ride.includes('AsyncStorage.setItem(SMART_JOURNEY_STORAGE_KEY'),'journey mutations must persist');
assert.ok(ride.includes('AsyncStorage.removeItem(SMART_JOURNEY_STORAGE_KEY'),'completion/cancellation must remove persisted continuation');
function dbWith(rows){
  return { collection(){
    const q={filters:[],where(k,_op,v){this.filters.push([k,v]);return this;},limit(){return this;},async get(){
      const matches=rows.filter((x)=>this.filters.every(([k,v])=>String(x[k]||'')===String(v)));
      return {docs:matches.map((x)=>({data:()=>x}))};
    }};
    return q;
  }};
}

// Cancellation/replan: a cancelled car Travel destroys the continuation instead of silently
// continuing an obsolete transit itinerary.
const cancel=ride.slice(ride.indexOf('const cancelRide:'),ride.indexOf('const threadFor',ride.indexOf('const cancelRide:')));
assert.ok(cancel.includes('smartJourneyRef.current = null')&&cancel.includes('setSmartJourney(null)'),'cancelled Smart car leg must end the journey');

// Every new Smart car leg starts from its own station or selected pickup, never a
// manually moved pin left over from Travel 1. The synchronous dispatch ref and the
// React state must both be cleared before the leg-2 departure/coordinates are set.
const legTwo = ride.slice(ride.indexOf('const beginSmartLeg ='),ride.indexOf('const endSmartJourney ='));
assert.ok(legTwo.includes('pickupPinRef.current = null;'),'leg 2 must reset the dispatch pickup override');
assert.match(legTwo, /setPickupPin\(null\);[\s\S]*setDeparture\(\{ name: plan\.to\.name/,'leg 2 must clear stale UI/quote pin before setting its station');

// Unknown agency fare: never represented as a known zero-dollar fare.
assert.ok(smart.includes('if (cents == null) out.fareUnknown = true'));
assert.ok(smart.includes('const transitFareUnknown = ours.some((l) => l.fareUnknown)'));

// Two-car charge reconciliation: preview and actual authority use the same journey continuation.
assert.ok(smart.includes('const q1 = quote(first.cents'));
assert.ok(smart.includes('const q2 = quote(second.cents'));
assert.ok(ride.includes("journeyNo: smartJourneyRef.current?.stage === 'leg2' ? smartJourneyRef.current.leg1No ?? null : null"));
assert.ok(money.includes('expectedTripNo: ride.tripNo || null'),'settlement must bind payout to the Travel payment/number');

(async()=>{
  const base={travelerUid:'u',tripNo:'AR-LEG1',paymentIntentId:'pi_1',status:'completed',travelCostCents:1000};
  assert.ok(await journeyFor({db:dbWith([base]),uid:'u',journeyNo:'AR-LEG1'}),'completed paid leg 1 must authorize continuation after restart');
  assert.equal(await journeyFor({db:dbWith([{...base,status:'accepted'}]),uid:'u',journeyNo:'AR-LEG1'}),null,'unfinished leg 1 must not authorize continuation after restart');
  assert.equal(await journeyFor({db:dbWith([{...base,paymentIntentId:null}]),uid:'u',journeyNo:'AR-LEG1'}),null,'unpaid leg 1 must not authorize continuation after restart');
  console.log('all Smart Travel restart/cancellation/authority invariants passed');
})().catch((e)=>{console.error(e);process.exitCode=1;});
