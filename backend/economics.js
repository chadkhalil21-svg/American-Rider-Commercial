// American Rider — canonical unit economics for one priced Travel.
//
// PURPOSE. The platform fee is not a marketing percentage. It is the smallest whole-cent
// amount that preserves the economic invariant below after the payment processor, Stripe
// Connect, the operating-risk reserve and a per-Travel infrastructure/overhead allowance.
//
// The traveler still sees one Total. These constants and calculations are internal.
//
// PAYMENT ARCHITECTURE
//   * Present and settle in USD only. An international-issued card therefore incurs Stripe's
//     international-card rate, but no Stripe FX conversion is assumed in the payment path.
//   * Unknown card country is costed as international. Under-pricing a first foreign card is
//     not an acceptable "first Travel" exception.
//   * Operators retain 99% of Travel Fare. Tolls are reimbursed whole.
//   * Government fees are remitted whole. Their processing cost is recovered by the platform
//     fee rather than silently absorbed.
//
// COST MODEL, 25 Sept 2026. Monetary values are cents; percentage rates are basis points.
// Stripe's $2 monthly payout-active Connect account charge belongs to the Operator,
// not Travelers; the former 20-Travel waiver is repealed. Separate collection requires
// affirmative fee consent, and cannot be assumed recovered in the fare model until paid.
// Payout/routing costs remain conservatively reserved here until actual per-payout Operator
// billing is verified. Never pretend a payout is free or double-count recovered fees.
//
// IMPORTANT. Costs that cannot yet be known from a quote (e.g. actual TNC corporate insurance,
// legal/accounting retainers) belong in the OPERATING_OVERHEAD allowance once quoted and in the
// corporate budget. The pricing function is intentionally centralized so that changing one
// audited allowance changes every quote and every invariant test together.

const MIN_PLATFORM_FEE_CENTS = 250;
const DOMESTIC_CARD_BPS = 290;      // 2.9%
const INTERNATIONAL_CARD_BPS = 440; // 2.9% + 1.5%
const STRIPE_FIXED_CENTS = 30;

const CONNECT_VARIABLE_BPS = 50; // 0.25% payout + 0.25% funds routing
const CONNECT_FIXED_ALLOWANCE_CENTS = 6;

const CONTINGENCY_RESERVE_CENTS = 25;
const OPERATING_OVERHEAD_ALLOWANCE_CENTS = 25;
const MIN_PLATFORM_CONTRIBUTION_CENTS = 75;

function cleanCountry(cardCountry) {
  return cardCountry == null ? '' : String(cardCountry).trim().toUpperCase();
}

function isDomesticCard(cardCountry) {
  return cleanCountry(cardCountry) === 'US';
}

function processingBps(cardCountry) {
  // Unknown is deliberately international-safe. A first Travel must not be loss-making merely
  // because the issuing country is learned after the quote.
  return isDomesticCard(cardCountry) ? DOMESTIC_CARD_BPS : INTERNATIONAL_CARD_BPS;
}

function ceilBps(cents, bps) {
  if (!(cents > 0) || !(bps > 0)) return 0;
  return Math.ceil((cents * bps) / 10000);
}

function commissionCents(travelCostCents) {
  return Math.floor(travelCostCents * 0.01);
}

/**
 * Fully loaded modeled economics for a candidate platform fee.
 *
 * transactionCount is normally 1. Smart Travel may contain two separately charged car legs;
 * its journey-level fee therefore has to fund two fixed Stripe/Connect/reserve/overhead units,
 * not pretend that two PaymentIntents cost the same as one.
 */
function economicsFor({
  travelCostCents,
  platformFeeCents,
  governmentFeeCents = 0,
  tollCents = 0,
  cardCountry = null,
  transactionCount = 1,
  // A source-only scenario input. Zero in every existing production quote.
  // Future paid referral offers must reserve the entire actual obligation first.
  referralReserveCents = 0,
}) {
  if (!Number.isSafeInteger(referralReserveCents) ||
      referralReserveCents < 0 || referralReserveCents > 30)
    throw new RangeError('referralReserveCents must be a whole number from 0 to 30');
  const fare = Math.max(0, Math.trunc(Number(travelCostCents) || 0));
  const fee = Math.max(0, Math.trunc(Number(platformFeeCents) || 0));
  const government = Math.max(0, Math.trunc(Number(governmentFeeCents) || 0));
  const toll = Math.max(0, Math.trunc(Number(tollCents) || 0));
  const units = Math.max(1, Math.trunc(Number(transactionCount) || 1));

  const commission = commissionCents(fare);
  const operatorGets = fare - commission + toll;
  const travelerPays = fare + fee + government + toll;

  const cardProcessingCents =
    ceilBps(travelerPays, processingBps(cardCountry)) + STRIPE_FIXED_CENTS * units;
  const connectVariableCents = ceilBps(operatorGets, CONNECT_VARIABLE_BPS);
  const connectFixedAllowanceCents = CONNECT_FIXED_ALLOWANCE_CENTS * units;
  const contingencyReserveCents = CONTINGENCY_RESERVE_CENTS * units;
  const operatingOverheadCents = OPERATING_OVERHEAD_ALLOWANCE_CENTS * units;

  const platformGrossCents = commission + fee;
  const platformContributionCents =
    platformGrossCents -
    cardProcessingCents -
    connectVariableCents -
    connectFixedAllowanceCents -
    contingencyReserveCents -
    operatingOverheadCents -
    referralReserveCents;

  return {
    travelerPays,
    operatorGets,
    commission,
    platformGrossCents,
    cardProcessingCents,
    connectVariableCents,
    connectFixedAllowanceCents,
    contingencyReserveCents,
    operatingOverheadCents,
    referralReserveCents,
    platformContributionCents,
    requiredContributionCents: MIN_PLATFORM_CONTRIBUTION_CENTS * units,
  };
}

/** Is a candidate fee sufficient under the complete modeled transaction economics? */
function feeIsSufficient(args) {
  const e = economicsFor(args);
  return e.platformContributionCents >= e.requiredContributionCents;
}

/**
 * The smallest whole-cent platform fee that satisfies the invariant.
 *
 * Binary search is used rather than a hand-derived percentage. Stripe charges its percentage
 * on the fee itself, pass-throughs change processing cost, Connect depends on the operator
 * transfer, and every component rounds to cents. Solving the actual integer problem avoids a
 * crossover that is mathematically neat and economically wrong.
 */
function minimumPlatformFeeCents({
  travelCostCents,
  governmentFeeCents = 0,
  tollCents = 0,
  cardCountry = null,
  transactionCount = 1,
  referralReserveCents = 0,
}) {
  const base = {
    travelCostCents,
    governmentFeeCents,
    tollCents,
    cardCountry,
    transactionCount,
    referralReserveCents,
  };

  if (feeIsSufficient({ ...base, platformFeeCents: MIN_PLATFORM_FEE_CENTS })) {
    return MIN_PLATFORM_FEE_CENTS;
  }

  let lo = MIN_PLATFORM_FEE_CENTS + 1;
  let hi = Math.max(400, Math.ceil((Number(travelCostCents) || 0) * 0.10) + 500);
  while (!feeIsSufficient({ ...base, platformFeeCents: hi })) {
    hi *= 2;
    if (hi > 10_000_000) throw new Error('platform fee could not satisfy the economic invariant');
  }

  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (feeIsSufficient({ ...base, platformFeeCents: mid })) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

module.exports = {
  MIN_PLATFORM_FEE_CENTS,
  DOMESTIC_CARD_BPS,
  INTERNATIONAL_CARD_BPS,
  STRIPE_FIXED_CENTS,
  CONNECT_VARIABLE_BPS,
  CONNECT_FIXED_ALLOWANCE_CENTS,
  CONTINGENCY_RESERVE_CENTS,
  OPERATING_OVERHEAD_ALLOWANCE_CENTS,
  MIN_PLATFORM_CONTRIBUTION_CENTS,
  isDomesticCard,
  processingBps,
  commissionCents,
  economicsFor,
  feeIsSufficient,
  minimumPlatformFeeCents,
};
