'use strict';
// Stripe documents the sk_test_ prefix, not a fixed alphabet for key suffixes.
// Never log the credential. Authenticate using Stripe's actual sandbox API before
// creating any TEST PaymentIntent. A live or restricted-live key is not accepted.
function safeSandboxSecretKey(value) {
  if(typeof value!=='string') return null;
  // A mobile browser may paste a single visibly wrapped Stripe token with
  // embedded layout whitespace or invisible text-formatting marks. Stripe,
  // not this preflight, authenticates the full normalized secret read-only.
  // Never print the secret or silently accept a live/restricted/publishable key.
  const key=value.replace(/[\s\u200B-\u200D\u2060\uFEFF]/gu,'');
  if(!key.startsWith('sk_test_')||key.length<10)return null;
  if(/[\x00-\x1F\x7F]/.test(key))return null;
  return key;
}
module.exports={safeSandboxSecretKey};
