// Private Cloudflare R2 object storage.
//
// Credentials live only on the backend. The app receives five-minute AWS Signature V4 URLs
// scoped to one object. This uses Node's built-in crypto so backend/package-lock.json remains
// authoritative and deployments stay reproducible.
const crypto = require('node:crypto');
const { readKey } = require('./env');

const BUCKET = readKey('R2_BUCKET') || 'american-rider-private';
const ACCOUNT_ID = readKey('R2_ACCOUNT_ID');
const ACCESS_KEY_ID = readKey('R2_ACCESS_KEY_ID');
const SECRET_ACCESS_KEY = readKey('R2_SECRET_ACCESS_KEY');
const REGION = 'auto';
const SERVICE = 's3';
const ready = () => !!(ACCOUNT_ID && ACCESS_KEY_ID && SECRET_ACCESS_KEY && BUCKET);

const safePart = (v) => String(v || '').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 100);
const allowedType = (purpose, v) => /^image\/(jpeg|png|webp|heic|heif)$/i.test(String(v || '')) ||
  (purpose === 'operator-document' && String(v || '').toLowerCase() === 'application/pdf');

function objectKey({ uid, purpose, kind, id }) {
  const owner = safePart(uid);
  if (!owner) return null;
  if (purpose === 'operator-document') {
    const k = safePart(kind);
    if (!['license', 'registration', 'inspection', 'insurance'].includes(k)) return null;
    return `operator-documents/${owner}/${k}-${Date.now()}-${safePart(id)}`;
  }
  if (purpose === 'lost-item') return `lost-items/${owner}/${Date.now()}-${safePart(id)}`;
  return null;
}
function owns(key, uid, purpose) {
  const prefix = purpose === 'operator-document' ? 'operator-documents' : purpose === 'lost-item' ? 'lost-items' : '';
  return !!prefix && String(key || '').startsWith(`${prefix}/${safePart(uid)}/`);
}
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
const hmac = (key, value) => crypto.createHmac('sha256', key).update(value).digest();
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
function signKey(date) {
  const d = hmac(Buffer.from('AWS4' + SECRET_ACCESS_KEY), date);
  const r = hmac(d, REGION); const s = hmac(r, SERVICE); return hmac(s, 'aws4_request');
}
function presign({ method, key, expires = 300 }) {
  if (!ready()) return null;
  const now = new Date();
  const amz = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = amz.slice(0, 8);
  const host = `${ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const path = '/' + enc(BUCKET) + '/' + String(key).split('/').map(enc).join('/');
  const scope = `${date}/${REGION}/${SERVICE}/aws4_request`;
  const q = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${ACCESS_KEY_ID}/${scope}`,
    'X-Amz-Date': amz,
    'X-Amz-Expires': String(expires),
    'X-Amz-SignedHeaders': 'host',
  };
  const query = Object.keys(q).sort().map((k) => `${enc(k)}=${enc(q[k])}`).join('&');
  const canonical = [method, path, query, 'host:' + host + '\n', 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', amz, scope, sha(canonical)].join('\n');
  const signature = crypto.createHmac('sha256', signKey(date)).update(stringToSign).digest('hex');
  return `https://${host}${path}?${query}&X-Amz-Signature=${signature}`;
}
async function uploadUrl({ uid, purpose, kind, contentType, id }) {
  const key = objectKey({ uid, purpose, kind, id });
  if (!ready() || !key) return { ok: false, code: 'storage_not_configured' };
  if (!allowedType(purpose, contentType)) return { ok: false, code: 'unsupported_type' };
  return { ok: true, key, url: presign({ method: 'PUT', key }) };
}
async function readUrl(key) { return presign({ method: 'GET', key }); }

module.exports = { ready, uploadUrl, readUrl, owns, BUCKET };
