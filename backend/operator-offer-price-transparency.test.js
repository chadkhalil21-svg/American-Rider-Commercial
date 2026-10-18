'use strict';
// Two-pass contract: the Operator sees the all-in Traveler Total and the entire
// server-calculated compensation (99% Fare plus toll reimbursement) before accepting.
// Local/offline regression only. Never calls Stripe, Firestore or an external provider.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { economicsFor, minimumPlatformFeeCents } = require('./economics');
const { quote } = require('./payments');

const source = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const helperPath = path.join(__dirname, '..', 'src/operatorOfferMoney.ts');
// Execute exactly the helper checked into this PR, rather than duplicating its logic.
const compiled = ts.transpileModule(source('src/operatorOfferMoney.ts'), {
  fileName: helperPath,
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const testedModule = new Module(helperPath, module);
testedModule.filename = helperPath;
testedModule.paths = module.paths;
testedModule._compile(compiled, helperPath);
const { operatorOfferAmounts } = testedModule.exports;

for (let pass = 0; pass < 2; pass++) {
  const inbox = source('src/backend/operatorInbox.ts');
  const state = source('src/state/OperatorContext.tsx');
  const screen = source('app/operator/index.tsx');
  const server = source('backend/server.js');
  assert.match(server, /travelCostCents: priced\.travelCostCents,\s*costCents: priced\.travelerPays/,
    'booking must store the all-in Traveler Total and the separate Fare');
  assert.match(inbox, /costCents: Number\(x\.costCents \?\? 0\)/);
  assert.match(inbox, /travelCostCents: Number\(x\.travelCostCents \?\? 0\)/);
  assert.match(inbox, /tollCents: Number\(x\.tollCents \?\? 0\)/);
  assert.match(state, /operatorOfferAmounts\(\{\s*travelerTotalCents: t\.costCents,\s*travelFareCents: t\.travelCostCents,\s*tollCents: t\.tollCents/);
  assert.match(screen, /t\('operator\.offerTravelerTotal'\)/);
  assert.match(screen, /t\('operator\.offerOperatorReceives'\)/);
  assert.match(screen, /fmt\(prices\.travelerTotalCents \/ 100\)/);
  assert.match(screen, /fmt\(prices\.operatorReceivesCents \/ 100\)/);
  // The most relevant answer should read first, and the screen must not invent
  // a pickup ETA from passenger journey duration. All duration and distance fields
  // are the already-priced passenger route written in the Travel.
  assert.match(inbox, /miles: Number\.isFinite\(Number\(x\.miles\)\)/);
  assert.match(inbox, /routedMinutes: Number\.isFinite\(Number\(x\.routedMinutes\)\)/);
  assert.match(state, /dist: t\.miles \?\? undefined/);
  assert.match(state, /tripMin: t\.routedMinutes \?\? undefined/);
  assert.match(state, /dist: underway\.miles \?\? undefined/);
  assert.match(state, /tripMin: underway\.routedMinutes \?\? undefined/);
  assert.match(screen, /request\.tripMin != null && request\.dist != null/);
  assert.match(screen, /t\('operator\.offerJourneyEstimate'/);
  assert.match(screen, /color=\{colors\.ink\}/, 'acceptance action uses institutional graphite');
  assert.match(screen, /textColor=\{offerPalette\.slate\}/, 'secondary decline uses restrained slate');
  assert.match(screen, /borderColor=\{offerPalette\.border\}/);
  assert.match(screen, /backgroundColor: offerPalette\.surface/);
  assert.match(screen, /color=\{colors\.green\}/, 'the compensation figure retains the approved green');
  assert.ok(screen.indexOf("t('operator.offerOperatorReceives')") <
      screen.indexOf("t('operator.offerTravelerTotal')"),
    'Operator compensation must come first in reading order');
  assert.match(screen, /<ScrollView style=\{styles\.requestScroll\}/);
  assert.match(screen, /requestScroll: \{ maxHeight: '100%', flexShrink: 1 \}/);
  assert.match(screen, /<View style=\{styles\.requestHeading\}>/);
  assert.match(screen, /t\('operator\.offerResponseTime'/);
  assert.match(screen, /<Avatar initials=\{request\.tInit\} size=\{34\} \/>/);
  assert.match(screen, /requestTitle: \{ fontSize: 18, fontWeight: '600', color: offerPalette\.ink \}/);
  assert.match(screen, /padding: 16,\s*\},\s*cbar: \{ height: 3,/);
  assert.match(screen, /offerAmounts: \{[\s\S]*?borderTopWidth: 1,[\s\S]*?paddingTop: 12,/);
  assert.match(screen, /routeRow: \{ flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 10 \}/);
  assert.match(screen, /requestButtons: \{ flexDirection: 'row', gap: 10, marginTop: 12 \}/);
  assert.doesNotMatch(screen, /style=\{\{ flex: 1\.6 \}\}/, 'accepted compact geometry keeps actions balanced');
    assert.match(screen, /disabled=\{accepting \|\| declining \|\| !prices\}/,
    'an unverified price must not be accepted');
  assert.match(screen, /onPress=\{async \(\) => \{\s*if \(acceptingRef\.current \|\| decliningRef\.current \|\| !prices\) return;/);

  for (const country of ['US', 'GB', null]) {
    for (const fare of [300, 1780, 2099, 5987, 10000, 27349]) {
      for (const toll of [0, 275, 1250]) {
        for (const government of [0, 200]) {
        const govFees = government ? [{ id: 'authority', name: 'Authority fee', payee: 'agency', cents: government }] : [];
        const q = quote(fare, null, govFees, country, toll);
        const display = operatorOfferAmounts({
          travelerTotalCents: q.travelerPays, travelFareCents: fare, tollCents: toll,
        });
        assert.ok(display, 'valid server quote must always produce a visible offer');
        assert.equal(display.travelerTotalCents, q.travelerPays, 'the Traveler Total cannot be repriced on the phone');
        assert.equal(display.operatorReceivesCents, q.operatorGets,
          'Operator money must reconcile exactly with the Stripe-bound quote');
        assert.equal(display.tollReimbursementCents, toll, 'reimburse tolls whole, beyond 99% Fare');
        const platform = minimumPlatformFeeCents({ travelCostCents: fare, tollCents: toll,
          governmentFeeCents: government, cardCountry: country });
        const econ = economicsFor({ travelCostCents: fare, platformFeeCents: platform,
          tollCents: toll, governmentFeeCents: government, cardCountry: country });
        assert.equal(display.operatorReceivesCents, econ.operatorGets);
        assert.equal(display.travelerTotalCents, econ.travelerPays);
        }
      }
    }
  }

  // An example is not a reason to round away a cent: $17.80 Fare -> $17.63
  // to the Operator, because commission is floor(1% of 1,780 cents) = 17 cents.
  assert.deepEqual(operatorOfferAmounts({
    travelerTotalCents: 2000, travelFareCents: 1780, tollCents: 0,
  }), {
    travelerTotalCents: 2000, operatorReceivesCents: 1763, tollReimbursementCents: 0,
  });

  for (const invalid of [
    { travelerTotalCents: 0, travelFareCents: 1780, tollCents: 0 },
    { travelerTotalCents: 1200, travelFareCents: 1780, tollCents: 0 },
    { travelerTotalCents: 2000, travelFareCents: 1780, tollCents: -1 },
    { travelerTotalCents: Number.NaN, travelFareCents: 1780, tollCents: 0 },
    { travelerTotalCents: 2000.5, travelFareCents: 1780, tollCents: 0 },
    { travelerTotalCents: 2000, travelFareCents: 0, tollCents: 0 },
  ]) assert.equal(operatorOfferAmounts(invalid), null, 'missing/invalid prices fail closed');

  for (const lang of ['en', 'es', 'fr', 'it', 'de']) {
    const locale = source('src/i18n/' + lang + '.ts');
    for (const key of ['offerTravelerTotal', 'offerOperatorReceives', 'offerTollIncluded', 'offerPriceUnavailable', 'offerJourneyEstimate', 'offerResponseTime']) {
      assert.match(locale, new RegExp('^\\s*' + key + ':', 'm'), 'missing ' + lang + ' ' + key);
    }
  }
}
console.log('PASS twice: exact Traveler Total and Operator compensation, toll reimbursement, quotes across markets/cards, price gate, five languages.');
