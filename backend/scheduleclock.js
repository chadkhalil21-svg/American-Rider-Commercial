// One scheduled instant is defined by the pickup market, never by the phone's timezone.
function parts(epoch, zone) {
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  return Object.fromEntries(format.formatToParts(new Date(epoch))
    .filter((v) => ['year','month','day','hour','minute'].includes(v.type))
    .map((v) => [v.type, Number(v.value)]));
}
function pickupDate(epoch, zone) {
  const p = parts(epoch,zone);
  return `${p.year}-${String(p.month).padStart(2,'0')}-${String(p.day).padStart(2,'0')}`;
}
function pickupMinutes(epoch, zone) {
  const p = parts(epoch,zone);
  return p.hour * 60 + p.minute;
}
function nextDate(date, days = 1) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('invalid_date');
  const epoch = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString().slice(0,10) !== date) throw new Error('invalid_date');
  return new Date(epoch + days * 86400000).toISOString().slice(0,10);
}
function resolvePickupWall(date, time, period, zone) {
  try {
    if (!/^(20\d{2})-(\d{2})-(\d{2})$/.test(date) ||
        !/^(1[0-2]|[1-9]):(00|15|30|45)$/.test(time) || !['AM','PM'].includes(period) || !zone)
      return { ok:false, code:'invalid_wall_time' };
    const [y,m,d] = date.split('-').map(Number);
    const [h,min] = time.split(':').map(Number);
    const hour = h % 12 + (period === 'PM' ? 12 : 0);
    const asUTC = Date.UTC(y,m-1,d,hour,min);
    if (new Date(asUTC).toISOString().slice(0,10) !== date) return { ok:false, code:'invalid_date' };
    const offsets = new Set();
    for (const delta of [-48,-24,-12,0,12,24,48]) {
      const test = asUTC + delta * 3600000;
      const p = parts(test,zone);
      offsets.add(Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute) - Math.floor(test/60000)*60000);
    }
    const candidates = [...offsets].map((offset) => asUTC-offset).filter((epoch) => {
      const p = parts(epoch,zone);
      return p.year===y && p.month===m && p.day===d && p.hour===hour && p.minute===min;
    });
    if (candidates.length !== 1) return { ok:false, code:candidates.length ? 'ambiguous_wall_time':'nonexistent_wall_time' };
    return { ok:true, atMs:candidates[0] };
  } catch { return { ok:false, code:'invalid_zone' }; }
}
// Pure, no-network decision used by the scheduling screen. A missing Fare is never
// evidence that a future pickup time has passed. The server still independently
// checks date, jurisdiction and authoritative fare before creating a reservation.
function scheduleReadiness({ hasDestination, hasQuote, pickupZone, pickupDate: date,
  resolved, customState, nowMs }) {
  if (!hasDestination) return 'destination_required';
  if (!hasQuote) return 'quote_required';
  if (!pickupZone) return 'zone_unavailable';
  if (!date) return 'date_required';
  if (customState === 'bad' || customState === 'suggest') return 'time_unconfirmed';
  if (customState === 'past') return 'time_past';
  if (!resolved || !resolved.ok) return 'time_invalid';
  if (!Number.isFinite(resolved.atMs) || resolved.atMs <= nowMs) return 'time_past';
  return 'ready';
}
module.exports={ pickupDate, pickupMinutes, nextDate, resolvePickupWall, scheduleReadiness };
