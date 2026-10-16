'use strict';
// Synthetic GTFS end-to-end test: zip agency schedules, build 3 profiles from
// five feeds, consume them through the REAL transit adapter. No external calls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const T = require('./transit');
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ar-smart-profiles-test-'));
const feeds = [
  ['MDT', 'mdt-gtfs.zip'], ['BCT', 'bct-gtfs.zip'],
  ['PALMTRAN', 'palmtran-gtfs.zip'], ['SFRTA', 'sfrta-gtfs.zip'],
  ['BRIGHTLINE', 'brightline-gtfs.zip'],
];
const schedule = fs.mkdtempSync(path.join(base, 'feed-'));
const lines = (header, rows) => [header, ...rows, ''].join('\n');
try {
  fs.writeFileSync(path.join(schedule, 'agency.txt'), lines('agency_id,agency_name', ['AG,Test Transit']));
  fs.writeFileSync(path.join(schedule, 'calendar.txt'),
    lines('service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date',
      ['DAILY,1,1,1,1,1,1,1,20200101,20991231']));
  fs.writeFileSync(path.join(schedule, 'calendar_dates.txt'), 'service_id,date,exception_type\n');
  fs.writeFileSync(path.join(schedule, 'routes.txt'), lines('route_id,route_short_name,route_long_name,route_type',
    ['FAST,1,Ten minute bus,3', 'SLOW,2,Half hour bus,3', 'RAIL,3,Rail service,2']));
  const trips = [], times = [];
  for (const [route, gap] of [['FAST', 10], ['SLOW', 30], ['RAIL', 60]]) {
    for (let min = 420; min <= 1140; min += gap) {
      const id = route + min;
      const stamp = `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}:00`;
      trips.push(`${route},DAILY,${id},0`);
      times.push(`${id},${stamp},${stamp},STOP,1`);
    }
  }
  fs.writeFileSync(path.join(schedule, 'trips.txt'), lines('route_id,service_id,trip_id,direction_id', trips));
  fs.writeFileSync(path.join(schedule, 'stop_times.txt'),
    lines('trip_id,arrival_time,departure_time,stop_id,stop_sequence', times));

  for (const [, file] of feeds) {
    const zip = spawnSync('zip', ['-q', path.join(base, file),
      'agency.txt', 'calendar.txt', 'calendar_dates.txt', 'routes.txt', 'trips.txt', 'stop_times.txt'],
    { cwd: schedule, encoding: 'utf8' });
    assert.equal(zip.status, 0, zip.stderr);
  }
  const output = path.join(base, 'compiled.json');
  const build = () => spawnSync(process.execPath, [
    path.join(__dirname, '..', 'infra', 'otp', 'build-route-profiles.mjs'),
    '--data', base, '--out', output,
  ], { encoding: 'utf8', timeout: 150000 });
  for (let pass = 0; pass < 2; pass++) {
    const result = build();
    assert.equal(result.status, 0, result.stderr);
    const raw = JSON.parse(fs.readFileSync(output, 'utf8'));
    assert.equal(Object.keys(raw.profiles).length, 3);
    for (const key of ['weekday', 'saturday', 'sunday']) {
      assert.equal(raw.profiles[key].length, 5);
      assert.ok(raw.profiles[key].every((row) => row.referenceDate === raw.profileReferences[key]));
    }
    const weekday = T.busRoutesFrom(raw, new Date('2026-10-15T14:00:00Z'), 'America/New_York');
    const saturday = T.busRoutesFrom(raw, new Date('2026-10-17T14:00:00Z'), 'America/New_York');
    const sunday = T.busRoutesFrom(raw, new Date('2026-10-18T14:00:00Z'), 'America/New_York');
    assert.equal(weekday.size, 10, 'weekday: 5 x (FAST + rail), not SLOW');
    assert.equal(saturday.size, 15, 'Saturday: 5 x (FAST + SLOW + rail)');
    assert.equal(sunday.size, 15, 'Sunday: 5 x (FAST + SLOW + rail)');
    assert.equal(weekday.has('MDT:SLOW'), false);
    assert.equal(saturday.has('MDT:SLOW'), true);
    assert.equal(sunday.has('BCT:SLOW'), true);
  }

  const beforeFailure = fs.readFileSync(output, 'utf8');
  fs.unlinkSync(path.join(base, 'bct-gtfs.zip'));
  const failed = build();
  assert.notEqual(failed.status, 0, 'missing current agency feed must reject commissioning');
  assert.equal(fs.readFileSync(output, 'utf8'), beforeFailure,
    'failure must not overwrite the last valid route list');

  console.log('Smart Travel GTFS 5-feed x 3-day build, 2 passes, fail-closed: passed');
} finally {
  fs.rmSync(base, { recursive: true, force: true });
}
