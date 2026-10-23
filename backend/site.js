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

const HOME_HTML = page(
  'American Rider',
  `
<section class="hero-grid" aria-labelledby="home-heading">
  <div>
    <p class="eyebrow">American Rider · National Transportation</p>
    <h1 class="hero-heading" id="home-heading">Travel, <span>considered.</span></h1>
    <p class="hero-lede">Transportation with clear terms, a composed experience, and independent Operators who retain 99% of the Travel Fare.</p>
    <div class="button-row">
      <a class="cta" href="/travel">Explore Travel</a>
      <a class="ghost" href="/operate">Operate with American Rider</a>
    </div>
  </div>
  <div class="path-card" role="img" aria-label="An abstract illustration of a connected journey, not a live map">
    <div class="path-label"><span>American Rider · United States</span><span>01 / 03</span></div>
    <svg viewBox="0 0 500 290" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <defs>
        <pattern id="ar-web-grid" width="48" height="48" patternUnits="userSpaceOnUse">
          <path d="M 48 0 L 0 0 0 48" fill="none" stroke="#c3ced8" stroke-width=".65" opacity=".48"/>
        </pattern>
      </defs>
      <rect x="0" y="0" width="500" height="290" rx="9" fill="url(#ar-web-grid)"/>
      <path d="M53 242 C110 226 102 157 183 158 C267 158 235 57 335 67 C401 73 407 116 457 51" fill="none" stroke="#a0afc0" stroke-width="11" stroke-linecap="round" opacity=".22"/>
      <path d="M53 242 C110 226 102 157 183 158 C267 158 235 57 335 67 C401 73 407 116 457 51" fill="none" stroke="#224d86" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="7 9"/>
      <circle cx="53" cy="242" r="14" fill="#f6f9fc" stroke="#2E5FE0" stroke-width="2.5"/>
      <circle cx="53" cy="242" r="4" fill="#2E5FE0"/>
      <circle cx="457" cy="51" r="14" fill="#172f4c" stroke="#f8fafc" stroke-width="3"/>
      <circle cx="457" cy="51" r="4" fill="#f8fafc"/>
      <rect x="188" y="128" width="114" height="38" rx="10" fill="#ffffff" stroke="#d2dce5"/>
      <text x="245" y="151" font-family="system-ui,sans-serif" font-size="12" font-weight="600" letter-spacing="1.1" text-anchor="middle" fill="#1c3859">AMERICAN</text>
      <path d="M72 250L100 265M420 36L441 21" stroke="#8099af" stroke-width="1.6"/>
    </svg>
    <p class="path-caption">The journey, thoughtfully arranged.</p>
  </div>
</section>

<div class="feature-strip" aria-label="Explore American Rider">
  <section aria-labelledby="ar-travel">
    <div class="number">01 / TRAVELER</div>
    <h2 id="ar-travel">One clear Total</h2>
    <p>Review one all-in Total before reserving. The agreed Total includes the Travel Fare, Platform Fee, and applicable charges.</p>
    <a class="more" href="/travel">How Travel works &rsaquo;</a>
  </section>
  <section aria-labelledby="ar-operator">
    <div class="number">02 / OPERATOR</div>
    <h2 id="ar-operator">99% of the Fare</h2>
    <p>Independent Operators retain 99% of the Travel Fare. The minimum Platform Fee is $2.50 per Travel and is not deducted from the Operator's share.</p>
    <a class="more" href="/operate">Operating information &rsaquo;</a>
  </section>
  <section aria-labelledby="ar-safety">
    <div class="number">03 / CONFIDENCE</div>
    <h2 id="ar-safety">Qualification and care</h2>
    <p>Operators must meet applicable insurance, screening, and vehicle requirements before becoming eligible for Travel.</p>
    <a class="more" href="/safety">Safety standards &rsaquo;</a>
  </section>
</div>

<div class="divider-label">A national transportation platform</div>
<section class="service-panel" aria-labelledby="network-heading">
  <div>
    <h2 id="network-heading">Designed to serve the nation.</h2>
    <p>American Rider is building a transportation network across the United States.
    Actual availability depends on location and qualified Operators.
    We are preparing the public mobile-app release.</p>
    <p><a href="/smart-travel">Smart Travel</a> · Currently unavailable.</p>
  </div>
  <a href="/travel">Explore Travel &rsaquo;</a>
</section>

<section class="recruitment-feature" aria-labelledby="recruitment-heading">
  <div>
    <p class="eyebrow">Work with American Rider</p>
    <h2 id="recruitment-heading">Help build the network.</h2>
    <p>Learn about independent recruiting opportunities and how approved representatives will introduce people to American Rider. This is separate from Traveler invitations.</p>
  </div>
  <a class="more" href="/recruitment">Recruitment information &rsaquo;</a>
</section>
`,
  '/',
);

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


const RECRUITMENT_HTML = page(
  'Recruitment',
  `
<h1>Recruitment</h1>
<p class="lede">Represent American Rider with clarity and professionalism.</p>
<section aria-labelledby="recruitment-overview">
  <h2 id="recruitment-overview">Independent recruiting</h2>
  <p>American Rider is developing a separate program for independent representatives who may introduce prospective Operators and Travelers to our national transportation platform. Service begins in selected markets; an introduction does not establish that Travel is available in a location.</p>
  <p>Recruiters are distinct from Travelers using the ordinary Invite a Traveler feature.</p>
</section>
<section aria-labelledby="recruitment-process">
  <h2 id="recruitment-process">Approval and representation</h2>
  <p>Recruiter identity, approval, permitted activities and written terms must be established before anyone represents American Rider as an approved recruiter. Personal attribution links, QR codes, recruiter accounts and commission statements will be made available only after their systems have been tested and activated.</p>
  <p>Compensation, eligibility and payout frequency are not yet announced. No person should promise payments or recruiting status on our behalf.</p>
</section>
<section aria-labelledby="recruitment-contact">
  <h2 id="recruitment-contact">Business inquiries</h2>
  <p>The recruiter program is not yet open for enrollment. For an initial business inquiry, contact <a href="mailto:relations@americanrider.app?subject=Recruitment%20inquiry">relations@americanrider.app</a>.</p>
  <p>Do not send identity documents, bank information or tax records by ordinary email.</p>
</section>
`,
  '/recruitment',
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
module.exports = { HOME_HTML, OPERATE_HTML, SUPPORT_HTML, TRAVEL_HTML, SAFETY_HTML, SMART_HTML, JOIN_HTML, RECRUITMENT_HTML };

