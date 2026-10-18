'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const locFile = path.join(__dirname, '../src/location.ts');
const locSource = fs.readFileSync(locFile, 'utf8');
const js = ts.transpileModule(locSource, {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText;
let foregroundChecks = 0;
let permissionRequests = 0;
let locationReads = 0;
let reverseGeocodes = 0;
let permission = 'granted';
let position = () => ({
  coords: {latitude: 25.7, longitude: -80.3, accuracy: 8},
  timestamp: Date.now(), mocked: false,
});
const location = {
  Accuracy: {High: 4},
  getForegroundPermissionsAsync: async () => { foregroundChecks++; return {status: permission}; },
  requestForegroundPermissionsAsync: async () => { permissionRequests++; return {status: permission}; },
  getCurrentPositionAsync: async () => {locationReads++;return position();},
  reverseGeocodeAsync: async () => {reverseGeocodes++;throw new Error('geocoding must never be needed for duty');},
};
const moduleForLocation = {exports:{}};
vm.runInNewContext(js, {
  exports:moduleForLocation.exports, module:moduleForLocation,
  require: name => {
    if (name === 'expo-location') return location;
    throw new Error('Unexpected dependency in location helper: '+name);
  },
  Date, console,
});
const resolve = moduleForLocation.exports.resolveOperatorDutyPosition;
assert.equal(typeof resolve, 'function');

(async () => {
  let result = await resolve();
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {lat:25.7,lng:-80.3});
  assert.equal(foregroundChecks,1,'renewals read already-granted permission');
  assert.equal(permissionRequests,0,'routine renewal must not prompt for permission');
  assert.equal(reverseGeocodes,0,'duty may not fail for want of an address label');

  result = await resolve({requestPermission:true});
  assert.ok(result);
  assert.equal(permissionRequests,1,'initial duty prompts as needed');
  assert.equal(reverseGeocodes,0,'even first entry needs no reverse geocode');

  permission='denied';
  const before=locationReads;
  assert.equal(await resolve(),null,'permission loss blocks renewed location');
  assert.equal(locationReads,before,'denied permission does not access GPS');
  permission='granted';

  for (const [name,loc] of [
    ['stale',{coords:{latitude:25.7,longitude:-80.3,accuracy:8},timestamp:Date.now()-600_000}],
    ['low_accuracy',{coords:{latitude:25.7,longitude:-80.3,accuracy:500},timestamp:Date.now()}],
    ['no_accuracy',{coords:{latitude:25.7,longitude:-80.3,accuracy:null},timestamp:Date.now()}],
    ['invalid_coordinates',{coords:{latitude:95,longitude:-80.3,accuracy:8},timestamp:Date.now()}],
    ['mock_location',{coords:{latitude:25.7,longitude:-80.3,accuracy:8},timestamp:Date.now(),mocked:true}],
  ]) {
    position=()=>loc;
    assert.equal(await resolve(),null,name+' must not authorize an Operator position');
  }
  position=()=>{throw Error('location unavailable');};
  assert.equal(await resolve(),null,'failed GPS must not result in invented position');
  assert.equal(reverseGeocodes,0);

  const ctx=fs.readFileSync(path.join(__dirname,'../src/state/OperatorContext.tsx'),'utf8');
  assert.match(ctx,/resolveOperatorDutyPosition\(\{ requestPermission: true \}\)/,
    'initial duty must be granted current physical GPS');
  assert.match(ctx,/await resolveOperatorDutyPosition\(\)/,
    'foreground renewals must be direct GPS, not Traveler address lookup');
  assert.doesNotMatch(ctx,/resolveCurrentDeparture/,
    'Operator renewal must never reverse-geocode every interval');
  assert.match(ctx,/AppState\.addEventListener\('change', next =>/,
    'return to foreground must initiate service revalidation');
  assert.match(ctx,/next === 'active' && prior !== 'active'/,
    'resume is edge-triggered');
  assert.match(ctx,/if \(stopped \|\| inFlight\) return/,
    'overlapping renewals must be bounded');
  assert.match(ctx,/Platform\.OS === 'web' \|\| AppState\.currentState === 'active'/,
    'background native location owns background renewal, not a JS timer');

  const native=fs.readFileSync(path.join(__dirname,'../src/backend/presence.ts'),'utf8');
  assert.match(native,/response\.ok && result\?\.ok === true/,
    'a 2xx response alone must not count unless the server acknowledges duty');
  assert.match(native,/console\.warn\('\[operator-presence\] renewal_refused', response\.status, code\)/,
    'background refusal should be recorded without identity or coordinates');
  assert.match(native,/distanceInterval: 0/,
    'both iOS and Android allow stationary position updates while in service');
  const matcher=fs.readFileSync(path.join(__dirname,'matching.js'),'utf8');
  assert.match(matcher,/PRESENCE_STALE_MS = 5 \* 60 \* 1000/,
    'stale dispatch remains fail-closed');
  console.log('PASS physical-position validation, geocode removal, foreground recovery, bounded renewals and native denial observability');
})().catch(e=>{console.error(e);process.exitCode=1;});
