/**
 * Screen-only breakdown of a completed Travel's estimated Operator amount.
 * All money is checked in integer cents. A local operation is NOT evidence
 * that Stripe captured funds or paid the Operator.
 *
 * Operator receives 99% of Travel Fare plus 100% of eligible toll reimbursement.
 * Do not subtract their total (including tolls) from Fare to infer commission:
 * that produces a negative commission whenever tolls exceed the 1% share.
 */
export function completionBreakdown(
  fareDollars: number,
  operatorTotalDollars: number,
  tollReimbursementCents?: number | null,
): { commissionCents: number | null; tollReimbursementCents: number | null } {
  const unknown = { commissionCents: null, tollReimbursementCents: null };
  if (!Number.isFinite(fareDollars) || !Number.isFinite(operatorTotalDollars) ||
      tollReimbursementCents == null || !Number.isSafeInteger(tollReimbursementCents) ||
      tollReimbursementCents < 0) return unknown;

  const fareCents = Math.round(fareDollars * 100);
  const operatorTotalCents = Math.round(operatorTotalDollars * 100);
  if (!Number.isSafeInteger(fareCents) || fareCents <= 0 ||
      !Number.isSafeInteger(operatorTotalCents) || operatorTotalCents < 0 ||
      Math.abs(fareDollars * 100 - fareCents) > 1e-6 ||
      Math.abs(operatorTotalDollars * 100 - operatorTotalCents) > 1e-6) return unknown;

  const commissionCents = fareCents + tollReimbursementCents - operatorTotalCents;
  // An older/mismatched local record is not permission to invent a commission.
  // Retain the gross estimate, but suppress an unverified breakdown.
  if (commissionCents !== Math.floor(fareCents * 0.01)) return unknown;
  return { commissionCents, tollReimbursementCents };
}
