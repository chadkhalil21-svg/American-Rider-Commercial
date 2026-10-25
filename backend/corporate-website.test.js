'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { build } = require('../scripts/build-corporate-website.cjs');

build();
const root = path.join(__dirname, '..', 'dist-corporate');
const paths = ['', 'travel', 'operate', 'safety', 'company', 'about', 'support', 'recruitment', 'recruiters/portal', 'recruitment/accept', 'smart-travel', 'join', 'download', 'terms', 'privacy', 'account-deletion', 'terms/es', 'privacy/fr'];
for (const route of paths) {
  const p = path.join(root, route, 'index.html');
  assert.ok(fs.existsSync(p), 'Missing public route: ' + route);
  const html = fs.readFileSync(p, 'utf8');
  assert.match(html, /<main id="main">/);
  assert.match(html, /<title>/);
  assert.ok(!html.includes('https://americanrider.app'), 'Old website domain leaked into ' + route);
  assert.ok(!html.includes('onrender.com'), 'Render link leaked into ' + route);
}
// The official-store page is reachable, but unapproved listings cannot be
// advertised as working downloads. Independent publication unlocks each link.
const download=fs.readFileSync(path.join(root,'download','index.html'),'utf8');
const invited=fs.readFileSync(path.join(root,'join','index.html'),'utf8');
for(const html of [download,invited]){
  assert.match(html,/Official app stores/);
  assert.match(html,/App Store · Coming soon/);
  assert.match(html,/Google Play · Coming soon/);
  assert.doesNotMatch(html,/href="https:\/\/apps\.apple\.com/);
  assert.doesNotMatch(html,/href="https:\/\/play\.google\.com/);
}
assert.match(invited,/Copy your invitation code before leaving this page/);
const {storeDownloadChoices}=require('../scripts/build-corporate-website.cjs');
assert.match(storeDownloadChoices({ios:true}),/href="https:\/\/apps\.apple\.com\/app\/id6798078543"/);
assert.doesNotMatch(storeDownloadChoices({ios:true}),/href="https:\/\/play\.google\.com/);
assert.match(storeDownloadChoices({android:true}),/href="https:\/\/play\.google\.com\/store\/apps\/details\?id=com\.americanrider\.app"/);
assert.doesNotMatch(storeDownloadChoices({android:true}),/href="https:\/\/apps\.apple\.com/);

const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.match(home, /American<br>Rider/);
assert.doesNotMatch(home, /99%|Traveler Total|One confirmed Total/);
assert.match(home, /qualified independent Operators/i);
assert.doesNotMatch(home, /Book now|Download on the App Store|nationwide bookings are available/i);
const operators = fs.readFileSync(path.join(root, 'operate', 'index.html'), 'utf8');
assert.match(operators, /\$2\.50/);
// Legacy signed iOS Build 53 opens /about. Keep it identical to the real Company page.
const company=fs.readFileSync(path.join(root,'company','index.html'),'utf8');
const legacyAbout=fs.readFileSync(path.join(root,'about','index.html'),'utf8');
assert.equal(legacyAbout,company,'Old signed About link must render exact current Company page');
const founder=fs.readFileSync(path.join(root,'founder','index.html'),'utf8');
assert.match(founder,/Continue with Google/);
assert.match(founder,/firebasejs\/12\.19\.0\/firebase-auth\.js/);
assert.match(founder,/googleSignInError\(error\)/);
assert.match(founder,/auth\/popup-blocked/);
assert.match(founder,/auth\/unauthorized-domain/);
assert.match(founder,/directly in Safari or Chrome/);
assert.match(founder,/browserSessionPersistence/);
assert.match(founder,/Google sign-in succeeded/);
assert.match(founder,/id="founder-signed-actions" hidden/);
assert.match(founder,/id="founder-account-id"/);
assert.match(founder,/id="founder-retry"/);
assert.match(founder,/id="founder-login-signout"/);
assert.match(founder,/founder-google'\)\.hidden=signedIn/);
assert.match(founder,/response\.status===429/);
const portal=fs.readFileSync(path.join(root,'recruiters','portal','index.html'),'utf8');
assert.match(portal,/noindex,nofollow/);
const invitationSite=fs.readFileSync(path.join(root,'recruitment','accept','index.html'),'utf8');
assert.match(invitationSite,/noindex,nofollow/);
assert.match(invitationSite,/recruiters\/accept/);
assert.match(invitationSite,/history\.replaceState/);
assert.match(invitationSite,/emailVerified/);
assert.match(invitationSite,/browserSessionPersistence/);
assert.match(portal,/private recruiter|recruitment account/i);
assert.match(portal,/recruiters\/me/);
assert.match(portal,/getIdToken/);
assert.match(portal,/recruiters\/link/);
assert.match(portal,/Stripe handles identity and bank verification|Stripe Connect/i);
assert.doesNotMatch(portal,/Bank enrollment, compensation and payment history are not yet commissioned/i);
assert.doesNotMatch(portal,/public self-enroll|Start earning immediately/i);
const recruiter = fs.readFileSync(path.join(root, 'recruitment', 'index.html'), 'utf8');
assert.match(recruiter, /accepting inquiries from prospective independent Recruiters now/i);
assert.match(recruiter,/An inquiry alone does not establish compensation/i);
assert.match(recruiter, /relations@americanrider.tech/i);
assert.equal((recruiter.match(/href="\/recruiters\/portal\/"/g)||[]).length,1,'Recruitment page must present one private Recruiter sign-in path');
assert.doesNotMatch(recruiter,/Invited representatives|No commission rate, payment date/i);
assert.match(recruiter,/recruiter-access-detail/);
assert.match(recruiter,/a verified Recruiter may earn \$0\.15 per qualifying paid and settled Travel/);
assert.doesNotMatch(recruiter, /Friday payout|guaranteed earnings|immediate payouts/i);
const terms = fs.readFileSync(path.join(root, 'terms', 'index.html'), 'utf8');
assert.match(terms, /Terms of Service/);
const privacy = fs.readFileSync(path.join(root, 'privacy', 'index.html'), 'utf8');
assert.match(privacy, /Privacy Policy/);
console.log('Corporate website routes, attribution language, domain isolation and legal continuity: PASS');
