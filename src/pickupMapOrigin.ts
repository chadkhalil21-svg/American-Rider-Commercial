// A map camera cannot start from an invented place.
// Prefer a deliberately selected pickup; otherwise a verified departure.
// When neither exists the caller can request fresh device location or ask for an address.
export type PickupMapPoint = { lat?: number; lng?: number } | null | undefined;
export type ResolvedPickupMapPoint = { lat?: number; lng?: number; resolved?: boolean } | null | undefined;

export function validMapCoordinate(lat: unknown, lng: unknown): lat is number {
  return typeof lat === 'number' && typeof lng === 'number' &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

export type PickupMapCenter = { latitude: number; longitude: number } | null;

export function pickupMapOrigin(
  selected: PickupMapPoint,
  departure: ResolvedPickupMapPoint,
): PickupMapCenter {
  const known = selected && validMapCoordinate(selected.lat, selected.lng)
    ? selected
    : departure?.resolved && validMapCoordinate(departure.lat, departure.lng)
      ? departure
      : null;
  return known ? { latitude: known.lat as number, longitude: known.lng as number } : null;
}
