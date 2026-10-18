# Decision 0036: Patron Support newest-first indexed history

Date: 2026-10-18. Status: Source candidate; production index pending.

## Decision
Return the newest Traveler-visible support cases using Firestore's indexed account-and-created-time order. Read at most 100 documents per request and filter restricted Operator qualification cases. Return a conservative possibly-incomplete indicator when source rows are capped.

## Requirements and risks
The new compound index `support_tickets(uid ASC, createdAt DESC)` must be explicitly confirmed **READY** in the authenticated production Firebase project before enabling this query on Render. Missing indexes cause a visible failure instead of an inaccurate older-case list. Verify account isolation and Operator-only record exclusion. Index declaration, CI and synthetic tests do not certify live Firebase index readiness or real account history. Preserve prior provider/market/payment decisions. Merge code with `[skip render]` and coordinate backend deployment only after index commissioning.

## Alternatives
Continuing the existing 100-row unordered scan can omit the most recent cases. Reading unlimited cases wastes money and risks exposing sensitive support records. Filtering on the client is not acceptable.

## Verification
Run the current-source repository suites and bounded 100-document mixed-privacy cases; check Firestore index readiness with authenticated production tools, then verify history after a controlled deployment. No mobile build is required solely to merge source.
