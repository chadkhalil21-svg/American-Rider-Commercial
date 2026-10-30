// Privately view an Operator's original uploaded document in named Operations.
// The app stores only a private R2 object key; never publish signed URLs in HTML.
// Bound downloads and validate bytes before returning them to an authenticated reviewer.
const MAX_VIEW_BYTES = 15 * 1024 * 1024;
const DOCUMENT_KINDS = new Set(['license', 'registration', 'insurance', 'inspection']);

function viewContentType(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'image/png';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.length >= 12 && /^ftyp(heic|heix|hevc|hevx|mif1)/.test(buf.toString('ascii', 4, 12))) return 'image/heic';
  if (buf.length >= 5 && buf.toString('ascii', 0, 5) === '%PDF-') return 'application/pdf';
  return null;
}

async function loadPrivateReviewDocument({ uid, kind, documents, owns, readUrl, fetcher = fetch }) {
  if (!uid || uid.length > 128 || !DOCUMENT_KINDS.has(kind)) return { status: 404 };
  const key = documents?.[kind]?.objectKey;
  if (typeof key !== 'string' || !owns(key, uid, 'operator-document')) return { status: 404 };
  const url = await readUrl(key);
  if (!url) return { status: 503 };
  const response = await fetcher(url, { redirect: 'error' });
  if (!response?.ok || !response.body) return { status: 502 };
  const size = Number(response.headers?.get?.('content-length') || 0);
  if (size > MAX_VIEW_BYTES) return { status: 413 };
  const chunks = [];
  let total = 0;
  for await (const chunk of response.body) {
    const buf = Buffer.from(chunk);
    total += buf.length;
    if (total > MAX_VIEW_BYTES) {
      await response.body.cancel?.().catch?.(() => {});
      return { status: 413 };
    }
    chunks.push(buf);
  }
  const body = Buffer.concat(chunks, total);
  const contentType = viewContentType(body);
  if (!contentType) return { status: 415 };
  return { status: 200, contentType, body };
}

module.exports = { MAX_VIEW_BYTES, DOCUMENT_KINDS, viewContentType, loadPrivateReviewDocument };
