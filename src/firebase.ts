// American Rider — Firebase connection for the real app.
//
// This web config is NOT secret — Firebase config is designed to live in the app.
// Security comes from Firebase Auth + Firestore Security Rules, not from hiding these.
import { initializeApp } from 'firebase/app';
import * as fbAuth from 'firebase/auth';
import { connectAuthEmulator, getAuth, initializeAuth, type Auth, type Persistence } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Strictly local, throwaway Firebase test environment for REAL native emulator
// interaction, not a bypass in the App Store or production Cloud Run client.
// This flag is never enabled by EAS or an ordinary developer launch.
const isolatedQa =
  Platform.OS !== 'web' &&
  process.env.EXPO_PUBLIC_AR_NATIVE_QA === '1' &&
  (process.env.EXPO_PUBLIC_API_URL === 'http://10.0.2.2:4242' ||
    process.env.EXPO_PUBLIC_API_URL === 'http://127.0.0.1:4242');
const emulatorHost = Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1';

const firebaseConfig = {
  apiKey: 'AIzaSyAQMJ1ikGvhrmCZY9D0OjM6EM2r2m0V4OY',
  authDomain: 'american-rider-35688.firebaseapp.com',
  projectId: 'american-rider-35688',
  storageBucket: 'american-rider-35688.firebasestorage.app',
  messagingSenderId: '623854974930',
  appId: '1:623854974930:web:d73e4dec7949c3756efa0b',
};

export const app = initializeApp(isolatedQa ? {
  apiKey: 'native-qa-local-only',
  authDomain: 'demo-american-rider-qa.firebaseapp.com',
  projectId: 'demo-american-rider-qa',
  storageBucket: 'demo-american-rider-qa.appspot.com',
  messagingSenderId: '000000000001',
  appId: '1:000000000001:web:local-native-qa',
} : firebaseConfig);

// STAYING SIGNED IN — the thing every rideshare app gets right and we didn't.
//
// On a phone, plain getAuth() keeps the session in MEMORY ONLY: force-quit the app and
// the traveler is thrown back to the front door with their trips, saved places, and
// operator status apparently gone. Firebase's own warning says so — "Auth state will
// default to memory persistence and will not persist between sessions."
//
// initializeAuth() with AsyncStorage (the phone's own on-device storage) writes the
// session to disk, so it survives force-quits, reboots, and app updates — you sign in
// once, like Uber. On web, getAuth() already persists in the browser.
//
// Metro resolves Firebase's React Native bundle at runtime. TypeScript currently resolves the
// browser declaration surface for firebase/auth under Expo and therefore omits this RN-only
// export. Keep the cast isolated here; the native export is also verified by the iOS export gate.
const getReactNativePersistence = (fbAuth as unknown as {
  getReactNativePersistence?: (storage: typeof AsyncStorage) => Persistence;
}).getReactNativePersistence;

function createAuth(): Auth {
  if (Platform.OS === 'web') return getAuth(app);
  if (typeof getReactNativePersistence !== 'function') {
    throw Object.assign(new Error('firebase/native-persistence-unavailable'), {
      code: 'firebase/native-persistence-unavailable',
    });
  }
  try {
    return initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  } catch (e: unknown) {
    // Reuse only a genuinely pre-initialized Auth instance. Do not silently downgrade a
    // native persistence/configuration failure to memory-only authentication.
    if ((e as { code?: string })?.code === 'auth/already-initialized') return getAuth(app);
    throw e;
  }
}

export const auth = createAuth();
if (isolatedQa) connectAuthEmulator(auth, `http://${emulatorHost}:9099`, { disableWarnings: true });

// The live Firestore database — operators, rides, etc.
export const db = getFirestore(app);
if (isolatedQa) connectFirestoreEmulator(db, emulatorHost, 8080);
