'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const ROOT=__dirname;
const data=new Map(),sent=[];
const fakeDb={
  collection(name) {
    assert.equal(name,'support_tickets');
    return {
      doc(id) {
        return {
          async get(){const v=data.get(id);return{exists:!!v,data:()=>({...v})};},
          async create(fields){
            if(data.has(id))throw Error('already exists');
            data.set(id,{...fields});
          },
          async set(fields,{merge}={}){
            const old=merge?(data.get(id)||{}):{};
            data.set(id,{...old,...fields});
          },
          async update(fields){
            const doc={...data.get(id)};
            for(const [key,value] of Object.entries(fields)){
              const parts=key.split('.');
              if(parts.length===1){doc[key]=value;continue;}
              let target=doc;
              for(const part of parts.slice(0,-1)){
                target[part]={...(target[part]||{})};
                target=target[part];
              }
              target[parts.at(-1)]=value;
            }
            data.set(id,doc);
          },
        };
      },
    };
  },
};
for(const [relative,exports] of [
  ['./env.js',{readKey:k=>({'SUPPORT_EMAIL':'fixture@example.invalid','RESEND_API_KEY':'synthetic-test'}[k]||'')}],
  ['./firebase-admin.js',{adminDb:()=>fakeDb,adminStatus:()=>({ok:true})}],
]){
 const p=require.resolve(path.join(ROOT,relative));
 require.cache[p]={id:p,filename:p,loaded:true,exports,children:[],paths:[]};
}
global.fetch=async(_url,opts)=>{
 sent.push({key:opts.headers['Idempotency-Key'],payload:JSON.parse(opts.body)});
 return {ok:true,status:200};
};
const {fileTicket,updateTicketLocation}=require('./tickets');
(async()=>{
 const event={uid:'u-fixture',kind:'emergency',reason:'Route monitoring',
   description:'Simulated incident (not a real passenger)',trip:{no:'fixture-ride'},
   idempotencyKey:'route-monitor-incident-fixture-ride-emergency'};
 const first=await fileTicket(event);
 const again=await fileTicket({...event,description:'Second replay must keep first record'});
 assert.equal(first.ok,true);assert.equal(first.stored,true);assert.equal(first.emailed,true);
 assert.equal(again.ok,true);assert.equal(again.repeated,true);
 assert.equal(first.caseNo,again.caseNo);assert.equal(data.size,1);
 assert.equal(sent.length,1,'accepted alert not re-sent on replay');
 assert.equal(sent[0].key,'case-alert/'+first.caseNo);
 const second=await fileTicket({...event,idempotencyKey:'route-monitor-incident-fixture2-emergency'});
 assert.notEqual(second.caseNo,first.caseNo);assert.equal(data.size,2);
 assert.equal(sent.length,2);
 assert.equal(sent[1].key,'case-alert/'+second.caseNo);
 const changed=await updateTicketLocation({caseNo:first.caseNo,uid:'u-fixture',
   address:'Synthetic location',coords:{lat:25.7,lng:-80.3}});
 assert.equal(changed.ok,true);
 assert.equal(sent.length,3);
 assert.equal(sent[2].key,'case-location/'+first.caseNo);
 const otherUid=await updateTicketLocation({caseNo:first.caseNo,uid:'intruder',
   address:'Untrusted',coords:{lat:0,lng:0}});
 assert.equal(otherUid.ok,false);assert.equal(sent.length,3);
 const reused=await updateTicketLocation({caseNo:first.caseNo,uid:'u-fixture',
   address:'Synthetic position later',coords:{lat:25.8,lng:-80.4}});
 assert.equal(reused.ok,true);assert.equal(sent.length,3,'location update is not repeatedly mailed');
 const scheduled={
   uid:'u-fixture',kind:'support',reason:'Scheduled Travel requires Operations review',
   idempotencyKey:'scheduled-review-1234567890abcdef1234567890abcdef',
   description:'Synthetic scheduled dispatch needs investigation',
   trip:{no:'AR-TEST-SCHEDULED'},
 };
 const scheduledFirst=await fileTicket(scheduled);
 assert.equal(scheduledFirst.ok,true);
 assert.match(sent.at(-1).payload.subject,/^SCHEDULED REVIEW · AR-C-/);
 assert(sent.at(-1).payload.subject.includes('AR-TEST-SCHEDULED'));
 const invalidSupportPosition=await updateTicketLocation({caseNo:scheduledFirst.caseNo,
   uid:'u-fixture',address:'Falsified emergency map',coords:{lat:25.8,lng:-80.2}});
 assert.equal(invalidSupportPosition.ok,false,
   'an ordinary Support case must never accept an Emergency GPS update');
 assert.equal(data.get(scheduledFirst.caseNo)?.emergency,null,
   'ordinary Support records retain their original null emergency field');
 const invalidGps=await updateTicketLocation({caseNo:first.caseNo,
   uid:'u-fixture',address:null,coords:{lat:120,lng:0}});
 assert.equal(invalidGps.ok,false,'invalid latitude must not overwrite an actual Emergency');
 assert.equal(data.get(first.caseNo).emergency.coords.lat,25.8);
 data.set(first.caseNo,{...data.get(first.caseNo),status:'resolved'});
 const closedPosition=await updateTicketLocation({caseNo:first.caseNo,uid:'u-fixture',
   address:'Moved after closure',coords:{lat:25.9,lng:-80.3}});
 assert.equal(closedPosition.ok,false,'closed Emergency is not silently reopened by GPS timer');
 assert.equal(data.get(first.caseNo).emergency.coords.lat,25.8);
 const afterScheduled=sent.length;
 const scheduledAgain=await fileTicket(scheduled);
 assert.equal(scheduledAgain.caseNo,scheduledFirst.caseNo);
 assert.equal(sent.length,afterScheduled,'do not duplicate scheduled alert on replay');
 console.log('PASS stable emergency ticket, replay, distinct incident, Resend 24-hour idempotency headers, first-location-only notification, unauthorized location denial');
})().catch(e=>{console.error(e);process.exit(1)});
