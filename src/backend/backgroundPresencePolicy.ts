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

/**
 * A moving car needs a fresher dispatch position than a parked Operator.
 * Only accelerate requests after both meaningful movement and a minimum
 * thirty-second interval. This keeps the worst-case API rate bounded.
 * Uses a modest spherical distance estimate, not a reverse-geocoder.
 */
export const MOVING_RENEWAL_MIN_MS = 30_000;
export const MOVING_RENEWAL_DISTANCE_M = 300;
export function backgroundMovementDue(
  lastAcceptedAt: number,
  previous: { latitude: number; longitude: number } | null,
  next: { latitude: number; longitude: number },
  now = Date.now(),
): boolean {
  if (!Number.isFinite(lastAcceptedAt) || lastAcceptedAt <= 0 ||
      !Number.isFinite(now) || now - lastAcceptedAt < MOVING_RENEWAL_MIN_MS) return false;
  if (!previous || !next) return false;
  const lat1 = previous.latitude, lon1 = previous.longitude;
  const lat2 = next.latitude, lon2 = next.longitude;
  if (![lat1,lon1,lat2,lon2].every(Number.isFinite) ||
      Math.abs(lat1)>90 || Math.abs(lat2)>90 ||
      Math.abs(lon1)>180 || Math.abs(lon2)>180) return false;
  const radians = Math.PI / 180;
  const phi1=lat1*radians, phi2=lat2*radians;
  const dphi=(lat2-lat1)*radians, dlambda=(lon2-lon1)*radians;
  const a=Math.sin(dphi/2)**2+Math.cos(phi1)*Math.cos(phi2)*Math.sin(dlambda/2)**2;
  const meters=2*6371000*Math.asin(Math.min(1,Math.sqrt(a)));
  return meters >= MOVING_RENEWAL_DISTANCE_M;
}
