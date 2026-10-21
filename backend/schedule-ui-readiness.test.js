'use strict';
// Offline, two-pass regression for scheduled Travel date, destination and price states.
// No Traveler, Stripe, Firestore or external provider is contacted.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pickupDate, nextDate, resolvePickupWall, scheduleReadiness } = require('./scheduleclock');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const screen = read('app/schedule.tsx');
const zone = 'America/New_York';
const localNow = Date.parse('2026-10-17T03:36:00Z'); // screenshot: Fri 16 Oct, 11:36 PM EDT
const tomorrow = nextDate(pickupDate(localNow, zone));
assert.equal(tomorrow, '2026-10-17');
const tomorrowMorning = resolvePickupWall(tomorrow, '6:00', 'AM', zone);
assert.equal(tomorrowMorning.ok, true);
assert.equal(tomorrowMorning.atMs, Date.parse('2026-10-17T10:00:00Z'));
const afterMidnight = Date.parse('2026-10-17T04:01:00Z'); // Sat 12:01 AM EDT
assert.equal(pickupDate(afterMidnight,zone),'2026-10-17');
assert.notEqual(tomorrow,nextDate(pickupDate(afterMidnight,zone)),
  'relative Tomorrow changes at midnight, so the selected date must be pinned');

const status = (overrides = {}) => scheduleReadiness({
  hasDestination: true, hasQuote: true, pickupZone: zone,
  pickupDate: tomorrow, resolved: tomorrowMorning,
  customState: 'none', nowMs: localNow, ...overrides,
});

for (let pass = 1; pass <= 2; pass++) {
  assert.equal(status(), 'ready', 'Tomorrow at 6 AM is not in the past at 11:36 PM today');
  assert.equal(status({hasDestination: false, hasQuote: false}), 'destination_required',
    'screenshot failure must point to missing destination, not expired time');
  assert.equal(status({hasQuote: false}), 'quote_required',
    'missing server price is not an expired time');
  assert.equal(status({hasQuote: false, resolved: {ok: false, code: 'invalid_zone'}}),
    'quote_required', 'missing quote is the most actionable issue after destination');
  assert.equal(status({pickupZone: null}), 'zone_unavailable');
  assert.equal(status({pickupDate: null}), 'date_required');
  assert.equal(status({customState: 'suggest'}), 'time_unconfirmed',
    'unaccepted 6:47 to 6:45 suggestion never books another time silently');
  assert.equal(status({customState: 'bad'}), 'time_unconfirmed');
  assert.equal(status({customState: 'past'}), 'time_past');
  assert.equal(status({resolved: {ok: false, code: 'ambiguous_wall_time'}}), 'time_invalid');
  assert.equal(status({resolved: {ok: false, code: 'nonexistent_wall_time'}}), 'time_invalid');
  assert.equal(status({nowMs: tomorrowMorning.atMs}), 'time_past',
    'at the instant of pickup it is too late');
  assert.equal(status({nowMs: tomorrowMorning.atMs - 1}), 'ready');
  assert.equal(status({nowMs: afterMidnight}), 'ready',
    'the previously selected Saturday at 6 AM stays Saturday after midnight');
  assert.equal(status({nowMs: tomorrowMorning.atMs + 30_000}), 'time_past');
  assert.equal(status({resolved: {ok:true, atMs: NaN}}), 'time_past');
  assert.equal(status({resolved: {ok:true, atMs: Infinity}}), 'time_past');

  const todayMorning = resolvePickupWall('2026-10-16', '6:00', 'AM', zone);
  assert.equal(status({pickupDate:'2026-10-16', resolved:todayMorning}), 'time_past');
  const thisEvening = Date.parse('2026-10-16T17:00:00Z');
  const todayLate = resolvePickupWall('2026-10-16', '11:45', 'PM', zone);
  assert.equal(status({pickupDate:'2026-10-16', resolved:todayLate, nowMs:thisEvening}), 'ready');

  const spring = resolvePickupWall('2026-03-08', '2:30', 'AM', zone);
  const fall = resolvePickupWall('2026-11-01', '1:30', 'AM', zone);
  assert.equal(status({resolved:spring}), 'time_invalid', 'nonexistent DST hour refused');
  assert.equal(status({resolved:fall}), 'time_invalid', 'ambiguous DST hour refused');

  // Combinations: withholding any required field fails closed, but never with a false
  // "time passed" explanation when the missing requirement is destination or price.
  for (const destination of [false, true]) {
    for (const quote of [false, true]) {
      for (const customState of ['none','ok','bad','suggest','past']) {
        const result=status({hasDestination:destination,hasQuote:quote,customState});
        if (!destination) assert.equal(result,'destination_required');
        else if (!quote) assert.equal(result,'quote_required');
        else if (customState==='bad'||customState==='suggest') assert.equal(result,'time_unconfirmed');
        else if (customState==='past') assert.equal(result,'time_past');
        else assert.equal(result,'ready');
      }
    }
  }

  assert.match(screen, /const schedInvalid = scheduleStatus !== 'ready'/,
    'Schedule control uses reason-specific readiness');
  assert.match(screen, /disabled=\{saving \|\| \(schedInvalid &&/,
    'invalid times block final Schedule Travel but missing itinerary allows completion');
  assert.match(screen, /scheduleStatus !== 'destination_required' && scheduleStatus !== 'quote_required'/,
    'missing destination and quote must not disable the route-completion action');
  assert.match(screen, /scheduleStatus !== 'ready' \|\| !resolved\.ok/,
    'onPress repeats the fail-closed readiness guard');
  assert.match(screen, /ride\.quotedTotalCents != null && ride\.quotedTotalCents > 0/,
    'display and acceptance require a genuine server Total');
  assert.match(screen, /ride\.quotedForClass === ride\.travelClass/,
    'quote must match the selected Travel class');
  assert.match(screen, /hasDestination && !!ride\.tripCoords && !ride\.repricing/,
    'schedule cannot present a valid Fare without route coordinates or while the map pin reprices');
  assert.match(screen, /const lat = ride\.pickupPin\?\.lat \?\? ride\.tripCoords\?\.pickup\?\.lat \?\? ride\.departure\.lat/,
    'pickup-zone lookup uses selected map pin before stale named departure');
  assert.match(screen, /const lng = ride\.pickupPin\?\.lng \?\? ride\.tripCoords\?\.pickup\?\.lng \?\? ride\.departure\.lng/,
    'pickup-zone longitude matches the same selected pickup authority');
  const rideContext = read('src/state/RideContext.tsx');
  assert.match(rideContext, /pickupLat: pickupPin\?\.lat \?\? tripCoords\?\.pickup\?\.lat \?\? departure\.lat/,
    'scheduled pickup latitude uses the selected map pin first');
  assert.match(rideContext, /pickupLng: pickupPin\?\.lng \?\? tripCoords\?\.pickup\?\.lng \?\? departure\.lng/,
    'scheduled pickup longitude uses the selected map pin first');
  assert.match(rideContext, /\[arrival, departure, pickupPin, travelClass, tripCoords, travelParty\]/,
    'the scheduled-submit callback sees the latest pickup pin');
  assert.match(screen, /resolved\.atMs <= Date\.now\(\)/,
    'submit repeats time validity at tap, not only on the last 30-second screen refresh');
  assert.match(screen, /hasQuote \? \(/,
    'only a verified quote renders a currency amount');
  assert.match(screen, /t\('traveler\.schedNotQuoted'\)/,
    'unknown Fare has an explicit, truthful state, not $0.00');
  assert.match(screen, /scheduleStatus === 'time_past' && customState !== 'past'/,
    'time-passed banner only for actual expired times');
  assert.doesNotMatch(screen, /\{schedInvalid && \(/,
    'missing Fare does not produce general false expired-time banner');
  assert.match(screen, /label=\{t\(scheduleStatus === 'destination_required'/,
    'one primary action becomes Choose destination, Review Travel Cost, or Schedule Travel');
  assert.match(screen, /pathname: '\/reserve'/,
    'reuse existing quote and destination entry, no second pricing engine');
  assert.match(screen, /params: hasDestination \? \{ scheduling: '1' \} : \{ search: '1', scheduling: '1' \}/,
    'missing destination opens address search and preserves scheduling intent');
  // Holistic UX contracts: single itinerary and progressive time selection.
  assert.ok(screen.indexOf('styles.journeyCard') > screen.indexOf('traveler.planAhead'),
    'location card belongs directly under Plan ahead');
  assert.ok(screen.indexOf("t('traveler.schedPickupPlace')") <
    screen.indexOf("t('traveler.schedDestination')"),
    'pickup is followed by destination in the same itinerary');
  assert.ok(screen.indexOf("t('traveler.schedDestination')") <
    screen.indexOf("t('traveler.schedPickupDateLabel')"),
    'journey locations precede date and time');
  assert.ok(screen.indexOf("t('traveler.schedPickupDateLabel')") <
    screen.indexOf("t('traveler.pickupTime')"),
    'pickup date comes before time');
  assert.match(screen, /accessibilityState=\{\{ expanded: timeEditing \}\}/,
    'time choices remain optional and screen readers know when expanded');
  assert.match(screen, /timeEditing && \(/,
    'four quick times and custom time are progressively disclosed, not always visible');
  assert.match(screen, /onPress=\{\(\) => setTimeEditing\(\(wasOpen\) => !wasOpen\)\}/,
    'tapping pickup time expands or collapses the options');
  assert.match(screen, /ride\.setSchedTime\(t\);\s*ride\.setCustomTime\(''\);\s*setTimeEditing\(false\);/,
    'tapping a valid quick time returns to the composed compact view');
  assert.match(screen, /params: \{ scheduling: '1', pickup: '1' \}/,
    'pickup can be edited directly from the itinerary');
  assert.match(screen, /params: \{ search: '1', scheduling: '1' \}/,
    'destination can be selected directly from the itinerary');
  assert.match(screen, /hasDestination \? ride\.arrival\.short : t\('traveler\.schedChooseDestination'\)/,
    'missing destination has a direct, clear place-selection label');
  assert.match(screen, /t\('traveler\.schedDestinationNeeded'\)/,
    'missing destination provides a brief explanation, not an alarming red error');
  assert.match(screen, /scheduleStatus === 'ready' && \(/,
    'future payment/assignment terms are displayed only before a real confirmation');
  assert.match(screen, /t\('traveler\.schedBookingNotice'\)/,
    'warn that assignment and charging occur later, not at schedule selection');

  assert.match(screen, /accessibilityLabel=\{t\('traveler\.schedPreviousMonth'\)\}/,
    'month-back control announces its purpose');
  assert.match(screen, /accessibilityLabel=\{t\('traveler\.schedNextMonth'\)\}/,
    'month-forward control announces its purpose');
  assert.match(screen, /accessibilityState=\{\{ selected: !!on, disabled: !c\.selectable \}\}/,
    'calendar days announce selected and unavailable states');
  assert.match(screen, /accessibilityState=\{\{ selected: on, disabled: passed \}\}/,
    'quick pickup times announce selected and expired states');
  assert.match(screen, /accessibilityLabel=\{t\('traveler\.anotherTime'\)\}/,
    'custom-time input has an explicit accessible name');
  assert.match(screen, /minHeight: 44/,
    'date/time tap targets preserve a comfortable minimum height');
  assert.match(screen, /summaryLabel: \{[^\n]*flexShrink: 1/,
    'Complete Travel Cost can wrap on narrow phones');


  // Locale and accessible calendar audit: six-language-independent dates were
  // previously shown under hardcoded US weekday initials in every translation.
  assert.match(screen, /const weekStart = language === 'en' \? 0 : 1/,
    'calendar week begins Sunday in current US English; Monday in the four other locales');
  assert.match(screen, /weekdayHeaders\.map\(\(day, i\) =>/,
    'day headers derive from the selected language instead of English S/M/T labels');
  assert.doesNotMatch(screen, /\['S', 'M', 'T', 'W', 'T', 'F', 'S'\]/,
    'no hardcoded English-only ambiguous weekday initials');
  assert.match(screen, /accessibilityLabel=\{day\.full\}/,
    'weekday headings announce full local weekday names');
  assert.match(screen, /weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'/,
    'each calendar day announces its full date and year for assistive technology');
  assert.match(screen, /pickupTimeDisplay\}\. \$\{t\('traveler\.schedChangeTime'\)\}/,
    'time editor accessibility label includes currently selected time');
  assert.doesNotMatch(screen, /const allSlotsPassed = timeSlots\.every/,
    'the app no longer changes the chosen time silently when a quick slot expires');
  assert.doesNotMatch(screen, /ride\.setSchedTime\(firstOpen\)/,
    'user must explicitly approve an alternative pickup hour');
  assert.match(screen, /const timeOptionsWrap = screenWidth < 360 \|\| fontScale > 1\.2/,
    'large text or narrow phone chooses a reflowed time layout');
  assert.match(screen, /timeGrid: \{ flexDirection: 'row', gap: 9 \}/,
    'ordinary phones preserve the original one-row four-time layout');
  assert.match(screen, /timeGridWrap: \{ flexWrap: 'wrap', justifyContent: 'space-between' \}/,
    'only narrow or accessibility-font layouts wrap onto two rows');
  assert.match(screen, /timeBtnWrap: \{ flex: 0, width: '48%' \}/,
    'two-column fallback keeps readable time choices on small phones');
  assert.match(screen, /calCell: \{\s*width: `\$\{100 \/ 7\}%`,\s*minHeight: 44/,
    'calendar uses the existing application control height, not an arbitrary larger variant');
  assert.match(screen, /keyboardType="numbers-and-punctuation"/,
    'custom time offers an appropriate time-entry keyboard');
  assert.match(screen, /accessibilityLabel=\{`\$\{t\('traveler\.useIt'\)\} \$\{suggestLabel\} \$\{suggestPeriod\}`\}/,
    'rounded suggestion explicitly announces what would be accepted');

  for (const locale of ['en', 'es', 'fr', 'it', 'de']) {
    const weekStart = locale === 'en' ? 0 : 1;
    const octoberFirst = new Date(Date.UTC(2026, 9, 1));
    assert.equal((octoberFirst.getUTCDay() - weekStart + 7) % 7,
      locale === 'en' ? 4 : 3, locale + ' October calendar alignment');
    const first = new Date(Date.UTC(2026, 9, 18 + weekStart));
    const label = first.toLocaleDateString(locale, { weekday: 'long', timeZone: 'UTC' });
    assert.ok(label.length > 2, locale + ' full weekday name');
    assert.ok(first.toLocaleDateString(locale, { weekday: 'short', timeZone: 'UTC' }).slice(0,2).length > 0,
      locale + ' compact localized day label');
  }

  // Institutional design follow-up: an appointment saved as "Tomorrow"
  // becomes a false description the moment the pickup area crosses midnight.
  assert.match(screen, /const chosenDayLabel = selectedPickupDate\s*\? new Date/,
    'stored reservation label is derived from the actual chosen day');
  assert.match(screen, /weekday: 'long', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC'/,
    'saved date includes the exact year and pickup-local day, not relative Today/Tomorrow');
  assert.doesNotMatch(screen, /activeDayChoice === 'today' \? t\('traveler\.schedToday'\)/,
    'success and stored summary must not describe an absolute reservation as Today');
  assert.doesNotMatch(screen, /activeDayChoice === 'tomorrow' \? t\('traveler\.schedTomorrow'\)/,
    'success and stored summary must not describe an absolute reservation as Tomorrow');

  // AM/PM is one explicit change, never permission to change the hour as well.
  assert.match(screen, /ride\.setSchedPeriod\(p\);/,
    'AM/PM selector must update the chosen period');
  assert.doesNotMatch(screen, /if \(!slotsFor\(p\)\.includes\(ride\.schedTime\)\) ride\.setSchedTime\('6:30'\)/,
    'switching from 6:00 AM to PM must not silently schedule 6:30 PM');

  for (const locale of ['en', 'es', 'fr', 'it', 'de']) {
    const written = new Date('2026-10-17T00:00:00Z').toLocaleDateString(locale, {
      weekday:'long', month:'short', day:'numeric', year:'numeric', timeZone:'UTC',
    });
    const afterMidnightWritten = new Date('2026-10-17T00:00:00Z').toLocaleDateString(locale, {
      weekday:'long', month:'short', day:'numeric', year:'numeric', timeZone:'UTC',
    });
    assert.equal(written, afterMidnightWritten,
      locale + ': calendar date stays stable after local midnight');
    assert.ok(written.includes('2026'), locale + ': explicit year survives in appointment text');
    assert.notEqual(written, 'Tomorrow', locale + ': no relative stored date');
  }

  // Mobile final review: confirm the whole itinerary without scrolling back
  // above date choices (Baymard mobile context and total-price findings).
  const finalReview = screen.slice(screen.indexOf('<Card style={styles.summaryCard}>'));
  assert.match(finalReview, /traveler\.schedPickupPlace/,
    'final review includes the pickup location');
  assert.match(finalReview, /ride\.departure\.short/,
    'final review repeats the actual selected pickup text');
  assert.match(finalReview, /traveler\.schedDestination/,
    'final review includes the destination');
  assert.match(finalReview, /ride\.arrival\.short/,
    'final review repeats the destination instead of a remembered name');
  assert.match(finalReview, /traveler\.pickupTime/,
    'final review includes the actual appointment date and time');
  assert.match(finalReview, /chosenDayLabel} · {pickupTimeDisplay}/,
    'date and time are adjacent at final confirmation');
  assert.match(finalReview, /traveler\.totalTravelCost/,
    'final review includes the all-in Total');
  assert.ok(finalReview.indexOf("traveler.schedDestination") <
    finalReview.indexOf("traveler.totalTravelCost"),
    'itinerary appears before the final Total and consent');
  assert.ok(finalReview.indexOf("traveler.totalTravelCost") <
    finalReview.indexOf("<PrimaryButton"),
    'final Total appears before the Schedule Travel action');

  // Vehicle selection is a necessary part of a scheduled booking, not a
  // separate immediate-only mode. Reuse the class picker and server quote.
  assert.match(screen, /classNameKey\(ride\.travelClass\)/,
    'current vehicle class is visible at the final scheduled review');
  assert.match(finalReview, /traveler\.vehicleClassLabel/,
    'Travel Confirmation class is exposed in scheduled review');
  assert.match(finalReview, /params: \{ scheduling: '1' \}/,
    'vehicle and traveler editors return to existing scheduled quote flow');
  assert.match(finalReview, /traveler\.whoIsTraveling/,
    'the person taking Travel is visible before scheduling');
  assert.match(finalReview, /traveler\.schedManageNotice/,
    'cancellation and assignment management are explained before scheduling');

  const home = read('app/index.tsx');
  assert.match(home, /\[confirmCancelScheduled, setConfirmCancelScheduled\]/,
    'cancel needs explicit confirmation state');
  assert.match(home, /onPress=\{\(\) => setConfirmCancelScheduled\(true\)\}/,
    'one tap opens cancel review but never deletes an accepted booking');
  assert.match(home, /ride\.schedState\?\.status === 'reserved' && \(/,
    'only unassigned reservations use the reservation-only cancellation');
  assert.match(home, /traveler\.schedCancelConfirmTitle/,
    'confirmation title makes the consequential action clear');
  assert.match(home, /traveler\.schedKeepTravel/,
    'cancel review has a preserve-booking option');
  assert.match(home, /traveler\.schedCancelConfirmAction/,
    'cancel review has an explicit final destructive action');
  assert.match(home, /await ride\.cancelScheduled\(\)/,
    'final cancel still uses server-verified transactional cancellation');
  assert.doesNotMatch(home, /label: t\('traveler\.scheduledTravel'\), onPress: \(\) => go\('\/schedule'\)/,
    'existing reservation in menu must not open an unrelated new booking');

  for (const language of ['en','es','fr','it','de']) {
    const dict = read('src/i18n/' + language + '.ts');
    for (const key of ['schedChangeVehicle','schedChangeTraveler','schedManageNotice',
      'schedCancelConfirmTitle','schedCancelConfirmBody','schedKeepTravel','schedCancelConfirmAction'])
      assert.match(dict,new RegExp('^\\s*' + key + ':','m'),
        language + ' must state current class and cancellation terms in its own language');
  }

  assert.match(finalReview, /traveler\.paymentMethods/,
    'scheduled Travel review includes access to existing payment methods');
  assert.match(finalReview, /router\.navigate\('\/wallet'\)/,
    'payment method link opens the existing secure payment page, not new card collection');

  const confirmation = read('app/reserve.tsx');
  assert.match(confirmation, /params\.scheduling === '1'/,
    'confirmation offers a direct return to the selected scheduled pickup');
  assert.match(confirmation, /params\.pickup === '1'/,
    'editing pickup opens existing pickup search, not an unrelated booking');
  assert.match(confirmation, /setSearchingDep\(true\)/,
    'pickup search activates when requested');

  assert.match(confirmation, /const selectingScheduledTravel = params\.scheduling === '1'/,
    'scheduled destination/price flow cannot silently become an immediate Travel');
  assert.match(screen, /params: \{ scheduling: '1', pickup: '1' \}/,
    'scheduled itinerary pickup action opens the existing pickup editor');
  assert.match(confirmation, /params\.pickup === '1'/,
    'Travel Confirmation recognizes the scheduled pickup edit parameter');
  assert.match(confirmation, /setSearchingDep\(true\)/,
    'scheduled pickup edit opens the pickup search rather than doing nothing');
  assert.match(screen, /accessibilityState=\{\{ expanded: timeEditing \}\}/,
    'optional detailed pickup-time choices disclose their expanded state');
  assert.match(confirmation, /disabled=\{selectingScheduledTravel \? !canContinueScheduling : !canReserve\}/,
    'the scheduled return button requires server quote and route, not live payment acceptance');
  assert.match(confirmation, /selectingScheduledTravel\s*\? \(\) => \{ if \(canContinueScheduling\) router\.navigate\('\/schedule'\); \}/,
    'schedule-first button returns to selected pickup, never confirms now');
  assert.match(confirmation, /!selectingScheduledTravel && payConfig\.cancellationFeeGrossCents/,
    'immediate booking fee terms remain hidden on schedule-first confirmation');
  assert.match(confirmation, /cancellationFeeNet3Disclosure/,
    'when active, $4 cancellation terms are visible before immediate booking');

  assert.match(screen, /const selectedPickupDate = pickupZone \? ride\.schedPickupDate : null/,
    'the picked calendar date survives midnight and destination-search navigation');
  assert.match(screen, /if \(o\.key === 'pick'\)/,
    'the calendar retains its own date-selection branch');
  assert.match(screen, /ride\.setSchedPickupDate\(keepDate\)/,
    'opening Pick a day again must preserve a previously selected future day');
  assert.match(screen, /setCalOffset\(offset\)/,
    'route-search return restores the visible month containing the chosen day');
  assert.match(screen, /o\.key === 'today' \? marketToday : nextDate\(marketToday\)/,
    'Today and Tomorrow chips still choose their own absolute dates');
  assert.match(screen, /ride\.schedPickupDate && ride\.schedDate !== activeDayChoice/,
    'the date chip adapts at midnight without moving the scheduled appointment');
  assert.match(screen, /const chosenDayLabel = selectedPickupDate\s*\? new Date/,
    'the summary prints the absolute selected date, not a stale relative label');
  assert.match(rideContext, /schedPickupDate: string \| null/,
    'RideContext retains the precise selected day while searching for destination');
  assert.match(rideContext, /setSchedPickupDate\(null\); \/\/ New journey/,
    'starting a genuinely new journey clears the prior date selection');
  assert.match(screen, /if \(state === 'active'\) setClockMs\(Date\.now\(\)\)/,
    'foreground return updates local clock immediately');
  assert.match(screen, /const \[zoneChecking, setZoneChecking\] = useState\(true\)/,
    'pickup market lookup begins in a neutral loading state');
  assert.match(screen, /setZoneChecking\(false\)/,
    'successful or failed lookup settles without extra polling');
  assert.match(screen, /zoneChecking \? 'traveler\.schedCheckingZone' : 'traveler\.schedZoneUnavailable'/,
    'do not display a false unavailable warning while the pickup zone is loading');
  assert.match(screen, /onPress=\{\(\) => setZoneRetry\(\(n\) => n \+ 1\)\}/,
    'after actual pickup market failure Traveler has a working one-tap retry');
  assert.match(screen, /\},\[lat,lng,zoneRetry\]\);/,
    'market lookup retries only after route changes or direct user request');
  assert.match(screen, /!zoneChecking && \(/,
    'recovery action is not offered while the market check is already in progress');

    assert.match(screen, /clearInterval\(ticker\); onResume\.remove\(\)/,
    'clean up clock-only timer and listener');
  assert.doesNotMatch(screen, /fetchQuote\(|getDocs\(|onSnapshot\(/,
    'no new network prices, listeners or reads from date controls');
  assert.match(screen, /customState !== 'ok'/,
    'unconfirmed typed time does not silently render a different pickup summary');

  for(const l of ['en','es','fr','it','de']) {
    const src=read('src/i18n/'+l+'.ts');
    for(const key of ['schedPickupDateLabel','schedPickupPlace','schedEditPickup',
      'schedDestination','schedChangeDestination','schedChangeTime','schedTimeOptions',
      'schedPreviousMonth','schedNextMonth',
      'schedNotQuoted','schedConfirmTimeHint',
      'schedContinueScheduling','schedChooseDestination','schedDestinationNeeded','schedQuoteNeeded',
      'schedCheckingZone','schedReviewFare','schedTimeUnconfirmed','schedTimesPassed','schedReturnToPickup','schedContinue']) {
      assert.match(src,new RegExp('^\\s*'+key+':','m'),l+': '+key);
    }
    assert.doesNotMatch(src,/^\s*schedAltLater:/m,
      'remove orphaned old warning copy in '+l);
  }
}
console.log('PASS twice: screenshot 11:36 PM -> tomorrow 6 AM, DST boundaries, date/quote separation, no $0, recovery action, five languages and local-only clock');
