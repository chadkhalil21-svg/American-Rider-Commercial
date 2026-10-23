// The public site: home, the operator page, and support.
//
// WHY THESE THREE. App Store Connect requires a Support URL that a reviewer will open, and a
// Terms page is not support. Stripe lists a business website on the live account. And an
// operator deciding whether to hand over their SSN and bank details looks the company up
// BEFORE they download anything — the operator page is the only surface that reaches them at
// the moment they are deciding.
//
// THE RUBRIC APPLIES HERE EXACTLY AS IT DOES TO EVERY SCREEN. The first draft of this file
// failed it in four ways, all of them the kinds the rubric names:
//
//   · reassured — "it does not change with the weather, the hour, or how busy the city is"
//     is "no surge" at greater length, and "card processing comes out of our share, not yours
//     and not the operator's" defends a position nobody had attacked
//   · editorialised — "everything else is quick", "a job you cannot start"
//     ·  said a thing twice to be believed — "your fare is returned in full. American Rider
//     charges no cancellation fee" is one fact stated as two
//   · addressed the reader as an instruction rather than stating the arrangement
//
// AMERICAN RIDER IS NATIONAL. It begins in Miami; it is not a Miami company, and the wordmark
// says NATIONAL TRANSPORTATION on every surface. The first draft also printed Florida's
// insurance minimums as though they were the requirement everywhere — a correctness defect,
// not a framing one: an operator in another state reading it would be misinformed. Minimums
// are set state by state and are named as Florida's.
//
// October 2026 website correction: remove obsolete fixed-value examples and avoid claiming
// a successful App Store launch, live capacity, or service outside verified geography.
// The canonical backend owns each actual all-in Travel Total; this page has no quote engine.
const { page } = require('./shell');

const HOME_HTML = page('American Rider', `

<section class="ar-hero" aria-labelledby="home-heading">
 <div class="ar-hero-copy">
  <p class="ar-kicker">American Rider / National Transportation</p>
  <h1 id="home-heading" class="ar-display">Travel,<br><em>considered.</em></h1>
  <p class="ar-lead">The journey matters. Clear terms, independent professional Operators, and thoughtful service, together in one transportation experience.</p>
  <div class="ar-actions"><a class="ar-primary" href="/travel">Discover Travel <span aria-hidden="true">↗</span></a><a class="ar-textlink" href="/operate">Explore Operating <span aria-hidden="true">↗</span></a></div>
  <p class="ar-smallnote">A national platform beginning in select areas. Availability depends on location and qualified Operators.</p>
 </div>
 <figure class="ar-photo">
  <img src="https://images.unsplash.com/photo-1749318398976-5a9b45307aae?auto=format&amp;fit=crop&amp;w=1500&amp;q=78" alt="Illustrative photograph of a black sedan on a city street; actual Operator vehicles vary" width="1000" height="1240" fetchpriority="high">
  <figcaption><span>THE ART OF ARRIVING</span><span>01 / 03</span></figcaption>
 </figure>
</section>
<section class="ar-manifesto" aria-labelledby="ar-promise">
 <p class="ar-kicker">A BETTER STANDARD OF MOVEMENT</p>
 <h2 id="ar-promise">A journey should feel simple.<br>Even when the details are not.</h2>
 <p>Know the Total before you reserve. Know who is arriving. Keep the information you need close from pickup to destination.</p>
</section>
<section class="ar-offerings" aria-label="Explore American Rider">
 <article><span class="ar-index">01 / TRAVELER</span><h2>Travel with clarity.</h2><p>One all-in Total, including Fare and Platform Fee, presented before you confirm. No unapproved amount added afterward.</p><a href="/travel">The Traveler experience ↗</a></article>
 <article><span class="ar-index">02 / OPERATOR</span><h2>Keep 99% of the Fare.</h2><p>Independent Operators keep 99% of the Travel Fare. The minimum Platform Fee is $2.50 per Travel, separate from their share.</p><a href="/operate">The Operator opportunity ↗</a></article>
 <article><span class="ar-index">03 / CONFIDENCE</span><h2>Care is a standard.</h2><p>Insurance, screening and vehicle qualifications matter. Safety reporting and attentive support belong in every journey.</p><a href="/safety">Our safety standards ↗</a></article>
</section>
<section class="ar-note" aria-label="Smart Travel status"><span>SMART TRAVEL</span><p>Currently unavailable while schedules and connections are verified. <a href="/smart-travel">Read more ↗</a></p></section>
<section class="ar-vision" aria-labelledby="ar-vision-heading">
 <div class="ar-vision-top"><span>AMERICAN RIDER / UNITED STATES</span><span>THE ROAD AHEAD</span></div>
 <h2 id="ar-vision-heading">Built for the<br>distance ahead.</h2>
 <p>American Rider is developing a transportation network across the United States. We are preparing the public mobile-app release. Service will expand only where a qualified Operator network and local availability can support it.</p>
 <a href="/about">About American Rider ↗</a>
</section>
<section class="ar-lastline"><div><p class="ar-kicker">FOR INDEPENDENT OPERATORS</p><h2>The work behind<br>every journey.</h2></div><a class="ar-outline" href="/operate">Explore Operating ↗</a></section>

`, '/');

const OPERATE_HTML = page(
  'Operate',
  `
<h1>Operate</h1>
<p class="lede">The fare is the operator's, less a 1% coordination commission.</p>

<div class="statement">
  <div class="lbl">Operator share</div>
  <div class="figure">99%</div>
  <div class="note">of each Travel Fare</div>
</div>

<section>
  <h2>Fare and Platform Fee</h2>
  <p>American Rider retains a 1% coordination commission from the Travel Fare.
  The separate Platform Fee starts at $2.50 per Travel, is shown in the
  Traveler's quoted Total, and is not deducted from the Operator's 99% share.</p>
  <p>Actual earnings depend on completed eligible Travels. Vehicle, insurance,
  taxes and other operating expenses remain the Operator's responsibility.</p>
</section>

<section>
  <h2>Cancellations</h2>
  <p>Cancellation terms are shown before a Travel is reserved. An Operator's arrival alone does not automatically create a fee. If a verified cancellation fee is offered and accepted, qualifying evidence and the disclosed terms determine whether it applies.</p>
  <p>A Travel already underway is resolved through Patron Support.</p>
</section>

<section>
  <h2>Payment</h2>
  <p>On completion of each Travel, American Rider transfers the Operator’s 99% fare share to the Operator’s Stripe connected account. Stripe then pays the connected balance to the Operator’s bank account according to the Operator’s Stripe payout schedule. Bank details remain with Stripe.</p>
</section>

<section>
  <h2>Requirements</h2>
  <ul>
    <li>Eighteen or older — the age at which an account may be held</li>
    <li>A valid driver license</li>
    <li>A vehicle owned by the operator or authorised for hire</li>
    <li>Commercial for-hire (livery) automobile insurance</li>
    <li>A background check, paid by the operator to the screening company</li>
  </ul>
</section>

<section>
  <h2>Insurance</h2>
  <div class="panel">
    Insurability is established before the background check is paid for. Carriers apply their
    own underwriting, including on age, and coverage that cannot be obtained is work that
    cannot be commissioned. American Rider sets no age limit of its own beyond eighteen.
  </div>
  <p style="margin-top:14px">Each operator must procure and maintain automobile coverage that
  satisfies the requirements applicable to that operator and vehicle. American Rider verifies
  the operator-procured coverage; it does not sell or substitute for that policy. Any coverage
  American Rider may separately be required by law to maintain does not relieve the operator
  of this requirement.</p>
  <p>Minimum limits are set state by state. In Florida they are $1,000,000 in liability while
  carrying a traveler, and $50,000 per person, $100,000 per incident and $25,000 property
  damage while available and unmatched.</p>
  <p>A personal automobile policy may provide no coverage while an operator is logged on or
  carrying a traveler. Most personal policies exclude driving for compensation.</p>
  <p>Coverage is verified before commissioning and on a continuing basis. Travel is not
  assigned while coverage is lapsed or expired.</p>
  <p><strong>Naming American Rider.</strong> Operators ask their agent to add American Rider as
  a certificate holder on the policy. The insurer then sends notice directly if the policy is
  cancelled or not renewed — a cancellation appears on no document, so it is the only way it
  can be known before a travel is assigned against coverage that has ended.</p>
  <p>Certificate holder only. An additional insured is granted coverage under the policy, which
  raises the premium and would state that American Rider is insured under it. It is not, and
  does not ask to be.</p>
</section>

<section>
  <h2>Qualification</h2>
  <p>Qualification is completed in the app: driver license, vehicle registration, qualifying
  insurance and the background screening required in the operator's market. American Rider
  verifies commercial coverage and does not sell it.</p>
  <p>In Florida, the screening standard follows Fla. Stat. §627.748. A current check must include
  the required nationwide criminal-record search with primary-source validation of records, the
  National Sex Offender Public Website, and a driving-history report. The statutory
  disqualifications are applied by the same rules to every applicant. A result that does not
  contain enough reliable information to apply those rules is not guessed at and does not pass;
  source clarification or dispute resolution is required before qualification can continue.</p>
</section>
`,
  '/operate',
);

const SUPPORT_HTML = page(
  'Support',
  `
<h1>Support</h1>
<p class="lede">Considered assistance for Travelers and Operators.</p>
<section aria-label="Contact American Rider">
  <h2>Contact</h2>
  <p>For Travel, payment, account, qualification or general questions, write to
  <a href="mailto:support@americanrider.app">support@americanrider.app</a>.</p>
  <p>For Operator and business relationships, write to
  <a href="mailto:relations@americanrider.app">relations@americanrider.app</a>.</p>
  <p>For insurance coordination, use
  <a href="mailto:insurance@americanrider.app">insurance@americanrider.app</a>.
  Do not email identification documents, background reports, bank credentials or other sensitive records.
  Use the private in-app upload process or the authenticated channel requested by our team.</p>
  <p>For an existing Travel, include your Travel number when available. Safety emergencies
  require local emergency services, not email.</p>
</section>

<section aria-label="Zero-tolerance impairment policy">
  <h2>Zero-tolerance impairment policy</h2>
  <p>American Rider prohibits Operators from providing Travel while impaired by alcohol or drugs. If you suspect impairment, do not enter the vehicle. If you are already traveling, request a safe stop and contact emergency services if you are in danger.</p>
  <p>Report suspected impairment through Patron Support in the app, or email <a href="mailto:support@americanrider.app?subject=Operator%20safety%20report">support@americanrider.app</a> with the Travel number, time and relevant facts. These reports require prompt safety review. For immediate danger, call 911.</p>
</section>

<section>
  <h2>Emergencies</h2>
  <p>Call <strong>911</strong>. During every travel the app carries the operator's name,
  vehicle, license plate and the traveler's location, to be read to a dispatcher.</p>
</section>

<section>
  <h2>A travel</h2>
  <p>Patron Support opens from the menu or from the travel itself. It covers travel cost, a
  lost item, a route concern, a cancellation and safety.</p>
  <p>Cases are settled against the record of the travel. Anything that should not be settled
  automatically, including any matter of safety, is directed to a person.</p>
</section>

<section>
  <h2>A lost item</h2>
  <p>A lost item is reported from the travel in the Travel Log. The operator who drove the
  travel is contacted first; where that operator has finished for the day, the return is
  dispatched to the nearest available operator.</p>
</section>

<section>
  <h2>Payment</h2>
  <p>Every travel carries a receipt in the Travel Log stating the fare, the platform fee and
  the total charged. A disputed amount is examined against the record of what was charged.</p>
  <p>For a cancelled Travel, an unused card authorization is released or a captured amount is refunded as the original booking terms require. Cancellation fees are not automatic merely because an Operator arrived; any optional verified fee must first have been disclosed and accepted.</p>
  <p>A Travel underway is resolved through Patron Support.</p>
</section>

<section>
  <h2>Operators</h2>
  <p>Payouts, qualification and insurance are handled on the operator side of the app, under
  Getting Paid and Documents.</p>
</section>
`,
  '/support',
);

const TRAVEL_HTML = page(
  'Travel',
  `
<h1>Travel</h1>
<p class="lede">What happens between naming a destination and arriving at it.</p>

<section>
  <h2>Reserving</h2>
  <p>A traveler names a destination and is shown the price before reserving — the travel fare
  plus the platform fee, as one amount. The amount shown at reservation is the amount
  charged.</p>
</section>

<section>
  <h2>Classes</h2>
  <div class="rows">
    <div><span class="k">Standard</span><span>Four seats</span></div>
    <div><span class="k">Large Vehicle</span><span>Six seats, extra luggage</span></div>
    <div><span class="k">Pet Friendly</span><span>Pets carried</span></div>
  </div>
  <p style="margin-top:16px">Each class is priced separately and the price is shown before the
  choice is made. Pet Friendly adds $3.00, which goes to the operator.</p>
</section>

<section>
  <h2>Dispatch</h2>
  <p>The nearest available operator qualified for the class requested is assigned. The
  traveler is shown that operator's name, vehicle and license plate, and their approach on the
  map. A temporary card authorization may be placed before an Operator is assigned. An authorization is not a completed charge. If no Travel takes place and no disclosed fee is due, the unused hold is released.</p>
</section>

<section>
  <h2>During the travel</h2>
  <p>The traveler can message the operator, share the travel with a trusted contact, and reach
  Patron Support or emergency services without leaving the travel.</p>
</section>

<section>
  <h2>Afterwards</h2>
  <p>A receipt is written to the Travel Log stating the fare, the platform fee and the total charged. On completion, the Operator’s 99% fare share is transferred to the Operator’s Stripe connected account; bank payout timing is separate.</p>
</section>

<section>
  <h2>Smart Travel</h2>
  <p>Currently unavailable. We are verifying transit schedules and journey connections
  before introducing this option. Ordinary American Rider Travel remains available.</p>
</section>

<section>
  <h2>Cancelling</h2>
  <p>Before a Travel begins, you may cancel. The service releases an unused card authorization or refunds a captured amount under the terms of that booking.</p>
  <p>An arrival fee is not automatic. If an optional verified cancellation fee applies, its total and requirements must have been shown and accepted before booking.</p>
  <p>A travel that has begun cannot be cancelled. Patron Support settles anything that goes
  wrong with a travel already underway.</p>
</section>
`,
  '/travel',
);

const SAFETY_HTML = page(
  'Safety',
  `
<h1>Safety</h1>
<p class="lede">Who is driving, and what a traveler can reach from inside a travel.</p>
<section aria-label="Zero-tolerance impairment policy">
  <h2>Zero-tolerance impairment policy</h2>
  <p>American Rider prohibits Operators from providing Travel while impaired by alcohol or drugs. If you suspect impairment, do not enter the vehicle. If you are already traveling, request a safe stop and contact emergency services if you are in danger.</p>
  <p>Report suspected impairment through Patron Support in the app, or email <a href="mailto:support@americanrider.app?subject=Operator%20safety%20report">support@americanrider.app</a> with the Travel number, time and relevant facts. These reports require prompt safety review. For immediate danger, call 911.</p>
</section>



<section>
  <h2>Before an operator carries anyone</h2>
  <p>Qualification is completed before an operator is commissioned: driver license, vehicle
  registration, vehicle inspection, commercial for-hire insurance, a background check paid to
  the screening company, and identity verification.</p>
  <p>Commercial coverage is verified before commissioning and on a continuing basis. Travel is
  not assigned while an operator's coverage is lapsed or expired.</p>
</section>

<section>
  <h2>Verifying the vehicle</h2>
  <p>The travel names the operator, the vehicle and the license plate before the operator
  arrives. These are checked against the vehicle at the kerb, not after boarding.</p>
</section>

<section>
  <h2>Sharing a travel</h2>
  <p>A travel can be shared with a trusted contact, who is given the travel as it proceeds.
  Trusted contacts are held on the traveler's own account.</p>
</section>

<section>
  <h2>Immediate assistance</h2>
  <p>Emergency services are reachable from within every travel. The emergency screen carries
  the operator's name, the vehicle, the license plate and the traveler's location, for reading
  to a dispatcher.</p>
  <p>Patron Support is reachable from the same place. Any matter concerning safety is directed
  to a person and is never settled automatically.</p>
</section>
`,
  '/safety',
);

const SMART_HTML = page(
  'Smart Travel',
  `
<h1>Smart Travel</h1>
<p class="lede">Currently unavailable.</p>
<section>
  <p>Smart Travel is temporarily unavailable while transit schedules, journey connections
  and live service reliability are verified. You can continue to reserve ordinary
  American Rider Travel.</p>
</section>
`,
  '/smart-travel',
);

// Neutral holding page only; does not complete invitations or pay recruiters.
const JOIN_HTML = page(
  'Invitation',
  `
<h1>Invitation</h1>
<p class="lede">American Rider is preparing its public mobile-app release.</p>
<section>
  <h2>Invitation status</h2>
  <p>Invitations are not yet active. The original invitation link may be reopened
  once the supported application and attribution process are available.</p>
  <p>No account, commission or Travel is initiated by visiting this page.</p>
  <a class="more" href="/">Return to American Rider &rsaquo;</a>
</section>
`,
);
const RECRUIT_HTML = page('Recruiter Opportunities', `

<section class="ar-recruit" aria-labelledby="recruit-title">
 <p class="ar-kicker">AMERICAN RIDER / COMPANY OPPORTUNITIES</p>
 <h1 id="recruit-title" class="ar-display">Help build<br><em>what comes next.</em></h1>
 <p class="ar-lead">American Rider is preparing an independent recruiter program to introduce qualified Operators to our transportation platform.</p>
 <div class="ar-recruit-status"><strong>Recruiter onboarding is not open yet.</strong><p>Personal invitations, verified recruiter accounts, unique sharing links, QR codes, private earnings records and bank payouts are being prepared. No earnings are promised, and no recruiter account is activated through this page.</p></div>
 <div class="ar-recruit-steps"><h2>A considered process.</h2><ol><li><strong>Personal invitation.</strong> Each recruiter will be individually authorized by American Rider.</li><li><strong>Independent identity.</strong> A secure account will be tied to the verified invited email.</li><li><strong>Shareable introduction.</strong> One verified personal link will work by text or QR code, with the required commercial disclosures.</li><li><strong>Transparent reporting.</strong> Referral eligibility, payment status and settlement will be available in a private workspace after commissioning.</li></ol></div>
 <p>For business inquiries, write to <a href="mailto:relations@americanrider.app?subject=Recruiter%20opportunities">relations@americanrider.app</a>. Do not email banking or identification documents.</p>
</section>

`, '/recruit');

module.exports = { RECRUIT_HTML, HOME_HTML, OPERATE_HTML, SUPPORT_HTML, TRAVEL_HTML, SAFETY_HTML, SMART_HTML, JOIN_HTML };

