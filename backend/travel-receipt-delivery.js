'use strict';
// Signed Resend callbacks for receipt deliverability only. The existing
// insurance mail verification and policy-standing handler are untouched.
const {TYPES,FINAL_FAILURES}=require('./resend-delivery');
const VALID=/^[A-Za-z0-9_.:-]{1,160}$/;
const clean=value=>String(value||'').trim().toLowerCase();
const rank={
  accepted:0,'email.sent':1,'email.delivery_delayed':2,
  'email.delivered':3,'email.bounced':4,'email.failed':4,
  'email.suppressed':4,'email.complained':4,
};
function sanitizeReceiptEvent(id,payload) {
  if(!TYPES.has(payload?.type))return null;
  const sender=clean(payload?.data?.from);
  if(!/(?:^|[<\s])receipts@americanrider\.(?:tech|app)(?:>|\s|$)/.test(sender))
    return null;
  const emailId=String(payload?.data?.email_id||'');
  if(!VALID.test(String(id||''))||!VALID.test(emailId))
    throw Error('invalid receipt provider event');
  const destinations=Array.isArray(payload?.data?.to)?payload.data.to:[];
  const recipient=destinations.length===1?clean(destinations[0]):null;
  const occurred=Date.parse(String(payload?.created_at||payload?.data?.created_at||''));
  return {
    kind:'travel_receipt',id:String(id),type:payload.type,emailId,
    recipient:recipient&&recipient.length<=254?recipient:null,
    eventAt:Number.isFinite(occurred)?occurred:null,
  };
}
async function applyReceiptDeliveryEvent({db,event,now=Date.now()}={}) {
  if(!db||event?.kind!=='travel_receipt'||!TYPES.has(event?.type)||
     !VALID.test(String(event?.emailId||'')))
    return {ok:false,reason:'invalid_receipt_provider_event'};
  const found=await db.collection('travel_receipt_outbox')
    .where('providerMessageId','==',event.emailId).limit(2).get();
  if(found.docs.length>1)return {ok:false,reason:'duplicate_receipt_provider_id'};
  // The callback can beat the outbound handler's provider ID transaction.
  // Keep it in the durable provider event queue for safe retry.
  if(!found.docs.length)return {ok:false,reason:'receipt_not_correlated_yet'};
  const ref=found.docs[0].ref;
  return db.runTransaction(async tx=>{
    const snap=await tx.get(ref),row=snap.exists?snap.data():null;
    if(!row||row.providerMessageId!==event.emailId||
       (event.recipient&&clean(row.to)!==event.recipient))
      return {ok:true,unmatched:true};
    const old=String(row.deliveryStatus||'accepted');
    if((rank[event.type]||0)<(rank[old]||0)||
       ((rank[event.type]||0)===(rank[old]||0)&&
        Number(row.deliveryEventAt||0)>=Number(event.eventAt||now)))
      return {ok:true,ignored:true};
    const eventTime=event.eventAt||now;
    tx.set(ref,{deliveryStatus:event.type,deliveryEventAt:eventTime,
      deliveryEventId:event.id,deliveryUpdatedAt:now},{merge:true});
    if(FINAL_FAILURES.has(event.type)) {
      tx.set(db.collection('rides').doc(row.rideId),
        {receiptDeliveryFailed:true,receiptDeliveryStatus:event.type,
          receiptDeliveryFailureAt:now},{merge:true});
    } else if(event.type==='email.delivered') {
      tx.set(db.collection('rides').doc(row.rideId),
        {receiptDeliveredAt:eventTime,receiptDeliveryFailed:false,
          receiptDeliveryStatus:'email.delivered'},{merge:true});
    }
    return {ok:true,updated:true,status:event.type};
  });
}
module.exports={sanitizeReceiptEvent,applyReceiptDeliveryEvent};
