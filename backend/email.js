// Email American Rider sends to travelers and operators.
//
// WHAT WAS MISSING. Resend was wired for ONE thing: alerting us about a support case. A
// traveler completed a journey, was charged, and received nothing — no receipt, no record,
// nothing to forward to an expense system or hand to an accountant. The Travel Receipt existed
// only inside the app, on the phone that took the journey.
//
// BRAND-BUILT, NOT BRAND-COLOURED (Chad's standing rule). The letterhead lockup, the wordmark,
// NATIONAL TRANSPORTATION, the app's own tokens hex for hex, mono for the amount and the
// travel number. A receipt is the most-kept thing we send; it is not the place for a template.
//
// PLAIN TEXT IS SENT ALONGSIDE, always. Some people read mail as text, and a receipt that is
// unreadable without HTML is a receipt that cannot be kept.
const { readKey } = require('./env');

const T = {
  paper: '#F7F7F5', ink: '#14171F', hairline: '#ECEBE6', border: '#E3E2DC',
  muted: '#8A8A82', faint: '#B4B3AB', blue: '#2E5FE0',
};

const money = (cents) => `$${((Number(cents) || 0) / 100).toFixed(2)}`;

// OWASP HTML text-node encoding: names and addresses are DATA, not markup.
// Apply at the HTML boundary; preserve unescaped plain text and subject.
const escapeHtmlText = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;',
})[char]);

/** Is email configured at all? `/health` reports this so a silent outage is impossible. */
const emailReady = () => !!(readKey('RESEND_API_KEY') && readKey('MAIL_FROM'));

/**
 * Send one message. Returns { ok, reason }. NEVER throws — a receipt that cannot be sent must
 * not undo a journey that happened or a payment that succeeded.
 */
async function send({ to, subject, html, text, from: fromOverride, replyTo, idempotencyKey }) {
  const key = readKey('RESEND_API_KEY');
  const from = fromOverride || readKey('MAIL_FROM') || 'American Rider <receipts@americanrider.tech>'; 
  if (!key) return { ok: false, reason: 'RESEND_API_KEY is not set' };
  if (!to) return { ok: false, reason: 'no address for this account' };
  // Optional stable event key for future durable outbox retries. The provider
  // deduplicates only for 24 hours and only for IDENTICAL message payloads.
  if (idempotencyKey !== undefined &&
      (typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9_:/.-]{1,256}$/.test(idempotencyKey)))
    return { ok: false, reason: 'invalid_email_idempotency_key' };
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json',
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
      body: JSON.stringify({ from, to: [to], subject, html, text, ...(replyTo ? { reply_to: replyTo } : {}) }),
    });
    if (!r.ok) return { ok: false, reason: `Resend ${r.status}: ${(await r.text()).slice(0, 200)}` };
    const out = await r.json().catch(() => ({}));
    return { ok: true, id: out?.id || null };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

/** The letterhead every message opens with, and the footer every message closes with. */
function shell(bodyHtml) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:${T.paper};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${T.paper};padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
  <tr><td align="center" style="padding-bottom:26px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
    <div style="font-size:13px;font-weight:600;letter-spacing:4px;color:${T.ink};">AMERICAN RIDER</div>
    <div style="font-size:10.5px;font-weight:600;letter-spacing:2px;color:${T.muted};margin-top:7px;">NATIONAL TRANSPORTATION</div>
  </td></tr>
  ${bodyHtml}
  <tr><td align="center" style="padding-top:26px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:11.5px;color:${T.faint};letter-spacing:1px;">
    AMERICAN RIDER · MIAMI, FL
  </td></tr>
</table></td></tr></table></body></html>`;
}

const row = (k, v, mono) =>
  `<tr>
     <td style="padding:13px 0;border-top:1px solid ${T.hairline};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:14.5px;color:${T.muted};">${escapeHtmlText(k)}</td>
     <td align="right" style="padding:13px 0;border-top:1px solid ${T.hairline};font-family:${mono ? "ui-monospace,'SF Mono',Menlo,monospace" : "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif"};font-size:15px;color:${T.ink};">${escapeHtmlText(v)}</td>
   </tr>`;

/**
 * The Travel Receipt.
 *
 * ONE ALL-IN PRICE, exactly as the app shows it. No itemised platform fee, no processing line
 * — the platform fee absorbs our processing cost and has never been shown to a traveler, and a
 * receipt that itemises what the screens do not is a second version of the price.
 */
function receiptEmail(ride) {
  const total = money(ride.costCents);
  // Origin, destination, duration, distance and total required for a Florida
  // transmitted electronic receipt. Never invent absent telemetry.
  const miles = Number.isFinite(ride.miles) && ride.miles >= 0
    ? Number(ride.miles).toFixed(1) + ' miles' : 'Not recorded';
  const firstBoardedAt = Number(ride.onboardAt);
  const completedAt = Number(ride.completedAt);
  const minutes = Number.isFinite(firstBoardedAt) && firstBoardedAt > 0 &&
    Number.isFinite(completedAt) && completedAt > firstBoardedAt
    ? Math.max(1, Math.round((completedAt - firstBoardedAt) / 60000)) + ' minutes'
    : 'Not recorded';
  const when = new Date(Number(ride.completedAt) || Number(ride.createdAt) || Date.now())
    .toLocaleString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    });

  const html = shell(`
  <tr><td style="background:#ffffff;border:1px solid ${T.hairline};border-radius:16px;padding:24px 24px 22px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
    <div style="font-size:11px;font-weight:600;letter-spacing:1.65px;text-transform:uppercase;color:${T.muted};">Travel Receipt</div>
    <div style="font-size:34px;font-weight:600;letter-spacing:-0.68px;color:${T.ink};margin-top:12px;font-family:ui-monospace,'SF Mono',Menlo,monospace;">${total}</div>
    <div style="font-size:14.5px;color:${T.muted};margin-top:8px;">${when}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;">
      ${row('From', ride.dep || '—')}
      ${row('To', ride.dest || '—')}
      ${row('Duration', minutes)}
      ${row('Distance', miles)}
      ${row('Class', ride.travelClass || 'Standard')}
      ${row('Operator', ride.operatorName || '—')}
      ${row('Travel Number', ride.tripNo || '—', true)}
      ${ride.tipCents ? row('Gratuity, paid in full to your operator', money(ride.tipCents), true) : ''}
    </table>
  </td></tr>
  <tr><td style="padding-top:14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:13.5px;color:${T.muted};line-height:20px;">
    Your operator keeps 99% of the travel fare.
    Questions about this travel: <a href="mailto:support@americanrider.tech" style="color:${T.blue};">support@americanrider.tech</a>, quoting the travel number.
  </td></tr>`);

  const text =
    `AMERICAN RIDER — NATIONAL TRANSPORTATION\n\n` +
    `TRAVEL RECEIPT\n${total}\n${when}\n\n` +
    `From:          ${ride.dep || '—'}\n` +
    `To:            ${ride.dest || '—'}\n` +
    `Duration:      ${minutes}\n` +
    `Distance:      ${miles}\n` +
    `Class:         ${ride.travelClass || 'Standard'}\n` +
    `Operator:      ${ride.operatorName || '—'}\n` +
    `Travel Number: ${ride.tripNo || '—'}\n` +
    (ride.tipCents ? `Gratuity:      ${money(ride.tipCents)} (paid in full to your operator)\n` : '') +
    `\nYour operator keeps 99% of the travel fare.\n` +
    `Questions: support@americanrider.tech, quoting the travel number.\n`;

  return { subject: `Travel Receipt · ${ride.tripNo || 'American Rider'} · ${total}`, html, text };
}

/** What an operator is told when money has actually moved to their account. */
function payoutEmail({ operatorName, amountCents, tripNo, dep, dest }) {
  const amount = money(amountCents);
  const html = shell(`
  <tr><td style="background:#ffffff;border:1px solid ${T.hairline};border-radius:16px;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
    <div style="font-size:11px;font-weight:600;letter-spacing:1.65px;text-transform:uppercase;color:${T.muted};">Travel Settled</div>
    <div style="font-size:34px;font-weight:600;letter-spacing:-0.68px;color:${T.ink};margin-top:12px;font-family:ui-monospace,'SF Mono',Menlo,monospace;">${amount}</div>
    <div style="font-size:14.5px;color:${T.muted};margin-top:8px;">Sent to your account.</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;">
      ${row('Route', `${dep || '—'} to ${dest || '—'}`)}
      ${row('Travel Number', tripNo || '—', true)}
    </table>
  </td></tr>`);
  const text =
    `AMERICAN RIDER — NATIONAL TRANSPORTATION\n\nTRAVEL SETTLED\n${amount} sent to your account.\n\n` +
    `Route:         ${dep || '—'} to ${dest || '—'}\nTravel Number: ${tripNo || '—'}\n`;
  return { subject: `Travel Settled · ${tripNo || ''} · ${amount}`.trim(), html, text };
}

module.exports = { send, receiptEmail, payoutEmail, emailReady, money };
