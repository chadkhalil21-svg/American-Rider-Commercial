// Verify a Firebase login (ID token) WITHOUT needing a service-account secret.
//
// When a traveler is signed in, the app can hand the server a short-lived "ID token" — a signed
// proof of who they are, issued by Firebase. It's a JWT signed by Google with a rotating key.
// We verify it by fetching Google's PUBLIC signing certificates and checking the signature plus
// the audience/issuer/expiry. Nothing secret is involved — only the public project id.
const jwt = require('jsonwebtoken');
const { X509Certificate } = require('crypto');

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'american-rider-35688';
const CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const ISSUER = `https://securetoken.google.com/${PROJECT_ID}`;

let certsCache = { at: 0, certs: null };

async function getCerts() {
  const oneHour = 60 * 60 * 1000; // Google rotates these keys roughly daily; cache an hour.
  const now = Date.now();
  if (certsCache.certs && now - certsCache.at < oneHour) return certsCache.certs;
  const res = await fetch(CERTS_URL);
  if (!res.ok) throw new Error('could not fetch Google public certs');
  const certs = await res.json();
  certsCache = { at: now, certs };
  return certs;
}

/**
 * Returns { uid, email, emailVerified } if the token is valid; throws otherwise.
 *
 * IT USED TO RETURN THE uid ALONE, and the email was decoded, verified, and thrown away one
 * line before the return. Twelve places in server.js read `req.email`, so all twelve got
 * undefined — including:
 *
 *   - `send({ to: req.email, ... })` in /travel/settle — the Travel Receipt had NO RECIPIENT.
 *     It never sent. /health reported receipts "on", because the key and the from-address were
 *     configured; send() returned "no address for this account" and that was logged, not shown.
 *   - `receipt_email` on every PaymentIntent — so Stripe's own receipt never sent either.
 *   - every Stripe customer created without an email.
 *   - every support case filed without an address to reply to.
 *
 * Both receipt paths, built at both ends, dead for the same missing line. Found 28 Aug 2026 by
 * running the whole loop end to end and reading Stripe's record of what it had been told.
 */
async function verifyIdToken(idToken) {
  const decoded = jwt.decode(idToken, { complete: true });
  if (!decoded || !decoded.header || !decoded.header.kid) throw new Error('malformed token');
  const certs = await getCerts();
  const certPem = certs[decoded.header.kid];
  if (!certPem) throw new Error('unknown signing key');
  const publicKey = new X509Certificate(certPem).publicKey; // extract the public key from the cert
  const payload = jwt.verify(idToken, publicKey, {
    algorithms: ['RS256'],
    audience: PROJECT_ID,
    issuer: ISSUER,
  });
  if (!payload.sub) throw new Error('no subject in token');
  return {
    uid: payload.sub,
    // Present on every password and Google sign-in. Absent for anonymous or phone-only
    // accounts, which is why every consumer must still handle an empty string.
    email: payload.email || '',
    emailVerified: !!payload.email_verified,
  };
}

// Express middleware: require a valid Firebase login on this request.
// The app sends it as  Authorization: Bearer <idToken>.
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Sign in required' });
    const who = await verifyIdToken(token);
    req.uid = who.uid;
    req.email = who.email;
    req.emailVerified = who.emailVerified;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired sign-in' });
  }
}

/**
 * Identify the caller if they are signed in, and carry on either way.
 *
 * FOR ROUTES THAT ARE OPEN BUT BEHAVE BETTER WHEN THEY KNOW WHO IS ASKING. /fare-quote is the
 * one: a traveler must be able to see a price before signing in, and a traveler who HAS signed
 * in must be quoted on the fee schedule their saved card falls under — the same price they
 * will be charged. Requiring auth would hide pricing; ignoring it would quote one price and
 * charge another.
 *
 * A bad or expired token is treated as no token. This route reveals nothing, so there is
 * nothing to refuse; it simply falls back to the anonymous answer.
 */
/** A valid local JWT does not prove the account remains enabled or its refresh tokens active.
 * Only money/transport mutations use this extra provider round-trip; emergency access remains
 * reachable without an Admin service dependency. */
async function requireFreshAuth(req, res, next) {
  const { adminStatus } = require('./firebase-admin');
  if (!adminStatus().ok) return res.status(503).json({ error: 'Account verification unavailable', code: 'account_verification_unavailable' });
  try {
    const token = String(req.headers.authorization || '').replace(/^Bearer /, '');
    const { getAuth } = require('firebase-admin/auth');
    const decoded = await getAuth().verifyIdToken(token, true);
    if (String(decoded.uid) !== String(req.uid)) throw new Error('identity mismatch');
    next();
  } catch {
    return res.status(401).json({ error: 'Account sign-in was revoked or disabled', code: 'account_revoked' });
  }
}

async function attachAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (token) {
      const who = await verifyIdToken(token);
      req.uid = who.uid;
      req.email = who.email;
      req.emailVerified = who.emailVerified;
    }
  } catch {
    // An unreadable token is an anonymous caller here, not an error.
  }
  next();
}

/**
 * A VERIFIED EMAIL ADDRESS, for the routes a throwaway account can otherwise abuse.
 *
 * WHY IT EXISTS. `emailVerified` has been read from the token and carried on every request
 * since authentication was written, and was checked by nothing. Meanwhile the app never called
 * sendEmailVerification, so it was false on every email-and-password account ever created. A
 * free control, plumbed end to end, and switched on at neither end — which is how it came to
 * be that the answer to "what stops hundreds of fake accounts" was a paid vendor.
 *
 * NOT ON SAFETY ROUTES. An emergency alert is never gated on anything. Somebody in trouble
 * does not stop to check their inbox, and a platform that answers "verify your email" to that
 * person has failed at the only thing it absolutely must not fail at. Those routes are counted
 * instead — see ratelimit.js countOnly().
 *
 * Google and Apple sign-in arrive verified, so this asks nothing of most travelers.
 */
function requireVerifiedEmail(req, res, next) {
  if (req.emailVerified) return next();
  return res.status(403).json({
    code: 'email_not_verified',
    error: 'Confirm your email address first. We sent a link when the account was created.',
  });
}

module.exports = { verifyIdToken, requireAuth, requireFreshAuth, attachAuth, requireVerifiedEmail };
