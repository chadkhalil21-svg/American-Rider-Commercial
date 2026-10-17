// Operator review must not dead-end after a handset restart, when transient
// document OCR verdicts disappear from local React state. Only the server can decide.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const qualify = fs.readFileSync(path.join(__dirname,'../app/operator/qualify.tsx'), 'utf8');
const context = fs.readFileSync(path.join(__dirname,'../src/state/OperatorContext.tsx'), 'utf8');
const server = fs.readFileSync(path.join(__dirname,'server.js'), 'utf8');
const review = fs.readFileSync(path.join(__dirname,'../app/operator/review.tsx'), 'utf8');

assert.match(qualify, /label=\{t\('traveler\.qualSubmitReview'\)\}/,
  'The review submission must have one clear name');
assert.match(qualify, /disabled=\{submitting \|\| !area\?\.market\}/,
  'Submission cannot depend on memory-only uploaded-document review flags');
assert.doesNotMatch(qualify, /disabled=\{!done \|\| submitting/,
  'After phone restart, local review flags disappear and would trap an Operator');
assert.match(qualify, /const out = await op\.submitQualification\(\)/);
assert.match(qualify, /setSubmitError\(out\.error \|\| null\)/,
  'The server must return an actionable reason if an item is genuinely missing');
assert.match(context, /const \[docReviews, setDocReviews\] = useState/,
  'The memory-only source of the old dead-end is explicitly recognized');
assert.match(server, /app\.post\('\/operator\/qualification\/submit', requireAuth, LIMITS\.qualification, requireOperatorPreparationMarket/,
  'Authenticated jurisdiction-checked backend owns the eligibility decision');
assert.match(server, /const a = await assessAndRecord\(\{ db, uid: req\.uid, checks: qualificationChecks, liveMoney: operationalMode \}\)/);
assert.match(server, /if \(a\.status === 'incomplete'\)/,
  'Incomplete applications must remain server-rejected');
assert.match(review, /if \(s\.status === 'qualified'/);
assert.match(review, /else if \(s\.status === 'incomplete'\)/,
  'Server status determines whether user is commissioned or sent back for missing evidence');
console.log('Operator review submission survives handset restarts without weakening server eligibility');
