// Real trip-map vehicle positions. A status change is NOT evidence that a car moved.
// Read only the Operator's existing position report on the authorized Travel document.
// A missing/stale reading hides the car rather than inventing progress.
export type LiveVehiclePosition = { lat: number; lng: number; at: number };
export type RidePositionReport = {
  operatorId?: unknown;
  operatorDemo?: unknown;
  releasedAt?: unknown;
  status?: unknown;
  opLat?: unknown;
  opLng?: unknown;
  opAt?: unknown;
};

export function validLiveVehiclePosition(
  ride: RidePositionReport | null | undefined,
  now: number = Date.now(),
): LiveVehiclePosition | null {
  if (!ride || typeof ride.operatorId !== 'string' || !ride.operatorId ||
      ride.operatorDemo === true || ride.releasedAt ||
      !['assigned', 'accepted', 'arrived', 'onboard'].includes(String(ride.status))) return null;
  const { opLat: lat, opLng: lng, opAt: at } = ride;
  if (typeof lat !== 'number' || typeof lng !== 'number' ||
      !Number.isFinite(lat) || !Number.isFinite(lng) ||
      Math.abs(lat) > 90 || Math.abs(lng) > 180 ||
      typeof at !== 'number' || !Number.isSafeInteger(at) ||
      !Number.isSafeInteger(now) || at > now + 5000 || now - at > 60000) return null;
  return { lat, lng, at };
}
