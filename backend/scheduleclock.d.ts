export function pickupDate(epoch: number, zone: string): string;
export function pickupMinutes(epoch: number, zone: string): number;
export function nextDate(date: string, days?: number): string;
export function resolvePickupWall(date: string, time: string, period: 'AM'|'PM', zone: string):
  { ok: true; atMs: number } | { ok: false; code: string };

export type ScheduleReadiness =
  | 'ready' | 'destination_required' | 'quote_required'
  | 'zone_unavailable' | 'date_required' | 'time_unconfirmed'
  | 'time_invalid' | 'time_past';
export function scheduleReadiness(args: {
  hasDestination: boolean;
  hasQuote: boolean;
  pickupZone: string | null;
  pickupDate: string | null;
  resolved: { ok: true; atMs: number } | { ok: false; code: string };
  customState: 'none' | 'ok' | 'suggest' | 'bad' | 'past';
  nowMs: number;
}): ScheduleReadiness;
