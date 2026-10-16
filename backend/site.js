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
// The figures are real, verified against Stripe on 19 Aug 2026: a $24.50 travel charges
// $26.00, transfers $24.26, and leaves $1.74. If the fare model changes, change them here.
const { page } = require('./shell');

const HOME_HTML = page(
  'American Rider',
  `
<div class="hero">
  <div class="name">American Rider</div>
  <div class="line">Transportation arranged between travelers and independent operators.</div>
  <div class="rule"></div>
</div>

<div class="statement">
  <div class="lbl">The operator retains</div>
  <div class="figure">99%</div>
  <div class="note">of every travel fare</div>
</div>

<section>
  <h2>A travel in full</h2>
  <p>One price, quoted before the travel and covering the journey in full.</p>
  <div class="rows" style="margin-top:16px">
    <div><span class="k">Travel fare</span><span class="amount">$24.50</span></div>
    <div class="split"><span class="k">To the operator</span><span class="amount">$24.26</span></div>
    <div><span class="k">American Rider commission</span><span class="amount">$0.24</span></div>
  </div>
  <p style="margin-top:16px">The traveler is quoted one Total before reservation. A platform
  fee funds payment and platform infrastructure without reducing the operator's 99% share of
  the travel fare. Government fees and tolls, when applicable, are passed through to their
  beneficiaries rather than retained by American Rider.</p>
</section>

<section>
  <h2>Travel</h2>
  <p>A traveler names a destination, is shown the price, and is assigned the nearest qualified
  operator. Standard, Large Vehicle and Pet Friendly are available.</p>
  <a class="more" href="/travel">How a travel works &rsaquo;</a>
</section>

<section>
  <h2>Smart Travel</h2>
  <p>Currently unavailable. We are verifying transit schedules and journey connections
  before introducing this option. Ordinary American Rider Travel remains available.</p>
</section>

<section>
  <h2>Operators</h2>
  <p>Operators are independent contractors. They own their vehicles, carry their own commercial
  coverage. On completion of each Travel, American Rider initiates the Operator’s earnings transfer to the Operator’s Stripe connected account; bank payout timing follows the Operator’s Stripe payout schedule.</p>
  <a class="cta" href="/operate">Operate with American Rider</a>
</section>

<section>
  <h2>Service</h2>
  <p>American Rider begins service in Miami, Florida. The app is in its test program and is
  not yet published on the App Store.</p>
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
  <div class="lbl">On a $24.50 travel</div>
  <div class="figure">$24.26</div>
  <div class="note">to the operator</div>
</div>

<section>
  <h2>The whole travel</h2>
  <div class="rows">
    <div><span class="k">Travel fare</span><span class="amount">$24.50</span></div>
    <div><span class="k">Coordination commission (1%)</span><span class="amount">$0.24</span></div>
    <div><span class="k">Operator receives</span><span class="amount">$24.26</span></div>
  </div>
  <p style="margin-top:16px">The platform fee is added to the fare and charged to the traveler.
  It is never taken from the operator's share, and it is what pays for card processing.</p>
  <p>The commission is 1% of the fare at every amount. A $200.00 travel returns $198.00. There
  is no tier and no cap.</p>
</section>

<section>
  <h2>Cancellations</h2>
  <p>A traveler who cancels before an operator arrives pays nothing, and the operator is owed
  nothing.</p>
  <p>Once an operator has arrived, a cancellation carries a $3.00 arrival fee, and that fee is
  paid to the operator who drove there and waited. A travel that has begun cannot be cancelled
  at all.</p>
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
<p class="lede">Reaching a person about a travel.</p>

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
  <p>A travel cancelled before the operator arrives is refunded in full. After arrival, a
  $3.00 arrival fee is retained for the operator. A travel already underway is settled through
  Patron Support rather than cancelled.</p>
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
  map. Nothing is charged until an operator has been assigned; a travel with nobody to drive it
  is not charged for.</p>
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
  <p>Before the operator arrives, a travel may be cancelled and the fare is refunded in
  full.</p>
  <p>Once the operator has arrived, cancelling returns the fare less a $3.00 arrival fee, which
  is paid to the operator who drove there and waited.</p>
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

module.exports = { HOME_HTML, OPERATE_HTML, SUPPORT_HTML, TRAVEL_HTML, SAFETY_HTML, SMART_HTML };

