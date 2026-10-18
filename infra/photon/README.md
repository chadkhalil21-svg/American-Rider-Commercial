# Photon: American Rider's private OpenStreetMap search service
**Status: source integrated; host NOT commissioned; no cost incurred.** `backend/place-search.js` already speaks Photon's GeoJSON API. This directory records the remaining reproducible service work. It is not a substitute for a Google Cloud deployment or an authentic production test.

## What is free
- OpenStreetMap names, roads, destinations and mapped businesses are open data under ODbL, subject to attribution and derivative-database obligations.
- Photon is free Apache-2.0 search software, not an API subscription.
- MapLibre/OpenFreeMap already displays map tiles. Do not replace it, do not buy Geoapify.
- The OpenStreetMap Foundation's PUBLIC Nominatim server prohibits autocomplete, and the Photon public demo disclaims high-volume availability. **Never use either as American Rider's primary national search API.**

## Recommended cost-minimal commissioning (not executed in this PR)
1. Use a **separate, private stateful server** with persistent SSD, not the normal stateless Cloud Run API instance. Fetch Photon's upstream release from https://github.com/komoot/photon/releases and an appropriately dated **US** Photon extract from https://download1.graphhopper.com/public/ . Exact release/extract compatibility, permitted reuse, size and freshness need verification before download. Import only allowed licensed data. Do not download the world or commit a large index to GitHub. Do not assume a U.S. ready-made dump exists until inspecting the upstream listing.
2. Start with a **small Florida data set** for the physical launch acceptance tests, then a country-wide index for U.S. discovery **before declaring nationwide search**. Note that a Florida-only index must NOT silently masquerade as national search. Planet-wide 2026 reference is around **95 GB SSD and 64 GB recommended RAM**; a U.S. extract might be smaller, but provision only after checking *actual index size and peak memory*. Benchmark the economical virtual machine size and the managed alternative. Storage, compute, backups and refreshing incur cloud charges.
3. Follow upstream instructions: Java 21 or later; release JAR and version-matched database directory. Serve only on loopback/private network. Publish an **American Rider-controlled authenticated HTTPS reverse proxy** for Cloud Run, limited to Cloud Run egress, with WAF/connection quotas, short network timeout and capacity alerts; do not expose raw port 2322 to the Internet.
4. On Cloud Run, set `AR_PLACE_SEARCH_PRIMARY=photon` and `AR_PHOTON_SEARCH_URL=https://<company-controlled-internal-search-host>` only after verifying TLS, authorization, provider agreement, and an actual signed-application result. Do not set `GEOAPIFY_API_KEY`. Keep `AR_HERE_AUTOCOMPLETE_FALLBACK=0` unless account terms and global capped spend explicitly approve an emergency budget. The app currently has server-side ten-minute cache and 350ms mobile typeahead delay.
5. Run **`PHOTON_BASE_URL=https://... node scripts/photon-acceptance.mjs`** from a permitted network route. It tests Miami businesses/landmarks plus New York, Seattle and San Francisco. Because a Florida-only import must fail nationwide checks, use a matching partial smoke set during the Florida pilot and the full script before national activation. Measure accuracy, selected coordinates, 95th percentile latency and genuine p95 peak under a separate reproducible load generator. A passing smoke test does NOT certify 100,000 simultaneous Travels.
6. To refresh the database, build a new index separately, run smoke tests, then **atomically switch**, preserving a rollback copy and monitoring memory/disk/requests. Photon upstream says in-place updates risk corruption. No OSM live Overpass/Nominatim request should occur during a Travel.
7. Keep the existing `HERE_API_KEY` where its actual contract authorizes use while Photon is brought online. The founder supplied proof of a saved card and **$0 Base Plan monthly recurring fee**, not proof that transactional usage is free, allowed for live TNC services, or uncapped. No account permissions change made.

## National expansion
This private search cluster is not a **market authorization**. It can serve U.S. search results while booking/onboarding remains open only in approved operating geography. Before a new state opens, validate address completeness, missing or renamed OSM POIs, state pricing/fees, official toll schedules, safety and local compliance. New region activation must not require modifying the app.

## Legal, product, and council review
- OSM data is ODbL and needs visible credit and independent legal review of derivatives/caches: https://www.openstreetmap.org/copyright
- Photon is Apache-2.0 software; provider is **not** a third-party commercial map API: https://github.com/komoot/photon
- Nominatim public policy (no autocomplete, <=1 rps aggregate): https://operations.osmfoundation.org/policies/nominatim/
- HERE Base Plan excludes certain asset management/tracking use. The $0 subscription and saved card are not permission for all rideshare uses: https://www.here.com/get-started/pricing/base-plan-restrictions
- Google SRE: test capacity and limit overload/retries. Uber H3 indexes spatial cells but is NOT address search or a toll-pricing service: https://sre.google/sre-book/addressing-cascading-failures/ and https://h3geo.org/docs/
- Review against founder Council principles (reliability, affordability, consistent user experience, simple operations). These are **research standards**, not advice personally delivered by the named individuals or a legal opinion.

## Separate toll procedure
This service is ONLY for finding destination names. The existing OSM/OSRM road route, OSM toll and charge tags and a vetted state toll schedule are separate. `backend/official-toll-pricing.js` correctly does NOT bill a crowd-entered tag without exact verified crossings, time/pass/class and rates. The rate catalogue is EMPTY until those records and mapping are commissioned, so HERE is not yet exceptional in actual billed trips. See ADR 0037 and issue #98.
