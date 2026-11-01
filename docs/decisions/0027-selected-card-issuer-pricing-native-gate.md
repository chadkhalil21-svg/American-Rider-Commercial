# Selected card issuer before a final Traveler quote
Date: October 31, 2026
Status: source-only financial preflight, not checkout activation or native release

## Founder commercial requirement
The Traveler's selected payment instrument, NOT a guessed/default US card, determines actual domestic (US) or international processing cost before the Traveler agrees to the final all-in Total. The existing protected 99% Operator Travel Fare and properly funded $0.15 per attributed referral role are preserved. No amount can increase after a Traveler agrees to a specific total.

## Verified existing architecture
- Build 60 `src/backend/payments.ts` uses Stripe PaymentSheet to choose payment instrument AFTER `/fare-quote`, booking and creation of the PaymentIntent. PaymentSheet can change the selected card. `backend/fareauthority.js` intentionally sets `cardCountry=null` for worst-case international-safe computation; the `defaultCardCountry` helper cannot identify the card the PaymentSheet ultimately charges.
- `backend/payments.js` already has payment method enumeration, existing Stripe customer ownership, saved-card default and `createSetupIntent`; do not build a second wallet. `/payment-methods` and `/payment-methods/default` already exist and are authenticated.
- The new `backend/selected-card-authority.js` only authenticates a single **Stripe-owned, customer-attached saved card** and returns issuer domestic/international status, plus a separate strict post-authorization identity check. It refuses another customer's card, a changed selected payment method, unknown card country, non-card methods and absent verified charge. It never creates any charge or fees.
- Stripe documentation: https://docs.stripe.com/payments/mobile/migration-confirmation-tokens?platform=react-native ; https://docs.stripe.com/payments/build-a-two-step-confirmation .

## Required mobile and backend integration BEFORE card-specific prices can be offered
1. In signed iOS/Android checkout, choose and bind the actual card before final quote; a newly entered card must first be safely tokenized/saved through an appropriate Stripe consented flow. Apple Pay/Google Pay require supported wallet-specific identity preview or safe international-cost fallback. No unsupported DIY storage of card numbers.
2. In the authenticated booking endpoint, validate the selected Stripe `pm_` owner and issuer again; store a single immutable method ID, issuer and server-authoritative quoted total with the same ride/PaymentIntent. Never accept the country or total from the phone.
3. Enforce **exact selected card matching** at payment confirmation, including 3DS and retries. Any card change requires a new quote and affirmative Traveler approval before any new authorization. Protect scheduled off-session consent and Smart Travel shared fees.
4. Test SDK behavior on physical iOS and Android: first-time payment, saved domestic card, international card, wallet token, changed PaymentSheet method, 3DS, decline, cancellation, scheduled holds and app restart. Only then sign, build, submit and release a new app. No production flag, price, or Build 60 change from this source-only PR.

**Do not call the above feature 'implemented live' or 'physical-device certified' merely because unit tests or source PR checks pass.** Runtime cannot recover unknown card issuer from a payment method that has not yet been chosen.
