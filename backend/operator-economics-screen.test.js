'use strict';
// Offline, twice-run contract checks for the pre-qualification Operator Economics screen.
// The display is an illustration, never a live quote, payout, or income guarantee.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { commissionCents } = require('./economics');

const source = (name) => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const screen = source('app/operator/economics.tsx');

const requiredKeys = [
  'econTitle', 'econIntro', 'econShare', 'econFee', 'econExamples',
  'econExampleFare', 'econOperatorRetains', 'econAmericanRiderShare',
  'econYourScenario', 'econWeeklyInput', 'econAmountPlaceholder',
  'econInvalid', 'econRetainedIllustration', 'econProjectionNote',
  'econCostsHeading', 'econAccountCostNote', 'econShowAccountTerms',
  'econHideAccountTerms', 'econDisclaimer', 'activeAccountCostBody',
  'econReviewRequirements',
];

for (let pass = 0; pass < 2; pass++) {
  assert.match(screen, /const EXAMPLE_FARES = \[20, 50\]/, 'use everyday per-Travel fare examples');
  assert.match(screen, /<Num size=\{46\} weight="600" style=\{styles\.heroPercent\}>99%<\/Num>/,
    'make the exact 99% share the principal visual');
  assert.match(screen, /coordinationFee\(example\)/, 'use existing canonical 1% client display helper');
  assert.match(screen, /coordinationFee\(fare\)/, 'use the same commission rule for scenarios');
  assert.match(screen, /weeklyFare\.trim\(\)\.replace\(',', '\.'\)/, 'accept comma decimal input');
  assert.match(screen, /!valid/, 'reject invalid weekly-fare input');
  assert.match(screen, /accessibilityLabel=\{t\('operator\.econWeeklyInput'\)\}/,
    'preserve explicit accessible calculator label');
  assert.match(screen, /accessibilityRole="alert"/, 'read input errors to assistive technology');
  assert.match(screen, /accessibilityState=\{\{ expanded: showAccountTerms \}\}/,
    'announce current account-term disclosure state');
  assert.match(screen, /minHeight: 44/, 'account-term disclosure is touch accessible');
  assert.match(screen, /t\('operator\.econAccountCostNote'\)/, 'display a cost warning without hiding it');
  assert.match(screen, /t\('operator\.activeAccountCostBody'\)/,
    'reuse the existing live-policy copy and avoid duplicated obsolete fee terms');
  assert.match(screen, /t\('operator\.econProjectionNote'\)/,
    'make 52-week assumptions and missing expenses explicit');
  assert.match(screen, /estimateNote: \{ color: colors\.ink2/,
    'weekly-projection limitations have readable text contrast');
  assert.match(screen, /disclaimer: \{ color: colors\.ink2/,
    'financial warnings have readable text contrast');
  assert.match(screen, /t\('operator\.econDisclaimer'\)/,
    'do not promise Travel volume or profit');
  assert.ok(screen.indexOf('operator.fareResearchLink') > screen.indexOf('operator.econDisclaimer'),
    'optional market research must not interrupt the principal economics and expenses');
  assert.doesNotMatch(screen, /fetch\(|axios\(|getDocs\(/,
    'an informational calculator must not create unnecessary database requests');

  for (const fareCents of [1, 99, 100, 2000, 5000, 100000, 100000000]) {
    const feeCents = commissionCents(fareCents);
    assert.equal(feeCents, Math.floor(fareCents * 0.01));
    assert.equal(fareCents - feeCents, fareCents - Math.floor(fareCents / 100),
      'operator examples must mirror the server 99% entitlement in integer cents');
  }

  for (const language of ['en', 'es', 'fr', 'it', 'de']) {
    const locale = source('src/i18n/' + language + '.ts');
    for (const key of requiredKeys) {
      assert.match(locale, new RegExp('^\\s*' + key + ':', 'm'), language + ': ' + key);
    }
    assert.match(locale, /econAccountCostNote:[^\n]*2\s*\$|econAccountCostNote:[^\n]*\$2/,
      language + ': $2 separate account cost must be visible');
  }
}
console.log('PASS twice: Operator Economics screen, 99% arithmetic, real-sized examples, accessible disclosure and five locales; no network or billing change.');
