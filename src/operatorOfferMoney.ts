// The Operator's offer is a disclosure of the server's Travel price, never a new quote.
// All values come from the assigned Firestore Travel, priced and written by the backend.
// Match backend/economics.js: 99% of the Fare, plus the entire toll reimbursement.
export type OperatorOfferPrices = {
  travelerTotalCents: number;
  operatorReceivesCents: number;
  tollReimbursementCents: number;
};

export function operatorOfferAmounts({
  travelerTotalCents,
  travelFareCents,
  tollCents,
}: {
  travelerTotalCents: number;
  travelFareCents: number;
  tollCents: number;
}): OperatorOfferPrices | null {
  if (!Number.isSafeInteger(travelerTotalCents) || travelerTotalCents <= 0 ||
      !Number.isSafeInteger(travelFareCents) || travelFareCents <= 0 ||
      !Number.isSafeInteger(tollCents) || tollCents < 0 ||
      travelerTotalCents < travelFareCents + tollCents) {
    // A missing/corrupt price must not be replaced by a client-side estimate.
    return null;
  }
  const commissionCents = Math.floor(travelFareCents * 0.01);
  return {
    travelerTotalCents,
    operatorReceivesCents: travelFareCents - commissionCents + tollCents,
    tollReimbursementCents: tollCents,
  };
}
