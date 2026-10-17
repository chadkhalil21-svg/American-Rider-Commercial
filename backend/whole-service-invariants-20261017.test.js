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

  // Platform notices belong to the authenticated account, not one role.
  // A legitimate report action deep-links directly, while older Operator apps
  // still know the /operator/inbox route. Server reads have a hard cap.
  const platform = read('backend/platforminbox.js');
  const accountRoutes = read('backend/server.js');
  const accountClient = read('src/backend/platformInbox.ts');
  const sharedScreen = read('app/operator/inbox.tsx');
  const travelerScreen = read('app/inbox.tsx');
  const homeScreen = read('app/index.tsx');
  assert.match(platform, /typeof action\?\.screen === 'string' && action\.screen\.startsWith\('\/'\)/,
    'trusted report destination must take precedence over generic inbox');
  assert.match(platform, /\? action\.screen : '\/operator\/inbox'/,
    'old Operator clients keep their legacy inbox route');
  assert.match(platform, /\.orderBy\('createdAt', 'desc'\)\.limit\(pageSize\)\.get\(\)/,
    'platform inbox reads at most requested recent records');
  assert.doesNotMatch(platform, /\.collection\('platform_messages'\)\.get\(\)/,
    'avoid loading and slicing whole lifetime platform inbox');
  assert.match(accountRoutes, /app\.get\('\/account\/inbox', requireAuth, accountInboxList\)/);
  assert.match(accountRoutes, /app\.post\('\/account\/inbox\/:id\/read', requireAuth, accountInboxRead\)/);
  assert.match(accountRoutes, /app\.get\('\/operator\/inbox', requireAuth, accountInboxList\)/);
  assert.match(accountClient, /\$\{PAYMENT_SERVER_URL\}\/account\/inbox/);
  assert.match(travelerScreen, /export \{ default \} from '\.\/operator\/inbox'/,
    'Traveler and Operator share a single inbox implementation');
  assert.match(sharedScreen, /travelerView = usePathname\(\) === '\/inbox'/,
    'shared inbox uses role-appropriate headings');
  assert.match(homeScreen, /traveler\.platformCommunications'\), onPress: \(\) => go\('\/inbox'\)/,
    'Traveler can reopen durable notices without relying on push delivery');

  // A loading inbox is not empty, a failed read is not proof of no messages,
  // and both signed-in roles need an accurate, user-triggered recovery path.
  assert.match(sharedScreen, /\[loading, setLoading\] = useState\(true\)/);
  assert.match(sharedScreen, /!error && !loading && items\.length === 0/);
  assert.match(sharedScreen, /setRefreshCount\(n => n \+ 1\)/,
    'manual Retry is available; no polling while idle');
  assert.match(sharedScreen, /platformCommunicationsUnavailable/,
    'server failure is translated rather than showing backend internals');
  assert.match(sharedScreen, /if \(!active\) return/,
    'screen departure ignores late asynchronous inbox responses');
  assert.match(platform, /\.collection\('platform_messages'\)\.orderBy\('createdAt', 'desc'\)\.limit\(pageSize\)/,
    'backend caps reads before querying Firestore, not after');

  // Logged-on Operators should not see one insurance expiry on their duty
  // dashboard and a later one on Insurance: both match the backend UTC
  // cutoff, regardless of device timezone (or DST).
  const operatorState = read('src/state/OperatorContext.tsx');
  const insuranceScreen = read('app/operator/insurance.tsx');
  const insuranceBackend = read('backend/insurance-horizon.js');
  assert.match(operatorState, /\$\{insuranceExpiry\}T23:59:59\.999Z/,
    'Operator duty calendar uses the exact UTC policy end');
  assert.match(insuranceScreen, /policyExpiry \+ 'T23:59:59\.999Z'/,
    'Insurance detail shares the backend policy end');
  assert.match(insuranceBackend, /expiry \+ 'T23:59:59\.999Z'/,
    'the UTC cutoff is grounded in the existing server policy');
  assert.doesNotMatch(operatorState, /\$\{insuranceExpiry\}T23:59:59`/,
    'do not interpret expiry in the phone local timezone');

  // Any transient database error has an explicit non-success response.
  const noticeService = read('backend/platforminbox.js');
  assert.match(noticeService, /reason: 'platform_inbox_unavailable', messages: \[\]/,
    'inbox read errors cannot cause unhandled route rejection or false empty state');
  assert.match(noticeService, /reason: 'platform_inbox_unavailable' \}/,
    'failed read-marking preserves unread status instead of throwing');

  // General Safety and Travel screen support attach a live journey only.
  // A prior completed ride is not evidence that today's safety report concerns it.
  const safetyScreen = read('app/safety.tsx');
  const liveRideScreen = read('app/ride.tsx');
  const rideStore = read('src/state/RideContext.tsx');
  assert.match(safetyScreen, /ride\.openHelp\(\)/,
    'Safety supports new accounts and between-Travel concerns without inventing a trip');
  assert.doesNotMatch(safetyScreen, /ride\.openHelp\(ride\.lastTrip\.no\)/,
    'general safety concern must not attach prior Travel implicitly');
  assert.match(liveRideScreen, /ride\.openHelp\(\)/,
    'Travel support obtains the authoritative live journey from shared store');
  assert.match(rideStore, /tripNo \?\? \(rideActiveRef\.current \? lastTrip\.no : ''\)/,
    'common support API uses lastTrip only while Travel is actually active');

  // Operator's actual Lost Item details screen must not strand someone on
  // a failed load or apply a stale response after they leave.
  const opLost = read('app/operator/lost-item.tsx');
  assert.match(opLost, /\[retryCount, setRetryCount\] = useState\(0\)/);
  assert.match(opLost, /fetchOperatorLostItem\(id\)\.then/);
  assert.match(opLost, /if \(!active\) return/,
    'a stale Operator report cannot replace the current report');
  assert.match(opLost, /return \(\) => \{ active = false; \}/);
  assert.match(opLost, /t\('operator\.lostRetry'\)/);
  assert.match(opLost, /setRetryCount\(n => n \+ 1\)/);
  assert.match(opLost, /t\('operator\.busyChecking'\)/);

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
    const operator = d.match(/^  operator:\s*\{([\s\S]*?)^  \},/m)?.[1];
    assert.ok(operator, lang + ': Operator translations must exist');
    assert.match(operator, /^\s{4}platformCommunicationsUnavailable:/m,
      lang + ': Operator also receives an understandable read error');
    assert.match(operator, /^\s{4}lostRetry:/m,
      lang + ': Operator Lost Item load has a localized Retry action');
    for (const key of ['removeDefaultCardNotice', 'removeCardNotice', 'mobileReadUnavailable',
      'lostHistoryCouldNotLoad', 'lostHistoryMore', 'lostNoVerifiedTravelThread', 'msgTravelUnavailable', 'platformCommunications', 'platformCommunicationsBody', 'noPlatformCommunications', 'newPlatformCommunication', 'platformCommunicationReadFailed', 'platformCommunicationsUnavailable']) {
      assert.match(traveler, new RegExp('^\\s{4}' + key + ':', 'm'),
        lang + ': missing Traveler copy or placed under the wrong role: ' + key);
    }
  }
}
console.log('PASS twice: default card removal; server ownership; truthful lost-item creation and bounded history.');
