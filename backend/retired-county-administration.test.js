'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=(name)=>fs.readFileSync(path.join(__dirname,name),'utf8');
const retired=['market-readiness.js','market-admission.js','market-launch-summary.js',
  'market-runtime-controls.js','market-evidence-diagnosis.js','founder-market-intents.js',
  'founder-market-intents.json'];
for(const name of retired) assert.equal(fs.existsSync(path.join(__dirname,name)),false,
  'retired county approval file was not deleted: '+name);
assert.equal(fs.existsSync(path.join(__dirname,'../scripts/ingest-market-admission.cjs')),false,
  'retired county approval submission workflow was not removed');
for(const filename of ['server.js','booking.js','market-fleet.js','chatgpt-mcp.js']){
  assert.doesNotMatch(read(filename),/market_admission|market-readiness(?!-ui)|admittedMarket\(/,
    'live booking, duty or Founder path must not reference retired admission: '+filename);
}
const fleet=read('market-fleet.js');
assert.doesNotMatch(fleet,/deactivateMarketFleet|sweepPausedMarketFleet|fleetCleanupPending/);
assert.match(fleet,/stripeCheckedAt/);
assert.match(fleet,/account_closures/);
const server=read('server.js');
assert.match(server,/requireServedPickup/);
assert.match(server,/requireActiveOperatingMarket/);
assert.match(server,/screeningCurrent\(/);
assert.match(server,/coverageUnsafeForNewTravel|coverageLapsed/);
assert.match(server,/requireOperationalReadiness/);
const ui=read('market-readiness-ui.js');
assert.match(ui,/geographyMarketPage/);
assert.doesNotMatch(ui,/marketChecklistPage|readyToActivate|recordEvidence|activateRegion/);
const {marketFor,servesPoint}=require('./markets');
for(const location of [
  {lat:25.775,lng:-80.191},{lat:26.1224,lng:-80.1373},{lat:26.7153,lng:-80.0534}
]) {
  assert.equal(marketFor(location)?.status,'active');
  assert.equal(servesPoint(location),true);
}
assert.equal(servesPoint({lat:28.5383,lng:-81.3792}),false);
console.log('PASS retired county approval code removed; geography and individual safeguards intact');
