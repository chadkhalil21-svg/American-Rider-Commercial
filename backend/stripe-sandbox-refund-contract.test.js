'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync('backend/stripe-manual-sandbox-acceptance.cjs', 'utf8');

// Accept only sk_test_ credentials, confirm real account and original payment
// are test mode. Refund objects do not have a guaranteed livemode attribute;
// making it mandatory caused a false failure on a genuine succeeded refund.
assert.match(source, /const key=safeSandboxSecretKey\(process\.env\.STRIPE_TEST_SECRET_KEY\)/);
assert.match(source, /assure\(scope\?\.livemode===false/);
assert.match(source, /assure\(pi\.livemode===false&&pi\.status==='requires_capture'/);
assert.match(source, /assure\(captured\.livemode===false&&captured\.status==='succeeded'/);
assert.match(source, /returned\.livemode!==true&&returned\.payment_intent===captured\.id/);
assert.match(source, /refundLatest\.livemode!==true&&[\s\S]*?refundLatest\.payment_intent===captured\.id/);
assert.doesNotMatch(source, /returned\.livemode===false/);
assert.doesNotMatch(source, /refundLatest\.livemode===false/);
assert.match(source, /retried\.id===returned\.id/);
assert.match(source, /listed\.data\.filter\(x=>\['succeeded','pending'\]\.includes\(x\.status\)\)\.length===1/);
assert.match(source, /assure\(refundLatest\.status==='succeeded'/);
console.log('PASS: Stripe sandbox refund verification uses documented mode fields and exact idempotent provider record');
