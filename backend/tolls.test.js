const assert = require('node:assert/strict');
const { parseHereTolls } = require('./tolls');

const clear = parseHereTolls({ routes:[{ sections:[{}] }] });
assert.deepEqual(clear, { status:'clear', tollCents:0, provider:'here' });

const tolled = parseHereTolls({ routes:[{ sections:[
  { tolls:[{ fares:[{ id:'a', price:{ value:1.75, currency:'USD' } }] }] },
  { tolls:[{ fares:[{ id:'a', price:{ value:1.75, currency:'USD' } }] }, { fares:[{ id:'b', convertedPrice:{ value:0.5, currency:'USD' } }] }] },
] }] });
assert.equal(tolled.status,'tolled');
assert.equal(tolled.tollCents,225,'duplicate fare ids count once');

// HERE may quote several mutually exclusive ways to pay ONE toll.
const alternativePayments = { routes:[{ sections:[{ tolls:[{ fares:[
  { id:'pass', price:{ value:1.0, currency:'USD' }, paymentMethods:['transponder'] },
  { id:'plate', price:{ value:1.5, currency:'USD' }, paymentMethods:['videoToll'] },
] }] }] }] };
const ambiguous = parseHereTolls(alternativePayments);
assert.equal(ambiguous.status, 'unknown', 'never add SunPass and plate alternatives');
assert.equal(ambiguous.reason, 'ambiguous_toll_payment_method');
assert.equal(parseHereTolls(alternativePayments,{paymentMethod:'transponder'}).tollCents,100);
assert.equal(parseHereTolls(alternativePayments,{paymentMethod:'videoToll'}).tollCents,150);
assert.equal(parseHereTolls(alternativePayments,{paymentMethod:'cash'}).status,'unknown');
assert.equal(parseHereTolls({routes:[{sections:[{tolls:[{fares:[]}]}]}]}).status,'unknown');

const unavailable = parseHereTolls({ routes:[{ sections:[{ notices:[{ code:'tollsDataUnavailable' }] }] }] });
assert.equal(unavailable.status,'unknown');
assert.equal(unavailable.tollCents,null);

const unpriced = parseHereTolls({ routes:[{ sections:[{ tolls:[{ fares:[{ id:'x' }] }] }] }] });
assert.equal(unpriced.status,'unknown');

const fs=require('node:fs'), path=require('node:path');
const authority=fs.readFileSync(path.join(__dirname,'fareauthority.js'),'utf8');
const server=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
assert.ok(authority.includes('resolveTollsCostAware(body.pickup, body.dest, { route: selectedRoute, routeAttempted: true })'),'fare authority passes the same selected road route to cost-aware toll resolution');
assert.ok(authority.includes('routeCar(body.pickup, body.dest)'),'fare authority selects one road route before pricing and toll resolution');
assert.ok(server.includes("code: 'toll_unavailable'"),'Travel paths expose fail-closed toll state');
assert.ok(!/req\.body[^\n]*tollCents/.test(server),'client toll amount is never authoritative');
console.log('all toll-authority tests passed');

const streets=fs.readFileSync(path.join(__dirname,'streets.js'),'utf8');
const tolls=fs.readFileSync(path.join(__dirname,'tolls.js'),'utf8');
assert.ok(streets.includes('steps=true'),'OSRM exposes route steps for free toll-class detection');
assert.ok(streets.includes("i.classes.includes('toll')"),'OSRM route checks OSM toll class');
assert.ok(tolls.includes("region?.tollCoverage?.certified === true"),'OSRM negative bypass requires certified official-authority market coverage');
assert.ok(!tolls.includes("provider: 'osrm-osm', reason: 'route_has_no_toll_class'"),'uncertified OSM negative cannot silently become zero toll');
assert.ok(tolls.includes("opts.routeAttempted === true"),'toll authority cannot select a second route after fare routing was attempted');
assert.ok(tolls.includes("reason: 'authoritative_route_unavailable'"),'missing authoritative route becomes unknown, never a second-route toll answer');

// A route supplied by OSRM/OTP must not silently inherit tolls from another
// separately calculated HERE route with the same endpoints.
const { resolveTollsCostAware } = require('./tolls');
resolveTollsCostAware(
  {lat:25.76,lng:-80.21},{lat:25.73,lng:-80.24},
  {route:{provider:'osrm',tollRelevant:true,distanceMeters:3000,durationSec:250},routeAttempted:true}
).then(out => {
  assert.equal(out.status,'unknown');
  assert.equal(out.reason,'unmatched_toll_route');
  console.log('PASS: unmatched HERE route never authorizes toll charge');
}).catch(e=>{console.error(e);process.exitCode=1;});
