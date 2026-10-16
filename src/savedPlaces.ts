// A TRAVELER'S OWN PLACES — home, work and their favourite destinations, set by them and
// nobody else.
//
// WHY THIS EXISTS. Profile used to state, as fact, that the reader's home was Brickell City
// Centre and their work was Coral Gables. Invented personal information about the person
// reading it, on the one screen that is supposed to be about them — and nothing anywhere
// could set either, so it was not a stale value, it was somebody else's. It was removed on
// sight with a note saying to restore it WITH the screen that lets a traveler save a place.
// This is that, and Profile shows these only once the traveler has actually set them.
// Favourites were added 14 September 2026 at Adrian's request: any number of destinations
// (up to eight) a traveler wants one tap away on Home.
//
// ACCOUNT-BACKED, with an account-scoped device cache. Saved Places follow the Traveler to a
// replacement phone while the local copy keeps the interface immediate and usable offline.
// One account must never inherit another account's places on a shared device.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

const KEY_PREFIX = 'ar:saved-places:v2:';
// Per-account memory window: revisiting Home should not re-read the same Firestore
// document every few seconds. Save/delete invalidates and cross-account use is isolated.
const SAVED_PLACES_CACHE_MS = 60_000;
let memoryPlaces: { key: string; at: number; value: SavedPlaces } | null = null;
const storageKey = () => KEY_PREFIX + (auth.currentUser?.uid || 'preview');
export const MAX_FAVORITES = 8;

export type SavedPlace = { label: string; lat: number; lng: number };
export type SavedPlaces = { home?: SavedPlace; work?: SavedPlace; favorites: SavedPlace[] };

// A place with no coordinates cannot be travelled to, so it is not a place. Dropped rather
// than shown as a row that fails when tapped.
const ok = (p?: SavedPlace | null): SavedPlace | undefined =>
  p && typeof p.label === 'string' && p.label.trim() && Number.isFinite(p.lat) && Number.isFinite(p.lng)
    ? { label: p.label.trim(), lat: p.lat, lng: p.lng }
    : undefined;

export async function loadSavedPlaces(): Promise<SavedPlaces> {
  const key = storageKey();
  if (memoryPlaces?.key === key && Date.now() - memoryPlaces.at < SAVED_PLACES_CACHE_MS)
    return memoryPlaces.value;
  let local: SavedPlaces = { favorites: [] };
  try {
    const raw = await AsyncStorage.getItem(storageKey());
    if (raw) {
      const v = JSON.parse(raw) as Partial<SavedPlaces>;
      const favorites = (Array.isArray(v.favorites) ? v.favorites : [])
        .map((p) => ok(p))
        .filter((p): p is SavedPlace => !!p)
        .slice(0, MAX_FAVORITES);
      local = { home: ok(v.home), work: ok(v.work), favorites };
    }
  } catch {
    local = { favorites: [] };
  }

  const uid = auth.currentUser?.uid;
  if (!uid) {
    memoryPlaces = { key, at: Date.now(), value: local };
    return local;
  }

  try {
    const snap = await getDoc(doc(db, 'users', uid));
    const rawRemote = snap.exists() ? snap.data()?.savedPlaces : null;
    if (rawRemote && typeof rawRemote === 'object') {
      const v = rawRemote as Partial<SavedPlaces>;
      const favorites = (Array.isArray(v.favorites) ? v.favorites : [])
        .map((p) => ok(p))
        .filter((p): p is SavedPlace => !!p)
        .slice(0, MAX_FAVORITES);
      const remote = { home: ok(v.home), work: ok(v.work), favorites };
      await AsyncStorage.setItem(storageKey(), JSON.stringify(remote)).catch(() => {});
      memoryPlaces = { key, at: Date.now(), value: remote };
      return remote;
    }

    // One-time migration for people who already had device-only places before account sync.
    if (local.home || local.work || local.favorites.length) {
      await setDoc(doc(db, 'users', uid), { savedPlaces: local }, { merge: true });
    }
  } catch {
    // Offline or rules unavailable: the account-scoped local cache remains usable.
  }
  memoryPlaces = { key, at: Date.now(), value: local };
  return local;
}

async function persist(next: SavedPlaces): Promise<SavedPlaces> {
  let localSaved = false;
  let remoteSaved = false;
  try {
    await AsyncStorage.setItem(storageKey(), JSON.stringify(next));
    localSaved = true;
  } catch {
    // Continue to the account store. Success is reported only if at least one durable store accepts it.
  }
  const uid = auth.currentUser?.uid;
  if (uid) {
    try {
      await setDoc(doc(db, 'users', uid), { savedPlaces: next }, { merge: true });
      remoteSaved = true;
    } catch {
      // Offline is acceptable when the account-scoped device cache was written successfully.
    }
  }
  if (!localSaved && !remoteSaved) throw new Error('saved-place-persist-failed');
  memoryPlaces = { key: storageKey(), at: Date.now(), value: next };
  return next;
}

export async function saveSavedPlace(
  which: 'home' | 'work',
  place: SavedPlace | null,
): Promise<SavedPlaces> {
  const current = await loadSavedPlaces();
  return persist({ ...current, [which]: ok(place) });
}

/** Add a favourite, or replace the one with the same label. Refused past MAX_FAVORITES. */
export async function saveFavorite(place: SavedPlace): Promise<SavedPlaces> {
  const current = await loadSavedPlaces();
  const clean = ok(place);
  if (!clean) return current;
  const rest = current.favorites.filter((f) => f.label.toLowerCase() !== clean.label.toLowerCase());
  if (rest.length >= MAX_FAVORITES) return current;
  return persist({ ...current, favorites: [...rest, clean] });
}

export async function removeFavorite(label: string): Promise<SavedPlaces> {
  const current = await loadSavedPlaces();
  return persist({
    ...current,
    favorites: current.favorites.filter((f) => f.label.toLowerCase() !== label.trim().toLowerCase()),
  });
}
