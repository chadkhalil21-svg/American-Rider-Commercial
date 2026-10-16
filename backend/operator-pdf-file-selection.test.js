// End-to-end source contract: native Files -> bounded signed R2 PDF -> manual review.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const base = path.resolve(__dirname, '..');
const source = (p) => fs.readFileSync(path.join(base, p), 'utf8');

assert.match(source('package.json'), /"expo-document-picker": "~57\.0\.3"/);
const pkg = JSON.parse(source('package.json'));
const lock = JSON.parse(source('package-lock.json'));
assert.equal(lock.packages[''].dependencies['expo-document-picker'], pkg.dependencies['expo-document-picker']);
assert.equal(lock.packages['node_modules/expo-document-picker'].version, '57.0.3');

const mobile = source('src/backend/documentUpload.ts');
assert.match(mobile, /import \* as DocumentPicker from 'expo-document-picker'/);
assert.match(mobile, /DocumentPicker\.getDocumentAsync\(/);
assert.match(mobile, /'application\/pdf'/);
assert.match(mobile, /copyToCacheDirectory: true/);
assert.match(mobile, /blob\.size > MAX_UPLOAD_BYTES/);
assert.match(mobile, /body: JSON\.stringify\(\{ kind, objectKey \}\)/);
assert.doesNotMatch(mobile, /ImagePicker\.launchImageLibraryAsync/);
assert.match(source('src/state/OperatorContext.tsx'), /SelectedDocument \| string/);

const { readDocument } = require('./documents');
async function run() {
  const prior = global.fetch;
  const raw = Buffer.from('%PDF-1.7\n1 0 obj\n<< >>\nendobj\n', 'ascii');
  global.fetch = async () => ({
    ok: true,
    headers: { get: () => String(raw.length) },
    body: Readable.from([raw]),
  });
  try {
    let ocrInvoked = false;
    const d = await readDocument({
      kind: 'insurance',
      imageUrl: 'https://r2.example.com/private-signed-get',
      ocr: async () => { ocrInvoked = true; throw Error('Never OCR a PDF as an image'); },
    });
    assert.equal(d.ok, true);
    assert.equal(d.verdict, 'review');
    assert.match(d.reasons.join(' '), /PDF received/);
    assert.equal(ocrInvoked, false);
  } finally {
    global.fetch = prior;
  }
  console.log('Native file selection and private PDF hold-for-human-review tests passed');
}
run().catch(e => { console.error(e); process.exitCode=1; });
