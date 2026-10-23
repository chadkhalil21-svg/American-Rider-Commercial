const path = require('path');
const { DISCLOSURE_VERSION } = require('./disclosure');
const ROOT = __dirname;
const MIN = 60 * 1000;

function makeDb(seed) {
  const data = JSON.parse(JSON.stringify(seed));
  const db = {
    __data: data,
    collection: (col) => ({
      doc: (id) => ({
        __col: col, __id: id,
        async get() { const d = data[col]?.[id]; return { exists: !!d, id, data: () => JSON.parse(JSON.stringify(d)) }; },
        async set(f, o) { data[col] = data[col] || {}; data[col][id] = o?.merge ? { ...(data[col][id] || {}), ...f } : { ...f }; },
        async update(f) { data[col][id] = { ...data[col][id], ...f }; },
      }),
      where: (field, op, val) => {
        const rowsFor = () =>
          Object.entries(data[col] || {}).filter(([, r]) =>
            op === 'in' ? val.includes(r[field]) : r[field] === val);
        const snap = (rows) => ({
          docs: rows.map(([id, r]) => ({ id, data: () => JSON.parse(JSON.stringify(r)) })),
        });
        // `limit` HONOURS THE BOUND rather than ignoring it. A double that accepts .limit(n)
        // and returns everything anyway would let an unbounded scan pass its own test — which
        // is exactly the read bill that exhausted the quota on 30 Aug 2026.
        let cursor = null, limit = Infinity, ordered = false;
        const query = {
          orderBy(field) { ordered = field === '__name__'; return query; },
          startAfter(id) { cursor = id; return query; },
          limit(n) { limit = n; return query; },
          async get() {
            let rows = rowsFor();
            if (ordered) rows.sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0);
            if (cursor) rows = rows.filter(([id]) => id > cursor);
            return snap(rows.slice(0, limit));
          },
        };
        return query;
      },
      // sweepAssignments lists the whole operator collection to find a replacement.
      async get() {
        return { docs: Object.entries(data[col] || {})
          .map(([id, r]) => ({ id, data: () => JSON.parse(JSON.stringify(r)) })) };
      },
    }),
    runTransaction: (fn) => fn({
      get: (ref) => ref.get(),
      update: (ref, fields) => { data[ref.__col][ref.__id] = { ...data[ref.__col][ref.__id], ...fields }; },
    }),
  };
  return { db, data };
}

const tickets = [];
function inject(dbHandle, { aiKey = false, caseFails = false, pushFails = [], pushResults = {} } = {}) {
  for (const [rel, exports] of [
    ['./firebase-admin.js', { adminDb: () => dbHandle, adminStatus: () => ({ ok: true, reason: null }) }],
    ['./tickets.js', { fileTicket: async (t) => { if (caseFails) return { ok:false }; tickets.push(t); return { ok:true, caseNo: `AR-C${tickets.length}` }; } }],
    ['./env.js', { readKey: (k) => (k === 'ANTHROPIC_API_KEY' && aiKey ? 'fake' : '') }],
    ['./push.js', { notify: async ({ uid }) => Object.prototype.hasOwnProperty.call(pushResults, uid)
      ? pushResults[uid] : { ok: !pushFails.includes(uid) } }],
  ]) {
    const p = require.resolve(path.join(ROOT, rel));
    require.cache[p] = { id: p, filename: p, loaded: true, exports, children: [], paths: [] };
  }
  // Re-offer dispatch uses the production bounded-geographic candidate authority. Stub only
  // its storage query here; qualification remains real and fail-closed below.
  const gp = require.resolve(path.join(ROOT, './geooperators.js'));
  const realGeo = require(gp);
  require.cache[gp] = { id: gp, filename: gp, loaded: true, exports: {
    ...realGeo,
    nearbyOperatorCandidates: async (_db, _point, { excludeIds = new Set() } = {}) =>
      Object.entries(dbHandle.__data?.operators || {}).filter(([id]) => !excludeIds.has(id)).map(([id, o]) => ({ id, ...o })),
  }, children: [], paths: [] };
    delete require.cache[require.resolve(path.join(ROOT, 'monitor.js'))];
  return require(path.join(ROOT, 'monitor.js'));
}

const now = Date.now();
// Two points ~0.2 mi apart, and one ~2 mi away.
const P = { lat: 25.7617, lng: -80.1918 };
const NEAR = { lat: 25.7645, lng: -80.1918 };
const NEAR2 = { lat: 25.7590, lng: -80.1918 };
const FAR = { lat: 25.80, lng: -80.25 };

const ride = (o = {}) => ({
  travelerUid: 'u1', travelerName: 'A. Smith', tripNo: 'AR-2048-MIA',
  operatorId: 'op1', operatorName: 'N. Operator', dep: 'Brickell', dest: 'South Beach',
  status: 'onboard', opLat: P.lat, opLng: P.lng, opAt: now - 20 * 1000,
  // The anchor the monitor last watched it move at — same place = it has not moved.
  monitorSeen: { lat: P.lat, lng: P.lng, at: now - 12 * MIN },
  stillSince: now - 12 * MIN, ...o,
});

const results = [];
const check = (l, c, d) => results.push({ l, ok: !!c, d });

(async () => {
  // Critical priority regression: an explicit safety request outranks the
  // inference that a cluster of slow cars must be ordinary congestion.
  const nearbyStopped=(p,operatorId,travelerUid) => ride({
    opLat:p.lat, opLng:p.lng, operatorId, travelerUid,
    monitorSeen:{lat:p.lat,lng:p.lng,at:now-12*MIN},
  });
  {
    tickets.length=0;
    const h=makeDb({rides:{
      r1:ride({monitor:{state:'asked_traveler',askedOperatorAt:now-6*MIN,
        askedTravelerAt:now-2*MIN,travelerReply:'help'}}),
      r2:nearbyStopped(NEAR,'op2','u2'),r3:nearbyStopped(NEAR2,'op3','u3'),
    }});
    const report=await inject(h.db).sweepMonitor({now});
    check('explicit Traveler emergency is never classified as traffic',
      h.data.rides.r1.monitor.state==='emergency' &&
      report.emergencies.some(x=>x.rideId==='r1') &&
      tickets.filter(t=>t.kind==='emergency').length===1,
      JSON.stringify(report));
  }
  {
    tickets.length=0;
    const h=makeDb({rides:{
      r1:ride({monitor:{state:'asked_operator',askedOperatorAt:now-2*MIN,
        operatorReply:'Passenger is hurt and needs ambulance'}}),
      r2:nearbyStopped(NEAR,'op2','u2'),r3:nearbyStopped(NEAR2,'op3','u3'),
    }});
    const report=await inject(h.db).sweepMonitor({now});
    check('operator emergency outranks congestion inference',
      h.data.rides.r1.monitor.state==='emergency' &&
      report.emergencies.some(x=>x.rideId==='r1'), JSON.stringify(report));
  }
  {
    tickets.length=0;
    const h=makeDb({rides:{r1:ride({stillSince:now-15*1000,
      monitor:{state:'emergency',caseNo:'AR-E-1',raisedAt:now-2*MIN}})}});
    const report=await inject(h.db).sweepMonitor({now});
    check('movement never automatically closes an existing emergency',
      h.data.rides.r1.monitor.state==='emergency' &&
      h.data.rides.r1.monitor.caseNo==='AR-E-1' &&
      tickets.length===0 && report.activeEscalations===1,
      JSON.stringify(report));
  }
  {
    tickets.length=0;
    const h=makeDb({rides:{r1:ride({stillSince:now-20000,
      monitor:{travelerReply:'help'}})}});
    const report=await inject(h.db).sweepMonitor({now});
    check('Traveler help gets immediate emergency treatment even before stop timer',
      h.data.rides.r1.monitor.state==='emergency' &&
      report.emergencies.length===1,JSON.stringify(report));
  }
  {
    tickets.length=0;
    const h=makeDb({rides:{r1:ride({monitor:{travelerReply:'help'}})}});
    const report=await inject(h.db,{caseFails:true}).sweepMonitor({now});
    check('failed emergency case filing is reported, not claimed successful',
      report.ok===false && report.emergencyDeliveryFailures.length===1 &&
      report.emergencyDeliveryFailures[0].caseFiled===false &&
      h.data.rides.r1.monitor.state==='emergency',JSON.stringify(report));
  }
  {
    tickets.length=0;
    const h=makeDb({rides:{r1:ride({monitor:{travelerReply:'help'}})}});
    const report=await inject(h.db,{pushFails:['u1']}).sweepMonitor({now});
    check('failed Traveler emergency push does not prevent Operator notification',
      report.ok===false && report.emergencyDeliveryFailures.length===1 &&
      report.emergencyDeliveryFailures[0].travelerNotified===false &&
      report.emergencyDeliveryFailures[0].operatorNotified===true &&
      report.emergencyDeliveryFailures[0].caseFiled===true,JSON.stringify(report));
  }
  // A fulfilled promise without an explicit {ok:true} is NOT a verified
  // push acceptance. Expo's actual device delivery still requires receipts.
  for (const ambiguous of [undefined, null, {}, {ok:null}, {ok:0}]) {
    tickets.length=0;
    const h=makeDb({rides:{r1:ride({monitor:{travelerReply:'help'}})}});
    const result=await inject(h.db,{pushResults:{u1:ambiguous}}).sweepMonitor({now});
    check('ambiguous emergency push never counts as successful delivery',
      result.ok===false && result.emergencyDeliveryFailures.length===1 &&
      result.emergencyDeliveryFailures[0].travelerNotified===false &&
      result.emergencyDeliveryFailures[0].operatorNotified===true &&
      h.data.rides.r1.monitor.state==='emergency',JSON.stringify(result));
  }
  {
    tickets.length=0;
    const h=makeDb({rides:{r1:ride({monitor:{
      state:'escalated',caseNo:'AR-PREVIOUS-SUPPORT',
      askedOperatorAt:now-5*MIN,travelerReply:'help',
    }})}});
    const result=await inject(h.db).sweepMonitor({now});
    check('new Traveler emergency overrides earlier nonurgent escalation',
      h.data.rides.r1.monitor.state==='emergency' &&
      result.emergencies.length===1 && tickets.length===1 &&
      tickets[0].kind==='emergency',JSON.stringify(result));
  }
  {
    tickets.length=0;
    const h=makeDb({rides:{r1:ride({monitor:{
      state:'escalated',caseNo:'AR-PREVIOUS-SUPPORT',
      askedOperatorAt:now-5*MIN,operatorReply:'Traveler is hurt, needs emergency help',
    }})}});
    const result=await inject(h.db).sweepMonitor({now});
    check('new Operator emergency overrides earlier nonurgent escalation',
      h.data.rides.r1.monitor.state==='emergency' &&
      result.emergencies.some(x=>x.from==='operator') &&
      tickets.length===1,JSON.stringify(result));
  }
  {
    tickets.length=0;
    const h=makeDb({rides:{r1:ride({monitor:{
      state:'emergency',caseNo:'AR-EXISTING',travelerReply:'help',
    }})}});
    const result=await inject(h.db).sweepMonitor({now});
    check('already active emergency is not repeatedly opened',
      result.activeEscalations===1 && tickets.length===0 &&
      h.data.rides.r1.monitor.caseNo==='AR-EXISTING',JSON.stringify(result));
  }
  {
    tickets.length=0;
    const h=makeDb({rides:{r1:ride({monitor:{
      state:'asked_traveler',askedOperatorAt:now-5*MIN,
      travelerReply:'help',
    }})}});
    const service=inject(h.db);
    const first=await service.sweepMonitor({now});
    const firstKey=tickets[0]?.idempotencyKey;
    // Simulate an authorized review clearing the earlier emergency, followed
    // by a genuinely new request on the same Travel.
    h.data.rides.r1.monitor={
      state:'clear',clearedAt:now+5*MIN,travelerReply:'help',
    };
    const second=await service.sweepMonitor({now:now+6*MIN});
    const secondKey=tickets[1]?.idempotencyKey;
    check('new incident after documented clearance receives a new case key',
      first.emergencies.length===1 && second.emergencies.length===1 &&
      typeof firstKey==='string' && typeof secondKey==='string' &&
      firstKey!==secondKey && firstKey.length<=100 &&
      secondKey.length<=100,JSON.stringify({firstKey,secondKey}));
  }
  // Safety emergency messages must not depend on availability of GPS.
  {
    tickets.length=0;
    const h=makeDb({rides:{r1:ride({opAt:now-30*MIN,
      monitor:{travelerReply:'help'}})}});
    const rep=await inject(h.db).sweepMonitor({now});
    check('stale GPS cannot suppress explicit Traveler help',
      h.data.rides.r1.monitor.state==='emergency' &&
      rep.emergencies.length===1 && rep.watching===0,JSON.stringify(rep));
  }
  {
    tickets.length=0;
    const h=makeDb({rides:{r1:ride({opLat:undefined,opLng:undefined,
      monitor:{travelerReply:'help'}})}});
    const rep=await inject(h.db).sweepMonitor({now});
    check('missing GPS cannot suppress explicit Traveler help',
      h.data.rides.r1.monitor.state==='emergency' &&
      rep.emergencies.length===1,JSON.stringify(rep));
  }
  {
    tickets.length=0;
    const h=makeDb({rides:{r1:ride({stillSince:now-20*1000,opAt:now-30*MIN,
      monitor:{operatorReply:'Passenger is injured, needs ambulance'}})}});
    const rep=await inject(h.db).sweepMonitor({now});
    check('urgent Operator warning is independent of GPS and stop timer',
      h.data.rides.r1.monitor.state==='emergency' &&
      rep.emergencies.some(x=>x.from==='operator'),JSON.stringify(rep));
  }
  {
    tickets.length=0;
    const h=makeDb({rides:{r1:ride({monitor:{travelerReply:'help'}})}});
    const originalCollection=h.db.collection;
    h.db.collection=(name)=>{
      const c=originalCollection(name);
      if(name==='rides'){
        const d=c.doc;
        c.doc=(id)=>{
          const doc=d(id), originalSet=doc.set;
          doc.set=async (fields,options)=>{
            if(fields?.monitor?.state==='emergency') throw new Error('synthetic database quota exhausted');
            return originalSet(fields,options);
          };
          return doc;
        };
      }
      return c;
    };
    const rep=await inject(h.db).sweepMonitor({now});
    check('emergency Firestore persistence failure is reported as degraded',
      rep.ok===false && rep.emergencyDeliveryFailures.length===1 &&
      rep.emergencyDeliveryFailures[0].emergencyStored===false &&
      rep.emergencyDeliveryFailures[0].caseFiled===true,JSON.stringify(rep));
  }
  // 10k active Travels: page EVERY active ride, not only first 200/500.
  {
    const many={};
    for(let i=0;i<10000;i++)many['scale'+String(i).padStart(5,'0')]=
      ride({status:'onboard',operatorId:'op'+i,travelerUid:'u'+i,
        stillSince:now-1000,monitorSeen:{lat:P.lat,lng:P.lng,at:now-1000}});
    const h=makeDb({rides:many});
    const rep=await inject(h.db).sweepMonitor({now});
    check('10k simultaneous synthetic active Travels are all paginated',
      rep.activeTravelsRead===10000 && rep.activeReadPages===51 &&
      rep.watching===10000 && rep.emergencies.length===0,
      JSON.stringify({read:rep.activeTravelsRead,pages:rep.activeReadPages,watching:rep.watching}));
  }
  // The monitor must use the ticket service's stable incident identity.
  // During a quota write failure, a second tick may redrive the same incident.
  // Resend and ticket storage can deduplicate only if the key is unchanged.
  {
    tickets.length=0;
    const h=makeDb({rides:{r1:ride({monitor:{travelerReply:'help'}})}});
    const originalCollection=h.db.collection;
    h.db.collection=(name)=>{
      const c=originalCollection(name);
      if(name==='rides'){
        const baseDoc=c.doc;
        c.doc=id=>{
          const d=baseDoc(id);
          d.set=async f=>{if(f?.monitor?.state==='emergency')throw Error('synthetic exhausted quota');};
          return d;
        };
      }
      return c;
    };
    const instance=inject(h.db);
    const p1=await instance.sweepMonitor({now});
    const p2=await instance.sweepMonitor({now:now+MIN});
    check('two emergency redrives keep the same incident idempotency key',
      p1.ok===false&&p2.ok===false&&tickets.length===2&&
      typeof tickets[0].idempotencyKey==='string'&&
      tickets[0].idempotencyKey===tickets[1].idempotencyKey&&
      tickets[0].category==='safety'&&tickets[1].kind==='emergency',
      JSON.stringify(tickets.map(t=>({key:t.idempotencyKey,kind:t.kind}))));
  }
  // 1. Moving normally: nothing said.
  {
    const h = makeDb({ rides: { r1: ride({ stillSince: now - 30 * 1000, monitorSeen: { lat: FAR.lat, lng: FAR.lng, at: now - MIN } }) } });
    const rep = await inject(h.db).sweepMonitor({ now });
    check('moving: no question asked', rep.asked.length === 0 && rep.moving === 1, JSON.stringify(rep));
  }

  // 2. Waiting AT the pickup is not an anomaly.
  {
    const h = makeDb({ rides: { r1: ride({ status: 'arrived' }) } });
    const rep = await inject(h.db).sweepMonitor({ now });
    check('stationary at pickup: not watched', rep.watching === 0 && rep.asked.length === 0, JSON.stringify(rep));
  }

  // 3. Stale telemetry is not a stopped car.
  {
    const h = makeDb({ rides: { r1: ride({ opAt: now - 30 * MIN }) } });
    const rep = await inject(h.db).sweepMonitor({ now });
    check('lost signal: not reported as stopped', rep.watching === 0, JSON.stringify(rep));
  }

  // 4. Stopped alone: the OPERATOR is asked, not the traveler.
  {
    const h = makeDb({ rides: { r1: ride() } });
    const rep = await inject(h.db).sweepMonitor({ now });
    const m = h.data.rides.r1.monitor;
    check('stopped alone: the operator is asked first',
      m.state === 'asked_operator' && rep.asked[0].who === 'operator', m?.state);
    check('  the traveler is NOT asked yet', !m.askedTravelerAt, m?.askedTravelerAt);
  }

  // 5. Three vehicles stopped in the same area: traffic. Nobody is asked.
  {
    const h = makeDb({ rides: {
      r1: ride(),
      // Each one's anchor is at its OWN position — all three genuinely sitting still.
      r2: ride({ opLat: NEAR.lat, opLng: NEAR.lng, operatorId: 'op2', travelerUid: 'u2',
        monitorSeen: { lat: NEAR.lat, lng: NEAR.lng, at: now - 12 * MIN } }),
      r3: ride({ opLat: NEAR2.lat, opLng: NEAR2.lng, operatorId: 'op3', travelerUid: 'u3',
        monitorSeen: { lat: NEAR2.lat, lng: NEAR2.lng, at: now - 12 * MIN } }),
    } });
    const rep = await inject(h.db).sweepMonitor({ now });
    check('three stopped nearby: read as traffic, nobody asked',
      rep.congestion === 3 && rep.asked.length === 0, JSON.stringify({ c: rep.congestion, a: rep.asked }));
    check('  and both parties are TOLD what the delay is',
      /vehicles in this area/.test(h.data.rides.r1.monitor.note), h.data.rides.r1.monitor.note);
  }

  // 5b. Both 0.59-mile neighboring vehicles count near a high-latitude cell edge.
  {
    const center={lat:47.61,lng:-122.33};
    const edgeLat={lat:center.lat+0.00853908,lng:center.lng};
    const edgeLng={lat:center.lat,lng:center.lng+0.01266599};
    const stopped=(p,op)=>ride({operatorId:op,opLat:p.lat,opLng:p.lng,
      monitorSeen:{lat:p.lat,lng:p.lng,at:now-12*MIN}});
    const h=makeDb({rides:{r1:stopped(center,'op1'),r2:stopped(edgeLat,'op2'),r3:stopped(edgeLng,'op3')}});
    const rep=await inject(h.db).sweepMonitor({now});
    check('regional spatial buckets keep 0.59-mile boundary neighbors visible',
      rep.congestion>=1&&h.data.rides.r1.monitor.state==='congestion',
      JSON.stringify({congestion:rep.congestion,state:h.data.rides.r1.monitor.state}));
  }

  // 6. One stopped, two moving nearby: NOT traffic — this one is asked.
  {
    const h = makeDb({ rides: {
      r1: ride(),
      r2: ride({ opLat: NEAR.lat, opLng: NEAR.lng, operatorId: 'op2', travelerUid: 'u2', stillSince: now - 10 * 1000 }),
      r3: ride({ opLat: NEAR2.lat, opLng: NEAR2.lng, operatorId: 'op3', travelerUid: 'u3', stillSince: now - 10 * 1000 }),
    } });
    const rep = await inject(h.db).sweepMonitor({ now });
    check('one stopped while others move: asked, not excused as traffic',
      rep.congestion === 0 && h.data.rides.r1.monitor.state === 'asked_operator',
      h.data.rides.r1.monitor.state);
  }

  // 7. The operator explains it: settled, no case.
  {
    tickets.length = 0; // isolate this expectation from preceding emergency fixtures
    const h = makeDb({ rides: { r1: ride({ monitor: { state: 'asked_operator', askedOperatorAt: now - 2 * MIN, operatorReply: 'Drawbridge is up on Venetian.' } }) } });
    await inject(h.db).sweepMonitor({ now });
    check('operator explains a road cause: settled',
      h.data.rides.r1.monitor.state === 'explained' && tickets.length === 0,
      h.data.rides.r1.monitor.state);
  }

  // 8. The operator reports a problem: straight to a person, marked urgent.
  {
    tickets.length = 0;
    const h = makeDb({ rides: { r1: ride({ monitor: { state: 'asked_operator', askedOperatorAt: now - 2 * MIN, operatorReply: 'The passenger seems unwell and is not answering me.' } }) } });
    await inject(h.db).sweepMonitor({ now });
    const mon = h.data.rides.r1.monitor;
    check('operator reports a problem: straight to the emergency lane',
      mon.state === 'emergency' && tickets.length === 1, mon.state);
    check('  the case is an emergency, with the position on it',
      tickets[0].kind === 'emergency' && /Last known position/.test(tickets[0].description), tickets[0]?.kind);
    check('  the position is frozen on the record for a dispatcher',
      mon.position && mon.position.lat === P.lat, JSON.stringify(mon.position));
    check('  and it records who raised it', mon.raisedBy === 'operator', mon.raisedBy);
  }

  // 9. Operator silent for four minutes: NOW the traveler is asked.
  {
    tickets.length = 0;
    const h = makeDb({ rides: { r1: ride({ monitor: { state: 'asked_operator', askedOperatorAt: now - 5 * MIN } }) } });
    const rep = await inject(h.db).sweepMonitor({ now });
    check('operator silent: the traveler is asked',
      h.data.rides.r1.monitor.state === 'asked_traveler' && rep.asked[0].who === 'traveler',
      h.data.rides.r1.monitor.state);
  }

  // 10. The traveler says they are fine: it ends there.
  {
    tickets.length = 0;
    const h = makeDb({ rides: { r1: ride({ monitor: { state: 'asked_traveler', askedOperatorAt: now - 12 * MIN, askedTravelerAt: now - 6 * MIN, travelerReply: 'ok' } }) } });
    await inject(h.db).sweepMonitor({ now });
    check('traveler says all is well: no case opened',
      h.data.rides.r1.monitor.state === 'explained' && tickets.length === 0,
      h.data.rides.r1.monitor.state);
  }

  // 11. The traveler asks for help: emergency lane at once.
  {
    tickets.length = 0;
    const h = makeDb({ rides: { r1: ride({ monitor: { state: 'asked_traveler', askedOperatorAt: now - 5 * MIN, askedTravelerAt: now - 1 * MIN, travelerReply: 'help' } }) } });
    const rep = await inject(h.db).sweepMonitor({ now });
    check('traveler asks for help: emergency lane at once',
      tickets.length === 1 && tickets[0].kind === 'emergency'
      && tickets[0].trip?.no === 'AR-2048-MIA'
      && tickets[0].trip?.dep === 'Brickell'
      && tickets[0].trip?.arr === 'South Beach'
      && h.data.rides.r1.monitor.state === 'emergency' && rep.emergencies.length === 1,
      JSON.stringify({ k: tickets[0]?.kind, s: h.data.rides.r1.monitor.state }));
  }

  // 11b. An ordinary road answer is settled by the fallback reader, NOT escalated.
  //      This is the triviality test: the vast majority must never reach a person.
  {
    tickets.length = 0;
    const ordinary = [
      'Traffic on the causeway',
      'Waiting on the passenger to come down',
      'Drawbridge',
      'Roadworks, one lane',
      'Stopped for fuel',
      'Accident up ahead, everyone is stopped',
      'Delivery truck blocking the lane',
    ];
    let settled = 0;
    for (const reply of ordinary) {
      const h = makeDb({ rides: { r1: ride({ monitor: { state: 'asked_operator', askedOperatorAt: now - 2 * MIN, operatorReply: reply } }) } });
      await inject(h.db).sweepMonitor({ now });
      if (h.data.rides.r1.monitor.state === 'explained') settled++;
    }
    check(`ordinary delays settle without a person: ${settled}/${ordinary.length}`,
      settled === ordinary.length && tickets.length === 0, `${settled} of ${ordinary.length}`);
  }

  // 11c. Real trouble is never settled, however casually it is worded.
  {
    tickets.length = 0;
    const bad = [
      'We were in a crash',
      'She is not well',
      'Someone hit us',
      'I need an ambulance',
      'The passenger is threatening me',
    ];
    let raised = 0;
    for (const reply of bad) {
      const h = makeDb({ rides: { r1: ride({ monitor: { state: 'asked_operator', askedOperatorAt: now - 2 * MIN, operatorReply: reply } }) } });
      await inject(h.db).sweepMonitor({ now });
      if (h.data.rides.r1.monitor.state === 'emergency') raised++;
    }
    check(`trouble always reaches the emergency lane: ${raised}/${bad.length}`,
      raised === bad.length, `${raised} of ${bad.length}`);
  }

  // 12. Nobody answers at all: a person is brought in.
  {
    tickets.length = 0;
    const h = makeDb({ rides: { r1: ride({ monitor: { state: 'asked_traveler', askedOperatorAt: now - 10 * MIN, askedTravelerAt: now - 6 * MIN } }) } });
    await inject(h.db).sweepMonitor({ now });
    check('nobody answers: case opened', tickets.length === 1 && h.data.rides.r1.monitor.state === 'escalated',
      h.data.rides.r1.monitor.state);
  }

  // 13. It moves again: the question is withdrawn.
  {
    const h = makeDb({ rides: { r1: ride({
      stillSince: now - 10 * 1000, opLat: FAR.lat, opLng: FAR.lng,
      monitor: { state: 'asked_operator', askedOperatorAt: now - 3 * MIN } }) } });
    await inject(h.db).sweepMonitor({ now });
    const m = h.data.rides.r1.monitor;
    check('moving again: the question is withdrawn', m.state === 'clear' && !m.askedOperatorAt, JSON.stringify(m));
  }

  // 14. A phone claiming to be stuck when the server saw it move is not believed.
  {
    const h = makeDb({ rides: { r1: ride({
      stillSince: now - 60 * MIN,                       // the phone says an hour
      monitorSeen: { lat: FAR.lat, lng: FAR.lng, at: now - MIN }, // the server saw it elsewhere
    }) } });
    const rep = await inject(h.db).sweepMonitor({ now });
    check('a phone cannot make itself look stuck', rep.moving === 1 && rep.asked.length === 0, JSON.stringify(rep));
  }

  // ---- sweepAssignments: the path that rescues a traveler nobody answered. ------------
  //
  // UNTESTED UNTIL 29 AUG 2026, which is how it shipped two separate faults at once: a
  // ReferenceError on coverageLapsed swallowed by `catch { continue }`, and a bare `continue`
  // for a ride with no pickup coordinates — which was EVERY ride, because dispatch.ts
  // received the pickup and never wrote it down. Both were invisible: the sweep reported
  // itself healthy while re-offering nothing, ever.
  const assigned = (o = {}) => ({
    travelerUid: 'u1', tripNo: 'AR-2098-MIA', operatorId: 'op1', operatorName: 'First',
    dep: 'Brickell', dest: 'Miami International Airport', status: 'assigned',
    travelClass: 'Standard', createdAt: now - 5 * MIN,
    notifiedOperatorAt: now - 5 * MIN,           // already asked, and did not answer
    paymentIntentId: 'pi_r1', paidAt: now - 5 * MIN, costCents: 2350,
    pickupLat: P.lat, pickupLng: P.lng, ...o,
  });
  // THE FIXTURES CARRY A CURRENT DISCLOSURE. Dispatch has filtered on disclosureVersion since
  // 08c0d89, and a record without one is deliberately not dispatchable (dispatchgate.test.js:
  // absence is not agreement). These fixtures predate that gate, so every case below failed for
  // a reason unrelated to what it asserts. Repaired, not loosened — the gate is statutory.
  const freeOperator = {
    op2: { uid: 'op2', name: 'Second', available: true, lat: NEAR.lat, lng: NEAR.lng,
           onlineAt: now, classes: ['Standard'], insuranceExpiry: '2099-01-01',
           disclosureVersion: DISCLOSURE_VERSION, commissioned: true },
  };
  {
    const oldMode = process.env.DEPLOYMENT_MODE;
    process.env.DEPLOYMENT_MODE = 'production';
    const h = makeDb({ rides: { r1: assigned() }, operators: freeOperator });
    const rep = await inject(h.db).sweepAssignments({ now, checkMarket: async () => 'waitlist' });
    check('a paused production market strands and eventually refunds the paid offer rather than reoffering',
      rep.stranded.includes('r1') && rep.reoffered.length === 0 && h.data.rides.r1.operatorId === 'op1');
    if (oldMode === undefined) delete process.env.DEPLOYMENT_MODE;
    else process.env.DEPLOYMENT_MODE = oldMode;
  }
  {
    const h = makeDb({ rides: { r1: assigned({ paymentIntentId: null }) }, operators: freeOperator });
    const rep = await inject(h.db).sweepAssignments({ now });
    check('an unpaid Travel is never reoffered', rep.stranded.includes('r1') && !rep.reoffered.length);
  }

  // An attempted notification is not an accepted notification. The offer
  // still exists in the Operator inbox and keeps its normal answer window.
  {
    const h = makeDb({ rides: { r1: assigned({
      createdAt: now - 20_000, offeredAt: now - 20_000,
      notifiedOperatorAt: null,
    }) }, operators: {} });
    const rep = await inject(h.db, { pushFails: ['op1'] }).sweepAssignments({ now });
    check('failed Operator push does not invent notification success or prematurely reassign',
      h.data.rides.r1.notifiedOperatorAt == null &&
      rep.notified.length === 0 && rep.reoffered.length === 0 &&
      h.data.rides.r1.status === 'assigned', JSON.stringify(rep));
  }
  {
    const h = makeDb({ rides: { r1: assigned({
      createdAt: now - 20_000, offeredAt: now - 20_000,
      notifiedOperatorAt: null,
    }) }, operators: {} });
    const rep = await inject(h.db).sweepAssignments({ now });
    check('provider-accepted Operator push records the attempt for the existing answer window',
      h.data.rides.r1.notifiedOperatorAt === now &&
      rep.notified.includes('r1') && h.data.rides.r1.status === 'assigned', JSON.stringify(rep));
  }
  {
    const h = makeDb({ rides: { r1: assigned({
      createdAt: now - 70_000, offeredAt: now - 70_000,
      notifiedOperatorAt: null,
    }) }, operators: {} });
    const rep = await inject(h.db, { pushFails: ['op1'] }).sweepAssignments({ now });
    check('failed push past answer window reaches normal replacement handling, not endless Retry',
      h.data.rides.r1.notifiedOperatorAt == null &&
      rep.stranded.includes('r1') && rep.notified.length === 0 &&
      h.data.rides.r1.status === 'assigned' &&
      h.data.rides.r1.paymentIntentId === 'pi_r1', JSON.stringify(rep));
  }

  {
    const h = makeDb({ rides: { r1: assigned({
      createdAt: now - 70_000, offeredAt: now - 70_000,
      notifiedOperatorAt: null,
    }) }, operators: {} });
    const rep = await inject(h.db).sweepAssignments({ now });
    check('a late successful push must not revive an already-expired offer',
      h.data.rides.r1.notifiedOperatorAt == null &&
      rep.notified.length === 0 && rep.stranded.includes('r1') &&
      h.data.rides.r1.paymentIntentId === 'pi_r1', JSON.stringify(rep));
  }

  // 15. A fleet flag alone is not qualification. The replacement has no authoritative user
  // record in this fixture, so the hardened sweep must refuse it rather than re-offer blindly.
  {
    const h = makeDb({ rides: { r1: assigned() }, operators: freeOperator });
    const rep = await inject(h.db).sweepAssignments({ now });
    check('an unverifiable replacement is not re-offered a paid Travel',
      rep.reoffered.length === 0 && rep.stranded.includes('r1') && h.data.rides.r1.operatorId === 'op1',
      JSON.stringify(rep) + ' | ' + JSON.stringify(h.data.rides.r1));
  }

  // 14b. THE SAFETY SWEEP SAYS SO WHEN IT CANNOT COVER EVERYBODY. Route monitoring is bounded
  // like the others, because it reads every travel underway once a minute. Unlike the others,
  // A page bound is not a coverage bound: 900 underway Travels (above the modeled 1m/month
  // 833-active peak) must all be read in one
  // tick, with no silent first-500-only window and without an unbounded single RPC.
  {
    const many = {};
    for (let i = 0; i < 900; i += 1) {
      many[`live${i}`] = {
        status: 'onboard', operatorId: 'op1', travelerUid: 'u1', tripNo: `AR-${i}-MIA`,
        opLat: 25.77, opLng: -80.19, opAt: now, createdAt: now,
      };
    }
    const h = makeDb({ rides: many, operators: freeOperator });
    const rep = await inject(h.db).sweepMonitor({ now });
    check('all 900 active Travels are paged and none are silently excluded',
      rep.activeTravelsRead === 900 && rep.activeReadPages === 5 && rep.unwatched !== true,
      JSON.stringify({ read: rep.activeTravelsRead, pages: rep.activeReadPages, unwatched: rep.unwatched }));
  }

  // 15b. THE READ BILL (30 Aug 2026). This query runs every 60 seconds — 1,440 times a day —
  // and Firestore bills per document RETURNED, so each travel it matches costs 1,440 reads a
  // day for as long as it sits there. Sixty-seven stale 'assigned' records were costing
  // ~96,000 reads a day against a 50,000/day allowance, on a database nobody was using. The
  // expiry is the cure; the bound is the guard, and this is what stops it being removed.
  {
    const many = {};
    for (let i = 0; i < 400; i += 1) many[`r${i}`] = assigned();
    const h = makeDb({ rides: many, operators: freeOperator });
    const rep = await inject(h.db).sweepAssignments({ now });
    // Counted on `pending` alone: one record can appear in both `notified` and `pending`, so
    // summing the buckets double-counts the same document rather than the reads it cost.
    check('a backlog of unanswered travel cannot spend a day\u2019s reads in one tick',
      rep.pending <= 50, `${rep.pending} records read out of 400 waiting`);
  }

  // 16. THE REGRESSION. No pickup on the record: it cannot be re-offered, and must SAY SO.
  {
    const h = makeDb({
      rides: { r1: assigned({ pickupLat: undefined, pickupLng: undefined }) },
      operators: freeOperator,
    });
    const rep = await inject(h.db).sweepAssignments({ now });
    check('a travel with no position is reported, not silently skipped',
      rep.positionless.includes('r1') && rep.reoffered.length === 0, JSON.stringify(rep));
  }

  // 17. An operator whose commercial cover has lapsed is never the replacement. This is the
  //     call that was throwing — the assertion is that it runs at all, and filters.
  {
    const h = makeDb({
      rides: { r1: assigned() },
      operators: { op2: { ...freeOperator.op2, insuranceExpiry: '2020-01-01' } },
    });
    const rep = await inject(h.db).sweepAssignments({ now });
    check('a lapsed policy is not re-offered travel',
      rep.reoffered.length === 0 && rep.stranded.includes('r1'), JSON.stringify(rep));
  }

  // 18a. THE PHANTOM. A record that has not checked in is not an operator, whatever its
  //      `available` flag says. This is what was dispatched instead of the operator actually
  //      on duty, and what a paid traveler was told was coming.
  {
    const h = makeDb({
      rides: { r1: assigned() },
      operators: { op2: { ...freeOperator.op2, onlineAt: now - 60 * MIN } },
    });
    const rep = await inject(h.db).sweepAssignments({ now });
    check('an operator who has not checked in is never re-offered travel',
      rep.reoffered.length === 0 && rep.stranded.includes('r1'), JSON.stringify(rep));
  }

  // 18. Nobody free at all: stranded and stamped, not cancelled from under a paid traveler.
  {
    const h = makeDb({ rides: { r1: assigned() }, operators: {} });
    const rep = await inject(h.db).sweepAssignments({ now });
    check('nobody available leaves the travel with its operator, recorded',
      rep.stranded.includes('r1') && h.data.rides.r1.unanswered === true, JSON.stringify(rep));
  }


  // Accepted-Travel exception: reuse the exact same paid booking, and do not
  // force the Traveler to wait for the ordinary one-hour unanswered timeout.
  // The existing refund recovery sweep, not this monitor, calls Stripe once.
  {
    const withdrawnAt = now - 4 * MIN;
    const h = makeDb({ rides:{r1:assigned({
      releasedAt:withdrawnAt, releasedReason:'operator_withdrawn',
      operatorWithdrawalAt:withdrawnAt, withdrawnBy:'op1',
      declinedBy:['op1'], offeredAt:withdrawnAt, createdAt:now - 6 * MIN,
    })},operators:{} });
    const rep=await inject(h.db).sweepAssignments({now});
    check('withdrawal replacement window stays open before five minutes',
      rep.pending===1 && rep.stranded.includes('r1') &&
      h.data.rides.r1.status==='assigned' && h.data.rides.r1.paymentIntentId==='pi_r1',
      JSON.stringify(rep));
  }
  {
    const withdrawnAt = now - 5 * MIN;
    const h = makeDb({ rides:{r1:assigned({
      releasedAt:withdrawnAt, releasedReason:'operator_withdrawn',
      operatorWithdrawalAt:withdrawnAt, withdrawnBy:'op1',
      declinedBy:['op1'], offeredAt:withdrawnAt, createdAt:now - 6 * MIN,
    })},operators:{} });
    const sweep=inject(h.db);
    const rep=await sweep.sweepAssignments({now});
    check('after five minutes with no replacement, server cancels original Travel',
      rep.expired.includes('r1') && h.data.rides.r1.status==='cancelled' &&
      h.data.rides.r1.paymentIntentId==='pi_r1' &&
      h.data.rides.r1.refundPending===true &&
      h.data.rides.r1.cancelledFrom==='assigned',JSON.stringify(rep));
    const repeat=await sweep.sweepAssignments({now:now+MIN});
    check('cancellation and refund obligation cannot repeat or be lost',
      repeat.expired.length===0 && h.data.rides.r1.status==='cancelled' &&
      h.data.rides.r1.refundPending===true);
  }

  // Another Operator was offered this Travel, but did not accept it. That is
  // not a completed replacement: the ORIGINAL withdrawal deadline must hold.
  {
    const withdrawnAt = now - 5 * MIN;
    const h = makeDb({ rides:{r1:assigned({
      operatorId:'op2', operatorName:'Candidate, not accepted',
      releasedAt:null, releasedReason:null, offeredAt:now - 20000,
      operatorWithdrawalAt:withdrawnAt, withdrawnBy:'op1',
      declinedBy:['op1'], createdAt:now - 6 * MIN,
    })},operators:{} });
    const rep=await inject(h.db).sweepAssignments({now});
    check('a fresh but unanswered reoffer cannot reset the original withdrawal deadline',
      rep.expired.includes('r1') && h.data.rides.r1.status==='cancelled' &&
      h.data.rides.r1.paymentIntentId==='pi_r1' &&
      h.data.rides.r1.refundPending===true,JSON.stringify(rep));
  }

  let bad = 0;
  for (const r of results) { if (!r.ok) bad++; console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.l}${r.ok ? '' : '   <-- ' + r.d}`); }
  console.log(`\n${results.length - bad}/${results.length} passed`);
  process.exit(bad ? 1 : 0);
})();
