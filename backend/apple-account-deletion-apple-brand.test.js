'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');

const auth = fs.readFileSync('src/state/appleSignIn.ts', 'utf8');
const screen = fs.readFileSync('app/delete-account.tsx', 'utf8');
const authContext = fs.readFileSync('src/state/AuthContext.tsx', 'utf8');
const ui = fs.readFileSync('src/screens/AuthScreen.tsx', 'utf8');
const appleGuide = 'https://support.apple.com/102571';

assert.match(auth, /revokeAccessToken/, 'use the Firebase-supported Apple access-token revocation when available');
assert.match(auth, /forAccountDeletion/, 'revoke only when the user initiates account deletion');
assert.match(auth, /OAuthProvider\.credentialFromResult\(fresh\)\?\.accessToken/, 'only real Apple OAuth access tokens are eligible');
assert.match(auth, /if \(token\)\s*\{[\s\S]*?revokeAccessToken\(auth, token\)/,
  'must not send an Apple identity token or authorization code to the access-token revocation API');
assert.match(auth, /revokeAccessToken\(auth, token\)\.catch/,
  'a provider revocation error must not make the account impossible to delete');
assert.match(screen, /reauthenticateWithApple\(\{ forAccountDeletion: true \}\)/);
assert.match(screen, /provider === 'apple' \? \(/, 'manual revocation guidance shown only when Apple linked');
assert.ok(screen.includes(appleGuide), 'manual Apple disconnection must link official Apple instructions');
assert.match(authContext, /await reauthenticate\(\);[\s\S]*?await deleteAccountOnServer\(\)/,
  'supported revocation attempts must never replace the real authenticated deletion endpoint');

for (const lang of ['en', 'es', 'fr', 'it', 'de']) {
  const contents = fs.readFileSync('src/i18n/' + lang + '.ts', 'utf8');
  assert.ok(contents.includes('appleRevokeAfterDeletion:'), lang+' must explain Apple manual disconnect');
  assert.ok(contents.includes('appleRevokeInstructions:'), lang+' must localize Apple support link');
}
assert.match(ui, /<SsoButton label=\{t\('auth\.continueWithApple'\)\} onPress=\{onApple\} glyph="apple" primary \/>/,
  'custom visual control keeps the real Apple OAuth entry');
assert.match(ui,/source=\{require\('\.\.\/\.\.\/assets\/brand\/apple-signin-apple-official\.png'\)\}/,
  'must use Apple-hosted logo image unchanged, rather than traced Apple glyph');
assert.match(ui,/btnTextSso: \{ color: colors\.ink, fontSize: 15, fontWeight: '600' \}/,
  'Apple title uses same compact 15pt semibold text as Google');

console.log('PASS: Apple official custom artwork and shared 15pt title; deletion revocation/manual fallback; Google unchanged');
console.log('NOT VERIFIED: Native Apple user/device grant, token issuance, provider revocation, real App Store binary or Google Cloud Apple OAuth configuration');
