// Emergency coordinates outrank a slower street-name lookup.
// Pure functions so we can test movement, out-of-order GPS samples, and
// delayed reverse geocoding without an actual phone or 911 interaction.
export type EmergencyCoordinate = { lat: number; lng: number };
export type EmergencyFix = {
  coords: EmergencyCoordinate;
  address: string | null;
  region: string | null;
  at: number;
};

// At a street junction, even an accurate address 50 m away can direct help
// down the wrong road. Keep the precise coordinates and discard stale labels.
const STREET_LABEL_RADIUS_METERS = 15;

function distanceMeters(a: EmergencyCoordinate, b: EmergencyCoordinate): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 12742000 * Math.asin(Math.min(1, Math.sqrt(Math.max(0, h))));
}

export function applyEmergencyPosition(
  previous: EmergencyFix | null,
  coords: EmergencyCoordinate,
  at: number,
): EmergencyFix | null {
  if (!Number.isFinite(at) || at <= 0 ||
      !Number.isFinite(coords.lat) || Math.abs(coords.lat) > 90 ||
      !Number.isFinite(coords.lng) || Math.abs(coords.lng) > 180)
    return previous;
  // A slower callback from an older GPS fix must not move the map backwards.
  if (previous && at <= previous.at) return previous;
  const stillNearStreet = !!previous &&
    distanceMeters(previous.coords, coords) <= STREET_LABEL_RADIUS_METERS;
  return {
    coords: { lat: coords.lat, lng: coords.lng },
    address: stillNearStreet ? previous!.address : null,
    region: stillNearStreet ? previous!.region : null,
    at,
  };
}

export function applyEmergencyStreet(
  current: EmergencyFix | null,
  geocodedPoint: EmergencyCoordinate,
  address: string | null,
  region: string | null,
): EmergencyFix | null {
  if (!current || !Number.isFinite(geocodedPoint.lat) ||
      !Number.isFinite(geocodedPoint.lng) ||
      distanceMeters(current.coords, geocodedPoint) > STREET_LABEL_RADIUS_METERS)
    return current;
  // Preserve the newest GPS point and its real sample time. A geocoder cannot
  // promote an old point into a fresh GPS fix by finishing its network call.
  return {
    ...current,
    address: address || null,
    region: region || null,
  };
}
