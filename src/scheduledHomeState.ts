import type { ScheduledRide } from './backend/scheduled';

// Home summarises future appointments and short-lived actionable dispatch failures;
// the full Scheduled Travel list retains the historical record. Cancellation is
// terminal immediately; never wait for the original pickup time to dismiss it.
export function showScheduledOnHome(
  record: Pick<ScheduledRide, 'status' | 'atMs'> | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!record || !Number.isFinite(record.atMs) || record.status === 'cancelled') return false;
  const status = record.status ?? 'reserved';
  if (status === 'dispatched') return record.atMs > now - 90 * 60_000;
  if (['unmatched', 'payment_failed', 'needs_attention', 'price_changed'].includes(status)) {
    return record.atMs > now - 60 * 60_000;
  }
  return record.atMs > now;
}

// The Home card must never say Upcoming Travel for a terminal failed request.
export function scheduledHomeHeadingKey(status?: ScheduledRide['status']): string {
  switch (status) {
    case 'dispatched': return 'traveler.schedOperatorAssigned';
    case 'unmatched': return 'traveler.noOperatorAvailable';
    case 'payment_failed': return 'traveler.cardDeclined';
    case 'needs_attention': return 'traveler.chargedNotCreated';
    case 'price_changed': return 'traveler.schedNeedsReview';
    case 'dispatching' as ScheduledRide['status']: return 'traveler.rideFindingBest';
    default: return 'traveler.scheduledTravel';
  }
}
