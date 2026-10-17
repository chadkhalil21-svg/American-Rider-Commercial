'use strict';
// Static contract test: screening requires an open market and authentic
// jurisdictional clearance. Waitlist interest must never start onboarding.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const server = read('backend/server.js');
const ui = read('app/operator/qualify.tsx');
const connect = read('src/backend/connect.ts');
const bg = read('app/operator/background.tsx');
const ops = read('backend/ops.js');
const external = read('backend/external-screening.js');

assert.match(server, /async function requireScreeningRequestMarket\(req, res, next\)/,
  'screening uses an independent jurisdiction gate after the market opens');
assert.match(server, /app\.post\('\/operator\/screening\/existing', requireAuth, LIMITS\.screening, requireScreeningRequestMarket/,
  'screening has an authenticated policy and market gate');
assert.match(server, /const gate = screeningPreparationFor\(market, region\)/,
  'the screening gate reads the national jurisdiction policy registry');
assert.match(server, /req\.screeningPolicy = gate\.policy/,
  'the server binds the verified screening policy to the request');
assert.doesNotMatch(server, /region\.jurisdiction\?\.stateCode !== 'FL'/,
  'the route no longer hard-codes one state');
assert.match(server, /app\.post\('\/operator\/qualification\/submit', requireAuth, LIMITS\.qualification, requireActiveOperatingMarket/,
  'qualification remains fully admission-gated');
assert.match(server, /app\.post\('\/operator\/online', requireAuth, requireFreshAuth, requireOperationalReadiness/,
  'duty requires launch readiness');
assert.match(server, /filed\?\.stored \|\| !filed\?\.caseNo/,
  'email-only delivery cannot count as a durable screening case');
assert.ok(server.indexOf('const filed = await fileTicket({', server.indexOf("app.post('/operator/screening/existing'")) <
  server.indexOf('const batch = db.batch();',server.indexOf("app.post('/operator/screening/existing'")),
  'case must be stored before changing screening/dispatch state');
assert.match(server, /batch\.set\(ref,[\s\S]*batch\.set\(db\.collection\('operators'\)/,
  'user and fleet changes share one atomic batch');
assert.match(server, /await batch\.commit\(\)/, 'atomic screening transition must commit');
assert.match(server, /transferTo: null/, 'unverified support mailbox is not a secure report destination');
assert.match(server, /reportId: null, conductedAt: null, recheckDue: null, externalVerification: null/,
  'previous clearance cannot remain current when review restarts');
assert.match(server, /jurisdictionCode: policy\.stateCode, policyId: policy\.id/,
  'the new case binds the authoritative state and screening policy');
assert.match(server, /oldCase\.exists && oldCase\.data\(\)\.uid === req\.uid/,
  'repeated request checks case ownership and reuses its existing case');
assert.match(ui, /area\.active\.map\(\(m\) =>/, 'Only already-open counties are offered for Operator registration');
assert.doesNotMatch(ui, /d\.key === 'background' && area\?\.market\?\.status === 'waitlist'/,
  'a waitlisted Operator must not enter screening preparation');
assert.match(ui, /const areaAuthorized = areaActive;/,
  'onboarding cannot start before the selected market opens');
assert.match(server, /app\.post\('\/waitlist', requireAuth, LIMITS\.waitlist/,
  'interest registration is separate and rate-limited');
assert.match(ui, /disabled=\{submitting \|\| !areaAuthorized\}/,
  'Waitlisted Operators cannot submit qualification; the server checks real document completion');
assert.match(connect, /waitlist: Market\[\]/, 'API client carries waitlist options');
assert.match(bg, /mode: requestMode/, 'existing/new screening requests are both supported');
assert.match(bg, /disabled=\{busy \|\| !releaseAuthorized\}/, 'request requires Operator authorization');
assert.match(ops, /app\.get\('\/ops\/screening'/, 'named reviewer has a screening queue');
assert.match(external, /permissiblePurposeVerified/, 'review requires permitted purpose');
for(const lang of ['en','es','fr','it','de']) {
  assert.match(read('src/i18n/'+lang+'.ts'), /bgProviderPending: '.{70,}',/,
    'screening waiting guidance must exist in '+lang);
}
console.log('PASS: unopened markets use lightweight interest only; screening requires active market and jurisdiction policy');
