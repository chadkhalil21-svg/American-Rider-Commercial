'use strict';
// Static contract test for prelaunch screening preparation: no live market or
// payment may be enabled to request a CRA report review.
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
  'screening has a separate early-interest market gate');
assert.match(server, /app\.post\('\/operator\/screening\/existing', requireAuth, LIMITS\.screening, requireScreeningRequestMarket/,
  'screening accepts policy-authorized prelaunch preparation independently of commercial admission');
assert.match(server, /const gate = screeningPreparationFor\(market, region\)/,
  'the screening gate reads the national jurisdiction policy registry');
assert.match(server, /req\.screeningPolicy = gate\.policy/,
  'the server binds the verified screening policy to the request');
assert.doesNotMatch(server, /region\.jurisdiction\?\.stateCode !== 'FL'/,
  'the route no longer hard-codes one state');
assert.match(server, /app\.post\('\/operator\/qualification\/submit', requireAuth, LIMITS\.qualification, requireOperatorPreparationMarket/,
  'qualification review is allowed before market opening, while duty and payments remain separately gated');
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
assert.match(ui, /\.\.\.area\.waitlist/, 'Operator can find listed prelaunch counties');
assert.match(ui, /if \(!area\?\.market\)/,
  'the Operator must select a county before source-verified preparatory checks');
assert.match(server, /app\.post\('\/operator\/document', requireAuth, LIMITS\.document, requireFreshAuth, requireOperatorPreparationMarket/,
  'documents and screening are both preparatory; neither approves paid Travel');
assert.match(ui, /disabled=\{submitting \|\| !area\?\.market\}/,
  'Operator must choose an area; the server checks real documents without granting paid duty');
assert.match(connect, /waitlist: Market\[\]/, 'API client carries waitlist options');
assert.match(bg, /mode: requestMode/, 'existing/new screening requests are both supported');
assert.match(bg, /disabled=\{busy \|\| !releaseAuthorized\}/, 'request requires Operator authorization');
assert.match(ops, /app\.get\('\/ops\/screening'/, 'named reviewer has a screening queue');
assert.match(external, /permissiblePurposeVerified/, 'review requires permitted purpose');
for(const lang of ['en','es','fr','it','de']) {
  assert.match(read('src/i18n/'+lang+'.ts'), /bgProviderPending: '.{70,}',/,
    'screening waiting guidance must exist in '+lang);
}
console.log('PASS provider-neutral prelaunch screening remains an audited, noncommercial preparation workflow');
