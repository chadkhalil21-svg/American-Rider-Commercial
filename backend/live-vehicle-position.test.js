'use strict';
// Honest Operator location: same report consumed by the actual Traveler map.
// No network, mock database, physical phone, location permission, or paid Travel.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const ts=require('typescript');
const root=path.join(__dirname,'..');
const js=ts.transpileModule(fs.readFileSync(path.join(root,'src','liveVehiclePosition.ts'),'utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
const box={exports:{}};
vm.runInNewContext(js,box,{timeout:1000});
const {validLiveVehiclePosition:position}=box.exports;
const now=1800000000000;
const base={operatorId:'legitimate-operator',status:'accepted',opLat:25.77,opLng:-80.2,opAt:now-15000};
const check=(data,want)=>assert.equal(JSON.stringify(position(data,now)),JSON.stringify(want));
check(base,{lat:25.77,lng:-80.2,at:now-15000});
check({...base,status:'onboard'},{lat:25.77,lng:-80.2,at:now-15000});
for(const [name,change] of Object.entries({
 absent:null,missing_operator:{operatorId:''},demo:{operatorDemo:true},released:{releasedAt:now-1},
 completed:{status:'completed'},cancelled:{status:'cancelled'},stale:{opAt:now-60001},
 future:{opAt:now+5001},missing_time:{opAt:null},bad_lat:{opLat:99},
 bad_lng:{opLng:-181},string_lat:{opLat:'25.77'},not_number:{opLat:NaN},
 lost_lat:{opLat:undefined},unpaid:{status:'awaiting_payment'},
}))check(change===null?null:{...base,...change},null);
check({...base,opAt:now-60000},{lat:25.77,lng:-80.2,at:now-60000});
check({...base,opLat:0,opLng:0},{lat:0,lng:0,at:now-15000});
const dispatch=fs.readFileSync(path.join(root,'src','backend','dispatch.ts'),'utf8');
const ride=fs.readFileSync(path.join(root,'src','state','RideContext.tsx'),'utf8');
const map=fs.readFileSync(path.join(root,'src','components','LiveMap.ios.tsx'),'utf8');
assert.match(dispatch,/onPosition\?\.\(validLiveVehiclePosition\(data\)\)/,'vehicle must use existing Travel subscription');
assert.match(ride,/setOperatorLivePosition\)/,'vehicle reports must reach Ride context');
assert.match(ride,/operatorLivePosition\.at \+ 60000 - Date\.now\(\)/,'stale vehicle must disappear even if no new Firestore snapshot arrives');
assert.match(map,/matchedOp\?\.demo === true/,'only named demo operators may use simulation');
assert.match(map,/operatorLivePosition \? toLatLng\(operatorLivePosition\)/,'real car must read reported GPS');
assert.match(map,/if \(!tripCoords \|\| !camera\) return null/,'unknown trip coordinates must hide map');
assert.doesNotMatch(map,/const MIAMI\s*=|liveMiami|25\.7743|-80\.1937/,'no hardcoded region or false live Miami');
assert.doesNotMatch(map,/setInterval\([\s\S]*setMatchedOp/,'timer cannot invent Operator position');
const crossPlatform=fs.readFileSync(path.join(root,'src','components','LiveMap.tsx'),'utf8');
assert.match(crossPlatform,/if \(!matchedOp\?\.demo\)/,'web and Android cannot run demo animation for real Operators');
assert.match(crossPlatform,/<RouteMap pickup=\{tripCoords\.pickup\} dest=\{tripCoords\.dest\} route=\{route\}/,'Android must use actual route geometry');
assert.doesNotMatch(crossPlatform,/liveMiami/,'a location-neutral map cannot claim LIVE MIAMI');
console.log('PASS 18 live vehicle GPS cases + single-listener feed, no fabricated car for paid production, no Miami map');
