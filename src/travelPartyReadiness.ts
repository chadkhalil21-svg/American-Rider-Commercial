// Presentation-level readiness for the Travel Confirmation button.
// The server independently validates identity, active Family authorization,
// age, verified email, pickup PIN and payment before dispatch.
export type TravelPartySelection = {
  mode: 'self' | 'other_adult' | 'teen';
  travelerName: string;
  familyLinkId?: string;
};

export function travelPartyReady(party: TravelPartySelection): boolean {
  if (party.mode === 'self') return true;
  if (!party.travelerName.trim()) return false;
  if (party.mode === 'other_adult') return true;
  return party.mode === 'teen' &&
    typeof party.familyLinkId === 'string' &&
    party.familyLinkId.trim().length > 0;
}
