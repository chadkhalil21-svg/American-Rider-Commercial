# ADR 0041: Compare Photon hosting cost against HERE before purchasing compute
Date: 2026-10-18. Status: founder cost review; source-only gate, NO new billable resource.

## Plain-language question
MapLibre/OpenFreeMap **displays** hosted map tiles. OpenStreetMap supplies open geographical data. Neither requires a large on-device download. Photon is optional **search software** for looking up OSM business names/addresses as the traveler types. Photon software is free, but commercial-scale search requires an always-available indexed database somewhere. The existing HERE account already has a search API and a founder-verified zero-dollar **recurring subscription**, but actual metered autosuggest toll transaction rates and base-plan use rights are NOT verified. Public Nominatim **prohibits autocomplete**, irrespective of map display.

## Verified list-price basis (not a cloud invoice)
- Google on-demand Compute Engine `e2-standard-2` in `us-east1`, 2 vCPU/8GB, **$0.06701142/hr**, 730 h ~ **$48.92/month**: https://cloud.google.com/products/compute/pricing/general-purpose .
- `pd-balanced` **$0.000136986/GiB-hour**; 120 GiB data + 30 GiB boot, 730 h ~ **$15.00/month**: https://cloud.google.com/compute/disks-image-pricing .
- Thus **$63.92/month** before egress, external IP, backup, monitoring, import/refresh, taxes, failure recovery and required scaling. Plan conservatively $65–$100+ monthly initially. A VM with 8 GiB RAM has NOT been benchmarked with the ready-made US Photon index or high production traffic; additional RAM/disks may change total materially.
- Existing American Rider economics allocate **$0.25 per completed Travel for all operating infrastructure**. The fixed $63.92 corresponds to about $0.064/Travel at 1,000 Travels/month, $0.0064 at 10,000/month and $0.00064 at 100,000/month, but **this is only Photon**, before the rest of Cloud Run/Firestore/other infra, and excludes searches from users who never travel.

## Exact break-even tool
`scripts/photon-cost-comparison.cjs` prints the fixed GCP baseline and a separate hypothetical HERE cost ONLY if its actual contracted `HERE_AUTOSUGGEST_USD_PER_1000` is explicitly supplied (and any actual `HERE_FREE_MONTHLY_REQUESTS`). User demand may be configured as `COMPLETED_TRAVELS_MONTH`, `SEARCH_REQUESTS_PER_TRAVEL` and `NONBOOKING_SEARCH_REQUESTS_MONTH`. The 25-cent allowance is used for comparison, never mistaken for a provider payment. `PHOTON_EXTRA_USD_MONTH` accounts for real additional costs once quoted. No personal/private card data or API keys appear in the model.

Example using **assumed, NOT verified** HERE price:
```sh
COMPLETED_TRAVELS_MONTH=10000 SEARCH_REQUESTS_PER_TRAVEL=5 \
  HERE_AUTOSUGGEST_USD_PER_1000=1 \
  node scripts/photon-cost-comparison.cjs
```
This is only a scenario. Never represent $1 per 1,000 as HERE's actual price.

## Decision before activating Google Compute Engine
1. Verify actual existing HERE Autosuggest and separate toll transaction pricing, included monthly requests, rate limits and the contract's permitted TNC/vehicle-management use. The Base Plan published page EXCLUDES defined `Asset Management` involving some tracking/routing: https://www.here.com/get-started/pricing/base-plan-restrictions . **Saved Visa and $0 recurring do not settle licensing or request rates.**
2. Count actual queries, including searches without booking, cancellations and typing, in a privacy-safe aggregate. Measure HERE billable events and peak requests/sec. No national 100,000-simultaneous-Travel capacity claim absent signed-device and measured full-stack load tests.
3. Benchmark the private Photon U.S. index for POIs, addresses, English/Spanish/Italian, nearby same-name selections and national results. Verify ODbL attribution, dataset rights, update process and the actual VM/RAM/disk expense. Public Photon demo is no production substitute.
4. **If HERE is permitted and its verified monthly expense is LOWER than operating Photon for observed demand, do not create an always-on Photon VM yet.** Continue using the existing provider with agreed spending caps. If self-hosting offers lower combined cost and adequate reliability/coverage, authorize and execute the already-prepared `infra/photon/provision-gcp.sh` via authenticated Google Cloud Console/Work.
5. Keep all Cloud Run/payment cutover prerequisites separate. Preserve the existing search provider until its replacement passes real device tests and provider commercial-permission review.

## Institutional comparison
- Google SRE: measure traffic, choose capacity proportional to demand, cache/coalesce, enforce limits, maintain degradation/fallback; do not run expensive infrastructure without real workload evidence: https://sre.google/sre-book/addressing-cascading-failures/ .
- Uber H3 is a geographical index for nearby cells, **not** an address/business name search service or toll price authority: https://h3geo.org/docs/ .
- OSM public Nominatim's commercial usage limits and no-autocomplete policy: https://operations.osmfoundation.org/policies/nominatim/ . Commercial reuse of OSM **data** remains allowed with ODbL and attribution: https://www.openstreetmap.org/copyright .
- No actual licensed attorney or HERE contracting representative was engaged. Legal/use rights require confirmation. Council is a decision rubric, not real endorsements.

**No GitHub change alone installs Photon, incurs GCP bills, configures a Cloud Run service, transfers secrets or certifies any live national search.**
