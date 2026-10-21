'use strict';
const assert = require('node:assert/strict');

// No real Firestore, notifications, reports or Operator identifiers are used.
const { sweepScreening, RECHECK_MS, RECHECK_WARN_MS, SCREENING_ADVANCE_MARGIN_MS, screeningCurrent } = require('./screening');

const DAY = 86_400_000, NOW = Date.parse('2026-10-10T18:00:00Z');
const users = Array.from({length: 620}, (_, i) => ({
  id: 'op' + String(i).padStart(4, '0'),
  data: { screening: {
    decision: 'pass', recheckDue: NOW + 5 * DAY,
    conductedAt: NOW + 5 * DAY - RECHECK_MS,
    jurisdictionCode: 'FL',
  }},
}));
const cursor = new Map(), operators = new Map(), messages = [], tickets = [];
let cursorFailures = false;
const db = {
  collection(name) {
    if (name === 'screening_renewal_cursor') return {
      doc(id) { return {
        get: async () => ({ exists: cursor.has(id), data: () => cursor.get(id) }),
        set: async data => {
          if (cursorFailures) throw new Error('cursor checkpoint failed');
          cursor.set(id, data);
        },
      }; },
    };
    if (name === 'operators') return {
      doc(id) { return {
        set: async data => operators.set(id, {...(operators.get(id) || {}), ...data}),
      }; },
    };
    assert.equal(name, 'users');
    return {
      where(field, op, cutoff) {
        assert.equal(field, 'screening.recheckDue');
        assert.equal(op, '<=');
        const query = {
          keys: [], cutoff, after: null, n: 200,
          orderBy(key) {this.keys.push(key);return this;},
          limit(n) {this.n=n;return this;},
          startAfter(due,id) {this.after={due,id};return this;},
          async get() {
            assert.deepEqual(this.keys,['screening.recheckDue','__name__']);
            const docs=users.filter(x=>Number(x.data.screening.recheckDue)<=this.cutoff)
              .sort((a,b)=>a.data.screening.recheckDue-b.data.screening.recheckDue ||
                a.id.localeCompare(b.id))
              .filter(x=>!this.after ||
                x.data.screening.recheckDue>this.after.due ||
                (x.data.screening.recheckDue===this.after.due && x.id>this.after.id))
              .slice(0,this.n);
            return { docs: docs.map(x=>({
              id:x.id, data:()=>x.data, ref: {
                set:async patch=>{
                  x.data.screening={...x.data.screening,...(patch.screening||{})};
                },
              },
            })) };
          },
        };
        return query;
      },
    };
  },
};
const sweep = now => sweepScreening({
  db, now, limit:200,
  notify: async data => { messages.push(data);return {ok:true}; },
  fileTicket: async data => { tickets.push(data);return {ok:true,stored:true,caseNo:'AR-C-TEST'}; },
});
(async()=>{
  const reports=[];
  for(let i=0;i<4;i++)reports.push(await sweep(NOW+i));
  assert.deepEqual(reports.map(x=>x.scanned),[200,200,200,20]);
  assert.ok(reports.every(x=>x.ok),JSON.stringify(reports));
  assert.equal(messages.length,620);
  assert.equal(new Set(messages.map(x=>x.uid)).size,620,'no due Operator starved');
  assert.equal(tickets.length,0);
  assert.equal(operators.size,0,'warning does not take Operators off duty');
  assert.ok(cursor.get('v1').lastUserId);

  const wrap=await sweep(NOW+4);
  assert.equal(wrap.scanned,200,'cursor wraps without scanning unbounded users');
  assert.equal(wrap.warned,0,'already warned cycle is not duplicated');
  assert.equal(messages.length,620);

  // A newly performed screening must be eligible for a new warning even when
  // prior-cycle timestamps remain on the Firestore document.
  const renewed=users[0].data.screening;
  const oldDue=renewed.recheckDue;
  renewed.recheckDue=NOW+10*DAY;
  renewed.conductedAt=renewed.recheckDue-RECHECK_MS;
  assert.equal(screeningCurrent(renewed,NOW),true);
  // Ensure the renewed record is selected after rollover despite its later date.
  for(let i=0;i<5;i++) await sweep(NOW+10+i);
  assert.equal(messages.filter(x=>x.uid===users[0].id).length,2,'renewed screening gets new-cycle warning');
  assert.equal(users[0].data.screening.recheckWarnedForDue, users[0].data.screening.recheckDue);
  assert.notEqual(users[0].data.screening.recheckWarnedForDue, oldDue);

  // On a new screening cycle 12 hours BEFORE expiry, stale prior markers
  // do not suppress advance suspension/case. All 620 Operators are processed.
  messages.length=0;tickets.length=0;operators.clear();cursor.clear();
  for(const item of users) {
    const s=item.data.screening;
    s.recheckExpiredForDue=NOW-100*DAY;
    s.recheckExpiredAt=NOW-99*DAY;
    s.recheckDue=NOW+12*60*60*1000;
  }
  const results=[];
  for(let i=0;i<4;i++)results.push(await sweep(NOW+100+i));
  assert.ok(results.every(x=>x.ok),JSON.stringify(results));
  assert.equal(results.reduce((n,x)=>n+x.expired,0),620);
  assert.equal(tickets.length,620);
  assert.ok(tickets.every(t => /^screening-renewal-[0-9]+$/.test(t.idempotencyKey)), 'cases are idempotent per screening due-date');
  assert.equal(operators.size,620);
  assert.equal(messages.length,620);
  for(const p of operators.values()) {
    assert.equal(p.available,false);
    assert.equal(p.screeningBlocked,true);
  }
  await sweep(NOW+200);
  assert.equal(tickets.length,620,'repeated sweep never files a second case');

  // A failed cursor checkpoint cannot be reported as successful.
  cursorFailures=true;
  const failed=await sweep(NOW+201);
  assert.equal(failed.ok,false);
  assert.match(failed.reason,/checkpoint/);

  // Default scan capacity is 500 per 6-hour tick; at 4 ticks/day this
  // preserves high-volume renewal throughput without 48 reminder sweeps/day.
  cursorFailures=false; cursor.clear();
  const bounded=await sweepScreening({db,now:NOW+202,
    notify:async()=>({ok:true}),
    fileTicket:async()=>({ok:true,stored:true,caseNo:'AR-C-TEST'})});
  assert.equal(bounded.scanned,500,'500 default page bounds the 6-hour batch');
    assert.equal(RECHECK_WARN_MS,30*DAY);
  assert.equal(SCREENING_ADVANCE_MARGIN_MS,DAY);
  const passing={decision:'pass',recheckDue:NOW+DAY+1};
  assert.equal(screeningCurrent(passing,NOW),true,'outside the 24h window remains valid');
  assert.equal(screeningCurrent({...passing,recheckDue:NOW+DAY},NOW),false,'exactly 24h ahead is blocked');
  assert.equal(screeningCurrent({...passing,recheckDue:NOW+12*60*60*1000},NOW),false,'12h ahead is blocked');
  assert.equal(screeningCurrent({decision:'review',recheckDue:NOW+10*DAY},NOW),false,'unverified screening is blocked');
  assert.equal(screeningCurrent(null,NOW),false,'missing screening is blocked');
  assert.equal(screeningCurrent({...passing,recheckDue:NaN},NOW),false,'invalid screening date is blocked');
  console.log('PASS 620-Operator rotating screening renewals, wrap/restart, stale-cycle markers, 24h advance lockout and failed checkpoint');
})().catch(e=>{console.error(e);process.exitCode=1;});
