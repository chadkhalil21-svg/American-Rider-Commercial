// Operator document review must fetch the original private object, never an obsolete
// public URL, leak its presigned URL, or show a different Operator's evidence.
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const fs = require('node:fs');
const { MAX_VIEW_BYTES, viewContentType, loadPrivateReviewDocument } = require('./operator-document-review');

const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const jpeg = Buffer.from('ffd8ff00', 'hex');
const pdf = Buffer.from('%PDF-1.7\n', 'ascii');
const res = (data, type = 'image/png') => ({
  ok: true,
  headers: { get: (name) => name === 'content-length' ? String(data.length) : type },
  body: Readable.from([data]),
});
const owns = (key, uid, purpose) =>
  key.startsWith('operator-documents/' + uid + '/') && purpose === 'operator-document';
const doc = { insurance: { objectKey: 'operator-documents/person1/insurance-proof' } };
async function run() {
  assert.equal(viewContentType(png), 'image/png');
  assert.equal(viewContentType(jpeg), 'image/jpeg');
  assert.equal(viewContentType(pdf), 'application/pdf');
  assert.equal(MAX_VIEW_BYTES, 15 * 1024 * 1024, 'multi-page policies fit the private review limit');
  const mobile = fs.readFileSync(require.resolve('../src/backend/documentUpload.ts'), 'utf8');
  assert.match(mobile, /const MAX_UPLOAD_BYTES = 15 \* 1024 \* 1024/, 'mobile must accept the same 15 MiB bound');
  const largerPdf = Buffer.concat([pdf, Buffer.alloc(6 * 1024 * 1024, 32)]);
  assert.equal((await loadPrivateReviewDocument({ ...options, fetcher: async () => res(largerPdf, 'application/pdf') })).status, 200,
    'valid scanned PDF above old 5 MiB limit must remain inspectable');
  assert.equal(viewContentType(Buffer.from('<html>x</html>')), null);

  let signed = 0;
  let fetched = 0;
  const options = {
    uid: 'person1',
    kind: 'insurance',
    documents: doc,
    owns,
    readUrl: async (key) => {
      assert.equal(key, doc.insurance.objectKey);
      signed++;
      return 'https://r2.example/private?temporary-signature=secret';
    },
    fetcher: async (url, opts) => {
      assert.match(url, /temporary-signature/);
      assert.equal(opts.redirect, 'error');
      fetched++;
      return res(png);
    },
  };
  const success = await loadPrivateReviewDocument(options);
  assert.equal(success.status, 200);
  assert.equal(success.contentType, 'image/png');
  assert.deepEqual(success.body, png);
  assert.equal(JSON.stringify(success).includes('temporary-signature'), false);
  assert.equal(signed, 1);
  assert.equal(fetched, 1);

  assert.equal((await loadPrivateReviewDocument({ ...options, uid: 'person2' })).status, 404);
  assert.equal((await loadPrivateReviewDocument({ ...options, kind: 'license' })).status, 404);
  assert.equal((await loadPrivateReviewDocument({ ...options, kind: '../insurance' })).status, 404);
  assert.equal(signed, 1, 'wrong-user or missing document must never request a signed URL');
  assert.equal(fetched, 1);
  assert.equal((await loadPrivateReviewDocument({ ...options, readUrl: async () => null })).status, 503);
  assert.equal((await loadPrivateReviewDocument({ ...options, fetcher: async () => ({ ok: false }) })).status, 502);
  assert.equal((await loadPrivateReviewDocument({ ...options, fetcher: async () => res(Buffer.from('<script>')) })).status, 415);
  const tooBig = await loadPrivateReviewDocument({
    ...options,
    fetcher: async () => res(Buffer.alloc(MAX_VIEW_BYTES + 1, 0xff)),
  });
  assert.equal(tooBig.status, 413);

  const ops = fs.readFileSync(require.resolve('./ops'), 'utf8');
  assert.match(ops, /d\.objectKey && r2Owns\(d\.objectKey, u\.id/);
  assert.match(ops, /\/ops\/operators\/document-view\?uid=/);
  assert.match(ops, /app\.get\('\/ops\/operators\/document-view'/);
  assert.match(ops, /opsAuthMode\(\) !== 'named'/);
  assert.match(ops, /loadPrivateReviewDocument\(/);
  assert.doesNotMatch(ops, /d\.imageUrl\s*\?\s*`<br><a/);
  console.log('Private Operator evidence review checks passed');
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
