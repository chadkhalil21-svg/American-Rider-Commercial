// Platform communications inbox.
//
// Travel chat is intentionally separate: it is between Traveler and Operator and belongs to a
// Travel. This inbox is American Rider -> account: qualification, insurance, screening,
// payout, policy and support notices. Firestore is the durable record; push/email are delivery
// channels, never the source of truth.

const { adminDb, adminStatus } = require('./firebase-admin');
const { notify } = require('./push');

const ALLOWED = new Set(['qualification','insurance','screening','payout','policy','support','operations']);

async function postPlatformMessage({ uid, category, title, body, action = null, required = true, now = Date.now() }) {
  const db = adminDb();
  if (!db) return { ok: false, reason: adminStatus().reason };
  if (!uid || !ALLOWED.has(String(category)) || !String(title || '').trim() || !String(body || '').trim()) {
    return { ok: false, reason: 'invalid platform message' };
  }
  const ref = db.collection('users').doc(String(uid)).collection('platform_messages').doc();
  const message = {
    category: String(category),
    title: String(title).trim().slice(0, 120),
    body: String(body).trim().slice(0, 3000),
    action: action || null,
    required: required !== false,
    createdAt: now,
    readAt: null,
  };
  await ref.create(message);
  // Best effort. The inbox already exists even if push delivery fails.
  await notify({
    uid, kind: 'platform_message', title: message.title, body: message.body.slice(0, 180),
    // Older Operator builds know /operator/inbox, not the newer shared
    // /inbox alias. When a trusted platform event names its actual report,
    // open that destination directly (e.g. /lost?item=...). Otherwise retain
    // the legacy Operator route until version-aware delivery is commissioned.
    data: {
      screen: typeof action?.screen === 'string' && action.screen.startsWith('/')
        ? action.screen : '/operator/inbox',
      messageId: ref.id,
    },
  }).catch(() => {});
  return { ok: true, id: ref.id, message };
}

async function listPlatformMessages(uid, limit = 50) {
  const db = adminDb();
  if (!db) return { ok: false, reason: adminStatus().reason, messages: [] };
  const requested = Number(limit);
  const pageSize = Number.isInteger(requested) && requested > 0
    ? Math.min(100, requested) : 50;
  try {
    // Native bounded query: never load an account's entire message history.
    const snap = await db.collection('users').doc(String(uid))
      .collection('platform_messages').orderBy('createdAt', 'desc').limit(pageSize).get();
    const messages = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return { ok: true, messages };
  } catch {
    // Express 4 does not implicitly handle a rejected async route. Return a
    // deliberate 503 so the phone shows Retry, never a fake "empty inbox".
    return { ok: false, reason: 'platform_inbox_unavailable', messages: [] };
  }
}

async function markPlatformMessageRead(uid, id, now = Date.now()) {
  const db = adminDb();
  if (!db) return { ok: false, reason: adminStatus().reason };
  try {
    const ref = db.collection('users').doc(String(uid)).collection('platform_messages').doc(String(id));
    const snap = await ref.get();
    if (!snap.exists) return { ok: false, reason: 'not found' };
    // Read-once semantics: reopening a notice must not rewrite the timestamp.
    if (!snap.data()?.readAt) await ref.set({ readAt: now }, { merge: true });
    return { ok: true };
  } catch {
    // Preserve the unread marker if the durable write was not confirmed.
    return { ok: false, reason: 'platform_inbox_unavailable' };
  }
}

module.exports = { ALLOWED, postPlatformMessage, listPlatformMessages, markPlatformMessageRead };
