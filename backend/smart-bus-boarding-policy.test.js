'use strict';
// Safe synthetic tests: no transit requests, passengers, charges, or live services.
const assert = require('node:assert/strict');
const { stopWaitLimit, acceptableBusBoardingWait: ok } = require('./smart-bus-boarding-policy');
const d = (day, hm, offset = '-04:00') => `${day}T${hm}:00${offset}`;
const car = (start, end) => ({ mode: 'car', startTime: start, endTime: end });
const bus = (start, end) => ({ mode: 'bus', startTime: start, endTime: end });
const rail = (start, end) => ({ mode: 'rail', startTime: start, endTime: end });
const tz = 'America/New_York';

assert.equal(stopWaitLimit(d('2026-10-15', '07:00'), tz), 15);
assert.equal(stopWaitLimit(d('2026-10-15', '18:59'), tz), 15);
assert.equal(stopWaitLimit(d('2026-10-15', '06:59'), tz), 30);
assert.equal(stopWaitLimit(d('2026-10-15', '19:00'), tz), 30);
assert.equal(stopWaitLimit(d('2026-10-17', '10:00'), tz), 30);
assert.equal(stopWaitLimit(d('2026-10-18', '17:00'), tz), 30);
assert.equal(stopWaitLimit(d('2026-11-01', '01:30', '-05:00'), tz), 30); // DST reset
assert.equal(stopWaitLimit(d('2026-07-05', '09:00'), tz), 30);
assert.equal(stopWaitLimit('nonsense', tz), null);
assert.equal(stopWaitLimit(d('2026-10-15', '09:00'), 'Not/AZone'), null);

const thu = '2026-10-15', sat = '2026-10-17', sun = '2026-10-18';
const thuReady = d(thu, '09:00'), satReady = d(sat, '09:00');
assert.equal(ok([bus(d(thu,'09:15'),d(thu,'09:35'))], thuReady, tz), true); // exact limit
assert.equal(ok([bus(d(thu,'09:16'),d(thu,'09:35'))], thuReady, tz), false);
assert.equal(ok([bus(d(sat,'09:30'),d(sat,'09:55'))], satReady, tz), true);
assert.equal(ok([bus(d(sat,'09:31'),d(sat,'09:55'))], satReady, tz), false);
assert.equal(ok([bus(d(sun,'09:29'),d(sun,'09:55'))], d(sun,'09:00'), tz), true);
assert.equal(ok([bus(d(sun,'09:31'),d(sun,'09:55'))], d(sun,'09:00'), tz), false);
assert.equal(ok([car(d(thu,'09:00'),d(thu,'09:20')),bus(d(thu,'09:35'),d(thu,'09:55'))],thuReady,tz),true); // measured at boarding stop, not trip origin
assert.equal(ok([car(d(thu,'09:00'),d(thu,'09:20')),bus(d(thu,'09:36'),d(thu,'09:55'))],thuReady,tz),false);
assert.equal(ok([rail(d(thu,'09:00'),d(thu,'09:20')),bus(d(thu,'09:34'),d(thu,'09:55'))],thuReady,tz),true);
assert.equal(ok([rail(d(thu,'09:00'),d(thu,'09:20')),bus(d(thu,'09:36'),d(thu,'09:55'))],thuReady,tz),false);
assert.equal(ok([bus(d(thu,'09:00'),d(thu,'09:20')),rail(d(thu,'09:21'),d(thu,'09:40'))],thuReady,tz),true); // trains not capped
assert.equal(ok([rail(d(thu,'09:00'),d(thu,'10:00'))],thuReady,tz),true); // no bus restrictions on rail
assert.equal(ok([bus(d(thu,'08:59'),d(thu,'09:10'))],thuReady,tz),false); // already departed
assert.equal(ok([bus('bad',d(thu,'09:40'))],thuReady,tz),false);
assert.equal(ok([car(d(thu,'09:00'),'bad'),bus(d(thu,'09:10'),d(thu,'09:30'))],thuReady,tz),false);
assert.equal(ok([bus(d(thu,'09:12'),d(thu,'09:30'))],'bad',tz),false);
assert.equal(ok([bus(d(thu,'09:12'),d(thu,'09:30'))],thuReady,'Bad/Timezone'),false);
assert.equal(ok([bus(d(thu,'09:12'),d(thu,'09:30'))],null,tz),true); // legacy mapper test seam only
assert.equal(ok([bus(d(thu,'09:12'),d(thu,'09:30'))],thuReady,tz),true);
assert.equal(ok([bus(d(thu,'09:12'),d(thu,'09:30')),car(d(thu,'09:30'),d(thu,'09:32')),bus(d(thu,'09:49'),d(thu,'10:10'))],thuReady,tz),false); // EVERY bus stop
assert.equal(ok([bus(d(thu,'09:12'),d(thu,'09:30')),car(d(thu,'09:30'),d(thu,'09:32')),bus(d(thu,'09:47'),d(thu,'10:10'))],thuReady,tz),true);
console.log('Smart bus boarding window: 33 safety scenarios passed (synthetic)');
