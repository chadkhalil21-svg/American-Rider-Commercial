'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {safeSandboxSecretKey}=require('./stripe-test-key-policy');
for(let i=0;i<2;i++){
 assert.equal(safeSandboxSecretKey('sk_test_fake_with_underscores_123'),
   'sk_test_fake_with_underscores_123');
 assert.equal(safeSandboxSecretKey('sk_test_dummy_1\n'), 'sk_test_dummy_1');
 assert.equal(safeSandboxSecretKey('  sk_test_dummy_1  '),'sk_test_dummy_1');
 // Responsive/mobile token cells may wrap one complete secret into several lines.
 assert.equal(safeSandboxSecretKey('sk_test_some_long\nwrapped\r\nsecret'),
   'sk_test_some_longwrappedsecret');
 assert.equal(safeSandboxSecretKey('sk_test_some_\u200Bwrapped\u2060token'),
   'sk_test_some_wrappedtoken');
 assert.equal(safeSandboxSecretKey('sk_test_interior space'),'sk_test_interiorspace');
 for(const bad of ['',null,undefined,'sk_test_','sk_live_not_allowed',
   'rk_test_restricted','rk_live_not_allowed','pk_test_public',
   'mk_key_identifier','sk_test_bad\u0007control']){
   assert.equal(safeSandboxSecretKey(bad),null);
 }
 const src=fs.readFileSync(path.join(__dirname,'stripe-manual-sandbox-acceptance.cjs'),'utf8');
 assert(src.includes('safeSandboxSecretKey(process.env.STRIPE_TEST_SECRET_KEY)'));
 assert(src.includes('const scope=await stripe.balance.retrieve()'));
 assert(src.includes('scope?.livemode===false'));
 assert(src.indexOf('scope?.livemode===false')<src.indexOf("const full=await authorize('complete')"),
   'Provider-confirmed sandbox must precede test financial writes');
 assert(!src.includes('console.log(key)'),'Never print an API key');
}
console.log('PASS twice: mobile soft-wrap tolerant, live/restricted/control tokens blocked, Stripe sandbox confirmed before any financial write');
