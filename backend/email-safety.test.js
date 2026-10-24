'use strict';
const assert = require('node:assert/strict');
const { receiptEmail, payoutEmail, send } = require('./email');
const originalKey = process.env.RESEND_API_KEY;
const originalFrom = process.env.MAIL_FROM;
const originalFetch = global.fetch;
const restore = () => {
  if (originalKey == null) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = originalKey;
  if (originalFrom == null) delete process.env.MAIL_FROM;
  else process.env.MAIL_FROM = originalFrom;
  global.fetch = originalFetch;
};
(async () => {
  // Red-team only: no HTTP request. Fields are attacker-controllable data.
  const payload = '<img src=x onerror="alert(1)">';
  const closing = '</td></tr><tr><td>FORGED RECEIPT';
  const amp = 'A & B "Central" O\u0027Hara';
  const receipt = receiptEmail({
    costCents: 2345, tipCents: 500, createdAt: Date.UTC(2026,9,11,4),
    dep: payload, dest: closing, travelClass: '<b>Premium</b>',
    operatorName: amp, tripNo: 'AR-001<script>escape</script>',
  });
  assert.ok(receipt.html.startsWith('<!doctype html>'));
  assert.ok(!receipt.html.includes(payload), 'HTML must not interpret injected location markup');
  assert.ok(!receipt.html.includes(closing), 'HTML must not interpret closing tags in a route');
  assert.ok(!receipt.html.includes('<b>Premium</b>'), 'Travel class is data, not markup');
  assert.ok(!receipt.html.includes('<script>escape</script>'), 'Travel number is data, not markup');
  assert.ok(receipt.html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'));
  assert.ok(receipt.html.includes('&lt;/td&gt;&lt;/tr&gt;&lt;tr&gt;&lt;td&gt;FORGED RECEIPT'));
  assert.ok(receipt.html.includes('A &amp; B &quot;Central&quot; O&#x27;Hara'));
  assert.ok(receipt.html.includes('&lt;b&gt;Premium&lt;/b&gt;'));
  assert.ok(receipt.html.includes('$23.45') && receipt.html.includes('$5.00'),
    'price and gratuity must remain accurate');
  assert.ok(receipt.text.includes(payload) && receipt.text.includes(amp),
    'plain-text alternative must remain readable without HTML entities');
  assert.ok(receipt.subject.includes('AR-001<script>escape</script>'),
    'subject is plain text, not HTML; output encoding must be contextual');
  const fullReceipt = receiptEmail({dep:'A',dest:'B',costCents:1234, miles:4.2,
    onboardAt: Date.UTC(2026,9,24,1,0), completedAt:Date.UTC(2026,9,24,1,14)});
  assert.match(fullReceipt.text,/Duration:\s+14 minutes/);
  assert.match(fullReceipt.text,/Distance:\s+4.2 miles/);
  assert.match(fullReceipt.html,/>14 minutes</);
  assert.match(fullReceipt.html,/>4.2 miles</);
  assert.match(receipt.text,/Duration:\s+Not recorded/);
  assert.match(receipt.text,/Distance:\s+Not recorded/);
  assert.ok(receipt.html.includes('mailto:support@americanrider.tech'),
    'trusted static support link must remain working');

  const payout = payoutEmail({
    operatorName: 'Private Operator', amountCents: 2198, tripNo: payload,
    dep: closing, dest: 'Commerce & 4th',
  });
  assert.ok(!payout.html.includes(payload));
  assert.ok(!payout.html.includes(closing));
  assert.ok(payout.html.includes('Commerce &amp; 4th'));
  assert.ok(payout.text.includes('Commerce & 4th'));
  assert.ok(payout.html.includes('$21.98'));

  const benign = receiptEmail({
    dep: 'Café Río & 5th', dest: 'O\u0027Hare Terminal',
    travelClass: 'Standard', operatorName: 'Ana Martínez',
    tripNo: 'AR-2026-001', costCents: 1899,
  });
  assert.ok(benign.html.includes('Café Río &amp; 5th'));
  assert.ok(benign.html.includes('Ana Martínez'));
  assert.ok(benign.text.includes('Café Río & 5th'));

  let networkCalls = 0;
  global.fetch = async () => { networkCalls++; throw Error('must not call remote provider'); };
  delete process.env.RESEND_API_KEY;
  let result = await send({to:'test@example.invalid', ...receipt});
  assert.equal(result.ok, false, 'missing key must fail closed');
  assert.match(result.reason, /RESEND_API_KEY/);
  assert.equal(networkCalls,0, 'missing key must never invoke Resend');

  process.env.RESEND_API_KEY = 'synthetic_never_live';
  process.env.MAIL_FROM = 'American Rider <receipts@americanrider.app>'; // Existing live sender remains a valid override until explicit cutover.
  result = await send({to:'', ...receipt});
  assert.equal(result.ok,false, 'missing recipient must fail closed');
  assert.equal(networkCalls,0, 'missing recipient must not invoke Resend');

  let observed = null;
  global.fetch = async (url, options) => {
    networkCalls++;
    observed = {url, options};
    return {ok:true,status:200,json:async()=>({id:'synthetic_resend_message_01'})};
  };
  result = await send({to:'fixture@invalid.example', ...receipt, replyTo:'support@americanrider.tech'});
  assert.deepEqual(result,{ok:true,id:'synthetic_resend_message_01'});
  assert.equal(observed.url,'https://api.resend.com/emails');
  assert.equal(observed.options.method,'POST');
  const body = JSON.parse(observed.options.body);
  assert.deepEqual(body.to,['fixture@invalid.example']);
  assert.equal(body.html,receipt.html,'provider payload must receive the escaped HTML intact');
  assert.equal(body.text,receipt.text,'provider must also receive complete text receipt');
  assert.equal(body.reply_to,'support@americanrider.tech');
  assert.match(body.from,/^American\s*Rider\s*<receipts@americanrider\.app>$/,
    'legacy verified sender override must not silently be changed at live cutover');
  assert.equal(observed.options.headers['Content-Type'],'application/json');
  assert.equal(observed.options.headers['Idempotency-Key'],undefined);
  result = await send({to:'fixture@invalid.example', ...receipt, idempotencyKey:'travel-receipt/ride_2026_001'});
  assert.equal(result.ok,true);
  assert.equal(observed.options.headers['Idempotency-Key'],'travel-receipt/ride_2026_001');
  const callsBeforeInvalidKey = networkCalls;
  for (const idempotencyKey of ['bad key', '\\r\\nInjected: true', '', 'x'.repeat(257)]) {
    result = await send({to:'fixture@invalid.example', ...receipt, idempotencyKey});
    assert.equal(result.ok,false,'invalid idempotency key must fail locally');
    assert.equal(result.reason,'invalid_email_idempotency_key');
  }
  assert.equal(networkCalls,callsBeforeInvalidKey,'untrusted email keys must never trigger the provider');

  for (const status of [400, 429, 500, 503]) {
    global.fetch = async () => ({
      ok:false,status,text:async()=>('synthetic vendor failure ' + status),
    });
    result = await send({to:'fixture@invalid.example', ...payout});
    assert.equal(result.ok,false,'Resend '+status+' must never be called delivered');
    assert.match(result.reason, new RegExp(String(status)));
  }

  global.fetch = async () => {throw Error('synthetic offline network');};
  result = await send({to:'fixture@invalid.example', ...receipt});
  assert.equal(result.ok,false,'network loss must not be acknowledged as delivery');
  assert.match(result.reason,/synthetic offline network/);

  global.fetch = async () => ({ok:true,status:202,json:async()=>{throw Error('bad json');}});
  result = await send({to:'fixture@invalid.example', ...receipt});
  assert.equal(result.id,null,'missing provider id cannot be fabricated');
  console.log('PASS HTML-encoded receipt/payout, .tech support contact, safe idempotency, legacy sender override, offline/vendor failures and mocked Resend payload; zero network requests');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(restore);
