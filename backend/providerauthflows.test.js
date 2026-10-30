const fs = require('node:fs');
const assert = require('node:assert/strict');

for (const path of ['src/state/googleSignIn.ts', 'src/state/appleSignIn.ts']) {
  const src = fs.readFileSync(path, 'utf8');
  assert.match(src, /function safeAuthReason\(e: unknown\): string/);
  assert.match(src, /typeof code === 'string' && code\.length <= 100 \? code : 'auth\/unknown'/);
  assert.doesNotMatch(src, /reason: \(e as Error\)\?\.message/,
    path + ' must never propagate arbitrary provider error messages');
  assert.match(src, /signInWithCredential\(auth,/,
    path + ' must exchange the provider credential into Firebase Auth');
}
const google = fs.readFileSync('src/state/googleSignIn.ts','utf8');
assert.match(google, /result\.type === 'cancel' \|\| result\.type === 'dismiss'/);
assert.match(google, /reason: 'no_identity_token'/);
const apple = fs.readFileSync('src/state/appleSignIn.ts','utf8');
assert.match(apple, /code === 'ERR_REQUEST_CANCELED'/);
assert.match(apple, /reason: 'no_identity_token'/);
console.log('provider auth failure-state invariants: PASS');

const appleNonce = fs.readFileSync('src/state/appleSignIn.ts','utf8');
assert.match(appleNonce, /Crypto\.getRandomBytes\(length\)/, 'Apple sign-in must use a cryptographically random nonce');
assert.match(appleNonce, /CryptoDigestAlgorithm\.SHA256, rawNonce/, 'Apple must receive the SHA-256 nonce');
assert.match(appleNonce, /nonce: hashedNonce/, 'Apple request must be bound to the hashed nonce');
assert.match(appleNonce, /idToken: apple\.identityToken, rawNonce/, 'Firebase credential must receive the original raw nonce');
console.log('Apple nonce binding invariants: PASS');

// Google protocol contract: acquisition mechanism may be AuthSession or a native provider,
// but it must yield an ID token, create a Firebase Google credential, and exchange that
// credential into the single Firebase Auth session authority.
const googleProtocol = fs.readFileSync('src/state/googleSignIn.ts','utf8');
assert.match(googleProtocol, /id[_T]oken|idToken/,
  'Google flow must obtain an identity token');
assert.match(googleProtocol, /GoogleAuthProvider\.credential\(/,
  'Google identity must be converted to a Firebase credential');
assert.match(googleProtocol, /signInWithCredential\(auth,/,
  'Google credential must establish the Firebase session');
assert.match(googleProtocol, /reauthenticateWithCredential\(user,/,
  'Google credential must support recent-login reauthentication');
console.log('Google-to-Firebase credential protocol invariants: PASS');

// Apple's authentication remains native, even when the visual control is custom.
// Explicitly verify the button invokes the real native Apple sign-in handler,
// the secure nonce/Firebase flow above, and the matching Google control.
const authScreen = fs.readFileSync('src/screens/AuthScreen.tsx','utf8');
assert.match(authScreen, /<SsoButton label=\{t\('auth\.continueWithApple'\)\} onPress=\{onApple\} glyph="apple" primary \/>/,
  'Apple label + white Apple mark must be linked to native Apple auth');
assert.match(authScreen, /const onApple = async \(\) => \{/);
assert.match(authScreen, /const r = await signInWithApple\(\)/,
  'Apple tap must still invoke authenticated Apple provider API');
assert.match(authScreen, /<GoogleEntry[\s\S]*?auth\.continueWithGoogle/,
  'Google sign-in must remain available with its own branded label');
assert.match(authScreen, /ssoButton: \{ width: '100%', height: 36, borderRadius: 12, paddingVertical: 0, justifyContent: 'center' \}/,
  'Google compact SSO must use matching institutional rounded-rectangle geometry');
assert.match(authScreen, /cornerRadius=\{12\}/, 'native Apple visible corner radius must match Google');
assert.match(authScreen, /s\.btn, s\.ssoButton, primary \? s\.btnInk : s\.btnSso/);
assert.match(authScreen, /btnText: \{ fontSize: 15, fontWeight: '600' \}/);
console.log('Apple native authentication via compact branded SSO control + Google visual parity: PASS');
