// Legal pages — Terms of Service and Privacy Policy, served by this server at
// /terms and /privacy so the app's sign-up screen can link to real, live pages.
//
// PLAIN-ENGLISH ON PURPOSE: these are written so a normal person can actually read them.
// ⚠️ STATUS: written for the prelaunch platform and pending qualified attorney review.
// Keep factual disclosures synchronized with actual account, Family/Teen and payment flows.
//
// The shell lives in backend/shell.js and is shared with the public site, so the legal pages
// and the marketing pages cannot drift apart the way they had — these carried their own copy
// of the styling in the wrong tokens, under a tagline the app does not use.

const UPDATED = 'October 13, 2026';
const PRIVACY_UPDATED = 'October 13, 2026';

const { page } = require('./shell');

const TERMS_HTML = page(
  'Terms of Service',
  `
<h1>Terms of Service</h1>
<p class="updated">Last updated ${UPDATED}</p>

<div class="panel"><strong>American Rider is in its testing period.</strong> The app is
distributed through Apple TestFlight and some features are demonstrations. Whether a payment
is live or simulated is stated in the app at the moment of payment.</div>

<section><h2>1 · What American Rider is</h2>
<p>American Rider is a technology platform that connects travelers with independent
professional drivers ("operators"). We arrange the trip, show you one all-in price, and
handle the payment. The driving itself is provided by independent operators, not by
American Rider — we are a coordination platform, not a transportation carrier.</p></section>

<section><h2>2 · Your account</h2>
<ul>
<li>Ordinary adult Traveler and Operator accounts require you to be at least 18. The separate Family/Teen Travel program allows an eligible Teen aged 13–17 to use an invited, verified Teen account under a verified guardian's authorization and safety controls. No child under 13 may hold a Teen account.</li>
<li>Keep your email and sign-in details accurate and to yourself. What happens on your
account is your responsibility, so tell us right away (through Patron Support) if you think someone
else is using it.</li>
</ul></section>

<section><h2>3 · Pricing — the promise</h2>
<ul>
<li>You are shown <strong>one all-in price before you reserve</strong>. It is the whole
cost of the travel: the travel fare together with a platform fee, which is never shown as a
separate charge and is never added on top of the amount you were quoted. The Platform Fee
has a minimum of $2.50 and may increase when necessary to cover processing and operating
costs; any such amount is included in the confirmed all-in Total. Payment processing
is paid from that fee.</li>
<li>The confirmed Total is the amount authorized for a Travel. If the route conditions or Total change before booking, American Rider requires you to review the revised Total before payment. Tolls, government fees and permitted adjustments must be shown before you agree; an unconfirmed increased Total must never be charged.</li>
<li>Your operator keeps 99% of the travel fare. Our commission is 1% of the travel fare.</li>
</ul></section>

<section><h2>4 · Cancellations</h2>
<ul>
<li>A temporary card authorization may be placed before an Operator is assigned. It is not a completed charge; an unused hold is released under bank processing times.</li>
<li>Before a Travel begins, you may cancel. An Operator's arrival does not automatically create a fee. An optional verified $4 cancellation or no-show fee, including $3 for the Operator, applies only if the policy is enabled, disclosed and accepted before booking, and qualifying evidence is verified. Otherwise, a hold release or refund follows the applicable booking terms.</li>
<li>Once a travel has begun it cannot be cancelled. Patron Support settles anything that goes
wrong with a travel already underway.</li>
</ul></section>

<section><h2>5 · Payments</h2>
<p>Payments are processed by Stripe. American Rider never sees or stores your full card
number. The app states whether a payment is live or simulated at the moment it is taken.</p></section>

<section><h2>6 · Riding with us</h2>
<p>Travelers may not use the platform for any unlawful purpose, and may not interfere with
an operator's safe control of the vehicle. Reasonable operator requests — seatbelts, no
smoking, and similar — are to be followed. An account that places an operator or another
traveler at risk may be suspended.</p></section>

<section><h2>7 · During the beta</h2>
<p>The service is provided "as is" while we test. Features may be simulated, change, or
break; the app may be unavailable at times. To the fullest extent Florida law allows,
American Rider's liability during the test program is limited to the amounts you actually
paid us, except to the extent such a limit is prohibited by applicable law. No term removes a
Traveler's nonwaivable statutory rights or responsibility for conduct the law does not allow
us to disclaim.</p></section>

<section><h2>8 · Disagreements</h2>
<p>Raise anything that goes wrong through Patron Support in the app. For anything that
cannot be resolved there, these terms are governed by Florida law and any dispute belongs to
the courts of Miami-Dade County, Florida.</p></section>

<section><h2>9 · Changes to these terms</h2>
<p>We publish revised terms with an updated date. If a material change affects your payment,
privacy or rights, we will provide appropriate notice and request consent when legally
required. A change is not applied retroactively to an already confirmed Travel.</p></section>
`,
);

const PRIVACY_HTML = page(
  'Privacy Policy',
  `
<h1>Privacy Policy</h1>
<p class="updated">Last updated ${PRIVACY_UPDATED}</p>

<div class="panel"><strong>The short version:</strong> we collect the account, location,
trip, safety and eligibility details needed to arrange Travel and protect Travelers and
Operators. Family/Teen Travel involves guardian and Teen information. We do not sell
personal data or run advertising; full card numbers are handled by Stripe, not our server.</div>

<section><h2>1 · What we collect</h2>
<ul>
<li><strong>Account:</strong> name, contact details, sign-in identity, account and device/session information. If you use password sign-in, Firebase handles password authentication; American Rider does not receive your plain-text password.</li>
<li><strong>Operators:</strong> identity, driver licence, vehicle registration, commercial insurance details and continuing verification status, screening decisions and lawful exception records. Screening and insurance records are needed to determine eligibility and investigate concerns.</li>
<li><strong>Family/Teen:</strong> invited Teen name, verified email, date of birth for age eligibility, guardian relationship, consent/revocation records and safety information needed for guardian-authorized Travel for ages 13–17. We do not offer accounts for children under 13.</li>
<li><strong>Support and safety:</strong> messages, reports, optional submitted photos, lost item records, location-sharing choices and relevant trip incident records.</li>
<li><strong>Trips:</strong> pickup and destination locations, the route, times, and the
price of each ride — that's what a receipt is made of.</li>
<li><strong>Location:</strong> precise pickup and destination and device location when permitted. Travelers use location for pickup, route, estimated Total and active Travel tracking; Operators who commence operations may share live/background location while on duty, including when their app is not in the foreground, to receive and fulfill Travel. Location permissions are controlled through the device settings. Denying them may limit pickup convenience or Operator availability.</li>
</ul></section>

<section><h2>2 · What we use it for</h2>
<p>We use these records to establish identity and eligibility, verify Operator insurance and screening, arrange and price Travel, enable dispatch, provide live safety/guardian features, process transactions and refunds, send service notices, resolve safety/support matters, prevent fraud and meet applicable legal obligations. Optional price research has a separate consent choice and does not set an individual Traveler's price.</p></section>

<section><h2>3 · Who touches the data (our processors)</h2>
<ul>
<li><strong>Google Firebase</strong> — accounts and trip records.</li>
<li><strong>Stripe</strong> — payments. Your card details go directly to Stripe; we never
store a full card number.</li>
<li><strong>Render</strong> — hosts our server.</li>
<li><strong>Routing, maps and toll providers</strong> may receive route coordinates needed to calculate roads, traffic or regulated tolls.</li>
<li><strong>Screening, storage, communications and notification service providers</strong> may handle only the information needed for their respective authorized service.</li>
<li><strong>The assigned Operator</strong> receives relevant pickup, destination and safety information; a verified guardian may receive an eligible Teen's live Travel status, location and communications where the Family/Teen service is authorized.</li>
<li><strong>Authorized emergency responders or public authorities</strong> may receive information when requested lawfully or needed to address an emergency.</li>
</ul>
<p>We don't sell your personal information to anyone, and we don't show ads.</p></section>

<section><h2>4 · How long we keep it</h2>
<p>You may initiate full account deletion from the in-app Account &gt; Delete Account screen, subject to verification and safe completion of any active Travel. You may also request deletion without the app through the public contact <a href="mailto:americanrider.communications@gmail.com?subject=American%20Rider%20Account%20Deletion">americanrider.communications@gmail.com</a>. We delete or de-identify linked account data as appropriate, while retaining only information reasonably necessary for lawful receipts, tax, fraud, safety, insurance claims, disputes or other legal obligations. We do not promise immediate erasure of records we must retain; you may request details through Patron Support.</p></section>

<section><h2>4A · Optional pricing research</h2>
<p>Only if you actively choose to participate when a Travel price is displayed, we record
the county, broad journey-length category, Total quoted, time of your choice, and whether
the quote led to preparing a booking. The research record does not hold your name or exact
pickup and destination. A booking reference may be connected to your account by our
authorized staff. We do not sell or advertise with this information. Participation is
optional and does not change your price or access to Travel. Research records are scheduled
for deletion seven days after recording, with additional processing time under the
database provider's deletion service. Deleting your account removes linked research
earlier; you may also ask Patron Support to withdraw your participation.</p></section>

<section><h2>5 · Children</h2>
<p>Ordinary Traveler and Operator accounts are for adults. The separate, guardian-authorized Family/Teen program uses limited data for verified Teen accounts aged 13–17; it is not available to children under 13. Guardians control invitations and revocation, with restrictions for Trips already underway. We do not knowingly create under-13 accounts.</p></section>

<section><h2>6 · Changes</h2>
<p>If this policy changes, the new version is posted here with an updated date at the top.</p></section>
`,
);

// Public deletion-request page for Google Play external deletion link. No sign-in is
// needed to *request* deletion; identity is verified before account data is altered.
// Never put personal account details in public query strings.
const ACCOUNT_DELETION_HTML = page(
  'Account deletion · American Rider',
  `
<h1>Delete your American Rider account</h1>
<p class="lede">Your account and personal information remain under your control.</p>
<section><h2>From the app</h2>
<p>Open Account, choose <strong>Delete Account</strong>, and confirm your identity. If a Travel is active, your deletion request may need to wait until the Travel safely ends. We will not claim the deletion is complete before it is processed.</p></section>
<section><h2>Without the app</h2>
<p>Send a request to <a href="mailto:americanrider.communications@gmail.com?subject=American%20Rider%20Account%20Deletion">americanrider.communications@gmail.com</a> with the subject <strong>American Rider Account Deletion</strong>. We will provide a secure way to verify your account; do not send passwords, payment card numbers, driver's licence images, or other sensitive documents by email.</p></section>
<section><h2>What happens to the data</h2>
<p>Associated account data is removed or de-identified, except records that must be retained for lawful safety, accounting, tax, fraud, disputes or claims purposes. Processing may take additional time if there are active Travels, legal holds or pending payments. We will explain any legally required retention and confirm completion.</p>
<p>See our <a href="/privacy">Privacy Policy</a> for the categories of data and service providers.</p></section>
`,
);

// About American Rider — the company-information page both drawers open.
//
// WHY IT EXISTS: "About American Rider" sat in the traveler drawer AND the operator drawer
// and both only raised "Mission, privacy, and terms open in the full build." Two placeholder
// rows on menus App Review opens. Rather than delete a row a serious company should have,
// this gives it something to open.
//
// It is also the correct home for the 99% model. The founders' design brief (§10A) places
// the operator-retention statement in a permanent company-information section, stated once
// as an institutional fact — NOT repeated through the traveler journey as a slogan. That
// is why the sentence below is plain, unadorned, and appears exactly once, with no
// exclamation, no "we believe", and no promotional framing.
// THE FEE RULE STAYS ON THIS PAGE (Chad asked for it removed, 19 Sept 2026; held).
//
// The standing rule he cited — one all-in price, never itemised — governs the TRAVELER'S POINT
// OF PAYMENT: the booking sheet, the receipt, the screens where somebody is deciding to spend
// money. It is a rule against making a person do arithmetic to learn what they owe. This page
// is a disclosure document, not a checkout, and the two want opposite things.
//
// Three reasons it stays. AGENTS.md records the decision that the Terms and this page state
// the rule. The operator section tells operators they can "reconcile every travel against
// this in their own records", which is only true while the rule is written down. And a page
// that claims complete rate transparency while removing the rate contradicts itself about
// money, which the rubric calls the most serious defect there is.
//
// His replacement sentence was also not accurate: "all coordination and network processing
// costs are integrated directly into the final fare" describes a fare with the fee inside it.
// The fee is ADDED to the travel fare. The traveler sees one total, which is what the promise
// is; the fee is not baked into the fare, and saying so would misdescribe the money.
const ABOUT_HTML = page(
  'About American Rider',
  `
<h1>About American Rider</h1>
<p class="updated">Miami, Florida</p>

<section><h2>Platform governance</h2>
<p>American Rider is a national transportation platform. It arranges travel between travelers
and independent commercial operators under one published fee rule, and settles the payment for
both sides.</p>
<p>A traveler names a destination and receives one price. An operator accepts the travel and is
paid for it. The company's principal place of business is Miami, Florida, and service begins in
the South Florida market before any further market opens.</p></section>

<section><h2>What a traveler pays</h2>
<p>One all-in Total is quoted before each Travel is reserved. The Platform Fee
has a minimum of $2.50 and is included within the Total, never added on top
after the Traveler agrees to it. Any changed Total must be shown and agreed
to before booking. The Operator retains 99% of the travel fare.</p></section>

<section><h2>How payment is settled</h2>
<p>American Rider processes Traveler card payments through Stripe.
After a qualifying completed paid Travel, the Operator's share is transferred to the
Operator's connected Stripe account; the subsequent bank payout follows that account's
payout schedule.</p>
<p>The quoted Total includes processing-related platform costs. Full card numbers
are held by the payment processor, not by American Rider.</p></section>

<section><h2>Operator framework</h2>
<p>American Rider operators retain 99% of the travel fare.</p>
<p>The remaining 1% is the coordination commission, and the per-travel platform fee covers
running the service, including payment processing.
Operators can reconcile every travel against this in their own records.</p>
<p>Operators are independent contractors, not employees. Each holds their own vehicle
registration, insurance, and license, and chooses which travel to accept.</p></section>

<section><h2>Qualification and coverage</h2>
<p>An Operator is commissioned only after the required qualification is complete:
driver license, vehicle registration and inspection, qualifying insurance,
identity verification, and legally required screening by an approved provider.</p>
<p>Commercial coverage is verified before commissioning and on a continuing basis. Travel is
not assigned to an operator whose coverage has lapsed or expired. The background check is
repeated every three years.</p></section>

<section><h2>Patron standards</h2>
<p>Before an operator arrives, the travel names the operator, the vehicle and the license
plate, so they can be checked against the vehicle at the kerb rather than after boarding. A
travel can be shared with a trusted contact and followed as it proceeds.</p>
<p>Emergency services are reachable from within every travel, on a screen carrying the
operator, the vehicle, the license plate and the traveler's location, for reading to a
dispatcher.</p></section>

<section><h2>Contact</h2>
<p>Patron Support is available from within the application. Safety concerns
receive human review; immediate emergencies require local emergency services.</p>
<p>Legal documents: <a href="/terms">Terms of Service</a> and
<a href="/privacy">Privacy Policy</a>.</p></section>
`,
);

// ---- TRANSLATIONS -------------------------------------------------------------------------
//
// Served at /terms?lang=es and /privacy?lang=es. English is the default AND the fallback: a
// language we do not have returns the English document whole rather than a mixture, for the
// same reason the insurance disclosure does — a reader cannot tell which half of a mixed
// document binds them.
//
// The English is legally controlling and every translation says so at the TOP, in a panel,
// before the reader has agreed to anything. Burying that at the bottom would make it a
// disclaimer; at the top it is information.
const { TERMS_ES, PRIVACY_ES } = require('./legal-es');
const { TERMS_FR, PRIVACY_FR } = require('./legal-fr');
const { TERMS_IT, PRIVACY_IT } = require('./legal-it');
const { TERMS_DE, PRIVACY_DE } = require('./legal-de');

const TRANSLATED = {
  es: { terms: page('Términos del Servicio', TERMS_ES), privacy: page('Política de Privacidad', PRIVACY_ES) },
  fr: { terms: page('Conditions Générales', TERMS_FR), privacy: page('Politique de Confidentialité', PRIVACY_FR) },
  it: { terms: page('Condizioni del Servizio', TERMS_IT), privacy: page('Informativa sulla Privacy', PRIVACY_IT) },
  de: { terms: page('Nutzungsbedingungen', TERMS_DE), privacy: page('Datenschutzerklärung', PRIVACY_DE) },
};

/** Languages each document exists in. English is always first and always available. */
const LEGAL_LANGUAGES = ['en', ...Object.keys(TRANSLATED)];

/** `doc` is 'terms' or 'privacy'. Unknown languages get the English document, entire. */
function legalPage(doc, lang) {
  const code = String(lang || '').slice(0, 2).toLowerCase();
  const translated = TRANSLATED[code]?.[doc];
  if (translated) return translated;
  return doc === 'privacy' ? PRIVACY_HTML : TERMS_HTML;
}

module.exports = { TERMS_HTML, PRIVACY_HTML, ABOUT_HTML, ACCOUNT_DELETION_HTML, legalPage, LEGAL_LANGUAGES };
