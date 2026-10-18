'use strict';
// Privacy-preserving sampled toll-source decisions for later launch calibration.
// No route coordinates, user IDs, search terms or payment data are recorded.
// Disabled by default. Set AR_TOLL_AUDIT_SAMPLE_PERCENT=1 for a 1% sample.
const ALLOWED = new Set(['verified_osm_clear','verified_official','here','route_unknown']);
function recordTollDecision(choice, { route, outcome } = {}) {
  try {
    const percent = Number(process.env.AR_TOLL_AUDIT_SAMPLE_PERCENT || 0);
    if (!Number.isFinite(percent) || percent <= 0 || percent > 5 ||
        !ALLOWED.has(choice) || Math.random() * 100 >= percent) return;
    const routeSource = ['osrm', 'otp', 'here'].includes(route?.provider) ? route.provider : 'unavailable';
    const osmTollSignal = route?.provider === 'osrm' ?
      (route.tollRelevant === true ? 'toll_tagged' : route.tollRelevant === false ? 'no_toll_tag' : 'unknown') :
      'not_available';
    const status = ['clear', 'tolled', 'unknown'].includes(outcome?.status) ? outcome.status : 'unknown';
    console.info(JSON.stringify({
      event: 'toll_authority_sample_v1', choice, routeSource, osmTollSignal, status,
      samplePercent: percent,
    }));
  } catch {
    // Diagnostic collection must never interfere with booking or toll accuracy.
  }
}
module.exports = { recordTollDecision };
