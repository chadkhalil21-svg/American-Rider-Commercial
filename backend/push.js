// Sending a notification.
//
// EXPO'S PUSH SERVICE, WHICH IS FREE AND NEEDS NO KEY. A POST to exp.host with the token the
// phone registered. No Firebase Cloud Messaging server key, no APNs certificate, no vendor
// account, no monthly cost. When the app is eventually built without Expo's services this is
// the one file that changes.
//
// WHAT MAY BE SENT. Only what a person needs to act on or would be wrong to miss. The
// Notifications screen governs the optional ones, and `notify` checks it before sending —
// which is what makes those toggles real rather than a memory of a preference. Two kinds are
// deliberately NOT optional and are marked `required`:
//   a travel assigned to an operator  — they are on duty; being told is the job
//   a safety check-in                  — see backend/monitor.js
//
// NEVER THROWS. A notification that cannot be sent must not take down the dispatch, the
// charge or the sweep that was sending it. Every failure is returned, not raised.
const { adminDb } = require('./firebase-admin');
const { recordAcceptedTicket } = require('./pushreceipts');

const EXPO_PUSH = 'https://exp.host/--/api/v2/push/send';

/** The preference key each kind of message is governed by, and whether it can be refused. */
// The keys match the rows on app/notifications.tsx exactly. They have to: a preference stored
// under one name and read under another is a toggle that does nothing, which is the state the
// whole screen was in.
const KINDS = {
  travel_assigned: { pref: null, required: true, channel: 'travel' },
  operator_withdrawn: { pref: null, required: true, channel: 'travel' },
  operator_unavailable: { pref: null, required: true, channel: 'travel' },
  check_in: { pref: null, required: true, channel: 'travel' },
  teen_pickup_code: { pref: null, required: true, channel: 'travel' },
  guardian_travel: { pref: null, required: true, channel: 'travel' },
  // A reservation that could not be filled, or could not be paid for. Not refusable: the
  // traveler is otherwise standing outside at 6:30 AM for a car that is not coming.
  scheduled_failed: { pref: null, required: true, channel: 'travel' },
  operator_assigned: { pref: 'enroute', required: false, channel: 'travel' },
  operator_arrived: { pref: 'arrived', required: false, channel: 'travel' },
  travel_complete: { pref: 'complete', required: false, channel: 'travel' },
  // Screening lifecycle. Not refusable: an operator who cannot drive, or is about to lose
  // the ability to, is not receiving marketing — they are being told why their income stops.
  screening_expired: { pref: null, required: true, channel: 'travel' },
  screening_due: { pref: null, required: true, channel: 'travel' },
  operator_account_fee_due: { pref: null, required: true, channel: 'travel' },
  insurance_verification_due: { pref: null, required: true, channel: 'travel' },
  insurance_verification_process: { pref: null, required: true, channel: 'travel' },
  platform_message: { pref: null, required: true, channel: 'travel' },
};

/** The token and preferences for one account, or nulls. */
async function recipient(uid) {
  const db = adminDb();
  if (!db || !uid) return { token: null, prefs: {} };
  try {
    const snap = await db.collection('users').doc(String(uid)).get();
    if (!snap.exists) return { token: null, prefs: {} };
    const u = snap.data();
    return { token: u.pushToken || null, prefs: u.pushPrefs || {} };
  } catch {
    return { token: null, prefs: {} };
  }
}

/**
 * Send one notification.
 *
 * @param uid   who to tell
 * @param kind  one of KINDS — decides whether the person's preferences can refuse it
 * @param title short. It is read on a lock screen, at a glance, possibly at the wheel.
 * @param body  one sentence.
 * @param data  what the app should open. `{ screen: '/ride' }` and so on.
 */
async function notify({ uid, kind, title, body, data }) {
  const rule = KINDS[kind];
  if (!rule) return { ok: false, reason: `unknown notification kind: ${kind}` };

  const { token, prefs } = await recipient(uid);
  if (!token) return { ok: false, reason: 'no push token for this account' };

  // An unset preference means ON. A person who has never opened the Notifications screen has
  // not refused anything, and treating silence as refusal would mean nobody is ever told
  // their operator has arrived.
  if (!rule.required && rule.pref && prefs[rule.pref] === false) {
    return { ok: false, reason: `declined by preference: ${rule.pref}` };
  }

  try {
    const res = await fetch(EXPO_PUSH, {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        to: token,
        title,
        body,
        sound: 'default',
        channelId: rule.channel,
        priority: 'high',
        data: { kind, ...(data || {}), recipientUid: String(uid) },
      }),
    });
    const out = await res.json().catch(() => ({}));
    const ticket = out?.data;
    if (!res.ok) return { ok: false, reason: `push HTTP ${res.status}` };
    if (ticket?.status === 'error') {
      // DeviceNotRegistered means the app was deleted or the token rotated. Dropped, so we
      // stop sending into the void — and so a reinstall re-registers cleanly.
      if (ticket?.details?.error === 'DeviceNotRegistered') await dropToken(uid, token);
      return { ok: false, reason: ticket.message || 'push rejected' };
    }
    if (ticket?.status !== 'ok' || typeof ticket.id !== 'string' || !ticket.id.trim()) {
      return { ok: false, reason: 'push acceptance ticket missing' };
    }
    // Safety tickets MUST be durable before declaring notification tracking
    // successful. A valid Expo ticket is still not a phone delivery result.
    if(kind==='check_in'){
      const tracked=await recordAcceptedTicket({uid:String(uid),kind,token,ticketId:ticket.id});
      if(!tracked.ok)return {ok:false,reason:tracked.reason,id:ticket.id};
    }
    // 'ok' here means accepted by Expo (and for safety, saved for receipt check).
    return { ok: true, id: ticket.id };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

async function dropToken(uid, rejectedToken) {
  const db = adminDb();
  if (!db || !rejectedToken) return;
  try {
    // Expo may reject an old token after the phone re-registered a fresh one.
    // The compare-and-set must be atomic across multiple backend instances.
    await db.runTransaction(async (tx) => {
      const ref = db.collection('users').doc(String(uid));
      const snap = await tx.get(ref);
      if (!snap.exists || snap.data()?.pushToken !== rejectedToken) return;
      tx.set(ref, { pushToken: null }, { merge: true });
    });
  } catch {
    // Never discard a current token or block an unrelated Travel on failure.
  }
}

module.exports = { notify, KINDS };
