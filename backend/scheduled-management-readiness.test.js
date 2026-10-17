'use strict';
// Whole-service scheduled Travel source contracts, repeated twice.
// No passenger, live payment, provider or production Firestore access.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const rules = read('firestore.rules');
const backend = read('backend/server.js');
const mobile = read('src/backend/scheduled.ts');
const list = read('app/upcoming.tsx');
const home = read('app/index.tsx');
const schedule = read('app/schedule.tsx');
const indexes = JSON.parse(read('firestore.indexes.json'));

for (let pass = 0; pass < 2; pass++) {
  const block = rules.split('match /scheduled_rides/{schedId} {')[1]?.split('}')[0];
  assert.ok(block, 'scheduled-rides rules block exists');
  assert.match(block, /allow read: if ownsExisting\(\)/);
  assert.match(block, /allow create, update, delete: if false/,
    'even own reservation cannot be deleted by client after dispatch');

  const serverCancel = backend.split("app.delete('/travel/schedule/:id'")[1]
    ?.split("app.post('/travel/schedule'")[0];
  assert.ok(serverCancel, 'authenticated server cancellation route exists');
  assert.match(serverCancel, /requireAuth, requireFreshAuth/,
    'authenticated fresh session required for cancellation');
  assert.match(serverCancel, /await db.runTransaction/,
    'dispatch race and cancellation resolve atomically');
  assert.match(serverCancel, /status !== 'reserved'/,
    'reserved status alone is cancellable before dispatch');
  assert.match(serverCancel, /tx.update\(ref, \{ status: 'cancelled'/,
    'cancellation retains historical reservation instead of erasing the record');

  assert.ok(indexes.indexes.some(i=>i.collectionGroup==='scheduled_rides' &&
    i.queryScope==='COLLECTION' && i.fields.length===2 &&
    i.fields[0].fieldPath==='travelerUid' &&
    i.fields[0].order==='ASCENDING' &&
    i.fields[1].fieldPath==='atMs' &&
    i.fields[1].order==='ASCENDING'),
  'owner-scoped ordered future query has a declared composite index');

  assert.match(mobile, /export async function fetchScheduledRidesPage/,
    'dedicated future travel list uses a shared bounded query');
  assert.match(mobile, /where\('travelerUid', '==', uid\)/,
    'query is restricted to this authenticated Traveler');
  assert.match(mobile, /where\('atMs', '>=', Date\.now\(\) - 90 \* 60 \* 1000\)/,
    'old reservation history is not scanned on every Home return');
  assert.match(mobile, /orderBy\('atMs', 'asc'\)/,
    'future reservations appear in ascending pickup order');
  assert.match(mobile, /limit\(21\)/,
    'at most 20 visible bookings per page, one extra for the next-page flag');
  assert.match(mobile, /startAfter\(after\)/,
    'older/further reservations use cursor pagination not charged offsets');
  assert.match(mobile, /nextCursor: shown\.length === 20 \? shown\[19\] : null/,
    'cursor advances from the last rendered row, without dropping a record');
  assert.match(mobile, /return null;\s*}\s*}\s*\/\*\*/,
    'missing Firestore index or offline failures do not become an empty list');
  assert.doesNotMatch(mobile, /getDocs\(\s*query\(collection\(db, 'scheduled_rides'\), where\('travelerUid', '==', uid\)\)\s*\)/,
    'Home may not perform an unbounded lifetime-wide scheduled Travel read');

  assert.match(list, /useFocusEffect/,
    'returning to Upcoming Travel refreshes bounded source');
  assert.match(list, /rides\.map\(\(r\) =>/,
    'multiple appointments render separately, not in a singleton widget');
  assert.match(list, /deleteScheduledRide\(id\)/,
    'cancellation is ID-specific and uses server approval');
  assert.match(list, /status === 'reserved' && cancelId === r\.id/,
    'cancellation requires a second deliberate step');
  assert.match(list, /\{ \.\.\.r, status: 'cancelled' \}/,
    'confirmed cancellations remain visible as cancelled records');
  assert.match(list, /setCancelErrorId\(id\)/,
    'a dispatch race produces a visible failure, never fabricated cancellation');
  assert.match(list, /fetchScheduledRidesPage\(after\)/,
    'pagination loads only when requested');
  assert.match(home, /go\('\/upcoming'\)/,
    'Travel menu reaches actual Upcoming Travel management');
  assert.match(home, /router\.navigate\('\/upcoming'\)/,
    'Home active appointment links to the complete list');
  assert.doesNotMatch(home, /label: t\('traveler\.scheduledTravel'\), onPress: \(\) => go\('\/schedule'\)/,
    'existing reservation must never open a new-booking form');

  assert.match(schedule, /classNameKey\(ride\.travelClass\)/,
    'scheduled journey has a visible class before consent');
  assert.match(schedule, /traveler\.whoIsTraveling/,
    'scheduled journey has a visible person before consent');
  assert.match(schedule, /traveler\.paymentMethods/,
    'Travelers can reach saved payment methods before consenting');
  for (const lang of ['en','es','fr','it','de']) {
    const t=read('src/i18n/'+lang+'.ts');
    for (const key of ['schedNoUpcoming','schedMoreUpcoming','schedManageTravel','schedCanceled',
      'schedOperatorAssigned','schedCancelConflict','schedListUnavailable'])
      assert.match(t, new RegExp('^\\s*'+key+':','m'),
        lang+': missing scheduled management copy '+key);
  }
}
console.log('PASS twice: cancel authority; per-user, bounded upcoming Travel; page cursors; class/payment controls; five-language management');
