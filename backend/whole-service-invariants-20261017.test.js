'use strict';
// Offline, repeatable cross-layer regression for the 17 Oct whole-service audit.
// These static contracts complement, never replace, real emulator/provider tests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

for (let pass = 1; pass <= 2; pass++) {
  const wallet = read('app/wallet.tsx');
  const payments = read('backend/payments.js');
  const rules = read('firestore.rules');
  const lost = read('src/backend/lostitem.ts');
  const indexes = JSON.parse(read('firestore.indexes.json'));

  // A saved default card is not irrevocable and can be removed through the
  // same confirmed, authenticated Stripe path as any other saved card.
  assert.match(wallet, /m\.isDefault \? \(\s*<Text style=\{styles\.defaultTag\}/);
  assert.match(wallet, /onPress=\{\(\) => setPendingRemove\(m\)\}/);
  assert.doesNotMatch(wallet, /m\.isDefault \? \(\s*<Text[^]*?\) : \(\s*<View style=\{styles\.actions\}>/);
  assert.match(wallet, /traveler\.removeDefaultCardNotice/);
  assert.match(wallet, /traveler\.removeCardNotice/);
  assert.match(wallet, /if \(r\.ok && r\.methods\) setMethods\(r\.methods\)/);
  assert.match(payments, /const wasDefault = defaultMethodId\(customer\) === owned\.pm\.id/);
  assert.match(payments, /replacement \? replacement\.id : ''/);
  assert.ok(payments.indexOf('invoice_settings: { default_payment_method: replacement ? replacement.id') <
    payments.indexOf('await stripe.paymentMethods.detach(owned.pm.id)'),
    'Stripe default advances or clears before detached method is removed');
  assert.match(payments, /await ownedPaymentMethod\(customer, paymentMethodId\)/,
    'only a saved method belonging to the authenticated Customer may be detached');

  // Lost-item clients may submit a report, never forge a found, delivered,
  // or Operator-notified report through the first write.
  const lostRule = rules.split('match /lost_items/{itemId} {')[1]?.split('// Once filed')[0];
  assert.ok(lostRule);
  assert.match(lostRule, /request\.resource\.data\.status == 'reported'/);
  assert.match(lostRule, /request\.resource\.data\.get\('return', 'missing'\) == null/);
  assert.match(lostRule, /request\.resource\.data\.get\('photoUrl', 'missing'\) == null/);
  assert.match(lostRule, /request\.resource\.data\.description\.size\(\) <= 2000/);
  assert.match(lostRule, /request\.resource\.data\.candidateTripNos\.size\(\) <= 20/);
  assert.match(lostRule, /request\.resource\.data\.notifiedOperatorIds\.size\(\) <= 20/);

  // False Operator IDs from a modified phone cannot be used for notices,
  // private photo access or return claims. Validate actual Travel ownership.
  const lostBackend = read('backend/lostitem.js');
  assert.match(lostBackend, /async function verifiedLostItemOperators\(item, d\)/);
  assert.match(lostBackend, /\.where\('tripNo', 'in', trips\)\.get\(\)/,
    'at most 20 ride records are verified using one bounded query');
  assert.match(lostBackend, /r\.travelerUid !== item\.travelerUid/,
    'a Travel owned by another account cannot authorize recovery');
  assert.match(lostBackend, /notifiedOperatorIds: ids/,
    'verified Operator IDs replace client-nominated IDs on the report');
  assert.match(lostBackend, /verified\.some\(x => x\.uid === String\(operatorUid\)\)/,
    'a named Operator must also prove real assignment for reading or responding');

  // The old function downloaded an account's lifetime of reports and
  // converted a network failure into a counterfeit empty list.
  assert.match(lost, /export async function fetchMyLostItemsPage\(/);
  assert.match(lost, /where\('travelerUid', '==', uid\)/);
  assert.match(lost, /orderBy\('createdAt', 'desc'\)/);
  assert.match(lost, /startAfter\(cursor\)/);
  assert.match(lost, /limit\(pageSize \+ 1\)/);
  assert.match(lost, /throw new Error\('Sign in required'\)/);
  assert.doesNotMatch(lost, /export async function fetchMyLostItems\(\): Promise<LostItem\[\]> \{[^]*?catch \{\s*return \[\];/,
    'failed reads cannot masquerade as zero filed reports');

  // The visible Support screen must honor the new pagination contract. The
  // repository is correct only if the caller is correct, not just the helper.
  const support = read('app/issues.tsx');
  assert.match(support, /fetchMyLostItemsPage\(after\)/);
  assert.match(support, /setLostUnavailable\(true\)/);
  assert.match(support, /traveler\.lostHistoryCouldNotLoad/);
  assert.match(support, /traveler\.lostHistoryMore/);
  assert.match(support, /previous\.some\(old => old\.id === item\.id\)/,
    'paged records deduplicate their document IDs');
  assert.doesNotMatch(support, /fetchMyLostItems\(\)\.then/,
    'old failure-as-empty history call was removed');

  // A customer support thread must never infer a real Operator or trip
  // from the demonstration/last-visited reservation.
  const lostScreen = read('app/lost.tsx');
  const messageScreen = read('app/message.tsx');
  assert.match(lostScreen, /const recordedTripNo = item\?\.tripNo \|\| item\?\.candidateTripNos\?\.find\(Boolean\) \|\| null/);
  assert.doesNotMatch(lostScreen, /item\?\.candidateTripNos\[0\] \?\? ride\.lastTrip\.no/);
  assert.match(lostScreen, /if \(!item\?\.id \|\| !recordedTripNo\) return/,
    'do not open a message thread without a filed, trip-bound report');
  assert.match(lostScreen, /ride\.openHelp\(\)/,
    'no-Travel cases explicitly open Support without a demonstration Travel');
  assert.match(messageScreen, /\(ride\.rideActive \? ride\.lastTrip\.no : ''\)/,
    'the missing route param falls back only when a ride is truly underway');
  assert.match(messageScreen, /if \(isLiveDemoRide \|\| !tripNo\) return/,
    'no Firestore message listener on a missing Travel');
  assert.match(messageScreen, /if \(!text \|\| sending \|\| !tripNo\) return/,
    'no message may be sent without a Travel identifier');
  assert.match(messageScreen, /traveler\.msgTravelUnavailable/,
    'unavailable conversation explains the condition instead of inventing a party');
  
  // A durable inbox notification is not useful if its deep link uses a query
  // parameter the destination screen ignores. Test sender and destination.
  const lostServer = read('backend/lostitem.js');
  const lostScreenRoute = read('app/lost.tsx');
  const operatorLostScreen = read('app/operator/lost-item.tsx');
  assert.match(lostServer, /action: \{ screen: `\/lost\?item=\$\{encodeURIComponent\(String\(itemId\)\)\}` \}/,
    'Traveler recovery notification must use /lost?item=...');
  assert.match(lostScreenRoute, /useLocalSearchParams<\{ item\?: string \}>/,
    'Traveler Lost Item screen reads the same item parameter');
  assert.match(lostScreenRoute, /const watchId = item\?\.id \?\? params\.item \?\? null/,
    'notification opens the report being watched');
  assert.match(lostServer, /action: \{ screen: `\/operator\/lost-item\?itemId=/,
    'Operator deep link retains its separate itemId name');
  assert.match(operatorLostScreen, /useLocalSearchParams<\{ itemId\?: string \}>/,
    'Operator endpoint matches its own route, not Traveler route');
  assert.doesNotMatch(lostServer, /action: \{ screen: `\/lost\?itemId=/,
    'no mismatched Traveler lost-item deep-link parameter remains');

  const found = indexes.indexes.some(x => x.collectionGroup === 'lost_items' &&
    x.queryScope === 'COLLECTION' &&
    x.fields?.[0]?.fieldPath === 'travelerUid' &&
    x.fields?.[1]?.fieldPath === 'createdAt' &&
    x.fields?.[1]?.order === 'DESCENDING');
  assert.ok(found, 'bounded newest-first query has a declared Firestore composite index');

  // A failed mobile-account read must not be represented as an empty
  // account number, and no edit may be saved until the real read succeeds.
  const mobile = read('app/account-mobile.tsx');
  assert.match(mobile, /loadState !== 'ready'/,
    'do not allow an unknown contact record to be overwritten');
  assert.match(mobile, /setLoadState\('unavailable'\)/,
    'failed Firestore read has an explicit unavailable status');
  assert.match(mobile, /setReloadCount\(n => n \+ 1\)/,
    'Traveler can explicitly retry, without perpetual polling');
  assert.doesNotMatch(mobile, /\.catch\(\(\) => \{\}\)/,
    'reading the mobile record cannot fail silently');

  for (const lang of ['en', 'es', 'fr', 'it', 'de']) {
    const d = read('src/i18n/' + lang + '.ts');
    const traveler = d.match(/^  traveler:\s*\{([\s\S]*?)^  \},/m)?.[1];
    assert.ok(traveler, lang + ': Traveler translations must exist');
    for (const key of ['removeDefaultCardNotice', 'removeCardNotice', 'mobileReadUnavailable',
      'lostHistoryCouldNotLoad', 'lostHistoryMore', 'lostNoVerifiedTravelThread', 'msgTravelUnavailable']) {
      assert.match(traveler, new RegExp('^\\s{4}' + key + ':', 'm'),
        lang + ': missing Traveler copy or placed under the wrong role: ' + key);
    }
  }
}
console.log('PASS twice: default card removal; server ownership; truthful lost-item creation and bounded history.');
