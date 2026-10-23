'use strict';
// Source and behavioral contracts for Operator push acceptance markers.
// An Expo ticket is NOT proof of a delivered phone notification.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root,p), 'utf8');
const server = read('backend/server.js');
const scheduler = read('backend/scheduler.js');
const monitor = read('backend/monitor.js');
const push = read('backend/push.js');
const dispatch = server.slice(server.indexOf("app.post('/travel/dispatch'"),
  server.indexOf("app.delete('/travel/schedule/:id'"));
const announcements = server.slice(server.indexOf("app.post('/travel/announce'"),
  server.indexOf("app.post('/travel/check-in'"));
function acceptMarker(body,label) {
  assert.match(body, /(?:const operatorNotice = await notify|sent = await notify)/,
    label + ': the actual push outcome must be retained');
  assert.match(body, /if \((?:operatorNotice|sent)\?\.ok === true\)[\s\S]{0,130}notifiedOperatorAt/,
    label + ': notification timestamp only after provider confirms acceptance');
}
acceptMarker(dispatch,'immediate dispatch');
acceptMarker(scheduler.slice(scheduler.indexOf('// ---- 3. Off-session'),scheduler.indexOf('// THE CHARGE',scheduler.indexOf('// ---- 3. Off-session')) > 0
  ? scheduler.indexOf('// THE CHARGE',scheduler.indexOf('// ---- 3. Off-session'))
  : scheduler.length),'scheduled dispatch');
acceptMarker(announcements,'idempotent announcement');
acceptMarker(monitor.slice(monitor.indexOf('if (!ride.notifiedOperatorAt'),
  monitor.indexOf('if (since < ANSWER_WINDOW_SEC',monitor.indexOf('if (!ride.notifiedOperatorAt'))),
  'assignment sweep');
assert(monitor.includes('if (since < ANSWER_WINDOW_SEC && !ride.releasedAt) continue;'),
  'failed push preserves the existing short answer window');
assert(monitor.includes('if (!next) {') && monitor.includes('out.stranded.push(ride.id);'),
  'after timeout the same paid Travel proceeds to replacement/stranded handling');
assert(push.includes("if (!token) return { ok: false"),
  'missing token is not an accepted delivery');
assert(push.includes("if (ticket?.status !== 'ok'") &&
  push.includes('return { ok: true, id: ticket.id }'),
  'only a valid Expo acceptance ticket may count as accepted; never claim device delivery');
console.log('PASS Operator push acceptance marker guarded at immediate, scheduled, announcement and recovery paths');
