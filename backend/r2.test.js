const assert = require('node:assert/strict');

// Configure before loading the module because env values are intentionally captured at boot.
process.env.R2_ACCOUNT_ID = 'acct123';
process.env.R2_ACCESS_KEY_ID = 'access123';
process.env.R2_SECRET_ACCESS_KEY = 'secret123';
process.env.R2_BUCKET = 'american-rider-private';
const r2 = require('./r2');

(async () => {
  assert.equal(r2.ready(), true);
  const a = await r2.uploadUrl({ uid: 'user_A', purpose: 'operator-document', kind: 'insurance', contentType: 'image/jpeg', id: 'abc' });
  assert.equal(a.ok, true);
  assert.match(a.key, /^operator-documents\/user_A\/insurance-/);
  assert.equal(r2.owns(a.key, 'user_A', 'operator-document'), true);
  assert.equal(r2.owns(a.key, 'user_B', 'operator-document'), false);
  assert.match(a.url, /^https:\/\/acct123\.r2\.cloudflarestorage\.com\/american-rider-private\//);
  assert.match(a.url, /X-Amz-Expires=300/);
  assert.ok(!a.url.includes('secret123'));

  const pdf = await r2.uploadUrl({ uid: 'user_A', purpose: 'operator-document', kind: 'insurance', contentType: 'application/pdf', id: 'pdf' });
  assert.equal(pdf.ok, true);
  assert.equal(r2.owns(pdf.key, 'user_A', 'operator-document'), true);
  assert.equal(r2.owns(pdf.key, 'user_B', 'operator-document'), false);
  const lostPdf = await r2.uploadUrl({ uid: 'user_A', purpose: 'lost-item', contentType: 'application/pdf', id: 'not-supported' });
  assert.equal(lostPdf.code, 'unsupported_type');

  const lost = await r2.uploadUrl({ uid: 'user_A', purpose: 'lost-item', contentType: 'image/png', id: 'def' });
  assert.equal(lost.ok, true);
  assert.equal(r2.owns(lost.key, 'user_A', 'lost-item'), true);
  assert.equal(r2.owns(lost.key, 'user_A', 'operator-document'), false);

  const bad = await r2.uploadUrl({ uid: 'user_A', purpose: 'lost-item', contentType: 'text/html', id: 'x' });
  assert.deepEqual(bad, { ok: false, code: 'unsupported_type' });
  const read = await r2.readUrl(lost.key);
  assert.match(read, /X-Amz-Signature=/);
  console.log('R2 private storage tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
