const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { followPage } = require('./follow');
const now = Date.now();
const original = {
  tripNo: 'AR-SAFETY-0001', status: 'onboard',
  operatorName: 'Private Operator Name', operatorCar: 'Private Car Model',
  operatorPlate: 'PRIVATE-PLATE-XYZ', dep: 'PRIVATE-PICKUP', dest: 'PRIVATE-DESTINATION',
  opLat: 25.76, opLng: -80.21, opAt: now,
};
const active = followPage(original);
assert.ok(active.includes('PRIVATE-PLATE-XYZ'), 'active shared link shows vehicle information');
const ended = followPage({...original,status:'completed',completedAt:now});
assert.match(ended,/This travel has ended/);
for (const secret of ['PRIVATE-PLATE-XYZ','PRIVATE-PICKUP',
  'PRIVATE-DESTINATION','Private Operator Name','25.76','-80.21']) {
  assert.ok(!ended.includes(secret), 'completed Travel leaked private detail: '+secret);
}
const cancelled = followPage({...original,status:'cancelled',statusAt:now});
assert.ok(!cancelled.includes('PRIVATE-PICKUP'), 'cancelled Travel exposes itinerary');
const stale = followPage({...original,opAt:now-10*60*1000});
assert.ok(!stale.includes('maps.apple.com'), 'stale location must not be shown');
const source=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
assert.ok(source.includes("res.set('Cache-Control','private, no-store, max-age=0')"));
assert.ok(source.includes("res.set('Referrer-Policy','no-referrer')"));
console.log('PASS active Travel share, expired position, ended privacy and no-store responses');
