// App-side payments — the REAL flow.
//
// WHAT THIS REPLACES: this file used to POST /charge-ride, a route its own comment labelled
// "LOCAL TEST ONLY … Not used by the real app", which charged a server-side test card
// (`pm_card_visa`) and returned success. It worked in test mode and would have failed on
// every single travel the moment a live key was installed, because that test card does not
// exist in live mode — and there was no card-entry UI anywhere in the app to replace it.
//
// THE REAL FLOW, three steps, and the card never touches our server:
//   1. ask this server for a PaymentIntent (it prices the travel; the app never sends a price)
//   2. hand the client secret to Stripe's PaymentSheet, which collects the card ON THE PHONE
//   3. report what actually happened — including the traveler simply cancelling the sheet
import { initPaymentSheet, presentPaymentSheet, retrievePaymentIntent, isPlatformPaySupported } from '@stripe/stripe-react-native';
import { Platform } from 'react-native';
import { PAYMENT_SERVER_URL } from '../config';
import { auth } from '../firebase';
import { t } from '../i18n';

export type SavedMethod = {
  id: string;
  type: string;
  brand: string;
  last4: string;
  expMonth: number | null;
  expYear: number | null;
  wallet: string | null;
  country: string | null;
  isDefault: boolean;
};

export type PaymentResult = {
  ok: boolean;
  paymentIntentId?: string;
  amountCents?: number;
  error?: string;
  /** True when the traveler closed the sheet themselves — not a failure, and not an error to show. */
  canceled?: boolean;
  /**
   * What was ACTUALLY used, read back from the confirmed intent — "Visa ····4242".
   *
   * The receipt used to print whichever method was selected in Wallet. With the PaymentSheet
   * the traveler chooses inside the sheet, so Wallet's selection is a preference and the
   * sheet's choice is the fact. Printing the preference would put a payment method on a
   * receipt that was never charged.
   */
  methodLabel?: string;
};

/** "Visa ····4242", "Bank account ····6789", or null when Stripe did not say. */
async function methodLabelFor(clientSecret: string): Promise<string | undefined> {
  try {
    const { paymentIntent } = await retrievePaymentIntent(clientSecret);
    const pm = paymentIntent?.paymentMethod as
      | { Card?: { brand?: string; last4?: string }; USBankAccount?: { last4?: string }; paymentMethodType?: string }
      | undefined;
    if (pm?.Card?.last4) {
      const brand = pm.Card.brand ? pm.Card.brand[0].toUpperCase() + pm.Card.brand.slice(1) : 'Card';
      return `${brand} ····${pm.Card.last4}`;
    }
    if (pm?.USBankAccount?.last4) return `Bank Account · ACH ····${pm.USBankAccount.last4}`;
    return pm?.paymentMethodType || undefined;
  } catch {
    return undefined;
  }
}

/**
 * What a traveler should be shown when a payment fails.
 *
 * Stripe writes its errors for the developer holding the keys. The one that prompted this
 * read "You did not provide an API key. You need to provide your API key in the
 * Authorization header, using Bearer auth (e.g. 'Authorization: Bearer YOUR_SECRET_KEY')"
 * — and rendered in red on the Payment line of a confirmed travel, under a real operator's
 * name. A traveler can do nothing with that, and an institution does not hand somebody its
 * own configuration problem and call it a status.
 *
 * Card-level messages ("Your card was declined") ARE actionable and pass through untouched:
 * the point is to stop leaking our plumbing, not to stop telling the truth.
 */
function travelerFacing(msg?: string | null): string {
  const m = (msg || '').trim();
  if (!m) return t('traveler.errPaymentNotCompleted');
  const ourProblem =
    /api key|authorization header|bearer|secret key|stripe\.com\/docs|invalid_request|no such |testmode|livemode|publishable/i;
  if (ourProblem.test(m)) return t('traveler.errPaymentUnavailableNoCharge');
  return m;
}

export type PaymentConfig = {
  stripePublishableKey: string | null;
  mode: 'live' | 'test' | 'no-key';
  /** Stripe is configured enough to list/add/default/remove saved methods. */
  canManagePaymentMethods: boolean;
  /** The platform is operationally ready to create a Travel payment. */
  canTakePayment: boolean;
};

/**
 * What the server says about payment: the publishable key and which world it is in.
 *
 * Served rather than bundled so the two keys can never disagree about mode. Returns a
 * no-key config on any failure, which makes the app say it cannot take payment — the safe
 * direction to fail in.
 */
export async function fetchPaymentConfig(): Promise<PaymentConfig> {
  try {
    const res = await fetch(`${PAYMENT_SERVER_URL}/config`);
    if (!res.ok) throw new Error(String(res.status));
    const d = await res.json();
    return {
      stripePublishableKey: d?.stripePublishableKey ?? null,
      mode: d?.mode === 'live' ? 'live' : d?.mode === 'test' ? 'test' : 'no-key',
      canManagePaymentMethods: d?.canManagePaymentMethods === true,
      canTakePayment: d?.canTakePayment === true,
    };
  } catch {
    return { stripePublishableKey: null, mode: 'no-key', canManagePaymentMethods: false, canTakePayment: false };
  }
}

// Exported because presence.ts needs it too. There are three private copies of this in
// src/backend (payments, connect, disclosure) — a fourth would have been the wrong direction,
// and consolidating the other two is worth doing but is not this change.
export async function authHeaders(): Promise<Record<string, string>> {
  const token = await auth.currentUser?.getIdToken().catch(() => null);
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function payForRide(opts: {
  destination: string;
  /** Where the travel starts, by name. Display only — it puts the route on the receipt and on
   *  the traveler's bank statement, so "American Rider · Brickell to Miami International
   *  Airport" is what they read three weeks later rather than a bare amount. */
  departure?: string;
  travelClass?: string;
  tripNo?: string;
  // Sent when we've geocoded the trip. The server prices by distance when both are present
  // and falls back to its named-destination table when they aren't — either way, the SERVER
  // decides the amount. We never send it a price.
  pickup?: { lat: number; lng: number } | null;
  dest?: { lat: number; lng: number } | null;
  /** The travel this pays for. The server stamps the intent onto it — see /create-payment-intent. */
  rideId?: string | null;
  /** Leg 2 of a Smart Travel journey: leg 1's Travel Number, so one platform fee covers both. */
  journeyNo?: string | null;
}): Promise<PaymentResult> {
  // ---- 1. The intent, priced by the server ----
  let intent: {
    clientSecret?: string;
    paymentIntentId?: string;
    mode?: 'live' | 'test' | 'no-key';
    customerId?: string;
    ephemeralKeySecret?: string;
    breakdown?: { travelerPays?: number };
  };
  try {
    const res = await fetch(`${PAYMENT_SERVER_URL}/create-payment-intent`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({
        destination: opts.destination,
        departure: opts.departure ?? null,
        travelClass: opts.travelClass ?? 'standard',
        tripNo: opts.tripNo ?? null,
        pickup: opts.pickup ?? null,
        dest: opts.dest ?? null,
        // So settlement never depends on this app being alive at the end of the journey.
        rideId: opts.rideId ?? null,
        journeyNo: opts.journeyNo ?? null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data?.error || `Server error ${res.status}` };
    }
    intent = data;
  } catch {
    return { ok: false, error: t('traveler.paymentServerUnreachable') };
  }

  if (!intent.clientSecret || !/^pi_[A-Za-z0-9]+$/.test(intent.paymentIntentId || ''))
    return { ok: false, error: t('traveler.errPaymentNotStarted') };

  // PaymentIntent and mode come from the SAME authenticated server response.
  // A second /config request may fail and must never flip a live Google Pay sheet into test.
  if (intent.mode !== 'live' && intent.mode !== 'test')
    return { ok: false, error: t('traveler.errPaymentUnavailableNoCharge') };
  const walletTestEnv = intent.mode === 'test';
  try {
  const init = await initPaymentSheet({
    merchantDisplayName: 'American Rider',
    paymentIntentClientSecret: intent.clientSecret,
    customerId: intent.customerId,
    customerEphemeralKeySecret: intent.ephemeralKeySecret,
    // An Operator cannot be offered a Travel until Stripe confirms success. ACH and other
    // delayed methods need a separately designed authorization/scheduling policy.
    allowsDelayedPaymentMethods: false,
    // Apple Pay is offered inside the sheet where the device and the merchant record allow it.
    ...(Platform.OS === 'ios'
      ? { applePay: { merchantCountryCode: 'US' } }
      : Platform.OS === 'android'
        ? { googlePay: { merchantCountryCode: 'US', testEnv: walletTestEnv } }
        : {}),
    returnURL: 'americanrider://stripe-redirect',
  });
  if (init.error) return { ok: false, error: travelerFacing(init.error.message) };

  const presented = await presentPaymentSheet();
  if (presented.error) {
    // Closing the sheet is a choice, not a fault. It must not read as a failed payment.
    const canceled = presented.error.code === 'Canceled';
    return {
      ok: false,
      canceled,
      error: canceled ? undefined : travelerFacing(presented.error.message),
    };
  }

  // ---- 3. Paid ----
  return {
    ok: true,
    paymentIntentId: intent.paymentIntentId,
    amountCents: intent.breakdown?.travelerPays,
    methodLabel: await methodLabelFor(intent.clientSecret),
  };
  } catch {
    // A native Stripe module or wallet can reject its Promise, not only return {error}.
    // Never let it strand the booking flow with an uncaught exception.
    return { ok: false, error: t('traveler.errPaymentUnavailableNoCharge') };
  }
}

/**
 * Send the operator their 99%, once the travel is finished.
 *
 * WHY THE TRAVELER'S APP ASKS FOR THIS. It is the device that knows the travel ended. The
 * server trusts none of it: it re-checks that this traveler owns the ride, that the payment
 * carries their uid, works the amount out from Stripe's own record of the fare, and finds the
 * destination account itself. The most a bad actor achieves is settling their own travel.
 *
 * Never throws and never surfaces to the traveler. Their part finished when they paid; whether
 * our transfer has cleared yet is our problem, and the server records it as owed if not.
 */
export async function settleTravel(opts: {
  rideId: string;
  paymentIntentId: string;
}): Promise<{ ok: boolean; owed?: boolean; pending?: boolean; reason?: string }> {
  if (!opts.rideId || !opts.paymentIntentId) return { ok: false, reason: 'nothing to settle' };
  try {
    const res = await fetch(`${PAYMENT_SERVER_URL}/travel/settle`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ rideId: opts.rideId, paymentIntentId: opts.paymentIntentId }),
    });
    const d = await res.json().catch(() => ({}));
    // 202 = the money is still clearing (an ACH mid-flight). A wait, not a failure.
    if (res.status === 202) return { ok: false, pending: true, reason: d?.error };
    if (!res.ok) return { ok: false, reason: d?.error || `Server error ${res.status}` };
    return { ok: d?.ok === true, owed: d?.owed === true, reason: d?.reason };
  } catch {
    return { ok: false, reason: t('traveler.paymentServerUnreachable') };
  }
}

/**
 * Cancel a travel and give the fare back.
 *
 * The traveler pays at confirmation, before an operator has moved, so a cancellation without
 * a refund is simply keeping money for a journey that did not happen. Nothing did this before:
 * cancelling wrote status 'cancelled' and stopped.
 *
 * Never throws. The travel is cancelled on the device either way — a traveler must always be
 * able to stop a journey — and the refund is recorded server-side as owed if it cannot go
 * through now.
 */
export async function cancelTravel(opts: {
  rideId: string;
  /** Ignored by the server, which refunds from the travel's own payment. Kept for older callers. */
  paymentIntentId?: string | null;
}): Promise<{ ok: boolean; refunded?: boolean; amountCents?: number; reason?: string }> {
  if (!opts.rideId) return { ok: false, reason: 'nothing to cancel' };
  try {
    const res = await fetch(`${PAYMENT_SERVER_URL}/travel/cancel`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({
        rideId: opts.rideId,
        paymentIntentId: opts.paymentIntentId ?? null,
      }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, reason: d?.error || `Server error ${res.status}` };
    return { ok: true, refunded: d?.refunded === true, amountCents: d?.amountCents, reason: d?.reason };
  } catch {
    return { ok: false, reason: t('traveler.paymentServerUnreachable') };
  }
}

/** The name a traveler knows the network by. Stripe returns lowercase codes. */
export function brandName(brand: string): string {
  const b = String(brand || '').toLowerCase();
  const names: Record<string, string> = {
    visa: 'Visa',
    mastercard: 'Mastercard',
    amex: 'American Express',
    discover: 'Discover',
    diners: 'Diners Club',
    jcb: 'JCB',
    unionpay: 'UnionPay',
  };
  return names[b] ?? (b ? b.charAt(0).toUpperCase() + b.slice(1) : '');
}

export async function fetchPaymentMethods(): Promise<{ methods: SavedMethod[]; unavailable?: string }> {
  try {
    const res = await fetch(`${PAYMENT_SERVER_URL}/payment-methods`, { headers: await authHeaders() });
    if (!res.ok) return { methods: [], unavailable: `server_${res.status}` };
    const data = (await res.json()) as { methods?: SavedMethod[]; unavailable?: string };
    return { methods: Array.isArray(data.methods) ? data.methods : [], unavailable: data.unavailable };
  } catch {
    return { methods: [], unavailable: 'unreachable' };
  }
}

/** Stripe's sheet in setup mode: the card is saved to the traveler's record and nothing is charged. */
export async function addPaymentMethod(): Promise<{ ok: boolean; canceled?: boolean; error?: string }> {
  let setup: { clientSecret?: string; customerId?: string; ephemeralKeySecret?: string; mode?: 'live' | 'test' | 'no-key' };
  try {
    const res = await fetch(`${PAYMENT_SERVER_URL}/payment-methods/setup-intent`, {
      method: 'POST',
      headers: await authHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error || `Server error ${res.status}` };
    setup = data;
  } catch {
    return { ok: false, error: t('traveler.paymentServerUnreachable') };
  }
  if (!setup.clientSecret) return { ok: false, error: t('traveler.couldNotAddMethod') };
  // The SetupIntent endpoint now includes Stripe's mode; no redundant /config round-trip.
  // If an older backend omits the field, refuse ambiguous wallet configuration.
  if (setup.mode !== 'live' && setup.mode !== 'test')
    return { ok: false, error: t('traveler.errPaymentUnavailableNoCharge') };
  const walletTestEnv = setup.mode === 'test';
  try {
  const init = await initPaymentSheet({
    merchantDisplayName: 'American Rider',
    setupIntentClientSecret: setup.clientSecret,
    customerId: setup.customerId,
    customerEphemeralKeySecret: setup.ephemeralKeySecret,
    ...(Platform.OS === 'ios'
      ? { applePay: { merchantCountryCode: 'US' } }
      : Platform.OS === 'android'
        ? { googlePay: { merchantCountryCode: 'US', testEnv: walletTestEnv } }
        : {}),
    returnURL: 'americanrider://stripe-redirect',
  });
  if (init.error) return { ok: false, error: travelerFacing(init.error.message) };
  const presented = await presentPaymentSheet();
  if (presented.error) {
    const canceled = presented.error.code === 'Canceled';
    return { ok: false, canceled, error: canceled ? undefined : travelerFacing(presented.error.message) };
  }
  return { ok: true };
  } catch {
    return { ok: false, error: t('traveler.errPaymentUnavailableNoCharge') };
  }
}

export async function setDefaultPaymentMethod(paymentMethodId: string): Promise<{ ok: boolean; methods?: SavedMethod[] }> {
  try {
    const res = await fetch(`${PAYMENT_SERVER_URL}/payment-methods/default`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ paymentMethodId }),
    });
    if (!res.ok) return { ok: false };
    const data = (await res.json()) as { methods?: SavedMethod[] };
    return { ok: true, methods: data.methods };
  } catch {
    return { ok: false };
  }
}

export async function removePaymentMethod(paymentMethodId: string): Promise<{ ok: boolean; methods?: SavedMethod[] }> {
  try {
    const res = await fetch(`${PAYMENT_SERVER_URL}/payment-methods/${encodeURIComponent(paymentMethodId)}`, {
      method: 'DELETE',
      headers: await authHeaders(),
    });
    if (!res.ok) return { ok: false };
    const data = (await res.json()) as { methods?: SavedMethod[] };
    return { ok: true, methods: data.methods };
  } catch {
    return { ok: false };
  }
}

/** Whether this device can present Apple Pay (or Google Pay). False on web and on failure. */
export async function platformPaySupported(): Promise<boolean> {
  try {
    return await isPlatformPaySupported();
  } catch {
    return false;
  }
}
