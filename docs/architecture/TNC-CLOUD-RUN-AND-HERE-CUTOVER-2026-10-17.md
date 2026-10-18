# American Rider · TNC launch-to-national infrastructure decision
17 October 2026 · **proposed / review-only; no live migration, billing approval or provider purchase**.

## Settled founder intentions
- Begin in South Florida; design for rapid multi-jurisdiction expansion and thousands/tens of thousands of simultaneous Travels, with minimal founder intervention.
- Firestore/Blaze retains official trips, customer/operator identities, settlement, insurance, screening, revocations and emergency records. Render/Cloud Run executes the backend code; Firebase bills Firestore reads/writes even when traffic bypasses Render directly.
- HERE is **exceptional fallback**, not normal map, driving routes or destination autocomplete. Preserve accurate destination, toll and quote results. Do not accept degraded POI coverage without testing.
- Evaluate open-source **Uber H3** spatial indexing against current bounded geohash; do not ship an unproven new candidate search. H3 is not a hosted service, and does not automatically reduce writes.

## Engineering and provider research
- Render Starter $7/month = 0.5 CPU, 512 MiB. Render Standard $25/month = 1 CPU, 2 GiB. Both one-instance without Pro autoscaling. $25 Pro workspace is separate. Render can manually add instances, each billed.
- Cloud Run request-based service is billed on allocated vCPU/GiB while requests execute and on request volume, not per registered Traveler. At us-central1 baseline: $0.000024/vCPU-second active, $0.0000025/GiB-second active, $0.40/million requests beyond free tier. Free tier includes 180k CPU-seconds, 360k GiB-seconds and 2M requests/month, subject to eligibility. Warm minimum instances incur idle charges. Google example for 10M 400ms requests/month on 1 CPU/0.5 GiB and concurrency20 in Belgium ~**$13.69/month**; **not American Rider's measured bill**. Egress, cold starts, tasks, database, networking and other providers extra.
- Cloud Run *automatically* scales the HTTP backend, within configured min/max. It does **not** automatically make in-process minute timers reliable: server instances can be suspended or duplicated. Our `backend/server.js` still starts minute-based safety/dispatch sweeps inside each process and uses leased work. Before production Cloud Run, move critical wakeups to **Cloud Scheduler / Cloud Tasks** with durable lease/retry, 1-minute watchdog or stronger, idempotency, authenticated invocations, escalating stale monitor alerts. Cloud Run alone is not a safe cutover.
- Geoapify provides commercial-allowed address autocomplete and POI/amenity results. Free plan 3,000 credits/day and up to 5 requests/s; larger business plans are charged and require attribution. It is a **candidate primary for initial South Florida**, not a contractual guarantee for national peak RPS. Scale destination search with cached/coalesced responses, provider-approved commercial plan and eventually hosted address/POI index as justified. No public OSM Nominatim auto-complete (policy forbids it). 
- Existing backend `backend/streets.js` routes through self-hosted OSRM then OTP; `backend/tolls.js` only calls HERE where own route cannot establish actual toll pricing. `backend/place-search.js` on the base branch instead always uses HERE. This candidate stages Geoapify first; `HERE_API_KEY` is only used if `AR_HERE_AUTOCOMPLETE_FALLBACK=1` and the **configured primary fails**, never on an empty valid answer. No new Firebase reads/writes. Cache lasts 10 min in each instance; for Cloud Run multi-instance, consider bounded shared cache only if actual provider volume justifies it.

References:
- https://cloud.google.com/run/pricing
- https://docs.cloud.google.com/run/docs/about-instance-autoscaling
- https://docs.cloud.google.com/run/docs/configuring/min-instances
- https://firebase.google.com/docs/firestore/understand-reads-writes-scale
- https://www.geoapify.com/pricing/
- https://apidocs.geoapify.com/docs/geocoding/address-autocomplete/
- https://operations.osmfoundation.org/policies/nominatim/
- https://www.uber.com/us/en/blog/h3/
- https://h3geo.org/

## Mathematical single-instance CPU planning envelope (not capacity proof)
One active hour-long Travel, with **1.5 simultaneously on-duty Operators** on average (one carrying and half an additional idle shift), creates `1.5*(3600/90)=60` Operator presence HTTP renewals per active Travel-hour. Let `c` be **5–25 milliseconds of actual CPU use per renewal**, excluding time waiting for Firebase/Stripe. Reserve **50% CPU** for new booking requests, safety sweeps, Stripe webhooks, retries, provider work and bursts. Then:

`safe active Travels approx = (instance vCPUs * 0.5 * 3600) / (60*c_seconds)`

- Starter 0.5 vCPU: **600–3,000** active Travels, with 5ms best / 25ms worst case.
- Standard 1 vCPU: **1,200–6,000** active Travels for the same simplified assumptions.
- At assumed midpoint **10ms CPU**, Starter ≈1,500 and Standard ≈3,000, *before* RAM, provider rate limits and scheduler workloads can reduce the usable capacity.
- This is a **CPU-only hypothetical envelope**. The 5–25ms range is not profiled. Paid authorization requests, Firestore round trips and 1.5 phone renewals per Travel can deviate substantially. Workload bursts can invalidate a steady-state average. The lower end is a conservative *planning ceiling*, **not certification**; do not promise 600/1200 service-level minimums without a real load test.
- GPS telemetry `rides` writes every 15 seconds come **directly from mobile clients to Firestore**, not the Render HTTP server. They do burden Firestore/listeners/monitor and may create contention; Cloud Run autoscaling does not solve an unbounded read scan or Firestore indexes.

## Correct migration, no interrupting revenue
1. **First confirm billing/project authorization**: user must activate Blaze and Google Cloud Billing on `american-rider-35688`; a valid Cloud Run project, IAM roles, Artifact Registry, Firebase Admin via workload identity, secrets and service policy are required. Never paste Stripe live keys into GitHub.
2. Build the backend image using `backend/Dockerfile.cloudrun` (build context `backend`; secrets excluded). Create a **staging Cloud Run service only**, `DEPLOYMENT_MODE=test`, Stripe sandbox, separate staging Firebase project, no production emails/webhooks, allowed origins, no production background authority. Health-check endpoints and sealed secrets required. Image alone does not commission a safe deployment.
3. Validate Firebase Auth, payments, Webhook **signature bytes**, browser/mobile allowed domain, storage/rules, Operator notification, geo and family flows. For cloud-workers, create scheduled authenticated triggers and durable leases; specifically review `runLeasedSweeps` and other timers and ensure each job has no double-charge/double-notify under ten simultaneous instances.
4. Run 100, 500, 1K, 5K, 10K simultaneous Travel simulations with **synthetic Firebase and test Stripe**, plus 100K daily Travel throughput, 10K Operator duty renewals, HERE/provider-failure spikes, coastal dense/sparse H3 comparisons and real iPhone/Android location + Push evidence. Evaluate p95/p99, retries, cost and safety monitor minute-by-minute coverage.
5. Only then authorize Cloud Run **production** with bounded min=1 warm instance, max and request concurrency set by measured data, provider contracts, production budget alerts and safety escalations. Cut payment webhook URLs once, preserve replay-safe durable records, verify return route and rollback, gradually switch API through the app's configurable backend URL. Retire Render only after comparison and stable reconciliation.
6. Do not run Render and Cloud Run as independent competing authorities for the same charge, dispatch or safety sweep. No actual Cloud Run resources, secrets, new API fees or production traffic created in this PR.

## Production rollout gates for HERE
- Obtain and bind `GEOAPIFY_API_KEY` secret on backend; enable verified Geoapify attribution in actual search UI and verify nationwide business/address/airport/POI quality, provider quota and agreed use. **Do not merge this branch as-is into a production backend with no key**, because it intentionally refuses routine HERE search.
- Only optionally set `AR_HERE_AUTOCOMPLETE_FALLBACK=1`, with budget/rate limits and provider outage logs. HERE remains unconfigured for normal search; payment/toll failures retain truthful 'unknown' outcomes.
- Measure actual calls per search session (debounce, cache hits, fallback count), especially 10K concurrent Travelers, and acquire production capacity before making a provider primary at high volume.

## Ongoing source-of-truth
`PROJECT-LEDGER.md` records this proposed decision and release status. It is updated *when work is saved*, not by an always-on automatic job. Do not claim GitHub PR review candidates are live.
