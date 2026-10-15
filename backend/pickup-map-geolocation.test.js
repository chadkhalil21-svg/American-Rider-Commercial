'use strict';
// Test the real, pure TypeScript map-origin rule with no GPS, passenger, money or web access.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const root=path.join(__dirname,'..');
const helper=fs.readFileSync(path.join(root,'src','pickupMapOrigin.ts'),'utf8');
const js=ts.transpileModule(helper,{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
const box={exports:{}};
vm.runInNewContext(js,box,{timeout:1000});
const {pickupMapOrigin,validMapCoordinate}=box.exports;
const equal=(actual,expected)=>assert.equal(JSON.stringify(actual),JSON.stringify(expected));
equal(pickupMapOrigin(null,null),null);
equal(pickupMapOrigin(undefined,{lat:25.77,lng:-80.2}),null);
equal(pickupMapOrigin(null,{lat:25.77,lng:-80.2,resolved:false}),null);
equal(pickupMapOrigin(null,{lat:40.713,lng:-74.006,resolved:true}),{latitude:40.713,longitude:-74.006});
equal(pickupMapOrigin({lat:34.0522,lng:-118.2437},{lat:25.77,lng:-80.2,resolved:true}),{latitude:34.0522,longitude:-118.2437});
equal(pickupMapOrigin({lat:NaN,lng:-80.2},{lat:26.1,lng:-80.1,resolved:true}),{latitude:26.1,longitude:-80.1});
for(const bad of [NaN,Infinity,-Infinity,'25',null,undefined,90.01,-90.01])
 assert.equal(validMapCoordinate(bad,-80),false);
for(const bad of [180.01,-180.01,NaN,Infinity,undefined])
 assert.equal(validMapCoordinate(25,bad),false);
assert.equal(validMapCoordinate(0,0),true,'global zero coordinate is legitimate');
assert.equal(validMapCoordinate(90,180),true,'boundary coordinates are legitimate');
const ios=fs.readFileSync(path.join(root,'app','pickup-map.ios.tsx'),'utf8');
assert.doesNotMatch(ios,/const MIAMI\s*=|setStart\(MIAMI\)|25\.7743|-80\.1937/,
 'The iOS pin map must not substitute a hardcoded Miami pickup');
assert.match(ios,/pickupMapOrigin\(ride\.pickupPin, ride\.departure\)/);
assert.match(ios,/validMapCoordinate\(pos\.coords\.latitude, pos\.coords\.longitude\)/);
assert.match(ios,/setLocationUnavailable\(true\)/);
assert.match(ios,/locationUnavailable\s*\?/);
assert.match(ios,/if \(start\) void describe\(start\)/,
 'Untouched initial center needs reverse-geocoding before confirmation');
assert.match(ios,/disabled=\{looking \|\| label === t\('traveler\.moveMapToSetPickup'\)\}/,
 'Never allow pickup confirmation against an unverified address');
assert.match(ios,/addressRevision\.current === revision/,
 'Late geocoding replies may not relabel a newer pin');
for(const locale of ['en','es','fr','it','de']) {
 const t=fs.readFileSync(path.join(root,'src','i18n',locale+'.ts'),'utf8');
 assert.match(t,/pickupMapLocationUnavailable:/,'location-unavailable message must be localized for '+locale);
}
console.log('PASS location-neutral pickup map: 10 synthetic origin cases, invalid GPS rejection, no Miami fallback, stale address and incomplete-label guards');
