'use strict';
// American Rider: deterministic lower-bound traffic accounting. OFFLINE ONLY.
const DEFAULTS=Object.freeze({operatorFactor:1.5,presenceSeconds:90,gpsSeconds:15,tripMinutes:60,observedHours:1});
function positive(value,name){if(!Number.isFinite(value)||value<=0)throw Error(name+' must be positive and finite');return value;}
function plan(activeTravels,options={}){
  const count=positive(activeTravels,'activeTravels');
  if(!Number.isSafeInteger(count))throw Error('activeTravels must be a safe integer');
  const a={...DEFAULTS,...options};
  for(const k of Object.keys(DEFAULTS))positive(a[k],k);
  const operators=Math.ceil(count*a.operatorFactor);
  const apiPresencePerSecond=operators/a.presenceSeconds;
  const firestorePositionWritesPerSecond=count/a.gpsSeconds;
  const replacementTravelStartsPerSecond=count/(a.tripMinutes*60);
  const seconds=a.observedHours*3600;
  return {activeTravels:count,onDutyOperators:operators,observedHours:a.observedHours,
    assumptions:a,apiPresenceRequestsPerSecond:apiPresencePerSecond,
    firestorePositionWritesPerSecond,replacementTravelStartsPerSecond,
    apiPresenceRequestsInWindow:apiPresencePerSecond*seconds,
    firestorePositionWritesInWindow:firestorePositionWritesPerSecond*seconds,
    replacementTravelStartsInWindow:replacementTravelStartsPerSecond*seconds,
    excluded:['booking and quote API calls','payment webhooks and payouts',
      'dispatch scans and safety sweeps','Firestore listeners and other reads',
      'provider calls, retries and duplicate network requests'],
    certifiedCapacity:false};
}
function cli(args=process.argv.slice(2)){
  const active=args.filter(x=>!x.startsWith('--'));
  if(active.length===0)active.push('100','1000','10000','100000');
  const flag=args.find(x=>x.startsWith('--hours='));
  const observedHours=flag?Number(flag.slice('--hours='.length)):DEFAULTS.observedHours;
  const rows=active.flatMap(x=>x.split(',')).map(x=>plan(Number(x),{observedHours}));
  const round=n=>Math.round(n*100)/100;
  console.log('OFFLINE PLANNING ONLY | No measured capacity or certified provider quotas.');
  console.log('Active | Operators | API presence/s | GPS Firestore writes/s | New Travels/s | API presence/period | GPS writes/period');
  for(const x of rows)console.log([x.activeTravels,x.onDutyOperators,
    round(x.apiPresenceRequestsPerSecond),round(x.firestorePositionWritesPerSecond),
    round(x.replacementTravelStartsPerSecond),round(x.apiPresenceRequestsInWindow),
    round(x.firestorePositionWritesInWindow)].join(' | '));
  console.log('Window: '+observedHours+' hour(s). API counts omit booking, payment, safety and other calls. GPS writes go directly to Firebase.');
  console.log('Google 500/50/5 ramp, indexes, hotspot avoidance and real-device tests are required before capacity claims.');
  return rows;
}
if(require.main===module)cli();
module.exports={plan,cli,DEFAULTS};
