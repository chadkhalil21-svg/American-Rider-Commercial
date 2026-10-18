'use strict';
// Offline commissioning regression. Does NOT contact a mapping service or
// pretend that a GitHub test is a live Photon installation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const script = path.resolve(__dirname,'../scripts/photon-acceptance.mjs');
const src = fs.readFileSync(script,'utf8');
assert.match(src,/Zoo Miami/);
assert.match(src,/Dadeland Mall/);
assert.match(src,/Grand Central Terminal/);
assert.match(src,/Pike Place Market/);
assert.match(src,/Golden Gate Park/);
assert.match(src,/photon\.komoot\.io/);
assert.match(src,/nominatim\.openstreetmap\.org/);
assert.match(src,/countrycode/);
const env = { ...process.env };
delete env.PHOTON_BASE_URL;
const noConfig = spawnSync(process.execPath,[script],{env,encoding:'utf8',timeout:5000});
assert.notEqual(noConfig.status,0,'must not run against an unconfigured or public provider');
for (const url of ['https://photon.komoot.io','http://127.0.0.1:2322',
                   'https://user:pass@search.example.com']) {
  const denied = spawnSync(process.execPath,[script],{
    env: {...env,PHOTON_BASE_URL:url},encoding:'utf8',timeout:5000,
  });
  assert.notEqual(denied.status,0,'unapproved or unencrypted endpoint must not receive tests');
}
const decision=fs.readFileSync(path.join(__dirname,'../infra/photon/README.md'),'utf8');
assert.match(decision,/NOT commissioned/);
assert.match(decision,/Photon.*free/i);
assert.match(decision,/separate, private stateful server/);
const { selectedPrimary } = require('./place-search');
const original = process.env.AR_PLACE_SEARCH_PRIMARY;
const originalPhoton = process.env.AR_PHOTON_SEARCH_URL;
const originalHere = process.env.HERE_API_KEY;
const originalGeo = process.env.GEOAPIFY_API_KEY;
try {
  delete process.env.AR_PLACE_SEARCH_PRIMARY;
  delete process.env.AR_PHOTON_SEARCH_URL;
  delete process.env.HERE_API_KEY;
  process.env.GEOAPIFY_API_KEY = 'synthetic';
  assert.equal(selectedPrimary(),null,'no unapproved Geoapify purchase or automatic usage');
} finally {
  for (const [k,v] of [['AR_PLACE_SEARCH_PRIMARY',original],['AR_PHOTON_SEARCH_URL',originalPhoton],
                      ['HERE_API_KEY',originalHere],['GEOAPIFY_API_KEY',originalGeo]]) {
    if (v === undefined) delete process.env[k]; else process.env[k]=v;
  }
}
console.log('PASS: Photon nationwide acceptance requires explicit private live service, no unwanted Geoapify');
