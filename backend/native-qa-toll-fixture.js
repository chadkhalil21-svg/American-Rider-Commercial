'use strict';
// Deterministic *simulated* toll response for ONE isolated native-device QA
// route. Not an official toll determination, not billable production evidence,
// not a market admission override, and NEVER returned with live Stripe.
// Without a HERE token or certified official facility-to-road mapping, the
// real toll resolver MUST continue to fail closed for unverified routes.
const { isolatedNativeQa } = require('./native-qa-isolation');
const ORIGIN=Object.freeze({lat:25.7617,lng:-80.1918});
const DESTINATION=Object.freeze({lat:25.801,lng:-80.1994});
const matches=(a,b)=>a && Number.isFinite(a.lat) && Number.isFinite(a.lng) &&
  Math.abs(a.lat-b.lat)<0.00005 && Math.abs(a.lng-b.lng)<0.00005;
function isolatedWynwoodTollFixture(from,to){
  if(!isolatedNativeQa())return null;
  if(!matches(from,ORIGIN)||!matches(to,DESTINATION))return null;
  // This 0-cent synthetic charge exercises booking/payment accounting only.
  // It does NOT claim that HERE or a public toll authority certified the road.
  return {
    status:'clear',
    tollCents:0,
    provider:'isolated-native-qa-synthetic-toll',
    reason:'synthetic_local_wynwood_route_not_official_rate_evidence',
    qaOnly:true,
  };
}
module.exports={isolatedWynwoodTollFixture,ORIGIN,DESTINATION};
