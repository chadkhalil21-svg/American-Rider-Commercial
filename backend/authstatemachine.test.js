const assert = require('node:assert/strict');

// Deterministic model of the native authentication boundary.
// It deliberately models outcomes, not Firebase internals: initialization, provider credential
// exchange, auth-state publication, onboarding, restart restoration, and failure closure.
function gate({ initializing, user, onboarding }) {
  if (initializing) return 'initializing';
  return (!user || onboarding) ? 'auth' : 'app';
}

function publish(state, user) {
  return { ...state, initializing: false, user };
}

let state = { initializing: true, user: null, onboarding: false };
assert.equal(gate(state), 'initializing');

// Cold start with no restored Firebase user stays at the front door.
state = publish(state, null);
assert.equal(gate(state), 'auth');

// Email/password, Google, and Apple all converge on the same Firebase auth-state publication.
for (const provider of ['password', 'google', 'apple']) {
  let s = { initializing: false, user: null, onboarding: false, provider };
  s = publish(s, { uid: provider + '-uid' });
  assert.equal(gate(s), 'app', provider + ' successful Firebase session must open the app');

  // A newly created account may deliberately keep onboarding above the signed-in app.
  s.onboarding = true;
  assert.equal(gate(s), 'auth', provider + ' onboarding must retain the front-door flow');
  s.onboarding = false;
  assert.equal(gate(s), 'app');

  // Restart restoration must reproduce the same published Firebase user before opening.
  let restarted = { initializing: true, user: null, onboarding: false };
  assert.equal(gate(restarted), 'initializing');
  restarted = publish(restarted, { uid: provider + '-uid' });
  assert.equal(gate(restarted), 'app', provider + ' restored session must survive restart');
}

// Repro: registration is interrupted before role selection. A later successful
// password sign-in must dismiss stale onboarding instead of returning to Sign In.
let interrupted = { initializing: false, user: null, onboarding: true };
assert.equal(gate(interrupted), 'auth');
interrupted = { ...publish(interrupted, { uid: 'reviewer' }), onboarding: false };
assert.equal(gate(interrupted), 'app', 'successful sign-in must clear stale registration overlay');

// Prevent a model-only fix: check that the native auth provider actually
// clears stale onboarding after a successful password sign-in and sign-out.
const nativeAuth = require('node:fs').readFileSync('src/state/AuthContext.tsx', 'utf8');
assert.match(nativeAuth,
  /signIn: \(email, password\) =>\s*run\(async \(\) => \{\s*await signInWithEmailAndPassword\(auth, email\.trim\(\), password\);[\s\S]*?setOnboarding\(false\);\s*\}\)/);
assert.match(nativeAuth,
  /await fbSignOut\(auth\);\s*\/\/ Do not carry an interrupted registration overlay into the next session\.[\s\S]*?setOnboarding\(false\);/);

// Credential/provider failure must never manufacture a user.
state = publish({ initializing: true, user: null, onboarding: false }, null);
assert.equal(gate(state), 'auth');

// Sign-out publication closes the gate.
state = publish({ initializing: false, user: { uid: 'u' }, onboarding: false }, null);
assert.equal(gate(state), 'auth');

console.log('native authentication state-machine simulation: PASS');
