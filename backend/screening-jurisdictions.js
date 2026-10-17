'use strict';
// National Operator screening policy registry.
//
// U.S. jurisdiction identity is not a legal screening authorization. Every state
// requires its own explicitly implemented preparation, review and renewal rules.
// Screening and onboarding begin only in ACTIVE service markets, and every
// active market must also pass its independent jurisdiction screening policy.
// No environment flag or a statewide policy alone creates service authority.
const US = require('./jurisdictions/us.json');

const DAYS_IN_YEAR = 365;
const FLORIDA = Object.freeze({
  id: 'fl-627748-screening-v1',
  stateCode: 'FL',
  statute: 'Fla. Stat. §627.748(12)',
  screeningYears: 3,
  existingReportMaxAgeMs: 3 * DAYS_IN_YEAR * 24 * 60 * 60 * 1000,
  requiredElements: Object.freeze(['nationwide_criminal', 'sex_offender', 'driving_history']),
  providerProcess: 'source_verified_provider_neutral',
  consentProcess: 'operator_written_instruction_and_cra_verification',
  adverseProcess: 'manual_pre_adverse_dispute_final_review',
  reviewEngine: 'florida_627748_v1',
  preparationConfigured: true,
  adjudicationConfigured: true,
});

// Deliberately only Florida. Adding a code to the geographic identity registry,
// or a county or service region, does not make its screening legally ready.
const POLICIES = Object.freeze({ FL: FLORIDA });
const VERIFIED_REVIEW_ENGINES = new Set(['florida_627748_v1']);

function policyForState(stateCode) {
  if (typeof stateCode !== 'string' || !/^[A-Z]{2}$/.test(stateCode)) return null;
  const jurisdiction = US.jurisdictions.find((entry) => entry.code === stateCode);
  if (!jurisdiction || jurisdiction.status !== 'configured') return null;
  const policy = POLICIES[stateCode];
  if (!policy || policy.stateCode !== stateCode || !policy.id ||
      !policy.statute || !Number.isInteger(policy.screeningYears) || policy.screeningYears <= 0 ||
      !Number.isSafeInteger(policy.existingReportMaxAgeMs) || policy.existingReportMaxAgeMs <= 0 ||
      !Array.isArray(policy.requiredElements) || policy.requiredElements.length === 0 ||
      !policy.providerProcess || !policy.consentProcess || !policy.adverseProcess ||
      !VERIFIED_REVIEW_ENGINES.has(policy.reviewEngine) ||
      policy.preparationConfigured !== true || policy.adjudicationConfigured !== true) return null;
  return policy;
}

function screeningPreparationFor(market, region) {
  // Founder-settled rule: never begin screening or regulated onboarding before
  // a county is open for service. Screening policy alone cannot open a market.
  if (market && market.status !== 'active') {
    return { ok: false, code: 'market_waitlist',
      error: 'Operator registration will be available when American Rider opens in this area.' };
  }
  // Do not trust a state code supplied by the phone, or a region detached
  // from the Operator's server-stored county selection.
  if (!market || !region || !market.id || !market.regionId ||
      market.regionId !== region.id || market.state !== region.state ||
      region.jurisdiction?.stateCode !== market.state) {
    return { ok: false, code: 'screening_market_required',
      error: 'Select a supported operating county before requesting screening.' };
  }
  const policy = policyForState(market.state);
  if (!policy || region.jurisdiction?.screeningYears !== policy.screeningYears) {
    return { ok: false, code: 'screening_jurisdiction_not_configured',
      error: 'Screening preparation is not yet available in this jurisdiction. You may remain on the interest list. Do not purchase a report.' };
  }
  return { ok: true, policy };
}

// Legacy pre-registry cases were issued under the Florida-only route. They
// remain Florida reviews; this fallback must never be applied to new cases.
// The verified adjudicators do not infer another state's law from a Florida report.
function reviewPolicyFor(screening) {
  if (!screening || typeof screening !== 'object') return null;
  const stateCode = screening.jurisdictionCode == null ? 'FL' : screening.jurisdictionCode;
  const policy = policyForState(stateCode);
  if (!policy || (screening.policyId && screening.policyId !== policy.id)) return null;
  return policy;
}

module.exports = { policyForState, screeningPreparationFor, reviewPolicyFor };
