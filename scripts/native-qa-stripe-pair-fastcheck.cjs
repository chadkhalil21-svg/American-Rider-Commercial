'use strict';
// Cheap, fail-closed Stripe TEST identity check BEFORE expensive emulators or compilers.
// Creates and immediately cancels ONE unconfirmed TEST PaymentIntent; no payment method,
// card charge, live account, customer record, or production Operator is touched.
const assert = require('node:assert/strict');
const e = process.env;
async function request(method, endpoint, key, form) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const resp = await fetch('https://api.stripe.com/v1/' + endpoint, {
      method,
      headers: {
        Authorization: 'Bearer ' + key,
        ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      ...(form ? { body: new URLSearchParams(form) } : {}),
      signal: controller.signal,
    });
    const data = await resp.json().catch(() => ({}));
    return { status: resp.status, data };
  } finally {
    clearTimeout(timer);
  }
}
async function main() {
  assert.equal(e.AR_NATIVE_COMMERCIAL_QA, '1', 'Only isolated native commercial QA may run this check');
  assert.equal(e.AR_NATIVE_QA_LOCAL, '1', 'Local QA marker required');
  assert.equal(e.GOOGLE_CLOUD_PROJECT, 'demo-american-rider-qa', 'Refuse production Google Cloud');
  assert.ok(!e.K_SERVICE && !e.STRIPE_LIVE_SECRET_KEY, 'No live infrastructure');
  const secret = e.STRIPE_SECRET_KEY || '';
  const publishable = e.STRIPE_PUBLISHABLE_KEY || '';
  assert.match(secret, /^sk_test_\S+$/, 'Stripe TEST secret missing or invalid');
  assert.match(publishable, /^pk_test_\S+$/, 'Stripe TEST publishable key missing or invalid');
  let id = null;
  try {
    const create = await request('POST', 'payment_intents', secret, {
      amount: '100', currency: 'usd', 'payment_method_types[0]': 'card',
      capture_method: 'manual', 'metadata[qa_only]': 'true',
      'metadata[purpose]': 'native_key_pair_fastcheck',
    });
    assert.equal(create.status, 200, 'Stripe TEST secret cannot create a disposable intent: ' + create.status);
    const obj = create.data;
    id = obj.id;
    assert.ok(/^pi_[a-zA-Z0-9]+$/.test(id || ''), 'Missing Stripe intent id');
    assert.equal(obj.livemode, false, 'Refuse live Stripe intent');
    assert.equal(obj.status, 'requires_payment_method', 'Intent must remain uncharged');
    const path = 'payment_intents/' + encodeURIComponent(id) +
      '?client_secret=' + encodeURIComponent(obj.client_secret);
    const read = await request('GET', path, publishable);
    assert.equal(read.status, 200, 'STRIPE_TEST_PUBLISHABLE_KEY does not belong to the same TEST account/sandbox as STRIPE_TEST_SECRET_KEY (' +
      String(read.status) + '/' + String(read.data?.error?.code || 'unknown') + ')');
    assert.equal(read.data.id, id, 'Client key returned a different intent');
    assert.equal(read.data.livemode, false, 'Client key returned a live intent');
    console.log('PASS: configured Stripe TEST pair accesses the same uncharged PaymentIntent (no keys printed)');
  } finally {
    if (id) {
      const cancel = await request('POST', 'payment_intents/' + encodeURIComponent(id) + '/cancel', secret);
      assert.equal(cancel.status, 200, 'Failed to cancel disposable unconfirmed QA intent');
      assert.equal(cancel.data.status, 'canceled', 'Diagnostic intent was not canceled');
    }
  }
}
main().catch(err => { console.error('QA STRIPE PAIR PREFLIGHT FAILED: ' + err.message); process.exitCode = 1; });
