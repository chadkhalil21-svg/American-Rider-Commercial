'use strict';
// Durable, event-driven Operations alert for an ambiguous scheduled dispatch.
// Reuse the existing support_tickets store, founder Ops case queue and Resend.
// No second database collection, background poller or emergency classification.
const { createHash } = require('node:crypto');

function scheduledExceptionIdempotencyKey(reservationId) {
  const id = String(reservationId || '');
  if (!id || id.includes('/')) throw new Error('Valid scheduled reservation ID required');
  return 'scheduled-review-' + createHash('sha256').update(id).digest('hex').slice(0, 32);
}

function scheduledExceptionTicket({ reservationId, reservation, rideId = null,
  paymentIntentId = null, reason = null } = {}) {
  const r = reservation || {};
  const uid = String(r.travelerUid || '');
  if (!uid) throw new Error('Scheduled reservation owner required for a durable case');
  const originalPayment = paymentIntentId || r.paymentIntentId || null;
  // Never assert that a bank charge or authorization was actually captured.
  // The payment reference is only an investigative lead for the operator.
  const paymentNote = originalPayment
    ? 'A provider payment reference exists; verify its actual held, captured, released or refunded state in Stripe.'
    : 'No provider payment reference was confirmed; do not invent a charge or refund.';
  return {
    uid, email: String(r.travelerEmail || ''),
    kind: 'support', category: 'scheduled-travel',
    reason: 'Scheduled Travel requires Operations review',
    idempotencyKey: scheduledExceptionIdempotencyKey(reservationId),
    trip: { no: String(r.tripNo || ''),
      dep: String(r.dep || ''), arr: String(r.dest || r.arr || '') },
    description: [
      'Scheduled Travel could not be safely dispatched.',
      'Reservation: ' + String(reservationId),
      'Travel: ' + String(rideId || 'not yet staged'),
      'Original payment reference: ' + String(originalPayment || 'none confirmed'),
      paymentNote,
      'Recorded reason: ' + String(reason || 'Unknown; inspect scheduled reservation').slice(0, 500),
      'Review the original reservation and provider state before capture, refund, release or closure.',
    ].join('\n'),
  };
}

async function alertScheduledException({ reservationId, reservation, rideId, paymentIntentId,
  reason, fileTicket } = {}) {
  if (typeof fileTicket !== 'function') throw new TypeError('Existing ticket writer required');
  const ticket = scheduledExceptionTicket({
    reservationId, reservation, rideId, paymentIntentId, reason,
  });
  return fileTicket(ticket);
}

// Open-ended, indexed and strictly bounded. Queried ONLY when the Founder opens
// the Operations page. No new cron, polling, location reads or indexes.
async function listScheduledExceptions(db,{after='',limit=25}={}) {
  if(!db)throw new Error('Firestore unavailable');
  if(after&&!/^[A-Za-z0-9_-]{1,128}$/.test(after))
    throw new Error('Invalid reservation cursor');
  const size=Number.isSafeInteger(limit)&&limit>0?Math.min(limit,50):25;
  let q=db.collection('scheduled_rides').where('status','==','needs_attention')
    .orderBy('__name__','asc');
  if(after){
    const cursor=await db.collection('scheduled_rides').doc(after).get();
    if(!cursor.exists)throw new Error('Reservation cursor missing');
    q=q.startAfter(cursor);
  }
  const snap=await q.limit(size+1).get();
  const docs=snap.docs||[];
  const page=docs.slice(0,size);
  const rows=page.map(d=>{
    const r=d.data()||{};
    return {id:d.id,tripNo:String(r.tripNo||''),
      atMs:Number(r.atMs)||0,reason:String(r.dispatchError||'Requires payment or dispatch review').slice(0,250),
      paymentState:r.paymentCapturePolicy==='manual_v1'?
        (Number(r.chargedCents)>0?'captured':'authorization_or_provider_review'):
        r.paymentIntentId?'verify_payment':'no_payment_confirmed',
      caseNo:String(r.caseNo||'')};
  });
  return {rows,next:docs.length>size?page.at(-1).id:null};
}

function scheduledExceptionsPage({rows,next}) {
 const escape=s=>String(s??'').replace(/[&<>"']/g,ch=>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const items=rows.map(r=>`<article style="padding:15px 0;border-bottom:1px solid #ccc">
  <h2 style="font-size:17px">Travel ${escape(r.tripNo||r.id)}</h2>
  <p>Reservation: ${escape(r.id)} · Payment: ${escape(r.paymentState)}</p>
  <p>Scheduled: ${escape(Number.isFinite(r.atMs)&&r.atMs>0&&r.atMs<8640000000000000
    ?new Date(r.atMs).toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short',timeZone:'America/New_York'})+' ET'
    :'Time unavailable')}</p>
  <p>${escape(r.reason)}</p>
  <p>Original case: ${escape(r.caseNo||'Not recorded')}</p>
  </article>`).join('');
 const nextLink=next?`<p><a href="/ops/scheduled-exceptions?after=${encodeURIComponent(next)}">Older unresolved reservations →</a></p>`:'';
 return '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1">'+
 '<title>Scheduled Travel exceptions · American Rider</title>'+
 '<main style="max-width:720px;margin:auto;padding:20px;font:16px system-ui;line-height:1.45">'+
 '<p><a href="/ops">← Operations</a> · <a href="/ops/cases?kind=support">Support cases</a></p>'+
 '<h1>Scheduled Travel exceptions</h1>'+
 '<p>Unresolved payment or dispatch work. An authorization is not a charge. Verify the original Stripe transaction before taking action.</p>'+
 (items||'<p>No unresolved scheduled exceptions on this page.</p>')+nextLink+
 '</main></html>';
}

module.exports = { scheduledExceptionIdempotencyKey, scheduledExceptionTicket,
  alertScheduledException, listScheduledExceptions, scheduledExceptionsPage };
