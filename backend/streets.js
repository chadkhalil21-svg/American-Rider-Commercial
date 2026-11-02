// Street routing: how a car actually gets from A to B, for the live map and — once the
// founders have compared it with the straight-line model — for pricing by time and distance.
//
// THE PUBLIC DEMO ROUTER IS GONE FROM HERE. routes.js called router.project-osrm.org, whose
// usage policy forbids production use. A map that depends on a server we were asked not to
// depend on is a map that stops one day without notice. The order now, per region:
//   1. the region's own OSRM (OSRM_URL_<REGION> or OSRM_URL), same API, when one is set;
//   2. the region's OpenTripPlanner, whose graph already holds the region's streets, asked
//      for a car-only itinerary (transit.js planCar) — when no OSRM is set, or when the one
//      that is set does not answer;
//   3. null, and the app draws the straight line it drew before routing existed.
// Every provider answers in one shape: { coords: [{lat,lng}], durationSec, distanceMeters,
// provider: 'osrm' | 'otp' }. A null is always safe; a ride must never fail because a route
// lookup did.
const { regionForTrip, isCoord } = require('./regions');
const transit = require('./transit');

const OSRM_TIMEOUT_MS = 6000;

async function routeOsrm(base, from, to) {
  const url =
    `${base.replace(/\/+$/, '')}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}` +
    `?overview=full&geometries=geojson&alternatives=false&steps=true`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), OSRM_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    const data = await res.json();
    const route = data && Array.isArray(data.routes) ? data.routes[0] : null;
    const line = route && route.geometry && route.geometry.coordinates;
    if (!Array.isArray(line) || line.length < 2) return null;
    return {
      coords: line.map(([lng, lat]) => ({ lat, lng })),
      durationSec: Math.round(route.duration),
      distanceMeters: Math.round(route.distance),
      provider: 'osrm',
      // The self-hosted OSRM profile derives road classes from OSM. Toll is therefore a
      // zero-marginal-cost relevance signal: a clear OSRM route does not need a paid toll lookup.
      tollRelevant: Array.isArray(route.legs) && route.legs.some((leg) =>
        Array.isArray(leg?.steps) && leg.steps.some((step) =>
          Array.isArray(step?.intersections) && step.intersections.some((i) =>
            Array.isArray(i?.classes) && i.classes.includes('toll')
          )
        )
      ),
    };
  } catch {
    return null; // down or too slow — the next provider takes over
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The driven route between two coordinates in one served region, or null.
 * opts.region skips the lookup when the caller already knows it.
 */
async function routeCar(from, to, opts = {}) {
  if (!isCoord(from) || !isCoord(to)) return null;
  const region = opts.region || regionForTrip(from, to);
  if (!region) return null;
  const osrm = region.osrmUrl;
  if (osrm) {
    const viaOsrm = await routeOsrm(osrm, from, to);
    if (viaOsrm) return viaOsrm;
  }
  if (region.otpUrl) {
    try {
      const planned=await transit.planCar(from,to,{region});
      if(planned)return planned;
    } catch { /* Existing HERE account remains the final fallback. */ }
  }
  // Reuse the HERE key already configured for route distance and toll pricing.
  // No OSRM instance, OpenTripPlanner VM or new subscription is needed.
  try { return await require('./tolls').verifiedHereRoute(from,to); }
  catch { return null; }
}

module.exports = { routeCar, routeOsrm, OSRM_TIMEOUT_MS };
