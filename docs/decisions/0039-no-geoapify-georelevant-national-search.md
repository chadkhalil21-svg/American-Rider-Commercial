# ADR 0039 — No Geoapify; geographically clear national search
Date: 2026-10-18
Status: proposed source change, NOT deployed. Supersedes the optional Geoapify clause in ADR 0038 and earlier requirements in PR #100.

## Ratified founder instruction
American Rider does **not** want a Geoapify account, paid plan or backend option. Reuse the existing MapLibre/OpenFreeMap street map, OSM data, OSRM routing and HERE account. A separate private Photon installation provides commercial-scale OSM address/business autocomplete once actually installed and tested.

The code is a connector only until a Photon service, searchable up-to-date data and private HTTPS URL are commissioned. **No public Nominatim or public Photon demo**. A search service is not the same as a map tile display. The OSM Foundation policy restricts only its shared/public Nominatim service, not all commercial OSM data or self-hosted geocoders: https://operations.osmfoundation.org/policies/nominatim/ . OSM open-data license: https://www.openstreetmap.org/copyright .

## Explicitly approved provider policy
- `AR_PLACE_SEARCH_PRIMARY=auto`: use our private Photon server if operational/configured; otherwise the existing HERE account for a transparent interim bridge, subject to actual HERE billing/contract approval. `photon` or `here` may be selected explicitly. **`geoapify` is no longer a recognized mode.** Remove `GEOAPIFY_API_KEY`, `AR_GEOAPIFY_SEARCH_FALLBACK`, network code, model source and UI attribution.
- Photon failures can optionally use HERE only when the existing exceptional flag `AR_HERE_AUTOCOMPLETE_FALLBACK=1` and a short local request limit permit. **That local cap is NOT a company-wide Cloud Run cap**; configure HERE account-wide controls before enabling substantial traffic.
- Never automatically upgrade to paid HERE, add payment credentials, call new mapping services or use blank/made-up search results. Production still runs the old Render revision until Cloud Run / signed-native release.

## Location relevance and nationwide expansion
- Photon automatically receives an approximate current search focus (only when the device supplies valid coordinates) and `countrycode=US`, so nearby businesses have preference. This is a **bias, not a Florida-only restriction**. Photon may legitimately return a U.S. result in another state when names coincide or the Traveler explicitly searches nationwide.
- Both pickup and destination results present the selected provider's place title, city/state address where available, and a translated `Farther away` marker for destinations more than **250 km (155 mi)** from the search focus. Distances and marker are computed server-side; no geocoded data or identity is sent to a new commercial provider. This is a caution, NOT a binding market/legal boundary.
- Normal business suggestions require a deliberate tap. The older *exact-name fallback for a previously chosen place* now accepts only ONE identical name within 250 km of the known pickup. Duplicate business names, missing pickup or out-of-area matches return no automatic destination and require user confirmation. The existing server geographically validates bookings/onboarding independently from search.
- Relevance tests must cover duplicate business names in Florida versus elsewhere, missing Photon names/cities, movement from Miami to another state, airports/transit, nearby rural and suburban places, deliberate nationwide searches, wrong country, GPS unavailable, and five languages. Signed iPhone acceptance with the **real Photon US dataset** is required; synthetics cannot prove quality.
- Google's published distinction between location bias (can return outside) and location restriction (cannot) backs preserving national access without disguising remote results: https://developers.google.com/maps/documentation/places/web-service/place-autocomplete .
- Uber H3 spatial indexing is neither geocoding nor a business directory: https://h3geo.org/docs/ .

## Legal and cost
Photon software is open source and free but a live U.S. service has persistent storage, CPU/RAM, operational and refresh costs: https://github.com/komoot/photon . OSM Attribution/ODbL may affect sharing of transformed public databases; review actual derived-data details with competent counsel, especially when mixing private and OSM data. HERE Base Plan excludes some asset management/tracking use: https://www.here.com/get-started/pricing/base-plan-restrictions . This document is **not an actual outside legal opinion** and there has been no live attorney engagement.
Keep national search available separately from geographic authority to **offer paid Travels**. Cost/reliability comparisons follow Google SRE (https://sre.google/sre-book/addressing-cascading-failures/).

## Release proof
Source-only PR, CI exact head required. No private Photon host created; Google Cloud no direct admin connector authorized. No new composite Firestore index is needed for Photon, as its search uses a separate persistent text index; Firestore already declares 20 other composites whose actual READY status remains unverified. No Render/Cloud Run, Stripe, HERE billing or App Store change is made here.
