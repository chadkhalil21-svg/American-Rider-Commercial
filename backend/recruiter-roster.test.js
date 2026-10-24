'use strict';
const assert=require('node:assert/strict');
const {listIntroductions,referenceFor,PAGE_SIZE}=require('./recruiter-roster');
const DB=[];
for(let i=0;i<45;i++)DB.push({id:'person'+i+'_operator',
  inviterUid:i===44?'recruiter-other':'recruiter-a',role:'operator',
  claimedAt:Date.UTC(2026,9,24)+i,name:'Private Operator',email:'private@example.org',
  origin:'Private street',destination:'Private address',qualifiedTravels:300});
DB.push({id:'friend_traveler',inviterUid:'recruiter-a',role:'traveler',
  claimedAt:Date.UTC(2026,9,24)+100,name:'Private Traveler'});
function db(){
 const reads=[];
 function snap(name,row){return {id:name,exists:!!row,data:()=>row};}
 return {reads,
   collection(name){
    return {
      doc(id){return {get:async()=>{reads.push(name+'/'+id);if(name==='recruiter_accounts'){
       if(id==='recruiter-a')return snap(id,{status:'approved',verifiedEmail:'recruiter@ar.test',
          allowedRoles:['operator','traveler']});
       return snap(id,null);
      }
      return snap(id,DB.find(r=>r.id===id)||null);
      }};},
      where(field,op,value){
        assert.equal(name,'referral_attributions');assert.equal(field,'inviterUid');
        assert.equal(op,'==');
        return {where(field2,op2,role){
          assert.equal(field2,'role');assert.equal(op2,'==');
          let max=Infinity,after=null;
          return {orderBy(field3,dir){assert.equal(field3,'__name__');assert.equal(dir,'asc');
            return {limit(n){max=n;
              return {startAfter(s){after=s.id;return this;},
                async get(){reads.push('INDEX_ONLY_'+value+'_'+role);
                  let a=DB.filter(r=>r.inviterUid===value&&r.role===role)
                    .sort((a,b)=>a.id.localeCompare(b.id));
                  if(after){const pos=a.findIndex(z=>z.id===after);a=a.slice(pos+1);}
                  return {docs:a.slice(0,max).map(z=>snap(z.id,z))};
                }};
            }};}}
        }};
      }
    };
   }
 };
}
(async()=>{
 const database=db();
 const a=await listIntroductions({db:database,uid:'recruiter-a',
   verifiedEmail:'recruiter@ar.test',role:'operator'});
 assert.equal(a.ok,true);assert.equal(a.items.length,PAGE_SIZE);
 assert.match(a.nextCursor,/^[A-Za-z0-9_-]{38,256}$/);
 assert.equal(a.nextCursor.includes('person'),false,
   'pagination token must not disclose invitee Firebase ID');
 assert.equal(a.items[0].progress,'introduction_recorded');
 assert.equal(a.items[0].qualifyingTravels,null);
 assert.equal(a.items[0].earnedCents,null);
 assert.equal(a.items[0].paidCents,null);
 for(const row of a.items){
  assert.deepEqual(Object.keys(row),['reference','role','recordedAt','progress',
    'qualifyingTravels','earnedCents','paidCents']);
  assert.match(row.reference,/^AR-[0-9A-F]{12}$/);
  assert.equal(JSON.stringify(row).includes('private@example.org'),false);
  assert.equal(JSON.stringify(row).includes('Private street'),false);
  assert.equal(JSON.stringify(row).includes('person'),false);
 }
 const next=await listIntroductions({db:database,uid:'recruiter-a',
    verifiedEmail:'recruiter@ar.test',role:'operator',after:a.nextCursor});
 assert.equal(next.ok,true);assert.equal(next.items.length,20);
 assert.ok(next.nextCursor);
 const last=await listIntroductions({db:database,uid:'recruiter-a',
    verifiedEmail:'recruiter@ar.test',role:'operator',after:next.nextCursor});
 assert.equal(last.items.length,4);assert.equal(last.nextCursor,null);
 const denied=await listIntroductions({db:database,uid:'recruiter-a',
   verifiedEmail:'recruiter@ar.test',role:'operator',after:'person44_operator'});
 assert.equal(denied.reason,'invalid_cursor');
 const tampered=await listIntroductions({db:database,uid:'recruiter-a',
   verifiedEmail:'recruiter@ar.test',role:'operator',
   after:a.nextCursor.slice(0,-1)+(a.nextCursor.endsWith('A')?'B':'A')});
 assert.equal(tampered.reason,'invalid_cursor');
 const wrongRole=await listIntroductions({db:database,uid:'recruiter-a',
   verifiedEmail:'recruiter@ar.test',role:'traveler',after:a.nextCursor});
 assert.equal(wrongRole.reason,'invalid_cursor');
 const wrong=await listIntroductions({db:database,uid:'recruiter-a',
   verifiedEmail:'wrong@ar.test',role:'operator'});
 assert.equal(wrong.reason,'identity_mismatch');
 assert.equal((await listIntroductions({db:database,uid:'recruiter-no',
   verifiedEmail:'recruiter@ar.test',role:'operator'})).reason,'not_enrolled');
 assert.equal((await listIntroductions({db:database,uid:'recruiter-a',
   verifiedEmail:'recruiter@ar.test',role:'invalid'})).reason,'invalid_request');
 const travelers=await listIntroductions({db:database,uid:'recruiter-a',
   verifiedEmail:'recruiter@ar.test',role:'traveler'});
 assert.equal(travelers.items.length,1);
 assert.equal(travelers.items[0].qualifyingTravels,null);
 assert.equal(referenceFor('test_operator'),referenceFor('test_operator'));
 assert.notEqual(referenceFor('test_operator'),referenceFor('other_operator'));
 assert.equal(database.reads.filter(x=>x.startsWith('INDEX_ONLY_')).length,4);
 console.log('PASS recruiter progress: strict identity, role, 20-record pagination, no Traveler route/name or fictional earnings');
})().catch(e=>{console.error(e);process.exitCode=1;});
