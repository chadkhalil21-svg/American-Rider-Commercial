'use strict';
// Official toll rates are the only billable local prices. OSM toll=yes / charge=*
// supplies candidate road/facility evidence, NOT a verified amount on its own.
// A future offline OSM/authority matcher must identify *every* traversed toll
// gantry and attach the certified crossings to the server-created OSRM route.
// We deliberately ship NO unverified rate records.
const APPROVED_OFFICIAL_RATE_BOOKS = Object.freeze({});
const TRUSTED_MATCH_SOURCE = 'validated-osm-authority-crossings-v1';
const MAX_VERIFICATION_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function officialTollPriceForRoute(route, marketId, {
  books = APPROVED_OFFICIAL_RATE_BOOKS,
  now = Date.now(),
} = {}) {
  // No self-declared client data is permitted here. routeCar() constructs the
  // OSRM route; the offline matcher must later attach certified crossing IDs.
  if (route?.provider !== 'osrm' || route.tollRelevant !== true ||
      route.officialMatchSource !== TRUSTED_MATCH_SOURCE ||
      route.officialMatchComplete !== true) return null;
  const ids = route.officialFacilityCrossings;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 40 ||
      !ids.every(id => typeof id === 'string' && /^[A-Za-z0-9:_-]{1,100}$/.test(id))) return null;

  const book = books?.[marketId];
  if (!book || book.marketId !== marketId || book.approval !== 'approved' ||
      book.currency !== 'USD' || book.rateType !== 'fixed' ||
      !/^[a-z0-9_-]{2,40}$/.test(String(book.vehicleClass || '')) ||
      !/^[a-z0-9_-]{2,40}$/.test(String(book.paymentMethod || '')) ||
      !/^https:\/\//.test(String(book.sourceUrl || ''))) return null;
  const reviewed = Date.parse(book.reviewedAt);
  const validFrom = Date.parse(book.validFrom);
  const validUntil = Date.parse(book.validUntil);
  if (![reviewed, validFrom, validUntil, now].every(Number.isFinite) ||
      reviewed > now || now - reviewed > MAX_VERIFICATION_AGE_MS ||
      now < validFrom || now > validUntil || validUntil < validFrom) return null;
  // Never substitute a SunPass price when the Operator's payment method or
  // vehicle class is not known. Variable-price express lanes require a live
  // official tariff feed, not this fixed-rate catalogue.
  if (route.vehicleClass !== book.vehicleClass ||
      route.tollPaymentMethod !== book.paymentMethod) return null;

  let tollCents = 0;
  const facilities = [];
  for (const id of ids) {
    const entry = book.rates?.[id];
    if (!entry || entry.variable === true ||
        !Number.isSafeInteger(entry.cents) || entry.cents < 0 ||
        typeof entry.name !== 'string' || !entry.name.trim()) return null;
    tollCents += entry.cents;
    if (!Number.isSafeInteger(tollCents)) return null;
    facilities.push({ id, name: entry.name, tollCents: entry.cents });
  }
  return { status: tollCents > 0 ? 'tolled' : 'clear', tollCents,
    provider: 'verified-official-toll-rates', facilities };
}

module.exports = { officialTollPriceForRoute, APPROVED_OFFICIAL_RATE_BOOKS, TRUSTED_MATCH_SOURCE };
