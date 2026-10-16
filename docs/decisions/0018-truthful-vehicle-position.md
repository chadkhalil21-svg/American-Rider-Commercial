# ADR 0018 — Real Operator location is the only live car marker

**15 October 2026 — candidate, requires all exact-head CI checks and signed phones.**

## Problem

The iPhone Travel map was placing a moving vehicle by interpolation along a route using the current trip status, even after the server was switched to actual Operator-controlled journey states. This means the displayed car could appear nearer than its physical position. The route is a plan, not a measured GPS fix. The map also defaulted its camera to Miami when no trip coordinates existed and labeled the map LIVE MIAMI.

## Decision

For any real assigned Operator, show a car icon **only** when the existing Firestore Travel listener receives a fresh (at most 60 seconds old), valid position from that Operator's own accepted Travel. Older, invalid, unavailable, released, finished, or demo reports may not impersonate fresh live movement. Never animate a real vehicle according to elapsed time or lifecycle stage. A declared demonstration Operator may retain simulation only in the demonstrator path. Keep the route as a route, with no false live badge. Without travel coordinates, do not open a default-city map.

Reuse the existing Travel listener rather than add an additional database listener, query or GPS write. Reported position is scoped to the Travel the account can already view; do not create an unauthenticated vehicle-location endpoint or request location from the Traveler.

## Required proof

Synthetic test covers fresh, expired, missing, impossible and future timestamps, canceled/released Travel, demo mode, and no false city. Verify on signed iPhone and Android with real Operator GPS, background lock and lost-signal tests. The old Android/web SVG was a repeating six-second fake vehicle path: real Android Travel now uses the native MapLibre route map with no unverified moving car icon; web omits the mock animation for real Travel. Android live GPS vehicle display still requires an audited native implementation and physical-device validation. Stress and fee decisions are unchanged.

## Reference rubric

Google Firestore: avoid redundant document reads; Amazon: retry/observer idempotence; NASA SWE-055: measured intended-environment behavior; Ford: reuse one subscriber; Rockefeller: no new provider; Jobs: never show a fictional car; Apple: precise, trustworthy location display.
