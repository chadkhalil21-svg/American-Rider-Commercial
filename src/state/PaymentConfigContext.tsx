// What the app knows about payment, read from the server rather than baked into the build.
//
// TWO THINGS THIS PREVENTS.
//
// 1. A MISMATCHED KEY PAIR. Stripe's publishable key must be in the same world as the secret
//    key. Bundling the publishable key into the app and setting the secret key on Render is
//    two places to change and one chance to forget — and the failure lands with a card
//    already typed in. Serving both from the server makes them one decision.
//
// 2. A SCREEN LYING ABOUT MONEY. Wallet said "Payments are simulated during the test program.
//    No charge is made" as a hardcoded string. That is true today and becomes false the
//    moment a live key is installed — the same outcome-without-mechanism defect as everything
//    else this build removed, pointing the other way: real money moving while the app says
//    none is. `mode` comes from the server's own key, so the sentence cannot go stale.
import { initStripe } from '@stripe/stripe-react-native';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { fetchPaymentConfig, type PaymentConfig } from '../backend/payments';
import { t } from '../i18n';

const UNKNOWN: PaymentConfig = {
  stripePublishableKey: null,
  mode: 'no-key',
  canManagePaymentMethods: false,
  canTakePayment: false,
};

const Ctx = createContext<PaymentConfig>(UNKNOWN);
const RefreshCtx = createContext<() => Promise<void>>(async () => {});

/** Failed startup configuration is temporary, not a permanent verdict on payment. */
export function PaymentConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<PaymentConfig>(UNKNOWN);
  const latest = useRef<PaymentConfig>(UNKNOWN);
  const mounted = useRef(false);
  const lastRead = useRef(0);
  const inFlight = useRef<Promise<void> | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    // Initial mount, wallet Retry, and foreground resume may coincide.
    if (inFlight.current) return inFlight.current;
    lastRead.current = Date.now();
    const work = (async () => {
      let next = await fetchPaymentConfig();
      if (next.stripePublishableKey) {
        // Native SDK readiness is still mandatory; do not unlock Wallet or
        // booking just because /config returned a publishable key.
        try {
          await initStripe({
            publishableKey: next.stripePublishableKey,
            merchantIdentifier: 'merchant.com.americanrider.app',
            urlScheme: 'americanrider',
          });
        } catch {
          next = { ...next, canManagePaymentMethods: false, canTakePayment: false };
        }
      }
      if (mounted.current) {
        latest.current = next;
        setConfig(next);
      }
    })();
    inFlight.current = work;
    try { await work; }
    finally { if (inFlight.current === work) inFlight.current = null; }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    // The server may be waking up or momentarily unavailable at app startup.
    // One bounded automatic retry prevents a permanent disabled payment screen.
    const startupRetry = setTimeout(() => {
      if (!latest.current.canManagePaymentMethods || !latest.current.canTakePayment)
        void refresh();
    }, 18_000);
    // No background polling. On a later return, refresh stale configuration
    // so a provider outage cannot require the user to force-quit the app.
    const resume = AppState.addEventListener('change', state => {
      if (state === 'active' && Date.now() - lastRead.current >= 60_000)
        void refresh();
    });
    return () => {
      mounted.current = false;
      clearTimeout(startupRetry);
      resume.remove();
    };
  }, [refresh]);

  return (
    <RefreshCtx.Provider value={refresh}>
      <Ctx.Provider value={config}>{children}</Ctx.Provider>
    </RefreshCtx.Provider>
  );
}

export const usePaymentConfig = (): PaymentConfig => useContext(Ctx);
/** An explicit recovery action for Wallet; never permits bypassing Stripe readiness. */
export const usePaymentConfigRefresh = (): (() => Promise<void>) => useContext(RefreshCtx);

/**
 * The one sentence about payment that every screen should use.
 *
 * Returns null in live mode — when real money moves, the honest thing is to say nothing
 * extra and let the price stand on its own (the rubric: state the amount, do not reassure).
 */
export function paymentModeNote(config: PaymentConfig): string | null {
  // THE GATE IS `canTakePayment`, NOT THE MODE. A server can hold a perfectly good secret
  // key and still be unable to take a payment, because the PaymentSheet needs the
  // PUBLISHABLE key too — which was configured nowhere, so the app booked a travel,
  // dispatched an operator, and only then showed Stripe's own "You did not provide an API
  // key" in red on the Payment line. Deciding this by mode alone is what let a screen say
  // "no charge is made" while the next one tried to charge.
  if (!config.canTakePayment) return t('traveler.paymentUnavailable');
  if (config.mode === 'live') return null;
  if (config.mode === 'test') return t('traveler.paymentsSimulated');
  return t('traveler.paymentUnavailable');
}
