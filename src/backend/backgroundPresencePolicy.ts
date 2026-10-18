/**
 * A native background event is an opportunity for a renewal, never proof by
 * itself that the phone is reachable. iOS can stop delivering such events
 * while stationary, even when the app still has permission.
 *
 * Keep this pure: the device task, not the cloud, decides when to submit a
 * *fresh* fix. The server still owns qualification and new-Travel eligibility.
 */
export const BACKGROUND_FIX_MAX_AGE_MS = 90_000;
export const BACKGROUND_FIX_MAX_ACCURACY_M = 150;
export const BACKGROUND_RENEWAL_MIN_MS = 90_000;

type BackgroundFix = {
  coords: { latitude: number; longitude: number; accuracy: number | null };
  timestamp: number;
  mocked?: boolean;
};

export function validBackgroundFix(fix: BackgroundFix | null | undefined, now = Date.now()): boolean {
  if (!fix || !fix.coords || fix.mocked === true) return false;
  const { latitude, longitude, accuracy } = fix.coords;
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return false;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return false;
  if (accuracy == null || !Number.isFinite(accuracy) || accuracy < 0 ||
      accuracy > BACKGROUND_FIX_MAX_ACCURACY_M) return false;
  if (!Number.isFinite(fix.timestamp) || !Number.isFinite(now)) return false;
  const age = now - fix.timestamp;
  return age >= -5_000 && age <= BACKGROUND_FIX_MAX_AGE_MS;
}

/** In-memory bound per task process; a restart may cause one extra request. */
export function backgroundRenewalDue(lastAcceptedAt: number, now = Date.now()): boolean {
  if (!Number.isFinite(now) || now <= 0) return false;
  if (!Number.isFinite(lastAcceptedAt) || lastAcceptedAt <= 0 || lastAcceptedAt > now) return true;
  return now - lastAcceptedAt >= BACKGROUND_RENEWAL_MIN_MS;
}
