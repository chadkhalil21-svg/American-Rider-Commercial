const fs = require('node:fs');
const assert = require('node:assert/strict');

const push = fs.readFileSync('src/backend/push.ts', 'utf8');
const layout = fs.readFileSync('src/boot/FullRoot.tsx', 'utf8');
const auth = fs.readFileSync('src/state/AuthContext.tsx', 'utf8');
const serverPush = fs.readFileSync('backend/push.js', 'utf8');

assert.match(push, /Notifications\.IosAuthorizationStatus\.PROVISIONAL/);
assert.match(push, /Notifications\.IosAuthorizationStatus\.EPHEMERAL/);
assert.doesNotMatch(push, /ios\?\.status\s*===\s*3/);
assert.match(serverPush, /recipientUid: String\(uid\)/);
assert.match(layout, /recipientUid !== user\.uid/);
assert.match(layout, /const allowed = new Set\(\[\s*'\/ride'/,
  'notification routing uses an explicit, static allowlist; see push-route-parity.test.js for full coverage');
assert.match(layout, /allowed\.has\(screen\)/);
assert.match(auth, /await clearPushToken\(\);/);
const signOutStart = auth.lastIndexOf('signOut: () =>');
const signOut = auth.slice(signOutStart, auth.indexOf('onboarding,', signOutStart));
assert.ok(signOut.indexOf('await clearPushToken()') >= 0);
assert.ok(signOut.indexOf('await clearPushToken()') < signOut.indexOf('await fbSignOut(auth)'));
console.log('PASS final native push boundary invariants');
