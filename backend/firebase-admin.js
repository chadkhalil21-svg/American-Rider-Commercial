// Firebase Admin — the server's own connection to Firestore.
//
// WHY THIS FILE HAD TO EXIST. backend/tickets.js did `require('firebase-admin')` inside a
// try/catch and used `admin.apps.length ? admin.firestore() : false`. Nothing anywhere ever
// called initializeApp, and `firebase-admin` was not in backend/package.json at all — so the
// require threw, the catch swallowed it, `db()` returned false forever, and `fileTicket`
// returned { ok: false } on every case ever filed, in production, since the day it shipped.
//
// The app was honest about it — Patron Support said "We could not open your case
// automatically" and the emergency screen said "Not reached from this device" — which is why
// nobody noticed. Truthful failure reporting made a total outage look like a considered
// edge case. Verifying that a screen tells the truth when a mechanism fails is not the same
// as verifying the mechanism works, and this is the file that closes that gap.
//
// CREDENTIALS. A server cannot use the web config in firebase-config.js; it needs a service
// account. Provide ONE of:
//   FIREBASE_SERVICE_ACCOUNT       the service account JSON, pasted whole into the env var
//   GOOGLE_APPLICATION_CREDENTIALS a path to that JSON on disk (Google's own convention)
// Generate it at: Firebase console → Project settings → Service accounts → Generate new
// private key. It is a REAL SECRET — it goes in backend/.env (gitignored) and in Render's
// environment, never in the repo.
const { readKey } = require('./env');

let _state = null;

/**
 * Returns { db, ok, reason }. `ok:false` always carries a reason, because the whole point of
 * this file is that a missing database can never again be invisible.
 */
function admin() {
  if (_state) return _state;

  // The MODULAR entry points, not the default export. `require('firebase-admin').apps` is
  // undefined in current versions — the first version of this file used it and reported
  // "Cannot read properties of undefined (reading 'length')" instead of the real problem.
  let appMod;
  let firestoreMod;
  try {
    appMod = require('firebase-admin/app');
    firestoreMod = require('firebase-admin/firestore');
  } catch (e) {
    _state = { db: null, ok: false, reason: `firebase-admin is not installed: ${e.message}` };
    return _state;
  }

  try {
    if (!appMod.getApps().length) {
      // NOT through readKey(). That strips ALL whitespace, which is correct for an API key
      // (no key we use contains any, so a wrapped paste self-heals) and destructive for a
      // JSON document, where whitespace inside string values is content. Trim the ends only.
      const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim().replace(/^["']|["']$/g, '');
      const path = readKey('GOOGLE_APPLICATION_CREDENTIALS');
      if (raw) {
        appMod.initializeApp({ credential: appMod.cert(JSON.parse(raw)) });
      } else if (path) {
        // Local/Render file-backed application default credentials.
        appMod.initializeApp({ credential: appMod.applicationDefault() });
      } else if (process.env.K_SERVICE) {
        // On Cloud Run use a bound, least-privilege workload identity;
        // no Firebase private key is exported to GitHub or copied to staging.
        appMod.initializeApp({ credential: appMod.applicationDefault() });
      } else {
        _state = {
          db: null,
          ok: false,
          reason:
            'no service account — set FIREBASE_SERVICE_ACCOUNT or ' +
            'GOOGLE_APPLICATION_CREDENTIALS locally/on Render; Cloud Run ' +
            'must use its assigned runtime service account',
        };
        return _state;
      }
    }
    _state = { db: firestoreMod.getFirestore(), ok: true, reason: null };
  } catch (e) {
    _state = { db: null, ok: false, reason: `firebase-admin failed to initialize: ${e.message}` };
  }
  return _state;
}

/** The Firestore handle, or null. Callers must treat null as "nothing was stored". */
const adminDb = () => admin().db;

/** Why storage is unavailable, or null when it is available. For /health and for logs. */
const adminStatus = () => ({ ok: admin().ok, reason: admin().reason });

/**
 * Is this Firebase account disabled? A disabled account keeps a valid ID token for up to an
 * hour, and requireAuth verifies the token locally, so this asks Firebase directly.
 * Returns true, false, or null when it cannot tell — callers treat null as "do not allow".
 */
async function accountDisabled(uid) {
  if (!admin().ok) return null;
  try {
    const { getAuth } = require('firebase-admin/auth');
    const u = await getAuth().getUser(String(uid));
    return !!u.disabled;
  } catch {
    return null;
  }
}

module.exports = { adminDb, adminStatus, accountDisabled };
