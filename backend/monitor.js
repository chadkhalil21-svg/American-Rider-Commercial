// American Rider — route monitoring.
//
// WHAT THIS IS FOR (Chad, 23 Aug 2026): "If a vehicle is stationary or whatever it is, the
// platform AI asks the traveler if everything is alright, or it also confirms with the
// operator what's going on. And, also, our platform AI may see itself if there is traffic in
// the area."
//
// THE ORDER IS THE WHOLE DESIGN. A car that has not moved for six minutes is, nine times out
// of ten, a car at a light on the causeway. An app that reacts to that by asking a traveler
// whether they are safe has just invented an emergency, and after the second false alarm
// nobody reads the third. So the platform works from the outside in:
//
//   1. Explain it if we can.  Are OTHER vehicles in the same half-mile also stopped? Then it
//      is the road, not the journey. Nobody is asked anything; the traveler is simply told
//      what the delay is.
//   2. Ask the operator.      They can answer without anybody being alarmed, and they are the
//      one person who actually knows.
//   3. Ask the traveler.      Only once the operator has been asked and has not answered.
//   4. Open a case.           Only once neither has.
//
// WHERE THE TRAFFIC SIGNAL COMES FROM. We have no traffic feed — OSRM's public routing has no
// live conditions, and Apple's Maps Server API needs a key that does not exist yet. But we do
// not need one to answer the question that matters. Every operator carrying a traveler is
// reporting their position, so the fleet IS the traffic sensor: three cars crawling in the
// same half-mile is congestion, and one car stopped while the others move is not. It costs
// nothing, it needs no vendor, and it gets sharper as Miami fills up.
//
// WHAT THE MODEL DOES, AND WHAT IT MUST NOT. Claude reads the OPERATOR'S OWN WORDS and decides
// whether they settle the matter or make it worse — "stuck behind an accident on the 836"
// settles it; "she's not answering me" does not. It never invents a position, a delay or a
// reason: every fact it is given comes from the record. With no key configured the ladder
// still runs on the thresholds alone, and says less.
const { createHash } = require('node:crypto');
const { distanceMiles, matchOperator, coverageLapsed } = require('./matching');
const { nearbyOperatorCandidates } = require('./geooperators');
const { screeningReady } = require('./screening');
const { assessOperator } = require('./qualification');
const { connectAccountStatus, verifiedTravelPayment } = require('./payments');
const { assignPaidTravel, paymentMatches } = require('./booking');
const { adminDb, adminStatus } = require('./firebase-admin');
const { fileTicket } = require('./tickets');
const { readKey } = require('./env');
const { notify } = require('./push');
const { shouldRecordUnanswered } = require('./assignment-write-policy');

// A vehicle that has stayed inside this radius is "not moving". Wide enough to absorb GPS
// drift at a standstill, tight enough that crawling traffic still reads as movement.
// One tick's worth of unanswered travel. Higher than any real backlog should reach, low
// enough that a stuck queue cannot quietly spend a day's read budget before anyone notices.
const ASSIGNED_SCAN_LIMIT = 50;

// A page limits the size of each Firestore RPC; it is NOT a cap on Travels covered per tick.
const LIVE_PAGE_SIZE = 200;
const MONITOR_READ_WARNING_MS = 30_000;
const FLEET_CELL_DEG = 0.01;

const STILL_RADIUS_MI = 0.03; // ~48 metres

// How long a stop has to last before it is worth a word. Six minutes is a long light and a
// short problem.
const STILL_MIN = 6;

// Escalation. The operator gets four minutes to answer before the traveler is asked, and five
// more before a person is brought in.
const ASK_TRAVELER_AFTER_MIN = 5;
const OPEN_CASE_AFTER_MIN = 9;

// How close another vehicle has to be to be evidence about this one's road.
const NEARBY_MI = 0.6;
const CONGESTION_MIN_VEHICLES = 2;

// Telemetry older than this tells us nothing about now — a phone that has lost signal is not
// a car that has stopped, and must never be reported as one.
const STALE_MIN = 5;

// Deterministic urgent wording must be checked even if live GPS is missing.
const EMERGENCY_TERMS = /(unwell|not (feeling )?well|not ok|sick|hurt|injur|bleed|unconscious|help|ambulance|911|unsafe|danger|scared|threat|weapon|argu|fight|assault|harass|refus|collision|we (were|got) (in|hit)|hit us|rear.?ended)/i;

/** The stages of a travel where the vehicle is expected to be moving. */
const MOVING_STAGES = new Set(['accepted', 'onboard']);

const minutesSince = (t, now) => (now - Number(t || 0)) / 60000;

/**
 * One pass over everything underway.
 *
 * Returns a report. Never throws — it shares an interval with the scheduled-travel sweep and
 * must not be able to stop it.
 */
async function sweepMonitor({ now = Date.now() } = {}) {
  const db = adminDb();
  if (!db) return { ok: false, reason: adminStatus().reason, watching: 0 };

  const report = {
    ok: true, watching: 0, moving: 0, congestion: 0,
    asked: [], cases: [], emergencies: [], emergencyDeliveryFailures: [], reoffered: [],
  };

  let live;
  try {
    // The same ordered query pages to exhaustion: 501 or 8,001 active Travels must not make
    // the first 500 the only vehicles watched. A slow scan is loud in /health and Ops.
    live=[];
    let cursor=null;const started=Date.now();let pages=0;
    for (;;) {
      let query=db.collection('rides').where('status','in',['accepted','arrived','onboard'])
        .orderBy('__name__');
      if(cursor)query=query.startAfter(cursor);
      const snap=await query.limit(LIVE_PAGE_SIZE).get();
      pages++;
      live.push(...snap.docs.map((d)=>({id:d.id,...d.data()})));
      if(snap.docs.length<LIVE_PAGE_SIZE)break;
      cursor=snap.docs.at(-1).id;
    }
    report.activeReadPages=pages;
    report.activeReadMs=Date.now()-started;
    report.activeTravelsRead=live.length;
    if(report.activeReadMs>MONITOR_READ_WARNING_MS) {
      report.slowScan=true;
      report.reason=`Active Travel scan took ${report.activeReadMs}ms; add capacity before monitoring falls behind.`;
    }
  } catch (e) {
    return { ok: false, reason: `could not read travel underway: ${e.message}`, watching: 0 };
  }

  // Every vehicle we have a fresh position for, whatever stage it is at. This is the sensor.
  const fleetNow = live
    .filter((r) => Number.isFinite(r.opLat) && Number.isFinite(r.opLng))
    .filter((r) => minutesSince(r.opAt, now) <= STALE_MIN)
    .map((r) => ({
      id: r.id,
      lat: r.opLat,
      lng: r.opLng,
      stillMin: r.stillSince ? minutesSince(r.stillSince, now) : 0,
    }));
  const grid=new Map();
  for(const v of fleetNow) {
    const key=`${Math.floor(v.lat/FLEET_CELL_DEG)}:${Math.floor(v.lng/FLEET_CELL_DEG)}`;
    if(!grid.has(key))grid.set(key,[]);
    grid.get(key).push(v);
  }

  for (const ride of live) {
    // A vehicle waiting AT the pickup is doing its job by being stationary. Watching it would
    // generate a check-in on every travel where the traveler takes a moment to come down.
    if (!MOVING_STAGES.has(ride.status)) continue;
    const m = ride.monitor || {};
    // Safety takes precedence over inferred congestion and movement. A traffic
    // hypothesis must NEVER suppress an explicit request for help, and a
    // previously raised emergency must not be automatically erased because the
    // phone later reports movement. Review/closure is a separate authority.
    // An existing emergency is already on the emergency lane, but a merely
    // escalated non-emergency case MUST NOT suppress a later request for help.
    if (m.state === 'emergency') {
      report.activeEscalations = (report.activeEscalations || 0) + 1;
      continue;
    }
    if (m.travelerReply === 'help') {
      const caseNo = await openCase(db, ride, {
        now, why: 'The traveler explicitly requested emergency assistance.', urgent: true,
      });
      const delivery = await raiseEmergency(db, ride, {
        now, caseNo, note: 'The traveler asked for help.', from: 'traveler',
      });
      recordEmergencyDelivery(report, ride.id, caseNo, delivery);
      report.emergencies.push({ rideId: ride.id, caseNo, from: 'traveler' });
      continue;
    }

    // An Operator's explicit injury/threat report is urgent even if the car
    // has resumed motion or the phone stopped sending position updates.
    if (m.operatorReply && !m.operatorReplyReadAt && EMERGENCY_TERMS.test(String(m.operatorReply))) {
      const caseNo = await openCase(db, ride, {
        now, why: 'The Operator explicitly reported a safety problem: ' + String(m.operatorReply),
        urgent: true,
      });
      const delivery = await raiseEmergency(db, ride, {
        now, caseNo, note: 'The Operator reported a problem.', from: 'operator',
      });
      recordEmergencyDelivery(report, ride.id, caseNo, delivery);
      report.emergencies.push({ rideId: ride.id, caseNo, from: 'operator' });
      continue;
    }

    if (m.state === 'escalated') {
      report.activeEscalations = (report.activeEscalations || 0) + 1;
      continue;
    }

    if (!Number.isFinite(ride.opLat) || !Number.isFinite(ride.opLng)) continue;
    if (minutesSince(ride.opAt, now) > STALE_MIN) continue;

    report.watching++;

    // HOW LONG IT HAS BEEN STOPPED, decided here rather than taken on trust.
    //
    // The operator's phone reports `stillSince` because it sees a position every fifteen
    // seconds and this sweep sees one a minute. But the server keeps its own anchor — the
    // last place it actually watched the vehicle move — and resets the clock if the car has
    // left it. Both corrections can only ever SHORTEN the stationary period, so no phone can
    // make itself look stuck, and a phone that reports nothing still gets watched.
    const here = { lat: ride.opLat, lng: ride.opLng };
    const seen = ride.monitorSeen;
    let stillSince = Number(ride.stillSince) || 0;
    let movedSinceAnchor = false;
    if (seen && Number.isFinite(seen.lat) && Number.isFinite(seen.lng)) {
      movedSinceAnchor = distanceMiles(seen, here) > STILL_RADIUS_MI;
      if (movedSinceAnchor) stillSince = Math.max(stillSince, Number(ride.opAt) || now);
    } else {
      // First sight of this vehicle. It has not been stationary for any length of time we can
      // vouch for, so it has not been stationary.
      stillSince = Math.max(stillSince, Number(ride.opAt) || now);
      movedSinceAnchor = true;
    }
    if (movedSinceAnchor) {
      await write(db, ride.id, { monitorSeen: { lat: here.lat, lng: here.lng, at: now } });
    }

    const stillMin = minutesSince(stillSince, now);

    // ---- Moving again. Clear anything outstanding. ------------------------------------
    if (stillMin < STILL_MIN) {
      report.moving++;
      if (m.state && m.state !== 'clear') {
        // Every outstanding question is withdrawn, not left on the screen to be answered
        // about a delay that is over.
        await write(db, ride.id, {
          monitor: {
            state: 'clear',
            clearedAt: now,
            note: 'The vehicle is moving again.',
            caseNo: m.caseNo || null,
          },
        });
      }
      continue;
    }

    // ---- 1. Is it the road? -----------------------------------------------------------
    const latRadius=NEARBY_MI/68;
    const lngRadius=NEARBY_MI/(68*Math.max(0.05,Math.cos(ride.opLat*Math.PI/180)));
    const neighbours=[];
    for(let y=Math.floor((ride.opLat-latRadius)/FLEET_CELL_DEG);y<=Math.floor((ride.opLat+latRadius)/FLEET_CELL_DEG);y++) {
      for(let x=Math.floor((ride.opLng-lngRadius)/FLEET_CELL_DEG);x<=Math.floor((ride.opLng+lngRadius)/FLEET_CELL_DEG);x++) {
        for(const v of grid.get(`${y}:${x}`)||[]) {
          if(v.id!==ride.id&&distanceMiles(v,{lat:ride.opLat,lng:ride.opLng})<=NEARBY_MI)neighbours.push(v);
        }
      }
    }
    const alsoStopped = neighbours.filter((v) => v.stillMin >= STILL_MIN / 2).length;

    if (alsoStopped >= CONGESTION_MIN_VEHICLES && !(m.operatorReply && !m.operatorReplyReadAt)) {
      report.congestion++;
      // Reported to both, asked of neither. A delay with a known cause is information, not a
      // question — and this is the branch that stops the whole feature from crying wolf.
      if (m.state !== 'congestion') {
        await write(db, ride.id, {
          monitor: {
            state: 'congestion',
            since: stillSince,
            vehiclesStopped: alsoStopped + 1,
            note:
              `Traffic on this road: ${alsoStopped + 1} American Rider vehicles in this area ` +
              `are stopped.`,
            at: now,
          },
        });
      }
      continue;
    }

    // ---- The operator has answered. Read what they said. ------------------------------
    if (m.operatorReply && !m.operatorReplyReadAt) {
      const verdict = await readReply({
        reply: String(m.operatorReply),
        stillMin: Math.round(stillMin),
        stage: ride.status,
      });
      if (verdict.resolved) {
        await write(db, ride.id, {
          monitor: {
            ...m,
            state: 'explained',
            operatorReplyReadAt: now,
            note: verdict.note,
          },
        });
        continue;
      }
      // Not settled. Straight past the ladder — the operator has told us something is wrong,
      // which is a stronger signal than silence.
      const caseNo = await openCase(db, ride, {
        now,
        why: `The operator was asked why the vehicle was stopped and answered: "${m.operatorReply}"`,
        urgent: verdict.urgent,
      });
      if (verdict.urgent) {
        const delivery = await raiseEmergency(db, ride, { now, caseNo, note: verdict.note, from: 'operator' });
        recordEmergencyDelivery(report, ride.id, caseNo, delivery);
        report.emergencies.push({ rideId: ride.id, caseNo, from: 'operator' });
      } else {
        await write(db, ride.id, {
          monitor: { ...m, state: 'escalated', operatorReplyReadAt: now, caseNo, note: verdict.note },
        });
        report.cases.push({ rideId: ride.id, caseNo, why: 'operator reported a problem' });
      }
      continue;
    }

    // ---- 2. Ask the operator. ---------------------------------------------------------
    if (!m.askedOperatorAt) {
      await write(db, ride.id, {
        monitor: {
          state: 'asked_operator',
          since: stillSince,
          askedOperatorAt: now,
          stillMin: Math.round(stillMin),
          // The number, not "for a while". A question that states what it is about can be
          // answered; one that gestures at it has to be interpreted first.
          question:
            `Your vehicle has been stationary for ${Math.round(stillMin)} minutes. ` +
            `Is everything alright?`,
          at: now,
        },
      });
      await notify({
        uid: ride.operatorId,
        kind: 'check_in',
        title: 'American Rider check-in',
        body: `Your vehicle has been stationary for ${Math.round(stillMin)} minutes. Is everything alright?`,
        data: { screen: '/operator/trip', rideId: ride.id },
      });
      report.asked.push({ rideId: ride.id, who: 'operator' });
      continue;
    }

    // ---- 3. Ask the traveler. ---------------------------------------------------------
    const sinceAsked = minutesSince(m.askedOperatorAt, now);
    if (!m.askedTravelerAt && sinceAsked >= ASK_TRAVELER_AFTER_MIN && ride.status === 'onboard') {
      await write(db, ride.id, {
        monitor: {
          ...m,
          state: 'asked_traveler',
          askedTravelerAt: now,
          stillMin: Math.round(stillMin),
          travelerQuestion:
            `This travel has been stationary for ${Math.round(stillMin)} minutes. ` +
            `Is everything alright?`,
        },
      });
      await notify({
        uid: ride.travelerUid,
        kind: 'check_in',
        title: 'American Rider check-in',
        body: `Your travel has been stationary for ${Math.round(stillMin)} minutes. Is everything alright?`,
        data: { screen: '/ride', rideId: ride.id },
      });
      if (ride.party?.teen && ride.party?.guardianUid && String(ride.party.guardianUid) !== String(ride.travelerUid)) await notify({ uid: ride.party.guardianUid, kind:'guardian_travel', title:'Teen Travel check-in', body:`${ride.party.travelerName || 'The Teen Traveler'}'s Travel has been stationary and American Rider has started a check-in.`, data:{screen:'/family',rideId:ride.id,tripNo:ride.tripNo||''} });
            report.asked.push({ rideId: ride.id, who: 'traveler' });
      continue;
    }

    // A traveler who has said they are fine ends it. They are in the car; they know.
    if (m.travelerReply === 'ok') {
      if (m.state !== 'explained') {
        await write(db, ride.id, {
          monitor: { ...m, state: 'explained', note: 'The traveler confirmed all is well.' },
        });
      }
      continue;
    }

    // ---- 4. Bring in a person. --------------------------------------------------------
    if (!m.caseNo && (sinceAsked >= OPEN_CASE_AFTER_MIN || m.travelerReply === 'help')) {
      const asked = m.travelerReply === 'help';
      const caseNo = await openCase(db, ride, {
        now,
        why: asked
          ? 'The traveler asked for help from the check-in on the travel screen.'
          : `The vehicle has been stationary for ${Math.round(stillMin)} minutes and neither ` +
            `the operator nor the traveler answered.`,
        urgent: asked,
      });
      if (asked) {
        await raiseEmergency(db, ride, { now, caseNo, note: 'The traveler asked for help.', from: 'traveler' });
        report.emergencies.push({ rideId: ride.id, caseNo, from: 'traveler' });
      } else {
        await write(db, ride.id, { monitor: { ...m, state: 'escalated', caseNo, at: now } });
        report.cases.push({ rideId: ride.id, caseNo, why: 'no answer' });
      }
    }
  }

  return report;
}

/**
 * Read the operator's answer.
 *
 * The model's ONLY job is judgement on words a person actually wrote. It is given no
 * discretion over the facts and cannot report a position, a delay or a cause of its own.
 *
 * With no key, or on any failure, the deterministic reading below runs instead: an answer
 * that mentions the road settles it, and anything else does not. Erring towards "not settled"
 * is the safe direction — it costs a support case, not a traveler.
 */
async function readReply({ reply, stillMin, stage }) {
  const fallback = () => {
    // Ordered so trouble wins: "we were in a crash" must not be settled as "crash up ahead".
    // `trouble` is tested FIRST, which is what lets "accident" live in `road`: an accident up
    // ahead is traffic, an accident we were in is not, and only the order tells them apart.
    const road = /(traffic|jam|light|lights|bridge|closed|closure|construction|roadwork|detour|congest|backed up|drawbridge|train|accident|waiting|passenger|rider|fuel|gas|parking|park|delivery|truck|wrong turn|rain|storm|flood)/i;
    if (EMERGENCY_TERMS.test(reply)) {
      return { resolved: false, urgent: true, note: 'The operator reported a problem.' };
    }
    if (road.test(reply)) {
      return { resolved: true, urgent: false, note: `Delay explained by the operator: ${reply}` };
    }
    return { resolved: false, urgent: false, note: `The operator's answer needs review: ${reply}` };
  };

  // These words are an escalation floor, not a model suggestion. A paid classifier may
  // contextualize ordinary traffic, but may never dismiss a reported injury or threat.
  const deterministic = fallback();
  if (deterministic.urgent) return deterministic;

  const key = readKey('ANTHROPIC_API_KEY');
  if (!key) return fallback();

  try {
    const AnthropicPkg = require('@anthropic-ai/sdk');
    const Anthropic = AnthropicPkg.default ?? AnthropicPkg;
    const client = new Anthropic({ apiKey: key });
    const res = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 250,
      system:
        'You monitor journeys for a transportation company. An operator was asked why their ' +
        'vehicle had stopped during a passenger journey, and answered. Decide whether the ' +
        'answer settles the matter or whether it must go further.\n\n' +
        'Reply with JSON only: {"resolved":bool,"urgent":bool,"note":string}.\n\n' +
        'MOST STOPS ARE ORDINARY AND YOU SHOULD SETTLE THEM. Traffic, a light, a closure, a ' +
        'bridge, a train, roadworks, a detour, a wrong turn, waiting on the passenger, ' +
        'fuel, parking, a delivery vehicle in the way — resolved=true, and nobody is ' +
        'disturbed. A company that escalates ordinary delays trains everyone to ignore it.\n\n' +
        'urgent=true ONLY where a person may be unwell, injured, unsafe, threatened, or in ' +
        'conflict, or where the vehicle has been in a collision. This routes both phones to ' +
        'emergency services, so it must be the situation and not the wording: an operator ' +
        'saying "accident up ahead" is traffic, not an emergency.\n\n' +
        'resolved=false with urgent=false is for the genuinely unclear — a person reads it.\n\n' +
        'note: one plain sentence stating the reason. Institutional and precise. No ' +
        'reassurance, no exclamation marks, no invented detail. Never state a location, a ' +
        'delay or a cause the operator did not give you.',
      messages: [
        {
          role: 'user',
          content:
            `Stage: ${stage === 'onboard' ? 'carrying the traveler' : 'driving to the pickup'}\n` +
            `Stopped for: ${stillMin} minutes\n` +
            `Operator's answer: ${reply}`,
        },
      ],
    });
    const text = (res.content || []).map((c) => c.text || '').join('');
    const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    if (typeof parsed.resolved !== 'boolean') return fallback();
    return {
      resolved: parsed.resolved,
      urgent: !!parsed.urgent,
      note: String(parsed.note || '').slice(0, 300) || fallback().note,
    };
  } catch {
    return fallback();
  }
}

/**
 * THE EMERGENCY LANE — Chad, 23 Aug: "Let it go straight to nine one one."
 *
 * WHAT A PLATFORM CAN AND CANNOT DO HERE, honestly. There is no free, public way to dispatch
 * 911 from a server, and there should not be: 911 is routed by the caller's own location to
 * the right answering point, a dispatcher needs someone who can speak to the situation, and
 * knowingly causing a false dispatch is a crime in Florida. Relay services exist (Noonlight,
 * RapidSOS) and they are paid.
 *
 * So the fastest correct route to 911 is the phone that is AT the scene, and this puts it one
 * tap away rather than four:
 *   - both phones are pushed at the highest priority, which opens the emergency screen
 *   - that screen already holds Call 911, the vehicle, the plate, the operator and the
 *     position — everything a dispatcher asks for, on screen, to read out
 *   - the case is filed as an emergency with the last known position on it
 *   - the travel is marked so nothing else about it reads as routine
 *
 * WHAT IS NOT DONE, DELIBERATELY: no automatic call is placed. A platform that dials 911 on a
 * misread word sends police to a traveler who said the word "accident" about the traffic.
 */
function recordEmergencyDelivery(report, rideId, caseNo, delivery) {
  if (caseNo && delivery.recorded && delivery.notifications.every(Boolean)) return;
  report.ok = false;
  report.emergencyDeliveryFailures.push({
    rideId, caseFiled: !!caseNo, emergencyStored: !!delivery.recorded,
    travelerNotified: !!delivery.notifications[0],
    operatorNotified: !!delivery.notifications[1],
  });
}

async function raiseEmergency(db, ride, { now, caseNo, note, from }) {
  const recorded = await write(db, ride.id, {
    monitor: {
      state: 'emergency',
      caseNo: caseNo || null,
      note: note || null,
      raisedBy: from,
      raisedAt: now,
      // What the emergency screen shows and a dispatcher is told, captured at this instant
      // rather than looked up later when the vehicle has moved.
      position: { lat: ride.opLat ?? null, lng: ride.opLng ?? null, at: ride.opAt ?? now },
    },
  });

  const body = 'Open American Rider to call 911. Your location and vehicle details are on screen.';
  // BOTH PARTIES, whichever of them raised it. The one who did not raise it is the one who may
  // not know yet, and in the case where they cannot use their own phone the other can.
  // Always attempt both independently. A failed push for one party must not
  // prevent trying the other. Provider acceptance is not proof of delivery.
  const results = await Promise.allSettled([
    notify({
      uid: ride.travelerUid, kind: 'check_in', title: 'Emergency assistance', body,
      data: { screen: '/emergency', rideId: ride.id, tripNo: ride.tripNo || '', emergency: true },
    }),
    notify({
      uid: ride.operatorId, kind: 'check_in', title: 'Emergency assistance', body,
      data: { screen: '/emergency', rideId: ride.id, tripNo: ride.tripNo || '', emergency: true },
    }),
  ]);
  return {
    recorded, notifications: results.map(r =>
      r.status === 'fulfilled' && r.value?.ok === true),
  };
}

// A stable case per *incident*, not per ride forever. A new monitored episode
// after clearance gets a fresh case, while a quota-failed retry retains the
// same key. SHA keeps long/untrusted identifiers within the ticket key bound.
function monitorIncidentKey(ride, urgent) {
  const m = ride.monitor || {};
  const anchor = [m.clearedAt, m.askedOperatorAt, m.askedTravelerAt, ride.createdAt]
    .map(Number).find(v => Number.isSafeInteger(v) && v > 0) || 0;
  const digest = createHash('sha256').update(JSON.stringify([
    String(ride.id), urgent ? 'emergency' : 'support', anchor,
  ])).digest('hex').slice(0, 40);
  return `route-monitor-${digest}`;
}

async function openCase(db, ride, { now, why, urgent }) {
  try {
    const filed = await fileTicket({
      uid: ride.travelerUid,
      email: ride.travelerEmail || '',
      kind: urgent ? 'emergency' : 'support',
      // The ticket service already supports stable incident keys. Use it so a
      // failed monitor-state write/retry reuses the SAME case, rather than
      // opening another case for each one-minute safety sweep.
      idempotencyKey: monitorIncidentKey(ride, urgent),
      category: 'safety',
      reason: 'Route monitoring',
      // Support stores one structured Travel reference; a bare string makes
      // the emergency email incorrectly display 'no travel number'.
      trip: { no: ride.tripNo || null, dep: ride.dep || null, arr: ride.dest || null },
      description:
        `Route monitoring opened this case on travel ${ride.tripNo || '(no travel number)'}.\n` +
        `${why}\n` +
        `Stage: ${ride.status}. Operator: ${ride.operatorName || '—'} (${ride.operatorId || '—'}).\n` +
        `Last known position: ${ride.opLat}, ${ride.opLng} at ` +
        `${new Date(Number(ride.opAt) || now).toISOString()}.\n` +
        `Route: ${ride.dep || '—'} to ${ride.dest || '—'}.`,
    });
    return filed?.ok === true ? (filed.caseNo || null) : null;
  } catch {
    return null;
  }
}

async function write(db, rideId, fields) {
  try {
    await db.collection('rides').doc(rideId).set(fields, { merge: true });
    return true;
  } catch {
    // Ordinary notes are best-effort; emergency callers inspect this boolean.
    return false;
  }
}

/**
 * Travel that was dispatched and never answered.
 *
 * THE DEFECT THIS CLOSES, and it is the one that made the operator loop unusable. The request
 * sheet ran a fifteen-second countdown and declined itself at zero. That is right for an
 * operator looking at the screen and catastrophic for one with the phone in their pocket:
 * every travel dispatched to them was refused before they could know it existed, and the
 * traveler was passed from operator to operator by phones that had never been looked at.
 *
 * The countdown now runs only while the app is in the foreground. This is the other half:
 * a travel nobody has answered is RE-OFFERED to the next nearest operator, by the server,
 * after a window long enough to reach for a phone.
 *
 * It is also the backstop for the assignment notification — if POST /travel/announce never
 * arrived, the operator is told here instead, at most a minute late.
 */
const ANSWER_WINDOW_SEC = 45;

// A dispatch nobody answered in an hour is not going to be answered. Past this it is history,
// not a live request, and working it every sixty seconds forever is pointless.
//
// FOUND IN PRODUCTION, 23 Aug 2026. The first sweep against the real database reported
// `pending: 67` — sixty-seven travels left in 'assigned' from development, each one read,
// matched against the fleet and considered for re-offer on every tick. Nothing came of it
// only because those records carry no coordinates; had they carried any, real operators would
// have been sent journeys from weeks ago.
const STALE_ASSIGNMENT_MS = 60 * 60 * 1000;
// A cancelled pickup should not leave a Traveler seeking a car for an hour.
// A short, bounded replacement window uses the same scheduled sweep and refund backstop.
const WITHDRAWN_REPLACEMENT_MS = 5 * 60 * 1000;

async function sweepAssignments({ now = Date.now(), checkMarket } = {}) {
  const db = adminDb();
  if (!db) return { ok: false, reason: adminStatus().reason, pending: 0 };
  const out = { ok: true, pending: 0, notified: [], reoffered: [], stranded: [], expired: [], positionless: [] };
  const liveMoney = String(readKey('DEPLOYMENT_MODE') || '').toLowerCase() === 'production' ||
    /^(sk|rk)_live_/.test(readKey('STRIPE_SECRET_KEY') || '');

  let rows;
  try {
    // BOUNDED. Firestore bills per document RETURNED, and this query runs every 60 seconds —
    // 1,440 times a day — so each unanswered travel it matches costs 1,440 reads a day for as
    // long as it sits there. The 67 stale 'assigned' records found on 28 Aug were therefore
    // costing ~96,000 reads a day on their own, against a 50,000/day allowance, for travel
    // nobody was waiting on. That is what exhausted the quota, not anybody using the app.
    //
    // The expiry below is the real cure and it now runs; this limit is the guard that stops a
    // backlog ever being able to do it again while nobody is looking.
    const snap = await db
      .collection('rides')
      .where('status', '==', 'assigned')
      .limit(ASSIGNED_SCAN_LIMIT)
      .get();
    rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    return { ok: false, reason: e.message, pending: 0 };
  }

  for (const ride of rows) {
    const age = now - (Number(ride.createdAt) || now);

    // A withdrawn accepted pickup gets five minutes for safe reassignment, not the
    // ordinary one-hour never-answered window. It remains the SAME paid Travel.
    // Keep the original five-minute deadline even if the sweep already offered
    // this same Travel to another Operator who has not ACCEPTED it yet.
    // A new offer is not a completed replacement and must not restart the clock.
    const withdrawnAt = Number.isSafeInteger(ride.operatorWithdrawalAt) &&
      ride.operatorWithdrawalAt > 0 && ride.operatorWithdrawalAt <= now
      ? ride.operatorWithdrawalAt : null;
    const expired = withdrawnAt
      ? now - withdrawnAt >= WITHDRAWN_REPLACEMENT_MS
      : age > STALE_ASSIGNMENT_MS;
    // Keep history, release held funds or refund the original captured payment
    // through the existing idempotent recovery path, never a second charge.
    if (expired) {
      if (!ride.staleAt) {
        const ref = db.collection('rides').doc(ride.id);
        const closed = await db.runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          if (!snap.exists || snap.data().status !== 'assigned') return false;
          const current = snap.data();
          const opRef = current.operatorId ? db.collection('operators').doc(String(current.operatorId)) : null;
          if (opRef) {
            const opSnap = await tx.get(opRef);
            if (opSnap.exists && String(opSnap.data().currentRideId || '') === ride.id) {
              tx.update(opRef, { currentRideId: null, reservedAt: null });
            }
          }
          tx.update(ref, { status: current.paymentIntentId ? 'cancelled' : 'expired',
            cancelledFrom: current.status, staleAt: now, unanswered: true,
            refundPending: !!current.paymentIntentId });
          return true;
        });
        if (closed) {
          out.expired.push(ride.id);
          if (withdrawnAt) {
            const notice = {
              kind: 'operator_unavailable', title: 'Travel cancelled',
              body: 'No replacement Operator was available. Your Travel has been cancelled. Any card hold will be released or any settled charge refunded.',
              data: { screen: '/ride', rideId: ride.id, tripNo: ride.tripNo || '' },
            };
            try {
              await notify({ ...notice, uid: ride.travelerUid });
              if (ride.party?.teen && ride.party?.guardianUid &&
                  String(ride.party.guardianUid) !== String(ride.travelerUid))
                await notify({ ...notice, uid: ride.party.guardianUid,
                  data: { ...notice.data, screen: '/family' } });
            } catch { /* A notification outage must never undo cancellation or money recovery. */ }
          }
        }
      }
      continue;
    }

    const since = (now - (Number(ride.offeredAt) || Number(ride.createdAt) || now)) / 1000;
    out.pending++;

    // Never reoffer a payment-less or reversed new booking. Legacy assigned records must be
    // reconciled separately rather than treated as proof of a successful charge.
    if (ride.paymentFailed || ride.chargeFailed || !ride.paymentIntentId) {
      out.stranded.push(ride.id);
      continue;
    }

    if (liveMoney) {
      let active = false;
      try {
        active = typeof checkMarket === 'function' &&
          (await checkMarket({ lat: Number(ride.pickupLat), lng: Number(ride.pickupLng) })) === 'active';
      } catch { /* Market admission is not inferred from stale geography on provider failure. */ }
      if (!active) { out.stranded.push(ride.id); continue; }
    }

    // RELEASED BY POST /travel/accept: the operator it was offered to is no longer eligible.
    // Neither notified nor given the answer window — it goes straight to somebody else.
    if (!ride.notifiedOperatorAt && !ride.releasedAt) {
      const operatorNotice = await notify({
        uid: ride.operatorId,
        kind: 'travel_assigned',
        title: 'Travel assigned',
        body: `${ride.dep || 'Pickup'} to ${ride.dest || 'destination'}. Open to accept.`,
        data: { screen: '/operator', rideId: ride.id, tripNo: ride.tripNo || '' },
      });
      if (operatorNotice?.ok === true) {
        await write(db, ride.id, { notifiedOperatorAt: now });
        out.notified.push(ride.id);
        continue; // an accepted notification gets its ordinary answer window
      }
      // If the device or Expo rejects the notice, do not claim it was delivered.
      // Before the normal answer deadline the Operator can still see the assigned
      // Travel in their live inbox. Afterwards, fall through to re-offer the SAME
      // paid Travel. Never retry a nonexistent push token forever at this gate.
    }

    if (since < ANSWER_WINDOW_SEC && !ride.releasedAt) continue;

    // Unanswered. Find somebody else, excluding everyone who has already had it.
    const declined = Array.isArray(ride.declinedBy) ? ride.declinedBy : [];
    const exclude = new Set([...declined, ride.operatorId]);
    const pickup = { lat: Number(ride.pickupLat), lng: Number(ride.pickupLng) };
    const from = Number.isFinite(pickup.lat)
      ? pickup
      : { lat: Number(ride.opLat), lng: Number(ride.opLng) };
    if (!Number.isFinite(from.lat)) {
      out.positionless.push(ride.id);
      continue;
    }

    let fleet = [];
    try {
      fleet = (await nearbyOperatorCandidates(db, from, { excludeIds: exclude }))
        .filter((o) => !coverageLapsed(o));
    } catch {
      continue;
    }

    // Matching is a candidate filter, not qualification authority. Re-offer candidates are
    // revalidated against their current user record and Stripe payout state before the Traveler
    // is told a new Operator has been assigned.
    let next = null;
    let candidates = [...fleet];
    while (candidates.length) {
      const candidate = matchOperator(candidates, from, ride.travelClass || 'Standard', { requireScreening: screeningReady() });
      if (!candidate) break;
      try {
        const uid = String(candidate.operator.id);
        const userSnap = await db.collection('users').doc(uid).get();
        const user = userSnap.exists ? userSnap.data() : null;
        const payout = await connectAccountStatus(user?.stripeAccountId || null);
        const a = assessOperator({
          user,
          fleet: candidate.operator,
          context: 'accept',
          liveMoney: true,
          account: { disabled: false },
          payouts: { enabled: !!payout.payoutsEnabled },
          now,
        });
        if (a.eligible) { next = candidate; break; }
        await db.collection('operators').doc(uid).set(
          { available: false, offDutyReason: a.blockers[0]?.code || 'ineligible', offDutyAt: now },
          { merge: true },
        );
      } catch {
        // An unverifiable Operator is not a safe re-offer candidate.
      }
      candidates = candidates.filter((o) => String(o.id) !== String(candidate.operator.id));
    }
    if (!next) {
      // No replacement yet. Re-run dispatch eligibility on every tick, but never
      // rewrite the SAME stranded marker every minute; this is a costly indexed
      // Firestore write and not needed to preserve owed-money or safety state.
      // An old record without a timestamp is repaired once.
      if (shouldRecordUnanswered(ride)) {
        await write(db, ride.id, { unanswered: true, unansweredAt: now });
      }
      out.stranded.push(ride.id);
      continue;
    }

    try {
      const payment = await verifiedTravelPayment(ride.paymentIntentId);
      if (!paymentMatches(ride, payment, ride.travelerUid, ride.id)) {
        out.stranded.push(ride.id);
        continue;
      }
      // Mark unanswered offers released without overwriting an acceptance or cancellation.
      const ref = db.collection('rides').doc(ride.id);
      const marked = await db.runTransaction(async (tx) => {
        const current = await tx.get(ref);
        if (!current.exists || current.data().status !== 'assigned' ||
            String(current.data().operatorId) !== String(ride.operatorId)) return false;
        if (!current.data().releasedAt) tx.update(ref, { releasedAt: now, releasedReason: 'answer_timeout' });
        return true;
      });
      if (!marked) continue;
      const result = await assignPaidTravel({ db, uid: ride.travelerUid, rideId: ride.id,
        payment, candidate: next, now, requireScreening: screeningReady() });
      if (result.status === 200 && !result.body.reused) out.reoffered.push({ rideId: ride.id, to: next.operator.name });
      else if (result.status !== 200) out.stranded.push(ride.id);
    } catch {
      // Do not create another Travel or claim the offer succeeded after a provider/DB error.
      out.stranded.push(ride.id);
    }
  }

  return out;
}

module.exports = {
  sweepMonitor,
  sweepAssignments,
  WITHDRAWN_REPLACEMENT_MS,
  readReply,
  STILL_MIN,
  STILL_RADIUS_MI,
  ASK_TRAVELER_AFTER_MIN,
  OPEN_CASE_AFTER_MIN,
  NEARBY_MI,
};
