'use strict';
// Native push-navigation parity across authenticated backend publishers.
// Source-only acceptance; actual delivery and cold-start behavior need signed devices.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const layout = read('src/boot/FullRoot.tsx');
const receiver = read('src/backend/push.ts');
const start = layout.match(/const allowed = new Set\(\[([\s\S]*?)\]\)/);
assert(start, 'notification destinations must have a static, narrow allowlist');
const allowed = new Set([...start[1].matchAll(/['"]([^'"]+)['"]/g)].map(m => m[1]));
const publishers = [
  'backend/server.js', 'backend/monitor.js', 'backend/scheduler.js',
  'backend/insurance-monitoring.js',
];
const published = new Map();
for (const filename of publishers) {
  const source = read(filename);
  for (const match of source.matchAll(/\bscreen\s*:\s*['"]([^'"]+)['"]/g)) {
    const route = match[1];
    if (!route.startsWith('/')) continue;
    if (!published.has(route)) published.set(route, []);
    published.get(route).push(filename);
  }
}
const required = ['/', '/wallet', '/operator/trip', '/emergency', '/ride', '/receipt',
  '/operator', '/operator/insurance', '/family'];
for (const route of required) {
  assert(published.has(route) || route === '/receipt',
    route + ' should be used by existing publishers');
}
for (const [route, senders] of published) {
  assert(allowed.has(route), 'backend notification route has no tap action: ' +
    route + ' from ' + senders.join(', '));
}
for (const route of allowed) {
  const screen = route === '/' ? 'app/index.tsx' : 'app' + route + '.tsx';
  assert(fs.existsSync(path.join(root, screen)),
    'notification allowlist points to a screen that does not exist: ' + route);
}
for (const route of ['/wallet', '/operator/trip', '/emergency', '/']) {
  assert(allowed.has(route), 'critical notification destination must be actionable: ' + route);
}
const monitor = read('backend/monitor.js');
assert.match(monitor, /kind:\s*'check_in'[\s\S]{0,240}screen:\s*'\/operator\/trip'/,
  'Operator safety check-in must open active operation');
assert.match(monitor, /kind:\s*'check_in'[\s\S]{0,240}screen:\s*'\/emergency'/,
  'Emergency monitor alert must reach Emergency screen');
// A guardian cannot see a Teen's live Travel in their own Traveler session.
assert.match(monitor, /kind:\s*'guardian_travel'[\s\S]{0,350}screen:\s*'\/family'/,
  'guardian check-in must route to Family, not unrelated Traveler ride');
assert(layout.includes("recipientUid !== user.uid"),
  'do not open another account\'s notification');
const uidGuard = layout.indexOf('recipientUid !== user.uid');
const navigation = layout.indexOf('router.navigate(destination as never)');
assert(uidGuard >= 0 && navigation > uidGuard, 'account check precedes navigation');
assert(layout.includes("screen === '/receipt' ? '/history' : screen"),
  'completion alert must open the server-backed Travel Log after a cold start');
assert(read('app/history.tsx').includes('ride.refreshMyRides({ useCache: true })') &&
  read('app/history.tsx').includes('receiptFromRide(r, language, t)'),
  'the fallback must load actual completed Travel records and open real receipts');
assert(receiver.includes('DEFAULT_ACTION_IDENTIFIER') &&
  receiver.includes('navigatedNotificationIds.has(id)'),
  'no silent action or duplicate cold-start delivery');
assert(!/acceptTravel\(|settleTravel\(|markCompleted\(/.test(layout),
  'notification action is navigation only');
console.log('PASS: '+published.size+' backend push destinations reach existing native routes; guardian safety routing, authenticated tap and no action side effects');
