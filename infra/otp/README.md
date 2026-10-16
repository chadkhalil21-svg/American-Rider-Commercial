# OpenTripPlanner for South Florida

This directory holds everything needed to build and run the transit engine behind Smart Travel:
a self-hosted OpenTripPlanner (OTP) server that knows the Miami-Dade Transit and Tri-Rail
timetables and the street network of Miami-Dade, Broward and Palm Beach counties. The backend
asks it one question — "from this coordinate to that one, at this time, using only these routes,
with a car at each end" — and prices the car legs itself. Nothing is paid per query; the cost is
one server.

The founders' direction (9 September 2026): Smart Travel is real, built on OpenTripPlanner over
the county's own GTFS feed, offered on rail and on buses that run every 15 minutes or better,
and opening a new city means loading that city's feed. This is the first city.

## What was built and measured (9 September 2026, 16 GB Apple Silicon Mac)

| Item | Value |
|---|---|
| OpenTripPlanner | 2.10.0, released 9 September 2026 (`otp-shaded-2.10.0.jar`, 191 MB, SHA-1 `cc2f8808…233c`) |
| Java | 25 required. 2.10.0 is compiled for Java 25 and refuses to start on 21 (`UnsupportedClassVersionError`). Homebrew `openjdk@25` 25.0.4.1 here; `eclipse-temurin:25-jre` in Docker |
| osmium-tool | 1.19.1 |
| OpenStreetMap | Geofabrik `florida-latest.osm.pbf` 656 MB → cropped to bbox −80.95,25.05 / −79.95,26.98: **119 MB**, 16.7 M nodes, 2.28 M ways. Crop: 4.3 s, 2.3 GB RAM |
| Miami-Dade Transit GTFS | 8.4 MB, dated 31 July 2026. 123 routes: 119 Metrobus (route_type 3), Metrorail (route_type 2 — RAIL, not SUBWAY), Metromover inner and outer loops and the MIA Mover (route_type 0 — TRAM). Calendar 1 Jan 2021 – 31 Dec 2027 |
| Tri-Rail GTFS | 36 KB. Mainline and Downtown Miami Link (RAIL), Fort Lauderdale Airport shuttle (BUS). `feed_end_date` **20 October 2026** — rebuild with a fresh copy before then |
| Graph build | `java -Xmx6G --build --save`: **46 s**, peak 3.3 GB resident. Output `graph.obj` **229 MB**; 1,207,842 vertices, 3,320,727 edges, 6,996 stops, 84,919 stop-to-stop transfers |
| Serving | Graph loads in 4 s. Resident memory 1.5 GB with a 2 GB heap after 8 plans, 1.8 GB with a 4 GB heap. Plan latency 0.1–0.8 s |
| API | `POST /otp/gtfs/v1` (GraphQL). Health `GET /otp/actuators/health`. Debug page at `/` |

Proof of planning, Brickell (25.7617, −80.1918) to Miami International Airport (25.7959, −80.2870),
9 September 2026 at 21:40:

- Walking access and egress (`example-plan.graphql` → `example-response.json`): 73 minutes —
  walk 10 min to Brickell Station, Metrorail 20 min to Earlington Heights, Metrorail 4 min to
  Airport Station, MIA Mover 3 min, walk 25 min. The final walk is a coordinate artefact: the
  requested point is inside the airport grounds 1.9 km from any road; with the terminal kerb
  (25.7953, −80.2789) the trip is 50 minutes and ends with a 129 m walk.
- Car drop-off and car pick-up (`example-plan-car.graphql` → `example-response-car.json`):
  59 minutes — car 6 min (5.7 km) to UHealth/Jackson Station, Metrorail 7 + 4 min, MIA Mover
  3 min, walk 25 min (same artefact). OTP requires `WALK` to be listed beside `CAR_DROP_OFF`
  and beside `CAR_PICKUP`; alone, either is rejected. Details and consequences in
  `schema-notes.md`.
- Restricted to the 13 routes in `backend/transit-routes.fl-southeast.json`
  (`example-plan-filtered.graphql` → `example-response-filtered.json`): 59 minutes, same
  Metrorail itinerary.

## Files

| File | Purpose |
|---|---|
| `build-config.json` | What goes into the graph: the OSM file, the two feeds with fixed feed ids `MDT` and `SFRTA`, a one-month-back / one-year-forward service window |
| `router-config.json` | Runtime routing defaults (walk 1.3 m/s, car reluctance 10, 2-minute transfer slack, 30 s request timeout) |
| `otp-config.json` | Feature flags: GTFS GraphQL API, health actuator, debug page — all on |
| `build.sh` | Builds (or resumes building) the graph into `~/otp-data`; `--refresh` re-downloads feeds and map; `--serve` runs the server |
| `Dockerfile`, `entrypoint.sh` | The serving image: Temurin 25 JRE + the jar + these configs. It downloads `graph.obj` from `GRAPH_URL` on first start and serves from `/var/otp` |
| `render.yaml` | The service definition for Render (Docker, Pro instance, 10 GB disk at `/var/otp`) |
| `frequent-routes.mjs` | Produces the region's bus allow-list — `backend/transit-routes.fl-southeast.json` here; in general `backend/transit-routes.<region id>.json`, the file `backend/regions.js` names for the region |
| `query.sh` | `query.sh file.graphql '{"variables":…}'` — posts a query to the server |
| `example-plan*.graphql`, `example-response*.json` | Real requests and answers (walk, car-shaped, route-restricted) |
| `schema-notes.md`, `introspection-planConnection.json` | The API contract the backend codes against |

Nothing large lives in the repository. Downloads, the graph and logs are under `~/otp-data/`.

## Which routes Smart Travel may use

`backend/transit-routes.fl-southeast.json` lists **13 of 123** Miami-Dade routes (regenerated with
`node infra/otp/frequent-routes.mjs ~/otp-data/build/mdt-gtfs.zip backend/transit-routes.fl-southeast.json --feed-id MDT`):

- All rail and movers, regardless of frequency: Metrorail, Metromover inner and outer loops, MIA Mover.
- Nine bus routes where, on a weekday between 07:00 and 19:00 at the route's busiest stop, nine
  waits in ten are 15 minutes or less **and no wait exceeds 30 minutes** (the wait from 07:00 to
  the first bus and from the last bus to 19:00 count): 11, 75, 100, 601 Metro Express,
  602 Transitway Local, the Coral Gables trolley and the City of Miami Allapattah, Biscayne and
  Little Havana trolleys.

The second condition matters. A plain "median headway ≤ 15" test admits 37 routes, including
route 95 (I-95 Golden Glades Express: 7-minute peaks, then nothing for 375 minutes) and route 211
(a 407-minute midday gap). A traveler dropped at one of those stops at 1 pm would wait hours.
Under-including is the safer failure; the thresholds are flags on the script (`--max-headway`,
`--max-gap`, `--percentile`) and every excluded route's numbers print when the thresholds are
loosened. GTFS does not say whether a bus runs on its own right-of-way, so the South Dade
TransitWay is represented by its frequency (601, 602), not by a flag.

The Tri-Rail feed is in the graph but not in this list; run the script on `sfrta-gtfs.zip` with
`--feed-id SFRTA` if Tri-Rail should be offered.

## Weekday, Saturday and Sunday bus service (15 October 2026 candidate)

The older route list is a *weekday reference*, not proof of weekend operation. Official agency
GTFS files determine which routes run on each date, and OTP determines the exact scheduled
boarding stop/time. The application now has review-candidate support for three service-day
allow-lists: weekday routes meeting the existing 15-minute/30-minute-gap standard, and
Saturday/Sunday routes meeting a 30-minute headway with no gap over 45 minutes at the busiest
stop. A second, independent test of each chosen bus boarding rejects waits above 15 minutes
on weekday 07:00–19:00 or above 30 minutes on weekends and at other hours. Routes where
calendar proof is absent are excluded, never guessed from another day. No new agency API or
monthly subscription is necessary for this offline generation.

To prepare authentic data: download and validate the five official transit feeds already named
in `infra/otp/build.sh`; rebuild OTP's street/transit graph from those **same versions**; then
run `node infra/otp/build-route-profiles.mjs --out backend/transit-routes.fl-southeast.json`
from the repository root (pass `--data <folder>` if not using `~/otp-data/build`). The command
rejects a missing or invalid feed instead of partially replacing the route list. Inspect
its profile dates, renew approaching expiry, commit and test at exact SHA, and deploy OTP and
backend with healthy route responses. **Do not execute this command with the old GTFS files
and then claim current service.** In particular the historical SFRTA feed expires 20 October
2026; a subsequent Wednesday sample cannot be authenticated until it is renewed.

The reference model is not a substitute for realtime delays: when agency realtime feeds are
available they must be integrated, tested and monitored separately. This service has not been
commissioned in the current Render account. The Render $85 4GB server + $2.50 storage is one
published hosting option, **not** a mandatory transit-provider fee. Compare other hosting
arrangements using RAM, actual CPU usage, safe network access and operator toil before spending.

## Building the graph on a Mac

```
brew install openjdk@25 osmium-tool
infra/otp/build.sh
```

The script downloads the planner, both feeds and the Florida map (656 MB, the only slow step),
crops the map, copies the three JSON files, and builds `~/otp-data/build/graph.obj`. Re-running
it does nothing that is already done. `infra/otp/build.sh --refresh` fetches new feeds and map
and rebuilds; do this when either agency publishes a new timetable (Miami-Dade about monthly;
Tri-Rail's current file expires 20 October 2026) and after any change to `build-config.json`.
`infra/otp/build.sh --serve` also starts the server on port 8080.

Static GTFS cannot be reloaded into a running server: a new timetable means a new `graph.obj`
and a restart.

## Deploying on Render

Render reads a blueprint only from the repository root, so this service is created in the
dashboard (or its entry in `infra/otp/render.yaml` is appended to `/render.yaml`). The graph is
built on a Mac and handed to the server; the server itself never builds.

1. On the Mac, run `infra/otp/build.sh` and wait for "Graph: 229M at …/graph.obj".
2. Sign in to Cloudflare, open R2, and create a bucket named `american-rider-otp`.
3. Upload `~/otp-data/build/graph.obj` into the bucket.
4. In the bucket's Settings, enable Public Development URL (r2.dev) and copy the address of `graph.obj`. This is the value for `GRAPH_URL`. The file is public timetable and map data; nothing in it is secret.
5. Sign in to Render, choose New → Web Service, and connect the `AmericanRider` repository.
6. Set Language to Docker, Dockerfile Path to `infra/otp/Dockerfile`, and Docker Build Context Directory to `infra/otp`.
7. Set Name to `american-rider-otp` and Region to the region of the existing backend service (they must match for private networking).
8. Set Instance Type to Pro (4 GB RAM). Standard (2 GB) is not enough: the loaded graph alone is 1.5 GB resident.
9. Under Disks, add a disk named `otp-graph`, mount path `/var/otp`, size 10 GB.
10. Under Environment Variables add `GRAPH_URL` (the address from step 4) and `OTP_XMX` = `2500m`.
11. Under Health Check Path enter `/otp/actuators/health`.
12. Choose Create Web Service and open the Logs tab. The first start downloads the graph (229 MB) and then prints "Grizzly server running". Later starts skip the download because the disk keeps the file.
13. Copy the service's address from the top of its Render page, add `/otp/actuators/health` to it, and open that in a browser. It must show `{"status":"UP"}`.
14. On the backend service, set its OTP address variable (the backend names it; the private address is `http://american-rider-otp:8080`) and redeploy the backend.
15. To ship a new graph: repeat steps 1 and 3 (overwrite the file), open the OTP service's Shell tab, run `rm /var/otp/graph.obj`, then Manual Deploy → Restart. The container downloads the new file.

A service with a disk runs as one instance and restarts with a short interruption on each deploy.
For a planner whose answers the backend can cache, that is acceptable.

## The cheaper alternative: one Hetzner server

A Hetzner CX32 (4 vCPU, 8 GB RAM, 80 GB disk) runs the same image with room to build the graph
on the server itself, for a lower monthly price than a Render Pro instance (compare both price
lists at the time of deciding). It trades Render's dashboard, automatic deploys and private
network for a plain Linux machine that must be kept patched.

1. In the Hetzner Cloud console choose Add Server: location Ashburn, image Ubuntu 24.04, type CX32, and add the Mac's SSH public key.
2. In the console's Firewalls, create a firewall that allows inbound TCP 22 from anywhere and TCP 8080 only from the backend's outbound IP addresses (Render lists them on the backend service's page), and apply it to the server.
3. From the Mac: `ssh root@<server-ip>`.
4. On the server: `apt update && apt install -y docker.io git && systemctl enable --now docker`.
5. On the server: `git clone https://github.com/<org>/AmericanRider.git && docker build -t otp AmericanRider/infra/otp`.
6. From the Mac, copy the graph: `scp ~/otp-data/build/graph.obj root@<server-ip>:/var/otp/` (create the directory first with `ssh root@<server-ip> mkdir -p /var/otp`).
7. On the server: `docker run -d --name otp --restart unless-stopped -p 8080:8080 -v /var/otp:/var/otp -e OTP_XMX=4g otp`.
8. On the server: `curl http://localhost:8080/otp/actuators/health` must print `{"status":"UP"}`.
9. Point the backend's OTP address at `http://<server-ip>:8080`.
10. To ship a new graph: repeat step 6, then `docker restart otp`.

Building on the server instead of copying: install Java 25 and osmium (`apt install -y osmium-tool`
plus Temurin 25 from packages.adoptium.net), clone the repository, and run
`BUILD_XMX=5G OTP_DATA_DIR=/var/otp-build infra/otp/build.sh`; then copy
`/var/otp-build/build/graph.obj` to `/var/otp/`.

## Operating notes

- Memory: the build needs about 3.5 GB free; serving needs a 2 GB heap minimum (`OTP_XMX`),
  2.5 GB on a 4 GB instance, 4 GB on an 8 GB server.
- No real-time data is loaded. Every `estimated` field in a response is null; times are the
  timetable. Miami-Dade offers GTFS-Realtime through Swiftly on request (a Google form on the
  county's open-data page); adding it is a `router-config.json` updater entry and a restart, not
  a rebuild.
- The debug page at `/` is enabled and public. It reveals nothing beyond public timetables; set
  `"DebugUi": false` in `otp-config.json` if a plain 404 is preferred.
- The Miami-Dade download address has moved once already (the old `/transit/GIS/google_transit.zip`
  now returns the county's error page). `build.sh` checks that what it downloaded is a zip with
  `routes.txt` and stops otherwise; the current address is listed on
  https://www.miamidade.gov/global/transportation/open-data-feeds.page.
- The graph's service window runs from one month before the build to one year after
  (`transitServiceStart`/`transitServiceEnd`). A graph older than a year answers "no transit
  connection" for every date; rebuild well before that.
