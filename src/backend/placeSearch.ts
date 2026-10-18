import { PAYMENT_SERVER_URL } from '../config';
import type { Coords } from './fares';

export type PlaceSuggestion = {
  id: string; title: string; subtitle: string; category: 'place' | 'address' | 'locality'; lat: number; lng: number;
  source?: 'geoapify' | 'here';
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
