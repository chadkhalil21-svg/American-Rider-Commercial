# ADR 0022 — Native PDF evidence upload during Operator onboarding

**Date:** 2026-10-15. **Status:** Release candidate, requires exact-commit CI and native-device verification.

## Problem
The Operator application labels a button "Choose a file", but it previously launched Expo ImagePicker's photo library. Common insurer PDF declarations pages could not be selected. The private Cloudflare R2 upload API permitted images only. Consequently the original-review repair in ADR 0021 could not receive PDFs from the native app.

## Decision and safeguards
- Add Expo SDK 57-compatible `expo-document-picker@~57.0.3` for the native iOS/Android Files picker (the system picker is supported without a compulsory new iCloud entitlement). Keep the separate camera choice. Pick PDF, JPEG, PNG, WebP, HEIC or HEIF and copy selected file to local cache before upload. Do not request photo-library permission to pick a PDF.
- Carry the chosen file URI and MIME type through existing Operator qualification context. Reject unknown MIME types and any file over 5 MiB before requesting an authenticated private, short-lived upload URL. Keep server-controlled object keys and account ownership.
- Permit `application/pdf` for `purpose=operator-document` only, not lost-item uploads. The server's document reader checks PDF magic and always returns *review*, never an automatic `accept`; named Operations staff can open the exact original through the private review route from ADR 0021. Existing insurer provenance and 30-day status verification remain mandatory; a user-submitted PDF is not proof of live insurance.
- No screening company or insurer contract, active market, per-county permission, Stripe transfer, pricing or billing change. The signed iOS/Android applications must be rebuilt to include the new native module, and a physical-phone upload and reviewer workflow still need proof. JavaScript CI exports cannot certify the native picker.
- Gate on all release CI and double-pass synthetic tests; regress scope restrictions and PDF-to-review behavior. Preserve the settled Operator-funded, provider-neutral model.

## Capacity and priorities
Firestore's Standard free quota is 50,000 reads and 20,000 writes per day. An 8-hour shift with a 90-second heartbeat causes 320 fleet heartbeat writes per Operator (100 Operators -> 32,000), before trip booking reads, notifications or other writes. This is a scenario, not observed production or a certified concurrent load. If Firebase is on Spark, the economical first capacity action is checking real Firebase usage and enabling Blaze usage billing with alarms by an authorized billing administrator; **do not** assume this is already done or silently incur charges. Render currently has one Starter instance (0.5 vCPU, 512 MiB); do not purchase extra compute without observed saturation and a test showing it helps.

## Published reference, not endorsements
[Expo DocumentPicker SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/document-picker/), [Cloud Firestore pricing and free tier](https://firebase.google.com/docs/firestore/pricing), [Firebase plans](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans), [Render scaling](https://render.com/docs/scaling). Council principles: founder-first repeatable process, cost discipline, truthful first-class UX, safety review.
