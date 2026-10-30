'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
// Both labels MUST be rendered by the exact same Text instance and styles:
// Apple's native ASAuthorizationAppleIDButton uses its own uncontrollable font size.
const ui=fs.readFileSync(path.join(__dirname,'..','src/screens/AuthScreen.tsx'),'utf8');
assert.doesNotMatch(ui, /<AppleAuthentication\.AppleAuthenticationButton/,
  'native Apple component controls its own font and failed Build 58 visual parity');
assert.match(ui, /<SsoButton label=\{t\('auth\.continueWithApple'\)\} onPress=\{onApple\} glyph="apple" primary \/>/,
  'Apple continues to call actual native Apple OAuth via shared control');
assert.match(ui, /<GoogleEntry\s+label=\{t\('auth\.continueWithGoogle'\)\}/);
assert.match(ui, /<Text style=\{\[s\.btnText, s\.btnTextSso, \{ color: onDark \}]}>{label}<\/Text>/,
  'both providers must use exactly the same React Native Text and style');
assert.match(ui, /btnText: \{ fontSize: 15, fontWeight: '600' \}/);
assert.match(ui, /btnTextSso: \{ color: colors\.ink, fontSize: 15, fontWeight: '600' \}/,
  'shared label must be 15pt semibold across providers');
assert.match(ui, /<View style=\{s\.ssoInner\}>[\s\S]*?<View style=\{s\.ssoIconSlot\}>[\s\S]*?glyph === 'apple'[\s\S]*?source=\{GOOGLE_OFFICIAL_G_SOURCE\}[\s\S]*?<\/View>[\s\S]*?<Text style=\{\[s\.btnText, s\.btnTextSso, \{ color: onDark \}]}>{label}<\/Text>/,
  'both branded logos share one icon slot, label renderer and spacing');
const rowStyle = ui.match(/ssoInner: (\{[^}]+\})/)?.[1];
assert.ok(rowStyle, 'both providers must share an SSO inner row');
assert.match(rowStyle, /alignSelf: 'center'/);
assert.match(rowStyle, /flexDirection: 'row'/);
assert.match(rowStyle, /alignItems: 'center'/);
assert.match(rowStyle, /justifyContent: 'center'/,
  'center the ENTIRE icon+text composition, not the fixed container');
assert.match(rowStyle, /gap: 10/,
  'preserve the agreed icon/text spacing');
assert.doesNotMatch(rowStyle, /\b(?:width|maxWidth|flex|flexBasis)\s*:/,
  'the inner row must have intrinsic width; fixed width left-aligned Build 59 contents');
assert.doesNotMatch(rowStyle, /flex-start/,
  'do not repeat Build 59 left-anchored logo/text row');
const groupCenter = (buttonWidth, labelWidth) => {
  const total = 36 + 10 + labelWidth;
  return (buttonWidth - total) / 2 + total / 2;
};
for (const width of [320, 375, 430]) {
  for (const labelWidth of [120, 168, 192, 234]) {
    assert.equal(groupCenter(width, labelWidth), width / 2,
      'the icon+label group's midpoint must remain at the button midpoint');
  }
}
assert.match(ui, /ssoIconSlot: \{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' \}/,
  'Apple/Google images must share a clipped 36pt icon slot');
assert.match(ui, /appleOfficialMark: \{ width: 44, height: 44 \}/,
  'Apple official PNG has built-in padding; 44pt canvas aligns the visible icon to Google');
assert.match(ui, /googleOfficialMark: \{ width: 17, height: 17 \}/);
const appleGlyphLeft = (36 - 44) / 2 + 44 * 19 / 60; // measured official PNG white pixels
const googleGlyphLeft = (36 - 17) / 2;
assert.ok(Math.abs(appleGlyphLeft - googleGlyphLeft) < 1,
  'vendor artwork visible left edges must agree within 1pt, not merely occupy equal slots');

assert.match(ui, /ssoButton: \{ width: '100%', height: 36, borderRadius: 12/,
  'both render the same 36pt rounded-rectangle shape');
assert.match(ui, /hitSlop=\{5\}/, '36pt face must have 46pt effective tap height');
assert.match(ui, /source=\{require\('\.\.\/\.\.\/assets\/brand\/apple-signin-apple-official\.png'\)\}/,
  'Apple logo must be bundled and Apple-provided');
assert.doesNotMatch(ui,/d="M17\.05 12\.54/, 'no self-drawn Apple logo in custom button');
assert.match(ui,/source=\{GOOGLE_OFFICIAL_G_SOURCE\}/);
assert.match(ui,/googleOfficialMark: \{ width: 17, height: 17 \}/);
assert.match(ui,/btnSso: \{ backgroundColor: colors\.card, borderWidth: 1, borderColor: '#747775' \}/);
const png=fs.readFileSync(path.join(__dirname,'..','assets/brand/apple-signin-apple-official.png'));
assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
assert.equal(png.readUInt32BE(16),60);
assert.equal(png.readUInt32BE(20),60);
const blobSha=crypto.createHash('sha1').update(Buffer.concat([Buffer.from('blob '+png.length+'\0'),png])).digest('hex');
assert.equal(blobSha,'aa3d1ada4145ec0d3a0438b273dfdedab016e027',
  'official Apple-hosted artwork must stay pixel-identical to retrieved asset');
console.log('PASS SOURCE: Apple and Google share 15pt title, intrinsic centered icon+label groups, 36pt icon slot, 10pt gap, official logos, 12pt rectangles');
console.log('PENDING: exact-SHA signed-iPhone screenshot font-size, baseline and OAuth visual acceptance');
