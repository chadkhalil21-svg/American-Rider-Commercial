// Private first-party Recruiter Workspace, served only on americanrider.tech.
// The API, not this browser, authenticates accounts, attributes Operators,
// decides eligibility and returns counts. This client never handles bank details.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, sendEmailVerification, reload, signOut
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js';

const app = initializeApp({
  apiKey: 'AIzaSyAQMJ1ikGvhrmCZY9D0OjM6EM2r2m0V4OY',
  authDomain: 'american-rider-35688.firebaseapp.com',
  projectId: 'american-rider-35688',
  appId: '1:623854974930:web:d73e4dec7949c3756efa0b',
});
const auth = getAuth(app);
const base = 'https://american-rider-api-production-623854974930.us-east1.run.app';
const el = id => document.getElementById(id);
const status = message => { el('workspace-status').textContent = String(message || ''); };
const show = (id, value) => { el(id).hidden = !value; };
let active = null;
function consumeToken() {
  const token = window.__arRecruiterInvitation;
  if (typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token)) return token;
  return null;
}
async function request(path, method = 'GET', payload) {
  if (!active) throw Error('Sign in required');
  const idToken = await active.getIdToken(true);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const r = await fetch(base + path, {
      method, signal: controller.signal, cache: 'no-store',
      headers: {
        Authorization: 'Bearer ' + idToken,
        ...(payload ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    });
    return { code: r.status, data: await r.json().catch(() => null) };
  } finally { clearTimeout(timer); }
}
async function load() {
  if (!active) return;
  show('workspace-verified', !active.emailVerified);
  show('workspace-main', false);
  if (!active.emailVerified) {
    status('Verify your email address, then choose Refresh account.');
    return;
  }
  status('Checking your recruiter account…');
  try {
    const r = await request('/recruiters/me');
    if (!r.data?.ok) {
      status(r.code === 404 ? 'A verified private invitation is required before recruiter enrollment.' :
        'Recruiter records are unavailable. Please try again.');
      show('workspace-accept', !!consumeToken());
      return;
    }
    show('workspace-accept', false);
    show('workspace-main', true);
    el('workspace-relationship').textContent =
      r.data.status === 'approved' ? 'Approved relationship' :
      r.data.status === 'pending_review' ? 'Awaiting review' :
      r.data.status === 'suspended' ? 'Suspended' : 'Inactive';
    el('workspace-operators').textContent = String(r.data.counts?.operatorIntroductions ?? '—');
    el('workspace-travelers').textContent = String(r.data.counts?.travelerIntroductions ?? '—');
    show('workspace-links', r.data.linksAvailable === true);
    status('Introductions are not qualified Operators or earned commissions.');
  } catch { status('Recruiter records are unavailable. Please try again.'); }
}
onAuthStateChanged(auth, user => {
  active = user;
  show('workspace-login', !user);
  show('workspace-signed', !!user);
  show('workspace-accept', !!user && !!consumeToken() && !!user.emailVerified);
  el('workspace-email').textContent = user?.email || '';
  if (user) void load();
  else {
    show('workspace-main', false);
    status('Recruiter access is limited to an authorized, verified account.');
  }
});
el('workspace-login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const email = el('workspace-login-email').value.trim();
  const password = el('workspace-login-password').value;
  const create = event.submitter?.value === 'create';
  status('Verifying account…');
  try {
    const user = create ?
      (await createUserWithEmailAndPassword(auth, email, password)).user :
      (await signInWithEmailAndPassword(auth, email, password)).user;
    if (create) {
      await sendEmailVerification(user);
      status('Verification email requested. Verify your address, then return and refresh.');
    } else void load();
  } catch {
    status('Unable to sign in. Check the email and password, or contact Recruitment Relations.');
  } finally { el('workspace-login-password').value = ''; }
});
el('workspace-refresh').addEventListener('click', async () => {
  if (!active) return;
  try { await reload(active); await active.getIdToken(true); void load(); }
  catch { status('Account verification is temporarily unavailable.'); }
});
el('workspace-logout').addEventListener('click', () => void signOut(auth));
el('workspace-accept-button').addEventListener('click', async () => {
  const token = consumeToken();
  if (!active?.emailVerified || !token) return;
  status('Verifying your private invitation…');
  try {
    const r = await request('/recruiters/accept', 'POST', { token });
    if (r.data?.ok) {
      delete window.__arRecruiterInvitation;
      show('workspace-accept', false);
      await load();
    } else status('The invitation was not accepted. Check that you signed in with the invited email.');
  } catch { status('Invitation verification is temporarily unavailable.'); }
});
for (const role of ['operator', 'traveler']) {
  el('workspace-share-' + role).addEventListener('click', async () => {
    if (!active?.emailVerified) return;
    try {
      const r = await request('/recruiters/link?role=' + role);
      const url = r.data?.url;
      if (!r.data?.ok || typeof url !== 'string' ||
          !/^https:\/\/americanrider\.tech\/join\?r=[A-Z0-9]{8,32}&role=(operator|traveler)$/.test(url))
        throw Error('link-unavailable');
      await navigator.clipboard.writeText(url);
      status('Verified ' + role + ' invitation link copied.');
    } catch { status('The invitation link is unavailable until recruitment is commissioned.'); }
  });
}
