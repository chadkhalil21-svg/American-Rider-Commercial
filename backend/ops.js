// The operations view — what the platform is doing, right now.
//
// WHY IT EXISTS. Everything the founders knew about their own company came from opening the
// app as a traveler, or from me reading Firestore out loud. There was no place to see travel
// underway, who is on duty, what money moved, or which cases are open. A company cannot launch
// without a window into itself, and "ask Claude" is not that window.
//
// BRAND-BUILT, NOT BRAND-COLOURED (Chad's standing rule). It runs on shell.js — the same
// letterhead, cards, eyebrows, radii and hex the app and the public site use. Mono for amounts
// and travel numbers, never for anything else.
//
// ACCESS. A password kept in OPS_PASSWORD, exchanged for an httpOnly cookie. Not a token in
// the URL: this page shows travelers' routes and operators' earnings, and a URL is copied into
// chats, pasted into search bars and kept in browser history forever.
const crypto = require('crypto');
const { page, T } = require('./shell');
const { adminDb, adminStatus } = require('./firebase-admin');
const {getAuth}=require('firebase-admin/auth');
const {allowedFounderUids,founderTokenAllowed}=require('./founder-readonly-access');
const { readKey } = require('./env');
const { owns: r2Owns, readUrl: r2ReadUrl } = require('./r2');
const { loadPrivateReviewDocument } = require('./operator-document-review');
const { webhookReady } = require('./webhook');
const { emailReady } = require('./email');
const { recordExternalReview } = require('./external-screening');
const { recordScreeningHandoff } = require('./screening-handoff');
const { triageScreeningCase, sortScreeningCases } = require('./screening-case-triage');
const { recordAdverseReview } = require('./external-screening-adverse');
const { monthlyRemittance } = require('./remittance');
const { REQUIRED_DOCS, resolveDocument, setSuspension, assessAndRecord } = require('./qualification');
const { disclosureStale } = require('./matching');
const { applyIndependentConfirmation, continuingStatus } = require('./insurance-monitoring');
const { recordIndependentContact } = require('./insurance-contact-trust');
const { codeFor, totpStep, sessionFor, verifySession } = require('./opssecurity');
const { withinDeadline, OPS_MFA_DEADLINE_MS } = require('./opslatency');
const { loadOpsBoard, UNDERWAY } = require('./opsboarddata');
const { summarizeFirstPartyPricing } = require('./first-party-pricing');
const {founderPlatformCounts,overviewMarkup}=require('./founder-platform-counts');

const COOKIE = 'ar_ops';

// WHO MAY SIGN IN, AND AS WHOM. Every exception decision is audit-logged with the name of the
// person who made it, so a shared password alone cannot say who that was. OPS_USERS names each
// person — "alice:long-password,bob:another-long-password" — and each signs in as themselves.
// OPS_PASSWORD alone still works and signs in as "ops": authenticated, but not attributable to
// one person, which /ops says on every page.
function opsAccounts() {
  const users = readKey('OPS_USERS');
  if (users) {
    return users
      .split(',')
      .map((pair) => {
        const i = pair.indexOf(':');
        return i > 0 ? { name: pair.slice(0, i), pw: pair.slice(i + 1) } : null;
      })
      .filter((x) => x && x.pw && /^[A-Za-z0-9_-]{1,40}$/.test(x.name));
  }
  const pw = readKey('OPS_PASSWORD');
  const mode = sharedMode();
  if (!pw || mode === 'off') return [];
  return [{ name: mode === 'emergency' ? 'ops-shared-emergency' : 'ops-shared-dev', pw }];
}

/**
 * Is this a production server? Render sets RENDER=true on every service; a live Stripe key or
 * NODE_ENV=production says the same. In production the shared password is OFF: an audit trail
 * that says "ops" cannot say who.
 */
function isProduction() {
  return process.env.NODE_ENV === 'production' || process.env.RENDER === 'true' || /^(sk|rk)_live_/.test(readKey('STRIPE_SECRET_KEY') || '');
}

/**
 * How the shared OPS_PASSWORD may be used, when OPS_USERS is not set:
 *   'dev'        not production — allowed, recorded as "ops-shared-dev"
 *   'emergency'  production with OPS_ALLOW_SHARED_PASSWORD=emergency — allowed, recorded as
 *                "ops-shared-emergency", and every page says so. For a lost OPS_USERS only.
 *   'off'        production otherwise
 */
function sharedMode() {
  if (!isProduction()) return 'dev';
  return readKey('OPS_ALLOW_SHARED_PASSWORD') === 'emergency' ? 'emergency' : 'off';
}

function mfaSecret(name) {
  const entry=String(readKey('OPS_MFA_SECRETS')||'').split(',').find((part)=>part.startsWith(`${name}:`));
  const key=entry?.slice(name.length+1)||'';
  return codeFor(key,1) ? key : null;
}
const productionSecurityReady = () => !isProduction() ||
  (String(readKey('OPS_SESSION_SECRET')||'').length>=32 &&
    opsAccounts().length>0 && opsAccounts().every((acct)=>!!mfaSecret(acct.name)));
// Diagnostics stay in private application logs. Never print passwords, MFA keys or session secrets.
function opsConfigurationIssues() {
  const accounts = opsAccounts();
  const issues = [];
  if (!accounts.length) issues.push('OPS_USERS has no valid named account (name:password)');
  if (isProduction()) {
    if (String(readKey('OPS_SESSION_SECRET') || '').length < 32)
      issues.push('OPS_SESSION_SECRET is missing or shorter than 32 characters');
    const lackingMfa = accounts.filter((acct) => !mfaSecret(acct.name)).map((acct) => acct.name);
    if (lackingMfa.length)
      issues.push('OPS_MFA_SECRETS missing or invalid Base32 secret for account(s): ' + lackingMfa.join(', '));
  }
  return issues;
}
const configured = () => opsConfigurationIssues().length === 0;
if (isProduction()) {
  const issues = opsConfigurationIssues();
  if (issues.length) console.warn('[operations] Sign-in blocked: ' + issues.join('; '));
}
const shared = () => !readKey('OPS_USERS') && configured();
// Authenticated Firebase Google identity can sign in as ONE specifically permitted
// named Founder. This is opt-in and never grants admin power to all Google users.
function googleFounderAccount(){
 if(readKey('AR_FOUNDER_GOOGLE_OPS_ENABLED')!=='1')return null;
 const ids=allowedFounderUids();
 const names=String(readKey('AR_RECRUITER_FOUNDER_USERS')||'')
   .split(',').map(x=>x.trim()).filter(Boolean);
 if(ids.length!==1||names.length!==1||!configured())return null;
 const accounts=opsAccounts().filter(x=>x.name===names[0]);
 return accounts.length===1?accounts[0]:null;
}

/** For /health: how /ops is signed in to. */
function opsAuthMode() {
  if (isProduction() && opsAccounts().length && !productionSecurityReady()) return 'off (Ops MFA/session secret required)';
  if (readKey('OPS_USERS') && opsAccounts().length) return 'named';
  if (!readKey('OPS_PASSWORD')) return 'off';
  const m = sharedMode();
  return m === 'off' ? 'off (shared password disabled in production)' : `shared-${m}`;
}

/** Bind delegated credentials to a real, currently enabled named Ops account.
 * A password rotation, secret rotation, account removal or loss of MFA invalidates them.
 * Only the HMAC digest is persisted by OAuth; never the actual password or TOTP secret. */
function oauthActorFingerprint(name) {
  if (opsAuthMode() !== 'named' || !productionSecurityReady()) return null;
  const account = opsAccounts().find(a => a.name === name);
  if (!account) return null;
  return crypto.createHmac('sha256', readKey('OPS_SESSION_SECRET'))
    .update('ar-mcp-v1:' + account.name + ':' + account.pw).digest('hex');
}

/** A session token for one account. Changing that person's password ends their sessions. */
const tokenFor = (acct) => crypto.createHash('sha256').update(`ar-ops:${acct.name}:${acct.pw}`).digest('hex');

/** The signed-in person's name, or null. */
function signedIn(req) {
  const raw = req.headers?.cookie || '';
  const got = raw.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${COOKIE}=`));
  if (!got) return null;
  let value;
  try { value = decodeURIComponent(got.slice(COOKIE.length + 1)); } catch { return null; }
  if (isProduction()) {
    if (!productionSecurityReady()) return null;
    const acct=opsAccounts().find((x)=>x.name===value.split('.')[0]);
    return acct && verifySession(value,acct,readKey('OPS_SESSION_SECRET')) ? acct.name : null;
  }
  const dot = value.lastIndexOf('.');
  if (dot <= 0) return null;
  const name = value.slice(0, dot);
  const acct = opsAccounts().find((x) => x.name === name);
  if (!acct) return null;
  // Constant time, so the cookie cannot be guessed a byte at a time.
  const a = Buffer.from(value.slice(dot + 1));
  const b = Buffer.from(tokenFor(acct));
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? acct.name : null;
}

/** Who did it, for the audit log. */
function actorOf(req) {
  const raw = req.headers?.cookie || '';
  return {
    name: signedIn(req),
    ip: req.ip || req.headers?.['x-forwarded-for'] || null,
    userAgent: req.headers?.['user-agent'] || null,
    // A fingerprint of the session, not the session: enough to tell two sessions apart.
    session: crypto.createHash('sha256').update(raw).digest('hex').slice(0, 12),
  };
}

const money = (c) => `$${((Number(c) || 0) / 100).toFixed(2)}`;
const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const ago = (ms) => {
  if (!ms) return '—';
  const m = Math.round((Date.now() - Number(ms)) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
};

const GOOGLE_LOGIN = `<section><h2>Founder Google sign-in</h2>
<p>Use your approved Google account to manage American Rider.</p>
<p><a class="cta" href="/ops/google">Continue with Google</a></p></section>`;
const LOGIN = `
<h1>Operations</h1>
<p class="lede">Sign in to continue.</p>
<section>
  <form method="post" action="/ops/enter">
    <input type="text" name="name" placeholder="Name" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false"
      style="width:100%;padding:13px 14px;border:1px solid ${T.border};border-radius:13px;
             font-size:16px;background:#fff;color:${T.ink};box-sizing:border-box;margin-bottom:10px;">
    <input type="password" name="password" placeholder="Password" autocomplete="current-password"
      style="width:100%;padding:13px 14px;border:1px solid ${T.border};border-radius:13px;
             font-size:16px;background:#fff;color:${T.ink};box-sizing:border-box;">
    <input type="text" name="otp" placeholder="Authenticator code (production)" inputmode="numeric" autocomplete="one-time-code"
      maxlength="6" style="width:100%;padding:13px 14px;border:1px solid ${T.border};border-radius:13px;
      font-size:16px;background:#fff;color:${T.ink};box-sizing:border-box;margin-top:10px;">
    <button type="submit" class="cta" style="border:0;cursor:pointer;">Sign in</button>
  </form>
  <p style="margin:20px 0 0;font-size:14px"><a href="https://americanrider.tech/founder/" rel="noopener">Read-only Founder overview</a></p>
</section>`;

/** A stat line: a quiet label and a value, the app's own row idiom. */
const stat = (k, v, mono) =>
  `<div><span class="k">${esc(k)}</span><span class="${mono ? 'amount' : ''}">${v}</span></div>`;

const DOC_TITLES = {
  license: 'Driver licence',
  registration: 'Vehicle registration',
  inspection: 'Vehicle inspection',
  insurance: 'Commercial insurance',
};

/** A small form that posts one decision. The session authorises it; SameSite=Lax keeps it ours. */
const noteInput = `<input type="text" name="note" placeholder="Note for the record (required)" required
  style="padding:8px 12px;border:1px solid ${T.border};border-radius:13px;font-size:14px;margin:6px 8px 0 0;min-width:220px;">`;
const small = (name, placeholder, extra = '') => `<input type="text" name="${name}" placeholder="${placeholder}" ${extra}
  style="padding:8px 12px;border:1px solid ${T.border};border-radius:13px;font-size:14px;margin:6px 8px 0 0;width:150px;">`;
const decide = (action, fields, label, extra = '') =>
  `<form method="post" action="${action}" style="margin:6px 0 0 0;">
     ${Object.entries(fields).map(([k, v]) => `<input type="hidden" name="${k}" value="${esc(v)}">`).join('')}
     ${extra}${noteInput}
     <button type="submit" style="border:1px solid ${T.border};background:#fff;color:${T.ink};
       border-radius:13px;padding:8px 14px;font-size:14px;cursor:pointer;margin-top:6px;">${esc(label)}</button>
   </form>`;

const DOC_CODES = /^(document_|insurance_)/;
const dollars = (x) => Number(String(x).replace(/[^0-9.]/g, '')) || undefined;

/**
 * One operator in the exception queue: every finding that stops them qualifying, and the
 * actions a person may take on it. Everything else about them is already automatic.
 */
function exceptionCard(u) {
  const q = u.qualification || {};
  const who = u.legalName || u.name || u.email || u.id;
  const blockers = Array.isArray(q.blockers) ? q.blockers : [];
  const shown = new Set();
  const rows = blockers.map((b) => {
    let actions = '';
    // One set of actions per document, however many findings it has.
    if (b.item && REQUIRED_DOCS.includes(b.item) && DOC_CODES.test(b.code) && !shown.has(b.item) && shown.add(b.item)) {
      const d = u.documents?.[b.item] || {};
      const image = d.objectKey && r2Owns(d.objectKey, u.id, 'operator-document')
        ? `<br><a href="/ops/operators/document-view?uid=${encodeURIComponent(u.id)}&kind=${encodeURIComponent(b.item)}" target="_blank" rel="noopener noreferrer">View private document</a>`
        : '';
      const read = d.evidence?.fields ? `<br>Read: ${esc(JSON.stringify(d.evidence.fields))}` : '';
      const box = (name, label) => `<label style="font-size:13px;margin-right:10px;"><input type="checkbox" name="${name}" value="yes"> ${label}</label>`;
      // What a person states they read on the policy. The same Florida rules then judge it.
      const insurance = b.item === 'insurance'
        ? box('commercialUse', 'Covers passengers for hire') + box('tncUse', 'TNC / for-hire use stated') +
          box('insuredConfirmed', 'Operator is insured or listed') + box('vehicleConfirmed', 'Registered vehicle is listed') + '<br>' +
          small('limitDollars', 'Ride-period limit, $', 'inputmode="numeric"') +
          small('loggedOnPerPersonDollars', 'Logged-on BI per person, $', 'inputmode="numeric"') +
          small('loggedOnPerIncidentDollars', 'Logged-on BI per incident, $', 'inputmode="numeric"') +
          small('loggedOnPropertyDamageDollars', 'Logged-on property damage, $', 'inputmode="numeric"') +
          small('pipDollars', 'PIP, $', 'inputmode="numeric"') +
          small('effectiveDate', 'Policy start YYYY-MM-DD') +
          `<select name="uninsuredMotorist" style="padding:8px;border:1px solid ${T.border};border-radius:13px;margin:6px 8px 0 0;">
             <option value="">UM / UIM…</option><option value="yes">UM / UIM shown</option><option value="rejected_in_writing">UM rejected in writing</option></select>`
        : '';
      actions =
        `<span style="color:${T.faint};font-size:13px;">${esc(d.summary || '')}${image}${read}</span>` +
        decide('/ops/operators/document', { uid: u.id, kind: b.item, action: 'accept' }, 'Accept document',
          small('expiry', 'Expiry YYYY-MM-DD') + insurance) +
        decide('/ops/operators/document', { uid: u.id, kind: b.item, action: 'refuse' }, 'Refuse document');
    } else if (b.item === 'screening') {
      actions = `<span style="color:${T.faint};font-size:13px;">Decided through the screening company's adjudication, not here.</span>`;
    }
    return `<div><span class="k">${esc(b.reason)}<br>
        <span class="mono" style="color:${T.faint};font-size:12px;">${esc(b.code)}${b.item ? ` · ${esc(b.item)}` : ''}</span><br>${actions}</span>
      <span class="amount">${esc(b.kind)}</span></div>`;
  }).join('');
  const suspended = !!u.suspension?.active;
  return `<div class="rows" style="margin-bottom:18px;">
    <div><span class="k"><strong>${esc(who)}</strong><br>
      <span class="mono" style="color:${T.faint};font-size:12px;">${esc(u.id)} · assessed ${ago(q.evaluatedAt)}</span></span>
      <span class="amount">${esc(q.status || '—')}</span></div>
    ${rows}
    <div><span class="k">${decide('/ops/operators/suspension', { uid: u.id, action: suspended ? 'reinstate' : 'suspend' }, suspended ? 'Reinstate' : 'Suspend')}</span></div>
  </div>`;
}

async function board() {
  const db = adminDb();
  if (!db) {
    return `<h1>Operations</h1>
      <section><h2>Not connected</h2><p>${esc(adminStatus().reason)}</p></section>`;
  }

  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const loaded = await loadOpsBoard(db, dayAgo);
  const size = (k) => loaded[k].unavailable ? 'Unavailable' : `${loaded[k].rows.length}${loaded[k].saturated ? '+' : ''}`;
  const unreadable = Object.entries(loaded).filter(([, group]) => group.unavailable).map(([key]) => key);
  const unavailableText = '<p role="alert">This section is unavailable. Do not interpret missing records as none.</p>';
  const pending = loaded.pending.rows
    .sort((a, b) => (a.qualification?.evaluatedAt || 0) - (b.qualification?.evaluatedAt || 0));

  const operators = loaded.operators.rows;
  const scheduled = loaded.scheduled.rows;
  const cases = loaded.cases.rows;
  const underway = loaded.underway.rows.filter((r) => UNDERWAY.includes(r.status)).sort((a, b) => b.createdAt - a.createdAt);
  const today = loaded.recent.rows;
  const completed = today.filter((r) => r.status === 'completed');
  const firstPartyPrices=loaded.recent.unavailable?null:summarizeFirstPartyPricing(today,{saturated:loaded.recent.saturated});
  const onDuty = operators.filter((o) => o.available);
  const owed = loaded.owed.rows;
  const disputed = loaded.disputed.rows;
  const attention = loaded.attention.rows;

  const paid = completed.reduce((n, r) => n + (Number(r.operatorPaidCents) || 0), 0);
  const took = completed.reduce((n, r) => n + (Number(r.platformTakeCents) || 0), 0);
  const owedCents = owed.reduce((n, r) => n + (Number(r.costCents) || 0), 0);

  // THE ONE THING THAT MUST BE AT THE TOP. Anything on fire outranks the numbers.
  const alarms = [];
  if (attention.length) alarms.push(`${size('attention')} travel needing attention`);
  if (disputed.length) alarms.push(`${size('disputed')} disputed payment${disputed.length > 1 ? 's' : ''}`);
  if (owed.length) alarms.push(`${size('owed')} operator payout${owed.length > 1 ? 's' : ''} owed`);
  const noReceipt = loaded.noReceipt.rows;
  if (noReceipt.length) alarms.push(`${size('noReceipt')} receipt${noReceipt.length > 1 ? 's' : ''} not delivered`);
  const waiting = pending.filter((u) => u.qualification?.status === 'exception');
  if (waiting.length) alarms.push(`${size('pending')} operator qualification item${waiting.length > 1 ? 's' : ''} to review`);
  // Real operators only — the demonstration stand-ins are never stored.
  const staleDisclosure = operators.filter((o) => disclosureStale(o));

  const rideRow = (r) =>
    `<div>
       <span class="k">${esc(r.dep || '—')} → ${esc(r.dest || '—')}<br>
         <span style="color:${T.faint};font-size:13px;">${esc(r.operatorName || 'unassigned')} ·
         <span class="mono">${esc(r.tripNo || '')}</span> · ${ago(r.createdAt)}</span>
       </span>
       <span class="amount">${esc(r.status)}${r.monitor?.state && r.monitor.state !== 'clear' ? `<br><span style="font-size:12px;color:${T.blue};">${esc(r.monitor.state)}</span>` : ''}</span>
     </div>`;

  return `
<h1>Operations</h1>
<p class="lede">${new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}</p>
${unreadable.length ? `<section role="alert" style="border:2px solid #B42318;">
  <h2>Operations data incomplete</h2>
  <p>${unreadable.length} dashboard section${unreadable.length === 1 ? ' is' : 's are'} unavailable.
  Counts and empty states cannot certify that emergencies, payout obligations, insurance exceptions or other work are clear.
  Review the affected data sources before making operational decisions.</p>
  <p>Affected sections: ${unreadable.map(esc).join(', ')}.</p>
  </section>` : ''}
<p><a href="/ops/overview">Platform Overview · registered accounts, Operators and Travel records →</a></p>
<p><a href="/ops/markets">Market readiness, evidence and pause controls →</a></p>
<p><a href="/ar/oauth/connections">ChatGPT Operations connection · view or disconnect →</a></p>
<p><a href="/ops/cases?kind=emergency">Urgent and deadline cases · acknowledge →</a> · <a href="/ops/cases?kind=support">Support cases →</a></p>
<p><a href="/ops/scheduled-exceptions">Unresolved scheduled Travel · payment and dispatch review →</a></p>
<p><a href="/ops/screening">Operator screening · verify authenticated agency reports →</a></p>
<p><a href="/ops/disputes">Stripe dispute evidence · review only →</a> · <a href="/ops/pricing-research">Pricing research · quoted price to prepared booking →</a></p>
<section>
  <h2>Pricing research · our own bookings</h2>
  <p>Last 24 hours. Existing Travel records only; no extra database query. Prices shown here are the
  amount recorded when booking was prepared, not independently verified charges.</p>
  ${firstPartyPrices===null
    ? '<p role="alert">Recent booking records unavailable. Pricing outcomes cannot be assessed.</p>'
    : firstPartyPrices.valid===0
      ? '<p>No eligible standard booking records in the sample yet. No price conclusions.</p>'
      : `<p><strong>${firstPartyPrices.valid}</strong> valid recorded bookings in the sample;
        ${firstPartyPrices.excluded} excluded; ${firstPartyPrices.duplicates} duplicates skipped.</p>
        ${firstPartyPrices.segments.map(g=>`<p>
          <strong>${esc(g.marketId)} · ${esc(g.distanceBand)} miles</strong>:
          ${g.recorded} recorded · ${g.completed} completed · ${g.cancelled} cancelled ·
          ${g.other} other stages.
          Recorded median: ${money(g.medianRecordedTotalCents)};
          completed median: ${g.medianCompletedTotalCents===null?'not available':money(g.medianCompletedTotalCents)}.
        </p>`).join('')}`}
  <p><strong>${firstPartyPrices?.saturated?'Partial sample (limit 120 records).':'Bounded recent sample.'}</strong>
  This is not a price-conversion rate: we do not yet count every quote displayed. No
  competitor benchmark, recommendation or automatic fare change is derived from these records.</p>
</section>
${Object.entries(loaded).some(([,g]) => g.saturated)
  ? '<p role="alert"><strong>Some sections show a bounded sample.</strong> A “+” means more records exist. Do not use sample amounts for accounting; reconcile with Stripe and the financial ledger. Check /health for worker saturation.</p>' : ''}

${alarms.length
  ? `<div class="panel" style="background:#FFF4F4;border-color:#F3D8D8;margin-top:18px;">
       <strong>Needs attention.</strong> ${alarms.map(esc).join(' · ')}
     </div>`
  : ''}

<div class="statement">
  <div class="lbl">Travel Underway</div>
  <div class="figure">${size('underway')}</div>
  <div class="note">${size('operators')} operator${onDuty.length === 1 ? '' : 's'} on duty ·
    ${size('scheduled')} reservation${scheduled.length === 1 ? '' : 's'} upcoming</div>
</div>

<section>
  <h2>Recent activity · up to 120 Travels in the last 24 hours</h2>
  <p>These numbers and amounts describe only the records shown, not a complete daily financial or operational total.</p>
  <div class="rows">
    ${stat('Travel completed', loaded.recent.unavailable ? 'Unavailable' : completed.length)}
    ${stat('Travel started', loaded.recent.unavailable ? 'Unavailable' : today.length)}
    ${stat('Paid to operators · sample', loaded.recent.unavailable ? 'Unavailable' : money(paid), true)}
    ${stat('American Rider kept · sample', loaded.recent.unavailable ? 'Unavailable' : money(took), true)}
    <div class="split"></div>
    ${stat('Payouts owed · shown', loaded.owed.unavailable ? 'Unavailable' : `${size('owed')} · ${money(owedCents)}`, true)}
    ${stat('Disputed · shown', size('disputed'))}
    ${stat('Open cases · shown', size('cases'))}
    ${stat('Receipts not delivered · shown', size('noReceipt'))}
  </div>
</section>

<section>
  <h2>Underway now</h2>
  ${loaded.underway.unavailable ? unavailableText : underway.length
    ? `<div class="rows">${underway.slice(0, 25).map(rideRow).join('')}</div>`
    : '<p>No travel underway.</p>'}
</section>

<section>
  <h2>Operator exceptions</h2>
  ${loaded.pending.saturated ? '<p role="alert">More Operator qualification exceptions exist than this page can show. Do not treat the list below as the entire review queue.</p>' : ''}
  <p>Operators qualify automatically when every check passes. Only what the checks cannot settle
    — held documents, refusals to reconsider, suspensions — appears here. Every decision is
    recorded with a note and the name of the person who made it.${shared() ? ` <strong>Signed in with the shared password (${esc(sharedMode())}): decisions are recorded as “${esc(opsAccounts()[0]?.name || 'ops')}”, not a named person. Set OPS_USERS.</strong>` : ''}</p>
  ${loaded.pending.unavailable ? unavailableText : pending.length ? pending.map(exceptionCard).join('') : '<p>No operator exceptions.</p>'}
  <div style="margin-top:20px;">
    <p style="color:${T.muted};font-size:13px;">Routine insurance confirmations are requested and processed by the platform. You do not need to visit Operations to handle each monthly check. An exception may require independent provider-identity verification if the system cannot establish a trusted source.</p>
    <details><summary><strong>Exceptional case · verify an unrecognized insurer or broker contact</strong></summary>
      <p>This is not a monthly task for every Operator. When a new provider cannot be
      independently authenticated by existing configured evidence, establish the
      company's genuine mailbox using its official directory and an outbound callback.
      Do not trust an address provided solely by the Operator. One verified mailbox
      can serve many Operators. This does not certify any particular policy or create coverage.</p>
      <form method="post" action="/ops/insurance/trust-contact">
        ${small('email','Verified insurer / broker email','type="email" required')}
        ${small('sourceReference','Official source / licensing reference','required')}
        <select name="method" required style="padding:8px;border:1px solid ${T.border};border-radius:13px;margin:6px 8px 0 0;">
          <option value="">How identity was independently verified</option>
          <option value="verified_carrier_website_and_callback">Official carrier website + callback</option>
          <option value="verified_broker_website_and_callback">Official broker website + callback</option>
          <option value="regulator_licence_lookup_and_callback">Regulator licence + callback</option>
          <option value="authenticated_provider_contract">Existing authenticated provider agreement</option>
        </select>
        ${noteInput}
        <button type="submit" style="border:1px solid ${T.border};background:#fff;color:${T.ink};border-radius:13px;padding:8px 14px;font-size:14px;cursor:pointer;margin-top:6px;">
          Record independently vetted contact
        </button>
      </form>
      <p>One-year renewal of contact identity. Coverage itself is independently confirmed on the existing 30-day schedule.</p>
    </details>
    <strong>Insurance status confirmation</strong>
    <p style="color:${T.muted};font-size:13px;">After reviewing a carrier, agent, broker, or monitoring-provider confirmation, record the current status here. A cancellation or material change removes the Operator from service immediately.</p>
    <form method="post" action="/ops/operators/insurance-status">
      ${small('uid', 'Operator uid', 'required')}
      ${small('source', 'broker / carrier / provider', 'required')}
      <select name="status" style="padding:8px;border:1px solid ${T.border};border-radius:13px;margin:6px 8px 0 0;">
        <option value="verified_active">Verified active</option>
        <option value="pending_cancellation">Pending cancellation</option>
        <option value="cancelled">Cancelled</option>
        <option value="nonrenewed">Nonrenewed</option>
        <option value="coverage_reduced">Coverage reduced</option>
        <option value="vehicle_removed">Vehicle removed</option>
        <option value="unverified">Unverified</option>
      </select>
      ${noteInput}
      <button type="submit" style="border:1px solid ${T.border};background:#fff;color:${T.ink};border-radius:13px;padding:8px 14px;font-size:14px;cursor:pointer;margin-top:6px;">Record status</button>
    </form>
  </div>
  ${decide('/ops/operators/suspension', { action: 'suspend' }, 'Suspend an operator', small('uid', 'Operator uid', 'required'))}
</section>

<section>
  <h2>On duty</h2>
  ${loaded.operators.unavailable ? unavailableText : onDuty.length
    ? `<div class="rows">${onDuty
        .map((o) => `<div><span class="k">${esc(o.name || o.id)}<br>
          <span style="color:${T.faint};font-size:13px;">${esc(o.car || '')} ${esc(o.plate || '')}</span></span>
          <span class="amount">${o.screened === false ? 'NOT SCREENED' : o.payoutsEnabled === false ? 'not payable' : 'available'}</span></div>`)
        .join('')}</div>`
    : '<p>Nobody is on duty.</p>'}
  ${staleDisclosure.length
    ? `<p>${staleDisclosure.length} operator record${staleDisclosure.length === 1 ? '' : 's'} carry an
        insurance disclosure that is not the one in force. Dispatch skips them until the operator
        reads the current disclosure in the app: ${staleDisclosure.map((o) => esc(o.name || o.id)).join(', ')}.</p>`
    : ''}
</section>

<section>
  <h2>Reservations</h2>
  ${loaded.scheduled.unavailable ? unavailableText : scheduled.length
    ? `<div class="rows">${scheduled
        .slice(0, 15)
        .map(
          (r) => `<div><span class="k">${esc(r.dep || '—')} → ${esc(r.dest || '—')}<br>
            <span style="color:${T.faint};font-size:13px;"><span class="mono">${esc(r.tripNo || '')}</span></span></span>
            <span class="amount">${new Date(Number(r.atMs)).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</span></div>`,
        )
        .join('')}</div>`
    : '<p>No reservations upcoming.</p>'}
</section>

<section>
  <h2>Open cases</h2>
  ${loaded.cases.unavailable ? unavailableText : cases.length
    ? `<div class="rows">${cases
        .slice(0, 15)
        .map(
          (c) => `<div><span class="k"><span class="mono">${esc(c.caseNo)}</span> ${esc(c.reason || '')}<br>
            <span style="color:${T.faint};font-size:13px;">${ago(c.createdAt)}</span></span>
            <span class="amount">${c.kind === 'emergency' ? 'EMERGENCY' : 'support'}</span></div>`,
        )
        .join('')}</div>`
    : '<p>No open cases.</p>'}
</section>

<section>
  <h2>Systems</h2>
  <div class="rows">
    ${stat('Firestore', unreadable.length ? 'DEGRADED' : adminStatus().ok ? 'connected' : 'DOWN')}
    ${stat('Stripe webhook', webhookReady() ? 'configured' : 'NOT CONFIGURED')}
    ${stat('Email receipts', emailReady() ? 'configured' : 'NOT CONFIGURED')}
    ${stat('Operator screening intake', adminStatus().ok ? 'available' : 'service unavailable')}
    ${stat('Optional incident/support analysis', readKey('ANTHROPIC_API_KEY') ? 'configured' : 'off')}
  </div>
  <a class="more" href="/health">Full health report ›</a>
</section>`;
}

/**
 * @param deps.db        () => Firestore, or null. Injected for tests.
 * @param deps.checks    the network half of an assessment (server.js qualificationChecks)
 * @param deps.liveMoney () => boolean, whether the Stripe key is live
 */
function mount(app, express, deps = {}) {
  const dbOf = deps.db || adminDb;
  const liveMoney = deps.liveMoney || (() => false);
  const checks = deps.checks || (async () => ({ account: { disabled: null }, payouts: { enabled: false } }));
  // Sign-in requires Google/Firebase ID-token verification and an exact Founder UID
  // allowlist. This route does not accept a claimed email, UID or provider from JSON.
  app.get('/ops/google',(req,res)=>{
    res.set('Cache-Control','no-store');
    if(!googleFounderAccount())return res.status(503).type('html').send(page('Founder Google sign-in',
      '<h1>Founder Google sign-in is not yet enabled</h1><p>Configure the single approved Founder Google account and release flag first.</p>'));
    const html=`<h1>American Rider Founder</h1>
<section><p>Use your authorized Google account.</p>
<button type="button" class="cta" id="google-ops">Continue with Google</button>
<p id="google-status" role="status"></p></section>
<script type="module">
import {initializeApp} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {getAuth,GoogleAuthProvider,signInWithPopup} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
const app=initializeApp({apiKey:'AIzaSyAQMJ1ikGvhrmCZY9D0OjM6EM2r2m0V4OY',authDomain:'american-rider-35688.firebaseapp.com',projectId:'american-rider-35688',appId:'1:623854974930:web:d73e4dec7949c3756efa0b'});
const auth=getAuth(app),button=document.getElementById('google-ops'),
  message=document.getElementById('google-status');
button.addEventListener('click',async()=>{
 button.disabled=true;message.textContent='Opening Google…';
 try{
   const provider=new GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});
   const result=await signInWithPopup(auth,provider);
   const token=await result.user.getIdToken();
   const response=await fetch('/ops/google/session',{method:'POST',credentials:'same-origin',
    headers:{'Content-Type':'application/json','X-AR-Founder-Google':'1'},
    body:JSON.stringify({idToken:token}),cache:'no-store',referrerPolicy:'no-referrer'});
   if(!response.ok)throw new Error('not_authorized');
   location.replace('/ops');
 }catch(err){
   const code=String(err?.code||'');
   message.textContent=code==='auth/unauthorized-domain'
    ? 'This service address must be authorized for Google sign-in in Firebase.'
    : code==='auth/popup-blocked'
    ? 'Open this page directly in Safari and permit the Google sign-in window.'
    : 'Sign-in did not complete. Check that this is your authorized Founder Google account.';
   button.disabled=false;
 }
});
</script>`;
    res.type('html').send(page('Founder Google sign-in',html));
  });
  app.post('/ops/google/session',deps.googleLoginLimit||((_req,_res,next)=>next()),async(req,res)=>{
    res.set('Cache-Control','private, no-store');
    const acct=googleFounderAccount();
    if(!acct)return res.status(503).json({ok:false,code:'founder_google_not_configured'});
    const origin='https://american-rider-api-production-623854974930.us-east1.run.app';
    if(req.get('origin')!==origin||req.get('x-ar-founder-google')!=='1'||
       !/^application\/json(?:;|$)/.test(String(req.get('content-type')||'')))
       return res.status(403).json({ok:false,code:'invalid_sign_in_origin'});
    const token=req.body?.idToken;
    if(typeof token!=='string'||token.length<60||token.length>4096||
       !/^[A-Za-z0-9._-]+$/.test(token))
       return res.status(401).json({ok:false,code:'google_sign_in_required'});
    let decoded;
    try{decoded=await getAuth().verifyIdToken(token,true);}
    catch{return res.status(401).json({ok:false,code:'google_sign_in_required'});}
    if(!founderTokenAllowed(decoded,allowedFounderUids())||
       decoded.firebase?.sign_in_provider!=='google.com'||
       Math.floor(Date.now()/1000)-Number(decoded.auth_time)>15*60)
      return res.status(403).json({ok:false,code:'founder_google_not_authorized'});
    // Issue the *existing*, audited, named Ops session. No duplicate /ops rights
    // or temporary API key, no raw Firebase token persisted anywhere.
    res.setHeader('Set-Cookie',
      `${COOKIE}=${encodeURIComponent(sessionFor(acct,readKey('OPS_SESSION_SECRET')))}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200; Secure`);
    return res.json({ok:true,mode:'google_verified_founder'});
  });

  // Deliberately on-demand: broad national count aggregations must NOT run
  // on every booking, every operational exception refresh or health probe.
  app.get('/ops/overview',async(req,res)=>{
    if(!signedIn(req)||opsAuthMode()!=='named')
      return res.status(403).type('html').send(page('Platform Overview',
        '<h1>Named Operations sign-in required</h1><p><a href="/ops">Sign in to Operations</a></p>'));
    res.set('Cache-Control','private, no-store');
    try{
      const totals=await founderPlatformCounts(dbOf());
      return res.type('html').send(page('Platform Overview',overviewMarkup(totals)));
    }catch{
      return res.status(503).type('html').send(page('Platform Overview',
        '<h1>Platform Overview</h1><p role="alert">The company-wide counts cannot be verified. No zero count is assumed.</p>'));
    }
  });

  app.get('/ops', async (req, res) => {
    if (!configured()) {
      return res
        .status(503)
        .type('html')
        .send(page('Operations', '<h1>Operations</h1><section><p>Operations sign-in is unavailable because its security configuration is incomplete. Check the Render service logs for the exact missing requirement.</p></section>'));
    }
    if (!signedIn(req)) {
      if (isProduction()) {
        // Trace cookie rejection without logging its value or the person's identity.
        const cookiePresent = String(req.headers?.cookie || '').split(';')
          .some((part) => part.trim().startsWith(`${COOKIE}=`));
        console.info(`[operations] Sign-in page rendered: session_cookie=${cookiePresent ? 'present_invalid' : 'absent'}`);
      }
      return res.type('html').send(page('Operations', (googleFounderAccount()?GOOGLE_LOGIN:'')+LOGIN));
    }
    try {
      res.type('html').send(page('Operations', await board()));
    } catch (e) {
      // Database error details may contain internal Firebase project paths and links.
      // Keep the private diagnostic on the server; show Operators an actionable safe state.
      console.error(`[operations] Dashboard could not render: ${String(e?.code || 'unexpected').slice(0, 48)}`);
      res.status(503).type('html').send(page('Operations',
        '<h1>Operations</h1><section role="alert"><h2>Dashboard temporarily unavailable</h2><p>Your sign-in succeeded, but operational data could not be retrieved. Please contact platform administration. Do not assume pending work is clear.</p></section>'));
    }
  });

  app.post('/ops/enter', express.urlencoded({ extended: false }), async (req, res) => {
    // Random reference connects an on-screen failure to private Render diagnostics.
    // It is NOT an authorization token. Never log names, passwords, codes, or sessions.
    const attempt = crypto.randomBytes(6).toString('hex');
    const trace = (outcome) => {
      if (isProduction()) console.info(`[operations] Sign-in ${attempt}: ${outcome}`);
    };
    const name = shared() ? opsAccounts()[0].name : String(req.body?.name || '').trim();
    const got = String(req.body?.password || '');
    const acct = opsAccounts().find((x) => x.name === name);
    let reason = 'credentials_rejected';
    // Constant time again, and a deliberate pause on failure so the form cannot be run at
    // speed against a short password.
    let ok = !!(
      acct &&
      got.length === acct.pw.length &&
      crypto.timingSafeEqual(Buffer.from(got), Buffer.from(acct.pw))
    );
    if (ok && isProduction()) {
      const step = totpStep(mfaSecret(acct.name), req.body?.otp);
      const ready = productionSecurityReady();
      ok = step !== null && ready;
      if (!ok) reason = ready ? 'authenticator_code_rejected' : 'configuration_incomplete';
      if (ok) {
        const db = dbOf();
        if (!db) {
          trace('mfa_store_unavailable');
          return res.status(503).send('Operations authentication is temporarily unavailable.');
        }
        let timedOut = false;
        try {
          ok = await withinDeadline(() => db.runTransaction(async (tx) => {
            const ref = db.collection('ops_mfa').doc(acct.name);
            const prior = await tx.get(ref);
            // A timed-out response must never authorize the caller. Avoid committing
            // a delayed step when Firestore recovers after the founder saw a failure.
            if (timedOut) return false;
            if (Number(prior.exists ? prior.data().lastStep : -1) >= step) {
              reason = 'authenticator_code_already_used';
              return false;
            }
            tx.set(ref, { lastStep: step, acceptedAt: Date.now() }, { merge: true });
            return true;
          }), OPS_MFA_DEADLINE_MS);
        } catch (e) {
          timedOut = true;
          trace(e?.code === 'OPS_STORAGE_TIMEOUT' ? 'mfa_store_timeout' : 'mfa_store_error');
          return res.status(503).type('html').send(page('Operations',
            '<h1>Operations</h1><section role="alert"><h2>Security database temporarily unavailable</h2>' +
            '<p>Your sign-in was not confirmed. This is a database delay, not an incorrect authenticator code. ' +
            'Please retry only when the database is responding.</p></section>'));
        }
      }
    }
    if (!ok) {
      trace(reason);
      return setTimeout(
        () => res.status(401).type('html').send(page('Operations',
          `<h1>Operations</h1><section role="alert"><h2>Sign-in unsuccessful</h2>
          <p>Check your name and password, then use a newly refreshed six-digit code from your paired authenticator.</p>
          <p>Support reference: <strong>${attempt}</strong></p></section>
          <section>${LOGIN.split('<section>')[1]}`)),
        700,
      );
    }
    trace('session_issued');
    res.setHeader(
      'Set-Cookie',
      `${COOKIE}=${encodeURIComponent(isProduction()
        ? sessionFor(acct, readKey('OPS_SESSION_SECRET'))
        : `${acct.name}.${tokenFor(acct)}`)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${60 * 60 * 12}; Secure`,
    );
    // Resume a pending OAuth consent only after real named Ops MFA sign-in.
    // The following GET validates the signed, short-lived HttpOnly request cookie.
    res.redirect(String(req.headers?.cookie || '').split(';').some(v =>
      v.trim().startsWith('ar_mcp_pending=')) ? '/ar/oauth/consent' : '/ops');
  });

  // First-contact identity is a company-level reusable fact, not a new per-Operator
  // screening step. It is recorded only after independent, named MFA-backed review.
  app.post('/ops/insurance/trust-contact', express.urlencoded({ extended:false }), async(req,res)=>{
    if(!configured() || !signedIn(req)) return res.status(401).type('html').send(page('Operations',LOGIN));
    if(opsAuthMode() !== 'named') return res.status(403).send('Named MFA-backed Operations access required');
    const db=dbOf();
    if(!db) return res.status(503).send('Insurance contact registry unavailable');
    try{
      const actor=actorOf(req);
      const result=await recordIndependentContact({db,actor,input:req.body});
      if(!result.ok) return res.status(400).send(esc(result.error||result.code));
      return res.redirect(303,'/ops');
    }catch{return res.status(503).send('Insurance contact verification could not be stored');}
  });

  // THE EXCEPTION ACTIONS. Each one: authenticated here, validated and audit-logged in the same
  // transaction as the change (backend/qualification.js), then the operator is re-assessed —
  // so resolving the last held item qualifies them on the spot, with nobody clicking Approve.
  const exceptionRoute = (path, act, { reassess = true } = {}) =>
    app.post(path, express.urlencoded({ extended: false }), async (req, res) => {
      if (!configured() || !signedIn(req)) return res.status(401).type('html').send(page('Operations', LOGIN));
      const db = dbOf();
      if (!db) return res.status(503).send(esc(adminStatus().reason));
      const uid = String(req.body?.uid || '').trim();
      if (!uid) return res.status(400).send('uid is required');
      try {
        const out = await act({ db, uid, body: req.body || {}, actor: actorOf(req) });
        if (!out.ok) return res.status(out.status || 400).send(esc(out.error));
        if (reassess) await assessAndRecord({ db, uid, checks, liveMoney: liveMoney() });
        res.redirect(303, '/ops');
      } catch (e) {
        res.status(500).send(esc(e.message));
      }
    });

  // Original uploaded files are private. Only a named/MFA Operations reviewer may view
  // the precise uploaded document belonging to this Operator. Never expose a signed
  // object-store URL in the review HTML; the backend proxies a bounded, verified image.
  app.get('/ops/operators/document-view', async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    if (!configured() || !signedIn(req)) return res.status(401).send('Operations sign-in required');
    if (opsAuthMode() !== 'named') return res.status(403).send('Named Operations access required');
    const uid = String(req.query?.uid || '');
    const kind = String(req.query?.kind || '');
    const db = dbOf();
    if (!db) return res.status(503).send('Private document review temporarily unavailable');
    try {
      if (!uid || uid.length > 128) return res.sendStatus(404);
      const snap = await db.collection('users').doc(uid).get();
      if (!snap.exists) return res.sendStatus(404);
      const result = await loadPrivateReviewDocument({
        uid, kind, documents: snap.data()?.documents,
        owns: r2Owns, readUrl: r2ReadUrl,
      });
      if (result.status !== 200) return res.sendStatus(result.status);
      res.set('Content-Security-Policy', "default-src 'none'; sandbox");
      return res.type(result.contentType).status(200).send(result.body);
    } catch (e) {
      console.error('[operations] Private document review unavailable:', String(e?.code || 'unexpected').slice(0, 40));
      return res.status(502).send('Document temporarily unavailable');
    }
  });

  // Provider-neutral screening queue: includes pending reports that are NOT qualification
  // exceptions yet. A real case, authorized by the Operator, is required for each decision.
  // This does not show or copy report documents or criminal-history details.
  app.get('/ops/screening', async (req, res) => {
    if (!configured() || !signedIn(req)) return res.status(401).type('html').send(page('Operations', LOGIN));
    if (opsAuthMode() !== 'named') return res.status(403).type('html').send(page('Screening',
      '<h1>Named Operations access required</h1><p>Screening evidence requires MFA-backed attributable staff access.</p>'));
    const db = dbOf();
    if (!db) return res.status(503).send('Screening review is temporarily unavailable.');
    try {
      const snap = await db.collection('users')
        .where('screening.decision', 'in', ['awaiting_agency', 'review', 'pre_adverse']).limit(51).get();
      const candidates = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(u => u.screening?.transferCaseNo && u.screening?.consentAt)
        .slice(0, 50);
      // Bound to 50 cases. A missing/mismatched source ticket is not actionable.
      const relatedCases = await Promise.all(candidates.map(async (u) => {
        const d = await db.collection('support_tickets').doc(String(u.screening.transferCaseNo)).get();
        if (!d.exists) return null;
        const row = d.data() || {};
        return row.uid === u.id && row.status === 'open' &&
          /^Operator screening — review (existing|new) provider report$/.test(row.reason || '')
          ? row : null;
      }));
      // A solo administrator needs an actionable queue, not an undifferentiated
      // list of security-sensitive forms. Sorting changes presentation only:
      // it never changes qualification or screening evidence.
      const work = sortScreeningCases(candidates.map((user, i) => ({
        user, screening: user.screening, ticket: relatedCases[i],
      })));
      const needingFollowUp = work.filter(row =>
        triageScreeningCase(row.screening, row.ticket).followUpDue).length;
      const field = (name, label, type = 'text', required = true) =>
        `<label style="display:block;margin:9px 0;font-size:13px;">${esc(label)}
        <input type="${type}" name="${name}" style="display:block;padding:9px;width:100%;max-width:400px;border:1px solid #C9CDD1;border-radius:8px;" ${required ? 'required' : ''}></label>`;
      const box = (name, label) =>
        `<label style="display:block;margin:7px 0;font-size:13px;">
          <input type="checkbox" name="${name}" value="yes"> ${esc(label)}</label>`;
      const cards = work.map(({ user: u, screening: r, ticket: linked }) => {
        const handoff = linked?.screeningHandoff || {};
        const triage = triageScreeningCase(r, linked);
        const nextReview = triage.followUpAt == null
          ? 'Missing case date — investigate'
          : new Date(triage.followUpAt).toLocaleString('en-US', {
              dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York',
            });
        if (!linked) return `<section role="alert"><h2>${esc(u.id)}</h2>
          <p>Screening case missing or inconsistent. Stop review and investigate.</p></section>`;
        const hidden = { uid: u.id, caseNo: r.transferCaseNo };
        const contactChoices = `<select name="contactChannel" required>
          <option value="">Verified CRA contact method…</option>
          <option value="verified_business_phone">Independently verified business phone</option>
          <option value="verified_business_email">Independently verified business email</option>
          <option value="authenticated_agency_portal">CRA authenticated portal</option></select>`;
        const reportChoices = `<select name="reportChannel" required>
          <option value="">Authenticated receipt method…</option>
          <option value="authenticated_provider_portal">Agency authenticated portal</option>
          <option value="provider_verified_secure_transfer">Verified secure agency transfer</option></select>`;
        const handoffControls = !handoff.stage
          ? decide('/ops/operators/screening-handoff', { ...hidden, action:'claim' }, 'Claim screening case')
          : handoff.stage === 'claimed' || handoff.stage === 'dispute_open' || handoff.stage === 'clarification_needed'
            ? decide('/ops/operators/screening-handoff', { ...hidden, action:'agency_contacted' },
                'Record verified agency contact', contactChoices +
                small('contactReference','CRA contact case reference','required') +
                box('agencyIdentityVerified','I independently verified the CRA contact identity'))
            : handoff.stage === 'agency_contacted'
              ? decide('/ops/operators/screening-handoff', { ...hidden, action:'report_authenticated' },
                  'Record authenticated report receipt', reportChoices +
                  small('providerReference','CRA report reference','required') +
                  box('sourceAuthenticated','I authenticated the report origin through the agency') +
                  box('reportOwnerMatched','I matched this report to the Operator') +
                  box('permissiblePurposeVerified','I verified lawful report receipt and reuse for American Rider'))
              : handoff.stage === 'report_authenticated' && r.decision !== 'pre_adverse'
                ? decide('/ops/operators/screening-handoff', { ...hidden, action:'dispute_open' },
                    'Open dispute and require corrected report')
                : '';
        const a = r.adverseAction || {};
        const adverseForm = (action, title, contents = '') =>
          `<form method="post" action="/ops/operators/screening-adverse" style="border-top:1px solid #CDD1D6;margin-top:16px;padding-top:10px">
            <input type="hidden" name="uid" value="${esc(u.id)}">
            <input type="hidden" name="caseNo" value="${esc(r.transferCaseNo)}">
            <input type="hidden" name="action" value="${action}">
            <strong>${title}</strong>
            ${contents}
            ${field('note','Staff verification note (no protected record details)')}
            <button type="submit">${title}</button>
          </form>`;
        const proposal = adverseForm('propose', 'Begin pre-adverse review', `
          <p>Only after independent review of an authenticated CRA report. No denial or report transmission is performed by this form.</p>
          ${field('reference','Provider report reference (not a government ID)')}
          ${field('reportIssuedOn','Verified CRA report date (YYYY-MM-DD)')}
          <label>Statutory ground <select name="reasonCode" required>
            <option value="">Choose...</option>
            <option value="criminal_history">Criminal-history disqualification</option>
            <option value="sex_offender_match">National sex-offender match</option>
            <option value="driver_license">Driver license qualification</option>
            <option value="moving_violations">Moving-violation threshold</option>
            <option value="other_statutory">Other verified statutory ground</option>
          </select></label>
          ${box('agencyAuthenticated','Agency portal/source independently authenticated')}
          ${box('reportMatchesOperator','Report owner independently matched to Operator')}
          ${box('permittedPurpose','Lawful American Rider report access verified')}
          ${box('disqualifierConfirmed','Actual source findings independently checked against statute')}
        `);
        const preNotice = adverseForm('record_pre_notice','Record pre-adverse delivery',`
          <p>Do not press until a report copy, rights summary and pre-adverse notice have actually reached the Operator by an approved channel. This app does not send them.</p>
          ${field('reference','Verifiable secure-delivery evidence reference')}
          ${box('reportCopyProvided','Operator received a copy of the actual agency report')}
          ${box('rightsSummaryProvided','Operator received the FCRA rights summary')}
          ${box('deliveryConfirmed','Pre-adverse notice was actually sent and delivery evidence checked')}
        `);
        const dispute = adverseForm('dispute','Record Operator dispute',`
          <p>Record a disputed finding. Final refusal remains prohibited until provider clarification and appropriate updated notices.</p>
        `);
        const withdraw = adverseForm('withdraw','Withdraw proposed refusal',`
          <p>Return to source review; this does NOT approve the screening.</p>
        `);
        const final = adverseForm('finalize','Record final decision and delivery',`
          <p>Allowed only after the actual pre-notice, an internal minimum review interval (seven calendar days, NOT a fixed statutory FCRA deadline), no unresolved dispute, and separately delivered final-adverse notice.</p>
          ${field('reference','Verified final-notice delivery reference')}
          ${box('finalNoticeDelivered','Final adverse-action notice was actually sent and verified')}
          ${box('providerFindingsRechecked','Provider findings and records reconfirmed unchanged')}
          ${box('noOpenDispute','No unresolved or pending dispute remains')}
        `);
        const adverseActions = r.decision === 'pre_adverse'
          ? `<p role="status">Pre-adverse review: ${esc(a.stage || 'missing stage')}. No Operator may accept Travel.</p>
             ${a.stage === 'proposed' ? preNotice : ''}
             ${['proposed','pre_notice_sent'].includes(a.stage) ? dispute : ''}
             ${['proposed','pre_notice_sent','disputed'].includes(a.stage) ? withdraw : ''}
             ${a.stage === 'pre_notice_sent' ? final : ''}`
          : handoff.stage === 'report_authenticated' ? proposal
            : '<p>Authenticate the agency report before considering a potential adverse decision.</p>';
        return `<section><h2>${esc(u.legalName || u.name || u.email || u.id)}</h2>
          <p>Case <strong>${esc(r.transferCaseNo)}</strong> · ${esc(r.provider || 'Unknown provider')} ·
            ${esc(r.decision)}. <a href="/ops/cases?kind=support">Open original support case →</a></p>
          <p>Assigned reviewer: <strong>${esc(handoff.owner || 'Unassigned')}</strong> ·
          Verified handoff: <strong>${esc(handoff.stage || 'Not started')}</strong>.</p>
          <p><strong>Next action:</strong> ${esc(triage.nextAction)}</p>
          <p><strong>Waiting on:</strong> ${esc(triage.waitingOn)} ·
             <strong>Internal follow-up:</strong> ${triage.followUpDue ? 'Due for review' : 'Check by'} ${esc(nextReview)}.
             This is a suggested staff checkpoint, not a promised provider response or legal deadline.</p>
          ${r.decision === 'pre_adverse' ? '' : handoffControls}
          <p>Review a report obtained from the named agency via an authenticated provider portal
          or confirmed secure transfer. Do not rely on an Operator-uploaded copy or an email
          attachment. No report contents or sensitive personal information belong in this form.</p>
          ${r.decision === 'pre_adverse' || handoff.stage !== 'report_authenticated'
            ? '<p>Complete the case assignment, verified agency contact and authenticated report receipt before adjudication.</p>'
            : `<form method="post" action="/ops/operators/screening-review">
            <input type="hidden" name="uid" value="${esc(u.id)}">
            <input type="hidden" name="caseNo" value="${esc(r.transferCaseNo)}">
            <input type="hidden" name="provider" value="${esc(r.provider || '')}">
            ${field('providerReference','Agency reference (no personal identifiers)')}
            ${field('issuedOn','Date report was conducted (YYYY-MM-DD)')}
            <label style="display:block;margin:9px 0;">Verified receipt
              <select name="channel" required>
                <option value="">Select source...</option>
                <option value="authenticated_provider_portal">Authenticated agency portal</option>
                <option value="provider_verified_secure_transfer">Verified agency secure transfer</option>
              </select>
            </label>
            ${box('sourceAuthenticated','I independently authenticated the agency and origin of this report.')}
            ${box('reportOwnerMatched','I confirmed that the original report belongs to this Operator.')}
            ${box('permissiblePurposeVerified','I confirmed written authorization and lawful permission to obtain/use this report for American Rider.')}
            <details><summary>Statutory checks required before a CLEAR decision</summary>
              ${box('nationwideChecked','Local and nationwide commercial criminal records search was completed.')}
              ${box('primarySourceValidated','Any criminal records requiring validation were checked with primary sources.')}
              ${box('sexOffenderChecked','U.S. DOJ national sex-offender search was completed.')}
              ${box('drivingHistoryChecked','Driving history was obtained and reviewed.')}
              ${box('noDisqualifyingCriminalRecords','No statutory disqualifying criminal history or unresolved record exists.')}
              ${box('sexOffenderClear','No disqualifying national sex-offender match exists.')}
              ${box('licenseValid','Current valid driver license independently verified.')}
              ${box('registrationVerified','Valid vehicle registration checked.')}
              ${field('movingViolations3y','Moving violations in preceding 3 years (0–3)','number', false)}
            </details>
            ${field('note','Verification rationale and any limitations (no consumer-report content)')}
            <button type="submit" name="action" value="hold">Hold for clarification</button>
            <button type="submit" name="action" value="clear">Record verified CLEAR</button>
          </form>`}
          ${adverseActions}
        </section>`;
      }).join('');
      res.type('html').send(page('External Operator screening',
        `<h1>External screening review</h1>
          <p><a href="/ops">← Operations</a> · <a href="/ops/cases?kind=support">Provider transfer cases</a></p>
          <p>Each case states what to do next and whether an internal follow-up is due.
          You may operate this queue as one named MFA-backed administrator. No exclusive
          screening company, vendor integration, automatic outreach or purchase is implied.</p>
          <p><strong>${work.length} cases displayed · ${needingFollowUp} require follow-up.</strong>
          Confirm source authenticity and Florida's statutory checks before any
          decision. A button is not evidence. Clearance never puts an Operator on duty.</p>
          ${snap.docs.length >= 51 ? '<p role="alert">More than 50 screening requests; this is a bounded queue, not the complete backlog.</p>' : ''}
          ${cards || '<p>No authorized screening-transfer requests in this queue.</p>'}`));
    } catch {
      res.status(503).type('html').send(page('External screening review',
        '<h1>Screening review unavailable</h1><p role="alert">The queue could not be read. Do not interpret this as no pending requests.</p>'));
    }
  });
  exceptionRoute('/ops/operators/screening-handoff', ({ db, uid, body, actor }) =>
    opsAuthMode() !== 'named' ? { ok:false, status:403, error:'Named Operations MFA is required.' }
      : recordScreeningHandoff({ db, input: { ...body, uid }, actor }), { reassess: false });
  exceptionRoute('/ops/operators/screening-review', ({ db, uid, body, actor }) =>
    opsAuthMode() !== 'named' ? { ok:false, status:403, error:'Named Operations MFA is required.' }
      : recordExternalReview({ db, input: { ...body, uid }, actor }));
  // For legally compliant agency-backed cases ONLY. These actions record
  // independently established notice/dispute evidence; they do not send
  // consumer reports or FCRA correspondence.
  exceptionRoute('/ops/operators/screening-adverse', ({ db, uid, body, actor }) =>
    opsAuthMode() !== 'named' ? { ok:false, status:403, error:'Named Operations MFA is required.' }
      : recordAdverseReview({ db, input: { ...body, uid }, actor }));

  // A person decides one document: a held one, or reconsiders a refused one.
  exceptionRoute('/ops/operators/document', ({ db, uid, body, actor }) =>
    resolveDocument({
      db,
      uid,
      actor,
      kind: String(body.kind || ''),
      action: String(body.action || ''),
      note: body.note,
      expiry: String(body.expiry || '').trim() || undefined,
      commercialUse: body.commercialUse,
      limitDollars: body.limitDollars ? dollars(body.limitDollars) : undefined,
      verified: {
        insuredConfirmed: body.insuredConfirmed === 'yes',
        vehicleConfirmed: body.vehicleConfirmed === 'yes',
        effectiveDate: String(body.effectiveDate || '').trim() || undefined,
        tncUse: body.tncUse === 'yes' ? 'yes' : undefined,
        rideCombinedDollars: body.limitDollars ? dollars(body.limitDollars) : undefined,
        loggedOnPerPersonDollars: body.loggedOnPerPersonDollars ? dollars(body.loggedOnPerPersonDollars) : undefined,
        loggedOnPerIncidentDollars: body.loggedOnPerIncidentDollars ? dollars(body.loggedOnPerIncidentDollars) : undefined,
        loggedOnPropertyDamageDollars: body.loggedOnPropertyDamageDollars ? dollars(body.loggedOnPropertyDamageDollars) : undefined,
        pipDollars: body.pipDollars ? dollars(body.pipDollars) : undefined,
        uninsuredMotorist: body.uninsuredMotorist || undefined,
      },
    }),
  );

  // Independent insurance-status evidence. Used after a carrier/broker reply or a
  // monitoring-provider alert is reviewed. The actor and note are retained on the same record.
  exceptionRoute('/ops/operators/insurance-status', async ({ db, uid, body, actor }) => {
    const ref = db.collection('users').doc(uid);
    const snap = await ref.get();
    if (!snap.exists) return { ok: false, status: 404, error: 'Operator not found' };
    const u = snap.data() || {};
    const status = String(body.status || 'verified_active');
    const source = String(body.source || 'broker').trim().slice(0, 40);
    const updated = applyIndependentConfirmation(u.insuranceMonitoring, {
      status,
      source,
      actor,
      note: String(body.note || '').trim() || null,
    });
    await ref.set({ insuranceMonitoring: updated }, { merge: true });
    const live = continuingStatus({ ...u, insuranceMonitoring: updated });
    await db.collection('audit_log').add({
      at: Date.now(),
      subject: uid,
      actor,
      action: 'insurance_status_confirmation',
      status,
      source,
      note: String(body.note || '').trim() || null,
      resultingCode: live.code || null,
    });
    if (!live.ok) {
      await db.collection('operators').doc(uid).set(
        { available: false, offDutyReason: live.code, offDutyAt: Date.now() },
        { merge: true },
      );
    }
    return { ok: true };
  });

  // Suspend (fraud, safety, administrative) or reinstate.
  exceptionRoute('/ops/operators/suspension', ({ db, uid, body, actor }) => {
    const action = String(body.action || '');
    if (!['suspend', 'reinstate'].includes(action)) return { ok: false, status: 400, error: 'Unknown action' };
    return setSuspension({ db, uid, active: action === 'suspend', actor, note: body.note });
  });

  // The record of every decision about one operator, newest first.
  app.get('/ops/audit', async (req, res) => {
    if (!configured() || !signedIn(req)) return res.status(401).json({ error: 'Sign in at /ops first' });
    const db = dbOf();
    if (!db) return res.status(503).json({ error: adminStatus().reason });
    const uid = String(req.query?.uid || '');
    if (!uid) return res.status(400).json({ error: 'uid is required' });
    try {
      const snap = await db.collection('audit_log').where('subject', '==', uid).get();
      res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => b.at - a.at));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // THE GOVERNMENT-FEE LEDGER: what is held for each public body for a calendar month, summed
  // from the rides, as JSON. /ops/remittance?year=2026&month=9 — default, the month just
  // ended. Behind the same cookie as the board. It names no traveler: payees, counts, cents.
  app.get('/ops/remittance', async (req, res) => {
    if (!configured() || !signedIn(req)) return res.status(401).json({ error: 'Sign in at /ops first' });
    const db = dbOf();
    if (!db) return res.status(503).json({ error: adminStatus().reason || 'Firestore is not configured' });
    const last = new Date();
    last.setUTCDate(1);
    last.setUTCMonth(last.getUTCMonth() - 1);
    const year = Number(req.query?.year) || last.getUTCFullYear();
    const month = Number(req.query?.month) || last.getUTCMonth() + 1;
    try {
      res.json(await monthlyRemittance({ db, year, month }));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}

module.exports = { mount, signedIn, opsAccounts, tokenFor, opsAuthMode, sharedMode, actorOf, opsConfigurationIssues, oauthActorFingerprint };
