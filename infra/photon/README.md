# American Rider Photon USA: Google Cloud installation

**Status: NOT commissioned. INSTALLATION SCRIPT PREPARED. No Google Cloud VM, data disk, external payment, running Photon service or API switch was created in this GitHub change.**

Photon is free software that searches OpenStreetMap place, address, and business data. It requires a separate, private stateful server for persistent search indexes. It is separate from MapLibre/OpenFreeMap (display) and OSRM/OTP (routing). It does not calculate toll prices. Geoapify has been removed. The iPhone application already calls the American Rider backend's `/place-search`, so it needs **no new mobile SDK**.

## Verified free data, software and cost
- Photon stable release **1.3.0** (Apache 2.0): https://github.com/komoot/photon/releases/tag/1.3.0 ; SHA-256 for photon-1.3.0.jar `a89707c0045e4807b2a1180e132e68e108d998709f48b6c94b98a6e281f571a5`.
- GraphHopper pre-built **USA Photon 1.x** index, October 13, 2026, around **10.5 GB compressed**: https://download1.graphhopper.com/public/north-america/usa/ . This is already processed national data. No full planet import, expensive Nominatim server, public Photon demo or new Geoapify contract required.
- Data usage is subject to OSM attribution/ODbL; the public OSM Foundation Nominatim no-autocomplete policy applies to *its shared public instance*, not our separately hosted Photon installation.
- Compute Engine VM and disk are **billable** and run continuously. Start with 2 vCPU, 8 GB RAM, 120 GB persistent balanced data disk + 30 GB boot disk, with review/resize if real throughput requires it. Use Google Cloud's **actual** region-specific estimate and a budget alert. This is an initial pilot, not a 100k-concurrent-Travel certification or proof 8GB is adequate in production. Disk must allow the compressed index plus extraction and later two-copy updates. Avoid an oversized planet-wide service.

## Safest short path from ChatGPT Work / Cloud Shell
1. Sign into **Google Cloud Console** under the intended American Rider account. Verify active billing for the chosen project and Cloud Run/API location first. GitHub/Render connectors alone have **no Google Compute Engine administrator permissions**. Keep secrets private.
2. In the Google Cloud **Cloud Shell** (or another authenticated terminal), check out the existing Commercial repo and branch **release/current** after this PR is merged:
   ```bash
   git clone https://github.com/chadkhalil21-svg/American-Rider-Commercial.git
   cd American-Rider-Commercial
   git checkout release/current
   bash infra/photon/provision-gcp.sh
   ```
   The first run prints the billable resources and does not create them. After reviewing the cost with Google, run:
   ```bash
   AR_GCP_PROJECT_ID=american-rider-staging-2026 AR_PHOTON_CONFIRM_BILLABLE=INSTALL bash infra/photon/provision-gcp.sh
   ```
   Or explicitly choose `AR_GCP_PROJECT_ID=american-rider-35688` for the production project after staging proof. Do not create a duplicate expensive VM in both projects unless separately approved.
3. The script creates a dedicated VPC and firewall, one Compute Engine VM, one persistent disk, and automatically installs **Java 21, Photon 1.3.0 and the U.S. dataset**, then starts a restartable systemd service. The Photon HTTP port (2322) has **NO public firewall access**. Only traffic within the dedicated private VPC can reach it. IAP provides restricted SSH. An outbound-only VM public address is used for download and later data updates; it must not expose Photon inbound. First import may take considerable time.
4. Check actual service:
   ```bash
   gcloud compute ssh american-rider-photon-us --project american-rider-staging-2026 --zone us-east1-b --tunnel-through-iap --command='sudo tail -n 40 /var/log/ar-photon-bootstrap.log'
   ```
   When healthy, search `/api` from inside the VM (do **not** call the public Photon demo). Validate Miami addresses/businesses and non-Florida matches. The existing `scripts/photon-acceptance.mjs` requires an HTTPS endpoint and thus cannot call the private VPC HTTP endpoint from an unrelated machine; run equivalent tests inside the VPC or behind an authenticated HTTPS test proxy.
5. After the **Cloud Run API exists in the SAME Google Cloud project and region**, connect its **Direct VPC egress** and only then switch place search:
   ```bash
   AR_GCP_PROJECT_ID=american-rider-staging-2026 AR_CLOUD_RUN_SERVICE=american-rider-api-staging AR_PHOTON_CONFIRM_SWITCH=ACTIVATE bash infra/photon/connect-cloudrun.sh
   ```
   The switch script verifies the existing Photon VM first. It configures Cloud Run to reach `http://10.84.0.10:2322` through **private VPC networking only**, guarded in backend code by `AR_PHOTON_PRIVATE_VPC=1`. For a private Google VPC, internal HTTP avoids the complexity/cost of a public TLS load balancer; **do not expose this private endpoint to the public web**. External HTTPS proxy addresses remain separately supported. Google: https://cloud.google.com/run/docs/configuring/vpc-direct-vpc
6. From an authenticated Cloud Run API session, test `/place-search` for partial Miami addresses, Zoo Miami, MIA, Dadeland Mall, and same-named businesses in other states. Verify distance labeling and unique-nearby recovery in a signed iPhone build, then national hold-outs (New York, Seattle and California). Test server restarts, OSM freshness, request bursts, memory, p95/p99 latency, Cloud Run egress, provider error cases and safe manual rollback to existing HERE search **without silently exceeding contract quotas**.
7. **Do not switch public API, Stripe webhook, dispatch scheduler or live fares merely because Photon is ready.** Cloud Run production cutover has independent safety/payment tests under [launch issue #98](https://github.com/chadkhalil21-svg/American-Rider-Commercial/issues/98).

## Maintenance and costs
- National index storage and memory are persistent. Enable Google Cloud budget alerts, VM monitoring, and disk-free-space alarms. Use the smaller US dataset, not the 63 GB global dataset.
- Photon release/upstream dump must stay compatible by major version. Verify official hashes and effective dates. Download and extract a new dataset into a **separate** directory, perform test, then atomically move/swap. **Never overwrite a live index in place.** The 120 GB disk choice must be re-evaluated before double-copy updates.
- A VM with its own public egress address receives security updates and dataset updates, but its inbound Photon port is protected by firewall. Keep the instance no-service-account; VM holds no Stripe, Firestore, or Render secrets.
- For later multi-region/national scale, benchmark whether to add read replicas or separate OpenSearch search cluster; avoid asserting a single 8GB VM supports 100,000 simultaneous Travels. Google guidance favors bounded caching, backpressure, quotas and measured scaling.
- Rollback: unset `AR_PHOTON_SEARCH_URL` and `AR_PHOTON_PRIVATE_VPC` and select existing HERE search only if contract/usage cap is acceptable; do not break toll verification. Stopping the VM stops compute charges but persistent disk **continues to be billed** until separately deleted after confirmed backup/disposal.

No licensed attorney has been directly consulted. The ODbL derivative and HERE TNC commercial-license questions require counsel/provider confirmation. No new Firestore composite index is needed for this Photon-specific search: it has its own private index.
