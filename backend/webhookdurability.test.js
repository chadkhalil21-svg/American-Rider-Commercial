const assert = require('node:assert/strict');
const path = require('node:path');
const ROOT = __dirname;
const ride = { travelerUid: 'u1', travelerEmail: 'a@example.com', paymentIntentId: 'pi_one',
  status: 'completed', tripNo: 'AR-1', dep: 'A', dest: 'B', operatorName: 'Operator' };
const fleet = { available: true };
const evidence = new Map();
let failRead = false, failRideWrite = false, failFleetWrite = false, failEvidenceWrite = false, stored = false, emailed = false;
const caseKeys = [];
const db = { collection(name) {
  return {
    where(field,op,value) {
      return { limit(size) { assert.equal(size,2); return { async get() {
        if (failRead) throw new Error('database query unavailable');
        if (name === 'rides' && field === 'paymentIntentId' && value === 'pi_one')
          return { docs: [{ id: 'r1', data: () => ({ ...ride }) }] };
        if (name === 'users' && field === 'stripeAccountId' && value === 'acct_1')
          return { docs: [{ id: 'op1', data: () => ({ stripeAccountId: 'acct_1' }) }] };
        return { docs: [] };
      } }; } };
    },
    doc(id) { return { async create(packet) {
      assert.equal(name,'dispute_evidence');
      if(failEvidenceWrite)throw new Error('evidence storage unavailable');
      if(evidence.has(id)){const err=new Error('already exists');err.code=6;throw err;}
      evidence.set(id,structuredClone(packet));
    },async get() {return {exists:evidence.has(id),data:()=>evidence.get(id)};},async set(patch) {
      if (name === 'rides') { if (failRideWrite) throw new Error('ride write unavailable'); Object.assign(ride,patch); }
      if (name === 'operators') { assert.equal(id,'op1'); if (failFleetWrite) throw new Error('fleet write unavailable'); Object.assign(fleet,patch); }
    } }; },
  };
} };
for (const [name,stub] of [
  ['firebase-admin.js',{adminDb:()=>db,adminStatus:()=>({ok:true})}],
  ['tickets.js',{fileTicket:async(opts)=>{caseKeys.push(opts.idempotencyKey);return {stored,emailed,caseNo:'AR-C-STABLE'};}}],
]) {
  const file=require.resolve(path.join(ROOT,name));
  require.cache[file]={id:file,filename:file,loaded:true,exports:stub,children:[],paths:[]};
}
const { handleEvent } = require('./webhook');
const dispute = { id:'evt_dispute_1', type:'charge.dispute.created', data:{object:{
  id:'dp_1', payment_intent:'pi_one', amount:2720, reason:'fraudulent',evidence_details:{due_by:2000000000},
}}};
(async()=>{
  await assert.rejects(()=>handleEvent(dispute),/not stored and alerted/);
  assert.equal(ride.disputed,undefined,'a failed case never pretends to secure the dispute');
  stored=true;
  await assert.rejects(()=>handleEvent(dispute),/not stored and alerted/);
  emailed=true;
  failEvidenceWrite=true;
  await assert.rejects(()=>handleEvent(dispute),/evidence storage unavailable/);
  assert.equal(ride.disputed,undefined,'missing evidence cannot be acknowledged as a secured dispute');
  failEvidenceWrite=false;
  failRideWrite=true;
  await assert.rejects(()=>handleEvent(dispute),/ride write unavailable/);
  failRideWrite=false;
  const result=await handleEvent(dispute);
  assert.equal(result.ok,true);assert.equal(ride.disputed,true);assert.equal(ride.caseNo,'AR-C-STABLE');
  assert.equal(result.evidenceRef,'dispute_evidence/dp_1');
  assert.equal(evidence.size,1,'provider retries reuse the create-only evidence snapshot');
  assert.equal(evidence.get('dp_1').travel.tripNo,'AR-1');
  assert.match(evidence.get('dp_1').sha256,/^[a-f0-9]{64}$/);
  assert.equal(evidence.get('dp_1').travel.travelerEmail,undefined,'the packet does not copy account PII');
  const {saveDisputeEvidence}=require('./disputeevidence');
  await assert.rejects(()=>saveDisputeEvidence({db,ride:{id:'r1',...ride},
    event:{...dispute,id:'evt_conflicting'}}),/does not match verified Stripe event/);
  assert.equal(evidence.size,1,'a conflicting event cannot modify the original packet');
  assert.equal(new Set(caseKeys).size,1,'the case key is stable across provider retries');
  failRead=true;
  await assert.rejects(()=>handleEvent(dispute),/database query unavailable/);
  failRead=false;
  const restricted={id:'evt_account_1',type:'account.updated',data:{object:{id:'acct_1',metadata:{uid:'op1'},payouts_enabled:false,charges_enabled:false}}};
  failFleetWrite=true;
  await assert.rejects(()=>handleEvent(restricted),/fleet write unavailable/);
  failFleetWrite=false;
  assert.equal((await handleEvent(restricted)).ok,true);
  assert.equal(fleet.available,false,'a restriction is not acknowledged before Operator availability is revoked');
  // Metadata may contain an obsolete or malicious uid: canonical account owner wins.
  fleet.available=true;
  const stale={...restricted, id:'evt_wrong_metadata',
    data:{object:{...restricted.data.object,metadata:{uid:'some-other-operator'}}}};
  assert.equal((await handleEvent(stale)).action,'operator taken off duty');
  assert.equal(fleet.available,false,'verified account owner is used, not provider uid metadata');
  fleet.available=true;
  const stranger={...restricted,id:'evt_unbound_account',
    data:{object:{...restricted.data.object,id:'acct_unlinked',metadata:{uid:'op1'}}}};
  assert.equal((await handleEvent(stranger)).action,'account not bound to an Operator');
  assert.equal(fleet.available,true,'an unbound Stripe event cannot suspend a metadata-named Operator');
  console.log('PASS Stripe dispute retries and account restrictions bound only to canonical account owner');
})().catch((e)=>{console.error(e);process.exitCode=1;});
