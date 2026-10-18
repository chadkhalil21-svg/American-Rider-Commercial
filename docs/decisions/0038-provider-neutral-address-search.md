# ADR 0038 — Cost-first, provider-neutral destination search
Date: 2026-10-18
Status: source implementation prepared in PR #101; no provider signed up, deployed or commissioned.
Supersedes PR #100's claim that Geoapify must be commissioned for the next launch. Adds an explicit choice, not a forced subscription.

## Founder intent
**Preserve the existing map and route stack** (MapLibre + OpenFreeMap/OSM for display, OSRM/OTP for road distance/time) and existing HERE toll verification. Avoid any new paid geocoder dependency until total provider and hosting costs can be compared with real usage and quality. Do not restore the forbidden public OSM Nominatim autocomplete endpoint. Search must support addresses AND named venues, with national coverage as markets open.

## Source behavior
`AR_PLACE_SEARCH_PRIMARY` is optional: `auto` (default), `photon`, `here`, `geoapify`.
- `auto` prioritizes **American Rider's own HTTPS Photon instance** if `AR_PHOTON_SEARCH_URL` is valid; otherwise reuses the **existing HERE key**; otherwise uses an already-configured Geoapify key. With none, returns no results rather than inventing locations.
- `photon` requires a PRIVATE/owned endpoint; public `photon.komoot.io` and public Nominatim are rejected. GeoJSON features provide OSM results. OSM is attributed in both pickup and destination search. Backend never invokes an uncontrolled public OSM geocoding API.
- `here` intentionally selects the existing HERE account as an **interim commercial bridge**, subject to owner-verified account rates, HERE licensed use, quotas and spend controls. This is different from the long-term founder preference for HERE only on unresolved exceptions.
- `geoapify` is an **optional** alternative, not required. Do not obtain or purchase a Geoapify subscription without comparative evidence.
- On any primary **failure** (not a valid zero-results answer), emergency HERE is disabled unless `AR_HERE_AUTOCOMPLETE_FALLBACK=1`; optional Geoapify backup is disabled unless `AR_GEOAPIFY_SEARCH_FALLBACK=1`. A successful empty search never triggers paid provider chaining. Cache and simultaneous request merging remain; mobile debounce is now 350ms, with cancellation.
- Multiple Cloud Run instances have separate caches; fleet-wide provider budget/quotas must be enforced at the vendor/account level before ramp-up. Do not equate a per-process cap with a fleet-wide guarantee.

## Price and scalability comparison (verified public terms; not our account statement)
| Choice | Direct external autocomplete rate | Launch suitability |
| --- | --- | --- |
| Existing HERE | HERE advertises free onboarding, flexible pay-as-you-grow plans; the new pricing webpage does not publish sufficient account-specific commercial rates for American Rider to claim $0 or an exact overage number. | Keep as short-term option because it is **already configured**; check live account contract, limits, category exclusions, and cost before claiming free |
| Self-hosted Photon (OSM) | No per-search third-party bill for the software; American Rider pays persistent server, RAM, SSD, backups, updates and OSM import. | Candidate for high request rates; test South Florida subset before US/national expansion; full planet (2026 Photon) roughly 95 GB disk and 64 GB recommended RAM, not free to operate |
| Geoapify | Free 3,000 credits/day; paid $59/mo for 10k/day, $109/mo for 25k/day, $609/mo for 250k/day, plus per-second quotas | Optional; zero cost only while below free limits; no mandatory onboarding |
| Google Places Autocomplete | 10,000 free billable events/month, then public per-1,000 pricing; details/geocoding can add charges | Reliable alternative but not free at large scale; don't add another Maps API automatically |
| Public OpenStreetMap Nominatim / Photon demo | Public shared service | **Not acceptable** for nationwide real-time autocomplete: Nominatim explicitly forbids it, Photon demo warns of throttling/bans |

Proof: https://www.here.com/get-started and https://www.here.com/get-started/pricing ; https://www.geoapify.com/pricing/ ; https://developers.google.com/maps/billing-and-pricing/pricing ; https://operations.osmfoundation.org/policies/nominatim/ ; https://github.com/komoot/photon ; https://github.com/komoot/photon/blob/master/docs/api-v1.md .

## Institutional and legal comparison
- **Google SRE**: use request cancellation, bounded coalescing/cache, no retry storm, budget gates and measured peak load, not guesses: https://sre.google/sre-book/addressing-cascading-failures/ .
- **Uber H3**: locates points within spatial hexagonal cells. It does not perform destination autocomplete or publish toll tariffs, and cannot substitute for a geocoder: https://h3geo.org/docs/ .
- **OSM ODbL licensing**: map-data attribution and database derivatives may trigger ODbL share-alike duties; source combination, caching/distribution, third-party keys, privacy and vendor contractual restrictions should be reviewed by licensed counsel before the resulting service is commissioned. Researching public terms is **not** a direct attorney consultation: https://www.openstreetmap.org/copyright ; https://wiki.osmfoundation.org/wiki/Licence/Licence_and_Legal_FAQ .
- **HERE Base/Limited plan exclusions** and rideshare permitted use require reading our **actual** contract. No false promise that the current HERE plan is unlimited or has no subscription.

## Decision economics
At hypothetical 100k completed Travels per MONTH and five autocomplete requests per Travel, 500k monthly searches. Google/HERE/Geoapify each have distinct free/paid rate and per-second limits; total costs must include non-booking searches and peak-hour throughput. Photon removes external per-call costs but adds always-on servers and update work; for **small volume** the already-configured HERE account or free tiers can beat self-hosting. For **very large** volumes, Photon may be cheaper, but only with measured quality and cloud invoices. Do not build 64-GB worldwide Photon infrastructure simply to save a $59 plan before actual traffic.

## Remaining commissioning, separate from GitHub code
1. Check HERE console *actual pricing, free limits, contractual scope*, current utilization and quotas. Maintain the live HERE deployment until one approved replacement is verified.
2. Benchmarked pickup and destination searches: partial street addresses, apartment units, Zoo Miami, airports, malls, rail, suburbs, rural POIs, 5 languages and proximity. Compare successful selected destination, not just query latency.
3. If Photon wins, provision a **separate** stateful service with indexed OSM extracts, storage, freshness, monitoring, backup and attribution. Cloud Run stateless Node/Express API is **not** itself a full Photon index host.
4. Rate-limit unauthenticated typeahead; measured local and account-wide requests/sec; cache near-area safe public phrases without retaining travel histories; fail safely and protect provider spend.
5. Complete official-first toll facility/rate matching under ADR 0037, then Google Cloud Run commissioning under issue #98. Neither is completed by this provider-selection change.

No person falsely represented as a lawyer or external adviser was consulted. No accounts, keys, costs, money, Render or Cloud Run resources were changed.
