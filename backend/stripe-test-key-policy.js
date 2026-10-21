'use strict';
// Stripe documents the sk_test_ prefix, not a fixed alphabet for key suffixes.
// Never log the credential. Authenticate using Stripe's actual sandbox API before
// creating any TEST PaymentIntent. A live or restricted-live key is not accepted.
function safeSandboxSecretKey(value) {
  if(typeof value!=='string') return null;
  const key=value.trim();
  if(!key.startsWith('sk_test_')||key.length<10||/\s/.test(key))return null;
  return key;
}
module.exports={safeSandboxSecretKey};
