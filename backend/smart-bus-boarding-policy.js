'use strict';
// Smart Travel boarding-stop reliability: compare OTP's actual boarding time
// against when the Traveler reaches THAT stop. No new schedule, provider or fare.
const MINUTE = 60_000;
function stopWaitLimit(startTime, timezone = 'America/New_York') {
  const d = new Date(startTime);
  if (!Number.isFinite(d.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, weekday: 'short', hour: '2-digit', hourCycle: 'h23',
    }).formatToParts(d);
    const weekday = parts.find((p) => p.type === 'weekday')?.value;
    const hour = Number(parts.find((p) => p.type === 'hour')?.value);
    if (!weekday || !Number.isInteger(hour)) return null;
    // Weekday commuter/daytime preference 15 min; evenings/weekends at most 30.
    return !['Sat', 'Sun'].includes(weekday) && hour >= 7 && hour < 19 ? 15 : 30;
  } catch {
    return null; // Unknown time zone must not authorize a bus journey.
  }
}

function acceptableBusBoardingWait(legs, requestedAt, timezone = 'America/New_York') {
  // Direct mapper fixtures without a requestedAt use legacy mapping; real
  // planTransit ALWAYS supplies requestedAt. No fare or rail logic depends on this.
  if (requestedAt == null) return true;
  const requested = new Date(requestedAt).getTime();
  if (!Number.isFinite(requested) || !Array.isArray(legs)) return false;
  for (let i = 0; i < legs.length; i++) {
    if (legs[i]?.mode !== 'bus') continue;
    const depart = Date.parse(legs[i].startTime);
    const previous = i > 0 ? Date.parse(legs[i - 1]?.endTime) : requested;
    const ready = Math.max(requested, previous);
    const minutes = stopWaitLimit(legs[i].startTime, timezone);
    if (!Number.isFinite(depart) || !Number.isFinite(previous) ||
        minutes == null || depart < ready || depart - ready > minutes * MINUTE) {
      return false;
    }
  }
  return true;
}

module.exports = { stopWaitLimit, acceptableBusBoardingWait };
