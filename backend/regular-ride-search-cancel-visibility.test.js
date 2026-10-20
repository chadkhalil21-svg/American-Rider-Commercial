'use strict';
// Verify normal immediate Travel's Operator-search cancel is visible with the
// current search status. This does not simulate a real Stripe refund.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.resolve(__dirname,'../app/ride.tsx'),'utf8');
const search=src.split('// ---- The demo\'s searching screen:')[1]?.split('const shareBookedTravel')[0]||'';
assert(search,'regular Travel search screen exists');
const cancel=search.indexOf("accessibilityLabel={t('traveler.cancelTravel')}");
const safety=search.indexOf('Safety is available from the moment');
assert(cancel>=0&&safety>=0&&cancel<safety,
  'Cancel must be beside Operator-search state, before supplementary safety row');
assert.match(search, /onPress=\{\(\) => setCancelAsk\(true\)\}/);
assert.match(search,/minHeight: 44/,'search Cancel is a touch-sized accessible control');
assert.match(search,/const ok = await ride\.cancelRide\(\)/,
  'Cancel must invoke authoritative ride cancellation, not only dismiss screen');
assert.match(search,/if \(ok\) router\.dismissTo\('\/'\)/,
  'Only confirmed cancellation may close the booking');
assert.match(search,/else setCancelFailed\(true\)/,
  'Ambiguous payment or provider outcome must remain unresolved');
assert.match(search, /traveler\.returnHome/);
assert.doesNotMatch(search, /support\.returnHome/);
assert.match(search,/traveler.contactSupport/);
const matched=src.split('const shareBookedTravel')[1]||'';
assert.match(matched,/if \(await ride\.cancelRide\(\)\) router\.dismissTo\('\/'\)/,
  'assigned-Operator cancellation still uses the server');
console.log('PASS ordinary Operator search: visible accessible Cancel, confirmation, provider-safe exit and Support');
