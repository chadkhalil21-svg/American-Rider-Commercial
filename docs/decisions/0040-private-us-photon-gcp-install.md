# ADR 0040: U.S. Photon GCP installation and low-cost private connectivity
Date: 2026-10-18. Status: **source installation scripts prepared, NOT RUN; no billing/resource change**.

## Decision
Keep existing MapLibre/OpenFreeMap/OSM and OSRM/OTP. The founder authorized installing a self-hosted Photon text-search service, rather than purchasing Geoapify. Use the ready-made official USA 1.x search index (10.5 GB compressed) on one modest dedicated Compute Engine virtual machine with persistent storage. Preserve nationwide search and independent booked-market checks. Scale only when real usage warrants it.

## Verified primary-source implementation facts
- Photon Apache-2.0 Java 21+ jar 1.3.0, artifact SHA-256 pinned to the upstream release asset: https://github.com/komoot/photon/releases/tag/1.3.0 .
- Prebuilt Photon 1.x USA dataset listed at https://download1.graphhopper.com/public/north-america/usa/ dated October 13, 2026, ~10.5 GB compressed; verify upstream MD5 at install. Only English, German, French and local names are included, so full Spanish/Italian completeness is NOT certified. No separate Nominatim or worldwide 63GB dump is needed.
- Cloud Run Direct VPC egress reaches a private GCE IP without a dedicated Serverless VPC Access connector: https://docs.cloud.google.com/run/docs/configuring/vpc-direct-vpc .
- Photo data disk persistent; no public Photon API port exposed. VM gets no GCP service account and has restricted IAP-only admin SSH. Existing HERE fallback remains off without explicit billing approval.
- Pilot configuration 2 vCPU/8GB RAM, 120GB pd-balanced persistent disk + 30GB boot disk is **capacity unproven**; Google Compute Engine bills VM, disk and egress. Review console quote and budget alert first. This decision is not a fixed price quote, nor a promise a single instance supports 100k concurrent Travels.

## Staged implementation
1. `infra/photon/gce-vm-startup.sh` pins release JAR and checksum, mounts the persistent disk, validates the ready-made US dataset checksum, installs a systemd service and proves an actual local Miami search.
2. `infra/photon/provision-gcp.sh` creates project-specific private network, firewall, VM, data disk, and runs the installer **only** with `AR_PHOTON_CONFIRM_BILLABLE=INSTALL`. No repo merge silently purchases compute.
3. `infra/photon/connect-cloudrun.sh` verifies real VM health, then configures an **already deployed** Cloud Run API for private Direct VPC egress and Photon primary **only** with `AR_PHOTON_CONFIRM_SWITCH=ACTIVATE`. It does not create a booking/payment backend or switch real clients.
4. `backend/place-search.js` allows the strictly private `10.x.x.x:2322` Photon address over VPC-only HTTP with explicit `AR_PHOTON_PRIVATE_VPC=1`. Public/metadata/localhost plain-HTTP endpoints are rejected. A separate authenticated HTTPS proxy remains permissible.
5. Unit and shell syntax checks must pass exact-head CI. Next run real authenticated stateful installation, actual `/place-search` US results, signed iPhone tests, operating expenses and performance. Never infer production activation from GitHub CI.

## National, license, provider, and safety
- OSM license ODbL requires contributor attribution and possible sharing conditions for derivative databases: https://www.openstreetmap.org/copyright .
- Public OSM Nominatim prohibits autocomplete; private Photon uses the open data without contacting that public service: https://operations.osmfoundation.org/policies/nominatim/ .
- Google SRE: rate-limited service, load-test, monitor p95/p99 and budgets instead of assuming unlimited supply: https://sre.google/sre-book/addressing-cascading-failures/ .
- Uber H3 only spatially indexes locations, not business name search or tolls: https://h3geo.org/docs/ .
- OSM toll tags remain separate hints, not automatically accepted monetary charges; the independent authority prices are not yet commissioned. HERE Base Plan $0 monthly plus saved card does not guarantee free toll calls or permitted TNC use: https://www.here.com/get-started/pricing/base-plan-restrictions .

No outside licensed legal counsel was directly consulted. Review ODbL derived-database questions and HERE contract with real counsel when necessary. Google Cloud credentials are NOT available as administrative tools in this chat; the billing-resource creation step must be run via authenticated Cloud Console / ChatGPT Work.
