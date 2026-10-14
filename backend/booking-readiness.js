'use strict';
// Each service checks only the dependencies it actually needs.
// County activation, market research, Operator screening intake and the Operations
// console do not authorize a paid Travel; real-time Operator checks do.
const SHARED = Object.freeze(['deployment_mode', 'firebase_admin']);
const PAYMENTS = Object.freeze([...SHARED, 'stripe_live_key',
  'stripe_publishable_key', 'stripe_webhook_secret', 'stripe_connect_webhook_secret']);
const DUTY = Object.freeze([...SHARED, 'stripe_live_key', 'stripe_connect_webhook_secret']);
const SCHEDULED = Object.freeze([...PAYMENTS, 'scheduler_token']);

function requiredFor(path) {
  switch (path) {
    case '/fare-quote':
    case '/smart-quote':
    case '/smart-revalidate':
    case '/travel/progress':
      return SHARED;
    case '/operator/online':
      return DUTY;
    case '/travel/schedule':
      return SCHEDULED;
    default:
      return PAYMENTS;
  }
}
function readinessForRoute({ path, missing = [], production = false } = {}) {
  if (!production) return { ready: true, missing: [] };
  const required = new Set(requiredFor(path));
  const unresolved = missing.filter((item) => required.has(item));
  return { ready: unresolved.length === 0, missing: unresolved };
}
module.exports = { requiredFor, readinessForRoute };
