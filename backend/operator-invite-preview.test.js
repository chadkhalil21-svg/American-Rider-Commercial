'use strict';
// Render's SPA export does not handle nested direct URLs without a rewrite.
// The dedicated preview page is a real static file that Expo copies to dist.
// Keep preview copy aligned with the source, while paid referrals remain off.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('public/operator/invite.html');
const alias=read('public/operator/invite/index.html');
const app=read('app/operator/invite.tsx');
const translations=read('src/i18n/en.ts');
for(const value of [
  'Invitations','Invite a Traveler','Invite an Operator',
  'Send a link privately. American Rider does not request your contacts.',
  'Invitations are not yet available.'
]){
  assert.ok(html.includes(value),'preview missing exact visible copy: '+value);
  assert.ok(translations.includes(value),'native source missing visible copy: '+value);
}
assert.match(alias,/url=\/operator\/invite\.html/);
assert.match(app,/referralInviteUnavailable/);
assert.match(html,/WEB PREVIEW/);
assert.doesNotMatch(html,/Stripe|commission|\$30|\$0\.15|QR code|createPaymentIntent/i);
assert.doesNotMatch(html,/<form|fetch\(|XMLHttpRequest|data:text\/html/i);
console.log('PASS: static nested Operator invitations preview, no payment promises');
