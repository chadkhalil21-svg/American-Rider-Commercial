// STAYING IN SERVICE WITH THE PHONE IN A POCKET.
//
// THE DEFECT THIS EXISTS FOR. An operator's presence was renewed by a setInterval in
// OperatorContext, every 90 seconds, reading foreground location. iOS suspends JavaScript
// timers the moment an app leaves the foreground — so the renewal stopped when the operator
// locked their phone, `onlineAt` went stale, and five minutes later matching.js correctly
// concluded they were not there.
//
// The operator, meanwhile, is sitting at a kerb with the app open in their pocket believing
// they are in service. They receive nothing, they are told nothing, and every explanation
// they reach for — "it's quiet", "the platform is broken", "I've been deprioritised" — is
// wrong. It is the worst failure shape this product has: silent, invisible from both ends,
// and indistinguishable from having no work.
//
// My own comment in backend/matching.js admitted it in August: "iOS suspends timers for a
// backgrounded app, so an operator who leaves the app will go stale even though they are
// there. The real answer is background location, which needs a native capability we have not
// built." This is that capability.
//
// HOW IT WORKS. iOS keeps delivering location to a registered background task after the app
// is suspended, provided the app declares the `location` background mode and holds "always"
// permission. Every delivery is proof the operator's phone is switched on and somewhere — so
// the location update IS the presence renewal. Nothing extra needs to run.
//
// WHY LOCATION RATHER THAN A BACKGROUND FETCH. iOS decides when background fetch runs and can
// be hours apart; it is designed for refreshing content, not for liveness. Location updates
// arrive on movement or on the distance filter, which is exactly the signal we want, and they
// are the same updates dispatch needs anyway to match by distance.
import { Alert, Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { PAYMENT_SERVER_URL } from '../config';
import { authHeaders } from './payments';
import { t } from '../i18n';

export const PRESENCE_TASK = 'american-rider-operator-presence';

/**
 * Registered at module load, which is a requirement rather than a style choice: iOS may
 * relaunch the app straight into this task after terminating it, and the definition has to
 * exist before that happens or the delivery is dropped.
 */
// NOT ON WEB. defineTask reaches for a native module that does not exist in a browser, and it
// runs at import — so on web it took the whole app down before the first screen rendered, with
// a blank page and one console error. The web build exists so the product can be reviewed by
// somebody without an iPhone; a background location task is not part of what they are
// reviewing, and an operator cannot be in service in a browser anyway.
if (Platform.OS !== 'web') {
  TaskManager.defineTask(PRESENCE_TASK, async ({ data, error }) => {
  if (error || !data) return;
  const { locations } = data as { locations?: Location.LocationObject[] };
  const last = locations?.[locations.length - 1];
  if (!last) return;

  // POSTS THE SAME SHAPE THE FOREGROUND RENEWAL DOES, to /operator/online — which is not only
  // a presence write. It re-runs every gate: coverage, the disclosure, Stripe payouts. So a
  // policy that lapses at midnight takes the operator out of service at 00:01 even with the
  // phone locked, rather than at the end of a shift they should not have been driving.
  try {
    const response = await fetch(`${PAYMENT_SERVER_URL}/operator/online`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({
        lat: last.coords.latitude,
        lng: last.coords.longitude,
        // The server keeps whatever it already holds for these when they are absent; a
        // background renewal has no access to the provider's React state.
        background: true,
      }),
    });
    if (!response.ok) {
      // A resolved fetch is not necessarily an accepted renewal. Do not log
      // Operator identity, coordinates, tokens or provider evidence.
      const result = await response.json().catch(() => null);
      const code = typeof result?.code === 'string' ? result.code.slice(0, 48) : 'no_code';
      console.warn('[operator-presence] renewal_refused', response.status, code);
    }
  } catch {
    // A failed renewal is a missed heartbeat, not an emergency. PRESENCE_STALE_MS tolerates
    // two, and the next location delivery tries again. Throwing here would have iOS treat the
    // task as faulty and back it off.
    }
  });
}

/** Google Play requires a clear choice before an Operator requests background location.
 * This is shown only on Android and only if the permission is not already granted.
 * Refusing leaves the Operator off duty; it never silently enables background tracking.
 */
export async function confirmOperatorBackgroundLocationUse(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    if ((await Location.getBackgroundPermissionsAsync()).granted) return true;
  } catch {
    // An unavailable permission status does not mean the Operator has consented.
  }
  return new Promise<boolean>((resolve) => {
    Alert.alert(
      t('traveler.bgLocationConsentTitle'),
      t('traveler.bgLocationConsentExplanation'),
      [
        { text: t('traveler.bgLocationConsentNotNow'), style: 'cancel', onPress: () => resolve(false) },
        { text: t('traveler.bgLocationConsentContinue'), onPress: () => resolve(true) },
      ],
      { cancelable: false },
    );
  });
}

/** Whether this device can hold presence in the background at all. */
export async function backgroundPresenceAvailable(): Promise<boolean> {
  try {
    return await Location.isBackgroundLocationAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Ask for "always" location, at the moment it is actually needed.
 *
 * DELIBERATELY NOT AT SIGN-UP. iOS shows this prompt once and a refusal is expensive to
 * recover from. Asked when somebody taps Commence Operations, it is answerable: they have
 * just told us they want travel assigned to them, and the sentence explains that this is how
 * that happens while their phone is locked. Asked during sign-up it is a stranger demanding
 * to follow you.
 */
export async function requestBackgroundPresence(): Promise<boolean> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return false;
  const bg = await Location.requestBackgroundPermissionsAsync();
  return bg.status === 'granted';
}

/**
 * Begin holding presence in the background. Safe to call when already running.
 *
 * Returns false when the operator declined background permission — in which case the
 * foreground timer still runs and they stay in service WHILE LOOKING AT THE APP. That is a
 * real limitation and the operator is told about it rather than left to discover it.
 */
export async function startBackgroundPresence(): Promise<boolean> {
  try {
    if (await TaskManager.isTaskRegisteredAsync(PRESENCE_TASK)) return true;
    const granted = await requestBackgroundPresence();
    if (!granted) return false;
    await Location.startLocationUpdatesAsync(PRESENCE_TASK, {
      accuracy: Location.Accuracy.Balanced,
      // Expo SDK 57 timeInterval is Android-only. iOS Core Location may
      // not deliver an update while the vehicle is stationary, even when
      // pausesUpdatesAutomatically is false; physical-device evidence is mandatory.
      timeInterval: 60_000,
      distanceInterval: 150,
      // WHAT THE OPERATOR SEES WHILE THIS RUNS. iOS requires a persistent indicator for
      // background location on Android and shows a status bar tint on iOS; saying plainly what
      // is happening is the institutional version of that, and it is also the honest one.
      foregroundService: {
        notificationTitle: 'In Service',
        notificationBody: t('traveler.bgLocationRationale'),
        notificationColor: '#14171F',
      },
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Stop. Called when an operator concludes operations, and it must be reliable — leaving
 * location running after somebody has finished work is a battery cost they did not agree to
 * and a tracking they did not consent to.
 */
export async function stopBackgroundPresence(): Promise<void> {
  try {
    if (await TaskManager.isTaskRegisteredAsync(PRESENCE_TASK)) {
      await Location.stopLocationUpdatesAsync(PRESENCE_TASK);
    }
  } catch {
    /* already stopped, or the task was never registered on this device */
  }
}
