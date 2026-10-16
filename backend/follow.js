// FOLLOWING A TRAVEL — the page a trusted contact opens.
//
// WHY THIS EXISTS. Safe Travels offered "Share This Travel" and sent a sentence: a destination
// and a Travel Number. The card above it said "share your live location, operator, and arrival
// time", which was not true — there was no link, no position, and nothing to follow. A safety
// promise the product does not keep is worse than no promise, because a contact told they can
// follow a journey stops checking on the person taking it.
//
// THE TOKEN IS A BEARER CAPABILITY, and that is deliberate. A contact should not need an
// account, an app, or a password at the moment they are worried about somebody — they need a
// link that opens. So possession of the link is the authorisation, which puts the whole design
// weight on the token being unguessable and short-lived:
//
//   - 32 hex characters from crypto.randomBytes. Not a ride id, not derived from anything.
//   - Minted per share, never reused, and only while a travel is actually underway.
//   - Dies when the travel does. After completion the page says the travel ended and shows
//     nothing further — no position, no operator, no history.
//   - Hard expiry regardless, so a link that leaks cannot be replayed a week later against
//     some future travel.
//
// WHAT IT DELIBERATELY DOES NOT SHOW: the traveler's name, their phone, their account, or any
// previous travel. A worried contact needs to know where the car is and who is driving it.
// Everything else is somebody's private life, and this page is public by construction.
const crypto = require('node:crypto');

const { page } = require('./shell');
const { adminDb } = require('./firebase-admin');

/** A shared link outlives the travel by this much, so a contact can see it ended. */
const GRACE_MS = 30 * 60 * 1000;
/** Nothing is followable beyond this, whatever the travel says. */
const MAX_LIFE_MS = 12 * 60 * 60 * 1000;

const ACTIVE = ['assigned', 'accepted', 'arrived', 'onboard'];

const newToken = () => crypto.randomBytes(16).toString('hex');

/**
 * Mint (or reuse) a follow token for a travel the traveler owns.
 * Returns null when the travel is not theirs, or is not underway.
 */
async function issueFollowToken({ rideId, travelerUid, guardianUid = null }) {
  const db = adminDb();
  if (!db || !rideId) return null;
  const ref = db.collection('rides').doc(String(rideId));
  const snap = await ref.get();
  if (!snap.exists) return null;
  const r = snap.data() || {};
  const owner = String(r.travelerUid) === String(travelerUid);
  const guardian = r.party?.teen === true && guardianUid && String(r.party?.guardianUid) === String(guardianUid);
  if (!owner && !guardian) return null;
  if (!ACTIVE.includes(String(r.status))) return null;

  // REUSED WITHIN ONE TRAVEL, so sharing twice does not leave two live links, and a contact
  // who was sent the first one is not silently cut off by the second.
  if (r.followToken && Number(r.followIssuedAt) > Date.now() - MAX_LIFE_MS) {
    return r.followToken;
  }
  const token = newToken();
  await ref.set({ followToken: token, followIssuedAt: Date.now() }, { merge: true });
  return token;
}

/** The travel behind a token, or null. Never throws. */
async function travelForToken(token) {
  const db = adminDb();
  if (!db || !/^[a-f0-9]{32}$/.test(String(token || ''))) return null;
  try {
    const q = await db.collection('rides').where('followToken', '==', String(token)).limit(1).get();
    if (q.empty) return null;
    const d = q.docs[0];
    const r = { id: d.id, ...d.data() };
    const now = Date.now();
    const issuedAt = Number(r.followIssuedAt || 0);
    if (!issuedAt || issuedAt < now - MAX_LIFE_MS) return null;

    // A contact may see that the Travel ended, but the bearer link does not remain a
    // long-lived location/itinerary capability. Completed and cancelled Travel get only the
    // short grace period promised by this module.
    const status = String(r.status || '');
    if (!ACTIVE.includes(status)) {
      const endedAt = Number(r.completedAt || r.statusAt || issuedAt);
      if (!endedAt || endedAt < now - GRACE_MS) return null;
    }
    return r;
  } catch {
    return null;
  }
}

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

const STATUS_WORDS = {
  assigned: 'An operator is being assigned',
  accepted: 'On the way to the pickup',
  arrived: 'Waiting at the pickup',
  onboard: 'Travelling',
  completed: 'This travel has ended',
  cancelled: 'This travel was cancelled',
};

/** The page itself. `r` is null when the link is unknown or expired. */
function followPage(r) {
  if (!r) {
    return page(
      'Travel',
      `<h1>This link is no longer active</h1>
       <p>A follow link works while a travel is underway and for a short time afterwards.
       Ask the traveler to share a new one.</p>`,
    );
  }
  const status = String(r.status || '');
  const ended = !ACTIVE.includes(status);
  // No route, Operator, plate or last position after the Travel is over.
  // A public bearer link may outlive completion briefly only to say it ended.
  if (ended) return page('Travel',
    `<h1>${esc(STATUS_WORDS[status] || 'This travel has ended')}</h1>
     <p>This Travel is no longer being shared.</p>`);
  const stale = !Number.isFinite(Number(r.opAt)) || Date.now() - Number(r.opAt) > 5 * 60 * 1000;

  // A POSITION WE CANNOT VOUCH FOR IS NOT SHOWN. An old pin is worse than none: a contact
  // reading a map has no way to tell a stopped car from a stopped feed, and this page exists
  // for the case where that difference matters.
  const position =
    ended || stale || !Number.isFinite(Number(r.opLat))
      ? `<p class="muted">Live position is not available right now.</p>`
      : `<p><a href="https://maps.apple.com/?ll=${Number(r.opLat)},${Number(r.opLng)}&q=Vehicle"
            rel="noopener">Open the vehicle's last position in Maps</a><br>
         <span class="muted">Updated ${Math.max(0, Math.round((Date.now() - Number(r.opAt)) / 60000))} min ago</span></p>`;

  return page(
    'Travel',
    `<h1>${esc(STATUS_WORDS[status] || 'Travel')}</h1>
     <p class="updated">Travel Number ${esc(r.tripNo || r.id)}</p>
     ${ended ? '' : position}
     <section><h2>Operator</h2>
       <p>${esc(r.operatorName || 'Being assigned')}${r.operatorCar ? ` &middot; ${esc(r.operatorCar)}` : ''}${
         r.operatorPlate ? ` &middot; plate ${esc(r.operatorPlate)}` : ''
       }</p></section>
     <section><h2>Route</h2>
       <p>${esc(r.dep || '')} &rarr; ${esc(r.dest || '')}</p></section>
     <div class="panel">This page was shared by the traveler and stops working when the travel
     ends. American Rider does not show their name, their number, or any other travel here.</div>`,
  );
}

module.exports = { issueFollowToken, travelForToken, followPage, GRACE_MS, MAX_LIFE_MS };
