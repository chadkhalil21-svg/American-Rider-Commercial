// An actual completed first-car Travel is the only stable source for the second-car
// booking key. The server also binds this key to the signed-in Traveler account.
// Invalid or optimistic UI Travel Numbers may never create a second car.
export function smartSecondCarKey(leg1No: string | null | undefined): string | null {
  return typeof leg1No === 'string' && /^AR-[0-9A-F]{8}-(?:MIA|FLL|PBI|SFL)$/.test(leg1No)
    ? `smart2-${leg1No}` : null;
}
