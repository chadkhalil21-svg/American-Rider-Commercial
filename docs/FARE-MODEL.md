# American Rider — Fare and Unit-Economics Model

Status: **pricing description checked against the commercial `release/current` engine on 16 October 2026**. Rates are Founder-ratified; this document does not authorize an automatic change to live fares.

The server is authoritative. Request clients provide route inputs; they do not provide a price.

## 1. Travel Fare

Standard Travel Fare:

```
Travel Fare = $1.00 + ($0.95 × routed miles) + ($0.32 × routed minutes)
minimum Travel Fare = $3.00
```

The operator retains 99% of Travel Fare. American Rider's coordination commission is 1% of
Travel Fare, floored to whole cents and uncapped.

Travel classes apply to Travel Fare before the 99%/1% split.

This is the current **South Florida Standard** tariff in `backend/market-pricing.js`. Other areas require their own explicit jurisdictional pricing record. Route-based miles and minutes are priced server-side; unavailable routing can invoke an expressly identified estimate rather than a claim of observed traffic. There is no automatic holiday, weather or passenger-specific surge multiplier in this tariff. The older $0.85/mile and $0.15/minute values are historical, not present commercial prices.

Our separate market-reference service may research an approximately 90% share of **genuinely comparable, ordinary, all-in local market prices** when independently verified observation quality and promotion requirements pass. The target is a hypothesis, not a universal discount, and a published historical taxi tariff or another city's public rideshare dataset is **not a current independent ride-hail price observation** for South Florida. Only an authorized source-based pricing change and a confirmed Traveler Total may affect a booking.

## 2. Traveler Total

The Traveler sees one Total. Internally:

```
Traveler Total = Travel Fare + Platform Fee + Government Pass-throughs + Toll Reimbursement
```

Government fees and tolls are not American Rider revenue. Government fees are remitted to the
public body. Tolls are reimbursed to the operator in full.

The fact that they are pass-throughs does **not** make them free to process. Their induced
Stripe/Connect cost is funded by the Platform Fee.

## 3. Platform Fee — economic invariant

The Platform Fee is **not** "$2 or X percent." Percentages were removed because they hid fixed
Stripe costs, Connect costs, pass-through processing and rounding.

`backend/economics.js` computes the smallest whole-cent Platform Fee satisfying all of these:

- Stripe card processing on the entire Traveler Total;
- international-card surcharge when the issuing country is not the United States;
- Stripe Connect variable payout and funds-routing charges;
- a conservative fixed Connect allowance;
- 25 cents contingency reserve per separately charged Travel;
- 25 cents operating/infrastructure allowance per separately charged Travel; and
- at least 75 cents modeled platform contribution per separately charged Travel.

The absolute Platform Fee floor is $2.50. This national floor is independent of geography; the solver raises it whenever payment, payout, pass-through, reserve, overhead, or required-contribution economics demand more.

Unknown card country is priced on the international-safe schedule. A first foreign card is not
allowed to become a deliberately loss-making exception.

Payment presentment and settlement are USD-only. Therefore the normal formula
does not assume Stripe FX conversion. A future non-USD path must add the actual FX cost before
it can be enabled.

### Audited examples, no toll/government fee

| Travel Fare | US-issued card | International/unknown card |
|---:|---:|---:|
| $5 | $2.50 | $2.50 |
| $10 | $2.50 | $2.50 |
| $20 | $2.50 | $2.50 |
| $30 | $2.50 | $2.91 |
| $40 | $2.65 | $3.32 |
| $50 | $2.90 | $3.73 |
| $61 | $3.18 | $4.18 |
| $75 | $3.52 | $4.75 |
| $100 | $4.13 | $5.77 |
| $150 | $5.37 | $7.81 |

These are outputs of the integer-cent economic model, not manually selected tiers.

## 4. Pass-throughs

A $2.00 MIA pickup fee remains exactly $2.00 owed to Miami-Dade Aviation. The Platform Fee may
rise by several cents because Stripe charges its percentage on the government money as well.

A toll remains exactly the amount owed back to the operator. The Platform Fee funds the
processing and Connect cost induced by collecting and forwarding it.

The beneficiary receives 100% of the underlying pass-through.

## 5. Smart Travel

Smart Travel may contain two separately charged car Travels. Two PaymentIntents mean two fixed
Stripe charges and two operating/reserve units.

The Traveler still pays one journey-level Platform Fee, but that fee is calculated with
`transactionCount = 2`. Leg 2 carries only the incremental amount not already collected on
leg 1.

A one-fee policy must never be implemented by pretending two charges have one charge's costs.

## 6. Operator payout

For a normal Travel:

```
Operator payout = Travel Fare − 1% commission + toll reimbursement
```

Government fees are never included in the operator share.

The separate Stripe Connect active-account economics are budgeted in the unit model.
Any future Operator account-service charge must be disclosed separately and must never be
described as a reduction of the 99% Travel Fare share.

## 7. Cost controls and unresolved corporate costs

The per-Travel model includes explicit operating/infrastructure allowance, but it cannot invent
unknown corporate invoices. Actual TNC-level insurance, CPA compliance, legal/accounting,
support labor and other fixed corporate expenses must be entered into the operating budget as
they are quoted.

The pricing engine must then raise the operating-overhead allowance if conservative volume is
insufficient to carry those costs.

**No projection may be labeled fully loaded until the Florida TNC insurance/backstop structure
has an authoritative coverage opinion and actual quote.**

## Operator livelihood and market comparison (research, not an automatic surcharge)

99% of the paid Travel Fare is a payment-share promise, **not** proof of fair net hourly earnings. Evaluate pickup/deadhead distance, unpaid waiting time, commercial vehicle costs, cancellations, utilization and duty-time earnings by county and route/time class. Official BLS wage statistics are employee occupational comparisons rather than verified platform-Operator net income; the IRS's 76¢/mile July–December 2026 optional business deduction rate is a research proxy, **not** every Operator's actual vehicle cost, a guaranteed pay rate or a tax ruling. Gather actual voluntary Operator cost and time distributions before using an earnings target to change fares.

Never infer that a cheap Traveler Total is competitive from an unmatched historical taxi estimate. Prefer the full quoted Total for the same route, service, hour, toll and government fees with current rights-permitted source observations. Exclude personalized promotional discounts and make data vintage visible. See `docs/audits/INSTITUTIONAL-PRICING-REVIEW-2026-10-16.md`.

## 8. Release invariant

The release gate must prove, exhaustively across the tested fare domain, that:

1. app and server pricing agree to the cent;
2. every selected fee meets the modeled contribution target;
3. one cent less fails whenever the $2.50 floor is not controlling;
4. government fees and tolls cannot create a hidden subsidy;
5. unknown cards are internationally safe; and
6. Smart Travel funds each separately charged leg's fixed economics.

The authoritative tests are `backend/economics.test.js`, `backend/payments.test.js` and `backend/institutional-pricing-integrity.test.js`. The latter also asserts that this document matches the commercial code and runs twice across synthetic 10K, 100K and 1M arithmetic tiers, with smaller end-to-end pricing-function scenarios. Those synthetic tiers are not certified concurrency, device, Stripe or production database load tests.
