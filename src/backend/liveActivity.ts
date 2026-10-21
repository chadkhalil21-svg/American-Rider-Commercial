// Live Activities are optional lock-screen presentation, not a startup dependency.
// IMPORTANT: RideContext loads this module while the app boots. Importing the native
// Expo widget at the module top level can throw before any call-level try/catch runs.
// Keep only the erased TypeScript type import here and resolve the native widget at
// the moment an activity is needed, inside the existing failure boundary.
// This preserves every paid Travel and sign-in even when a widget is unavailable.
import { Platform } from 'react-native';
import type { TravelActivityProps } from '../widgets/TravelActivity';

type Instance = {
  update: (p: TravelActivityProps) => Promise<void>;
  end: (...args: unknown[]) => Promise<void>;
};

type ActivityAPI = {
  start: (props: TravelActivityProps, url: string) => Instance;
  getInstances: () => Instance[];
};

const supported = Platform.OS === 'ios';
let current: Instance | null = null;

function activity(): ActivityAPI | null {
  if (!supported) return null;
  try {
    // Metro bundles the module, but does not evaluate it during RootLayout import.
    // The widget's createLiveActivity() may fail at module evaluation (a previously
    // observed failure mode). A local try/catch can contain that without taking down
    // Firebase sign-in, routing, payments, or dispatch.
    return (require('../widgets/TravelActivity') as typeof import('../widgets/TravelActivity'))
      .TravelActivity as unknown as ActivityAPI;
  } catch {
    return null;
  }
}

/** Begin a Live Activity on iOS. Never affects the underlying travel on failure. */
export function startTravelActivity(props: TravelActivityProps): void {
  if (!supported) return;
  try {
    const widget = activity();
    if (!widget) return;
    endTravelActivity();
    current = widget.start(props, 'americanrider:///ride');
  } catch {
    // Optional ActivityKit/Expo widget errors must never terminate a travel.
  }
}

/** Update an activity already started. Safe on every other platform. */
export function updateTravelActivity(props: TravelActivityProps): void {
  if (!supported || !current) return;
  try {
    current.update(props).catch(() => {});
  } catch {
    // An OS refusal costs only the lock-screen presentation.
  }
}

/** End all activity instances, including ones surviving a prior app process. */
export function endTravelActivity(immediate = false): void {
  if (!supported) return;
  try {
    const widget = activity();
    if (widget) {
      const running = widget.getInstances();
      for (const active of running) active.end(immediate ? 'immediate' : 'default').catch(() => {});
    }
    current?.end(immediate ? 'immediate' : 'default').catch(() => {});
  } catch {
    // Optional activity failure must never stop the underlying journey.
  }
  current = null;
}
