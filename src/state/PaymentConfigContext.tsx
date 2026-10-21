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
import React, { createContext, useContext, useEffect, useState } from 'react';
import { fetchPaymentConfig, type PaymentConfig } from '../backend/payments';
import { t } from '../i18n';

const UNKNOWN: PaymentConfig = {
  stripePublishableKey: null,
  mode: 'no-key',
  canManagePaymentMethods: false,
  canTakePayment: false,
};

const Ctx = createContext<PaymentConfig>(UNKNOWN);

/** Never throws and never blocks rendering: unreachable server = "cannot take payment". */
export function PaymentConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<PaymentConfig>(UNKNOWN);

  useEffect(() => {
    let live = true;
    fetchPaymentConfig().then(async (c) => {
      if (!live) return;
      if (!c.stripePublishableKey) {
        setConfig(c);
        return;
      }
      // Do not enable Add Payment or booking merely because /config answered.
      // The native Stripe SDK must also have finished initializing. Previously
      // its promise ran in the background while Wallet became clickable, so a
      // fast tap could open a PaymentSheet with no initialized Stripe key.
      try {
        await initStripe({
          publishableKey: c.stripePublishableKey,
          merchantIdentifier: 'merchant.com.americanrider.app',
          urlScheme: 'americanrider',
        });
        if (live) setConfig(c);
      } catch {
        if (live) setConfig({
          ...c, canManagePaymentMethods: false, canTakePayment: false,
        });
      }
    });
    return () => {
      live = false;
    };
  }, []);

  return <Ctx.Provider value={config}>{children}</Ctx.Provider>;
}

export const usePaymentConfig = (): PaymentConfig => useContext(Ctx);

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
