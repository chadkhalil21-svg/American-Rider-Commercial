// One authoritative fare computation for quoting, dispatch and payment.
// Request bodies provide route inputs only. They never provide a computed fare, distance or fee.
const { quote } = require('./payments');
const { fareCentsForCoords, applyTravelClass, normalizeTravelClassKey } = require('./fares');
const { outsideMarket, outsideMarketMessage } = require('./market');
const { governmentFeesFor, permitRequired, permitRequiredMessage } = require('./fees');
const { resolveTollsCostAware, verifiedHereRoute } = require('./tolls');
const { routeCar } = require('./streets');
const { referenceForQuote } = require('./market-reference-authority');
const { fareForMarketTarget, controlledTargetFromAllIn } = require('./market-reference-fare');

function priceRoute(body, selectedRoute = null) {
  const withClass = (cents) => applyTravelClass(cents, body?.travelClass || body?.cls);
  const away = outsideMarket(body?.pickup, body?.dest);
  if (away) return { outsideMarket: away, reason: outsideMarketMessage(away) };
  const blocked = permitRequired(body?.pickup, body?.dest);
  if (blocked) return { permitRequired: blocked, reason: permitRequiredMessage(blocked) };

  const routeMetrics = selectedRoute ? { routedMiles: selectedRoute.distanceMeters / 1609.344, routedMinutes: selectedRoute.durationSec / 60 } : null;
  const byCoords = fareCentsForCoords(body?.pickup, body?.dest, routeMetrics);
  if (byCoords) {
    return {
      travelCostCents: withClass(byCoords.travelCostCents),
      miles: byCoords.miles,
      minutes: byCoords.minutes,
      timedBy: byCoords.timedBy,
      pricedBy: selectedRoute ? 'routed-distance' : 'estimated-distance',
      routeProvider: selectedRoute?.provider || null,
      governmentFees: governmentFeesFor(body?.pickup, body?.dest),
    };
  }
  // A name alone has no pickup or measured route. The old Brickell-only fixed
  // table cannot truthfully quote the new prices, other counties or national
  // bookings. Refuse instead of showing a misleading lower amount that the
  // canonical server would then replace before payment.
  return null;
}

async function journeyFor({ db, uid, journeyNo, now = Date.now() }) {
  const no = String(journeyNo || '').slice(0, 24);
  if (!db || !uid || !no) return null;
  const snap = await db.collection('rides')
    .where('travelerUid', '==', String(uid)).where('tripNo', '==', no).limit(1).get();
  const first = snap.docs[0];
  const leg = first?.data();
  if (!leg || !leg.paymentIntentId || leg.status !== 'completed' || !(leg.travelCostCents > 0)) return null;
  // Smart continuation is a short, single-use extension of a completed Travel.
  // A random old ordinary Travel must not confer a repeatable second-leg fee.
  const completedAt = leg.completedAt;
  if (!Number.isSafeInteger(completedAt) || completedAt > now ||
      now - completedAt > 48 * 60 * 60 * 1000) return null;
  // Leg 2 stores its link in journey.journeyNo, NOT a top-level journeyNo.
  // Checking only the old top-level field allowed unlimited chained continuations.
  if (leg.journeyNo || leg.journey?.journeyNo || leg.smartContinuationRideId) return null;
  // The booking transaction will re-check the original paid Travel under the lock.
  if (!/^[a-f0-9]{40}$/.test(String(first?.id || ''))) return null;
  return {
    journeyNo: no,
    leg1RideId: first.id,
    leg1FareCents: Number(leg.travelCostCents),
    leg1GovernmentFeeCents: Math.max(0, Number(leg.governmentFeeCents) || 0),
    leg1TollCents: Math.max(0, Number(leg.tollCents) || 0),
    // The physical Traveler/guardian envelope is frozen by the first Travel. Leg 2 must not
    // trust a restarted or modified client to name a different party.
    party: leg.party || null,
  };
}

async function authoritativeFare({ body, uid = null, email = null, db = null, cardCountryFor = null }) {
  // One selected road route is the physical authority for both fare distance/time and toll
  // analysis. This prevents quoting one modeled path while resolving tolls on another.
  let selectedRoute = null;
  if (body?.pickup && body?.dest) {
    // Reject prohibited geography before contacting a paid routing fallback.
    // No route is requested for a Travel we cannot sell.
    const blocked = outsideMarket(body.pickup, body.dest) || permitRequired(body.pickup, body.dest);
    if (!blocked) {
      try { selectedRoute = await routeCar(body.pickup, body.dest); } catch { selectedRoute = null; }
      // A missing regional road server previously made *every* quote fail closed,
      // even with a working HERE key. HERE's same response now proves road
      // distance, time AND tolls without inventing a straight-line fare.
      if (!selectedRoute) selectedRoute = await verifiedHereRoute(body.pickup, body.dest);
    }
  }
  const route = priceRoute(body, selectedRoute);
  if (!route || route.outsideMarket || route.permitRequired) return route;
  const requestedJourneyNo = String(body?.journeyNo || '').trim();
  const tollPromise = body?.pickup && body?.dest
    ? resolveTollsCostAware(body.pickup, body.dest, { route: selectedRoute, routeAttempted: true })
    : Promise.resolve({ status: 'unknown', tollCents: null, reason: 'coordinates_required' });
  const referencePromise = body?.pickup && body?.dest && route.miles && route.minutes
    ? referenceForQuote({ pickup: body.pickup, dest: body.dest, serviceClass: normalizeTravelClassKey(body?.travelClass || body?.cls), routedMiles: route.miles, routedMinutes: route.minutes })
    : Promise.resolve({ ok: false, reason: 'route conditions unavailable' });
  const [cardCountry, journey, toll, marketReference] = await Promise.all([
    uid && cardCountryFor ? cardCountryFor({ uid, email }) : null,
    journeyFor({ db, uid, journeyNo: requestedJourneyNo }),
    tollPromise,
    referencePromise,
  ]);
  // A caller that names a Smart Travel first leg does not get ordinary single-Travel pricing
  // merely because the reference is invalid. That would let an unpaid/foreign/chained leg
  // bypass the journey fee. Fail the quote instead.
  if (requestedJourneyNo && !journey) {
    return { invalidJourney: true, reason: 'The Smart Travel first leg is not a paid completed Travel on this account.' };
  }
  // Toll resolution is authoritative and server-side. Unknown is distinct from zero.
  // Callers decide whether an unknown toll state blocks the operation; it must never be
  // converted into an assumed $0 pass-through.
  route.tollStatus = toll.status;
  route.tollCents = toll.tollCents;
  route.tollProvider = toll.provider || null;
  route.tollReason = toll.reason || null;
  const tollForQuote=toll.status === 'unknown' ? 0 : toll.tollCents;
  let marketPricing={applied:false,reason:marketReference.reason||'reference unavailable'};
  if(!journey&&marketReference.ok&&selectedRoute&&toll.status!=='unknown'){
    const quoteForFare=(fare)=>quote(fare,null,route.governmentFees,cardCountry,tollForQuote);
    // Published comparable market reference is the full Traveler Total.
    // Only Fare+Platform Fee is controlled here; deduct pass-throughs once.
    const passThroughCents=quoteForFare(route.travelCostCents).passThroughCents;
    const targetControlledTotalCents=controlledTargetFromAllIn({
      targetTravelerTotalCents:marketReference.targetTotalCents,passThroughCents,
    });
    if(targetControlledTotalCents!==null){
      const solved=fareForMarketTarget({
        floorFareCents:route.travelCostCents,targetControlledTotalCents,quoteForFare,
      });
      route.travelCostCents=solved.fareCents;
      marketPricing={applied:solved.reason==='market reference',reason:solved.reason,regionId:marketReference.regionId,marketId:marketReference.marketId,referenceAsOf:marketReference.referenceAsOf,referenceTotalCents:marketReference.referenceTotalCents,targetControlledTotalCents,referenceCell:marketReference.key,sources:marketReference.sources};
    } else marketPricing={applied:false,reason:'market total insufficient for verified pass-throughs'};
  } else if(!journey&&marketReference.ok){
    marketPricing={applied:false,reason:!selectedRoute?'route not verified':'toll not resolved'};
  } else if(journey) marketPricing={applied:false,reason:'smart-journey combined economics'};
  const breakdown = quote(route.travelCostCents,journey,route.governmentFees,cardCountry,tollForQuote);
  return { ...route, ...breakdown, marketPricing, journey, cardCountry: cardCountry || null };
}

module.exports = { priceRoute, authoritativeFare, journeyFor };
