# ADR 0037 — Official-first toll prices and bounded destination-search costs
Date: 2026-10-18
Status: SOURCE IMPLEMENTED; official facility mapping, tariffs, production provider keys, and live measurement NOT COMMISSIONED.
Supersedes any assertion that map tiles calculate toll prices or that raw OSM charge tags are billable.

## Founder decision
Keep MapLibre + OpenFreeMap visual maps, regional OSRM/OSM street routing and OTP contingency. **ADR 0038 supersedes the requirement for Geoapify as mandatory primary autocomplete**: self-hosted Photon/OSM, existing HERE as an explicitly acknowledged interim option, and optional Geoapify are now selectable. Preserve HERE for unresolved real toll prices/route fallback, separately from its optional temporary search role. Never deploy an uncommissioned search source.

## What the public evidence actually proves
- OSM `toll=yes` indicates a tolled roadway; `charge=2.95 USD` MAY express a price; `charge:conditional` can express conditions. These are volunteer tags, not a time-specific official tariff or an assurance that all gantries are mapped: https://wiki.openstreetmap.org/wiki/Key:toll and https://wiki.openstreetmap.org/wiki/Key:charge
- OSRM's existing route API exposes road-class toll signals, not complete underlying OSM way charge tags or a reliable priced crossing list. MapLibre only renders the map. If we want OSM prices, an **offline OSM extract + facility/gantry matcher** must identify every selected-route crossing, then compare current prices with primary-source authority records before billing. Never issue a paid Overpass/taginfo lookup per Travel.
- Florida primary sources: https://floridasturnpike.com/tolls/toll-rates/ and https://floridasturnpike.com/TollCalc/ (historically posted schedules; independently check effective dates), Greater Miami Expressway Agency https://www.gmx-way.com/ and other local operators. A source may publish static base rates, but dynamic express lanes and plate-vs-SunPass, vehicle class, direction and passage time require the correct tariff; unverified means UNKNOWN.
- HERE v8 toll requests count as additional transactions and its prices depend on vehicle/payment/time: https://docs.here.com/routing/docs/routing-v8-tolls-for-route
- Google Routes API separately estimates tolls where supported, also at a higher billed tier, requiring explicit toll-pass/vehicle context; it is a comparison, not proof that another provider is free: https://developers.google.com/maps/documentation/routes/calculate_toll_fees
- Uber H3 indexes **areas and nearby points** and does NOT calculate toll prices: https://h3geo.org/docs/ . Keep existing geohash-based dispatch. Do not migrate to H3 absent measured benefit.
- Google SRE recommends caching, load testing, backpressure and preventing cascading retries: https://sre.google/sre-book/addressing-cascading-failures/

## Toll order and safety
1. Get **one** internal OSRM route, with fallback to regional OTP; preserve the exact fare-route geometry.
2. Where independent full-area public-authority road/facility coverage **and complete OSRM toll-signal extraction** are both certified, an OSRM route with no toll class can count as clear. Current South Florida has NO such certification, so no blank `toll=no` inference.
3. If an **approved, fresh** local authority rate book exactly matches **every** route crossing, the Operator's two-axle SunPass payment context, and the effective fixed tariff, return those official amounts and facility names. `backend/official-toll-pricing.js` now enforces these conditions. Its production catalogue is **deliberately empty**. Raw `charge=*` is a hint, never an independently billable value.
4. Otherwise request HERE toll information only if necessary; if unavailable, mark the toll UNKNOWN, not zero. Existing booking safety applies. Dynamic-priced managed lanes require reliable current official data or HERE; do not cache their prices for hours.
5. Do not treat HERE's original routed geometry as identical to OSRM if routing differs. Already merged fare authority preserves one selected road route and guards unavailable routing.

## Practical next commissioning (not represented as done)
- Obtain machine-readable licensed/current **facility and rate** material directly from each relevant South Florida operating authority; confirm effective dates, two-axle/SunPass rates, gantry direction, entry/exit, time rules, and permitted reuse. Do not copy stale tariff rows from a website without validation.
- Build a bounded offline matcher from versioned OSM extracts and authority facility geometry with reviewed hold-out routes. Integrate its certified metadata with the OSRM route. Include all crossings or use HERE. Review evidence monthly or whenever an authority publishes an update. Audit representative routes against authority calculators, including priced, free, dynamic, repeated-gantry, unknown, missing mapping and nearby non-toll alternatives.
- In staging, enable `AR_TOLL_AUDIT_SAMPLE_PERCENT=1` ONLY with approved privacy review; sampled records contain source, OSM toll flag and result, **no coordinates, identity, fare or payment**. Aggregate counts to measure actual share falling through to HERE by geography, road and trip type. Default 0/off. Produce observed point estimate and confidence interval, not an invented fallback percentage. Record observed HERE vendor charges separately; sampled decisions are not invoices.
- Commission a fleet-wide HERE request/spend limit with the provider. Per-instance memory/cache is NOT an account-wide cap under Cloud Run autoscaling. Ensure actual safe unavailable-toll behavior is tested.

## Geoapify economics and scale
Source: https://www.geoapify.com/pricing/ and https://apidocs.geoapify.com/docs/geocoding/forward-geocoding/
One autocomplete request uses one credit. As published: 3k/day free (5 requests/sec); 25k/day $109/mo (15/sec); 50k/day $179/mo (20/sec); 100k/day $299/mo (25/sec); 250k/day $609/mo (30/sec); custom from $860/mo with negotiated throughput. Quotes exclude tax.

Scenario assumptions (NOT predicted search usage): five billable search requests per completed Travel, 30-day month, no non-converting searches or cache benefit. 100k Travels/month -> about 16,667 requests/day -> $109/mo -> $0.00109 per completed Travel (0.109 cents). 10k Travels/day -> 50k requests/day -> $179/mo -> $0.000597/Travel. 50k/day -> 250k requests/day -> $609/mo -> $0.000406/Travel. 100k Travels/day -> 500k requests/day -> **custom negotiated plan**, price and throughput unknown. Search requests per Travel and browsing-before-booking must be measured separately. 100k simultaneous Travels is NOT 100k autocomplete requests per second.

The app previously debounced destination AND pickup by 180 ms; source now uses 350 ms, keeping request cancellation and minimum two characters. Backend 10-min per-instance cache/coalescing remains. For 100k-scale traffic, introduce a shared bounded cache and provider-level quota **only after measured demand**. Do not share location-specific queries or personal information in cache across accounts without privacy review. Do not rely on per-instance HERE limits as Cloud Run fleet protection.

The existing fare model budgets 25 cents infrastructure per completed Travel, 25 cents contingency and >=75 cents platform contribution with the $2.50 minimum Platform Fee. At 100k Travels/month and the illustrative $109 Geoapify plan, the autocomplete allocation is ~0.11 cents/Travel, below that infrastructure allowance; this does NOT certify fully loaded economics, vendor burst capacity or full 100k active-Travel throughput.

## Release status
No live authority tariffs, station matching, provider keys, cloud billing, payment transactions, staging service, production deploy, Firestore index commissioning, H3 migration, or native release were made in this PR. Six exact-head CI and signed-device/provider acceptance still required. Keep Render authoritative until paid Cloud Run single-authority cutover under issue #98.
