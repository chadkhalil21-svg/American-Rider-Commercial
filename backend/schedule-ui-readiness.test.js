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
  assert.match(screen, /disabled=\{schedInvalid \|\| saving\}/,
    'unknown Fare and invalid times never allow scheduling');
  assert.match(screen, /scheduleStatus !== 'ready' \|\| !resolved\.ok/,
    'onPress repeats the fail-closed readiness guard');
  assert.match(screen, /ride\.quotedTotalCents != null && ride\.quotedTotalCents > 0/,
    'display and acceptance require a genuine server Total');
  assert.match(screen, /ride\.quotedForClass === ride\.travelClass/,
    'quote must match the selected Travel class');
  assert.match(screen, /hasQuote \? fmt\(ride\.travelerTotal\) : '—'/,
    'unknown Fare is not a false $0.00 quote');
  assert.match(screen, /scheduleStatus === 'time_past'/,
    'time-passed banner only for actual expired times');
  assert.doesNotMatch(screen, /\{schedInvalid && \(/,
    'missing Fare does not produce general false expired-time banner');
  assert.match(screen, /scheduleStatus === 'destination_required' \|\| scheduleStatus === 'quote_required'/,
    'a destination and quote both offer a relevant recovery action');
  assert.match(screen, /pathname: '\/reserve'/,
    'reuse existing quote and destination entry, no second pricing engine');
  assert.match(screen, /params: hasDestination \? \{\} : \{ search: '1' \}/,
    'missing destination takes the Traveler directly into search');
  assert.match(screen, /if \(state === 'active'\) setClockMs\(Date\.now\(\)\)/,
    'foreground return updates local clock immediately');
  assert.match(screen, /clearInterval\(ticker\); onResume\.remove\(\)/,
    'clean up clock-only timer and listener');
  assert.doesNotMatch(screen, /fetchQuote\(|getDocs\(|onSnapshot\(/,
    'no new network prices, listeners or reads from date controls');
  assert.match(screen, /customState !== 'ok'/,
    'unconfirmed typed time does not silently render a different pickup summary');

  for(const l of ['en','es','fr','it','de']) {
    const src=read('src/i18n/'+l+'.ts');
    for(const key of ['schedChooseDestination','schedDestinationNeeded','schedQuoteNeeded',
      'schedReviewFare','schedTimeUnconfirmed','schedTimesPassed']) {
      assert.match(src,new RegExp('^\\s*'+key+':','m'),l+': '+key);
    }
    assert.doesNotMatch(src,/^\s*schedAltLater:/m,
      'remove orphaned old warning copy in '+l);
  }
}
console.log('PASS twice: screenshot 11:36 PM -> tomorrow 6 AM, DST boundaries, date/quote separation, no $0, recovery action, five languages and local-only clock');
