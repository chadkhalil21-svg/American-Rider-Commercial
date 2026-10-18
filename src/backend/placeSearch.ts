import { PAYMENT_SERVER_URL } from '../config';
import type { Coords } from './fares';

export type PlaceSuggestion = {
  id: string; title: string; subtitle: string; category: 'place' | 'address' | 'locality'; lat: number; lng: number;
  distanceKm?: number; outsideLocalArea?: boolean;
  source?: 'here' | 'photon';
};

export async function searchPlaces(query: string, near: Coords | null, signal?: AbortSignal): Promise<PlaceSuggestion[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  try {
    const p = new URLSearchParams({ q, limit: '6' });
    if (near && Number.isFinite(near.lat) && Number.isFinite(near.lng)) { p.set('lat', String(near.lat)); p.set('lng', String(near.lng)); }
    const res = await fetch(`${PAYMENT_SERVER_URL}/place-search?${p.toString()}`, { signal });
    if (!res.ok) return [];
    const d = await res.json().catch(() => null);
    if (!Array.isArray(d?.suggestions)) return [];
    return d.suggestions.filter((x: any) => x && typeof x.title === 'string' && Number.isFinite(x.lat) && Number.isFinite(x.lng));
  } catch (e: any) {
    if (e?.name === 'AbortError') return [];
    return [];
  }
}

/**
 * An automatic recovery for a previously selected named destination is safe
 * only if there is ONE exact-name match inside the traveler's local area.
 * Never silently choose an identically named place in a different US state.
 * National results still appear normally in the interactive picker.
 */
export function uniqueNearbyExactPlace(
  name: string, suggestions: PlaceSuggestion[], near: Coords | null,
): PlaceSuggestion | null {
  if (!near || !Number.isFinite(near.lat) || !Number.isFinite(near.lng)) return null;
  const normalize = (s: string) => s.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
  const matches = suggestions.filter(p => normalize(p.title) === normalize(name) &&
    Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (matches.length !== 1) return null;
  const only = matches[0];
  const rad = (n: number) => n * Math.PI / 180;
  const dlat = rad(only.lat - near.lat);
  const dlon = rad(only.lng - near.lng);
  const hav = Math.sin(dlat/2)**2 +
    Math.cos(rad(near.lat)) * Math.cos(rad(only.lat)) * Math.sin(dlon/2)**2;
  const km = 6371 * 2 * Math.atan2(Math.sqrt(hav), Math.sqrt(Math.max(0, 1-hav)));
  return km <= 250 ? only : null;
}
