'use strict';
// No Firebase/Stripe calls. Tests the actual compound query shape and 100-read ceiling.
const assert = require('node:assert/strict');
const {listTickets} = require('./tickets');

function fakeDb(rows, tally) {
  const sorted = [...rows].sort((a,b)=>b.createdAt-a.createdAt);
  function query(offset=0, cap=100) {
    return {
      orderBy(field,order){assert.equal(field,'createdAt');assert.equal(order,'desc');return this;},
      startAfter(cursor){
        const i=sorted.findIndex(r=>r.caseNo===cursor.id);
        assert.notEqual(i,-1,'cursor identifies a previously read document');
        return query(i+1,cap);
      },
      limit(n){assert(n>=1&&n<=100);return query(offset,n);},
      async get(){
        const docs=sorted.slice(offset,offset+cap).map(r=>({id:r.caseNo,data:()=>r}));
        tally.count+=docs.length;
        return {docs};
      },
    };
  }
  return {collection(name){
    assert.equal(name,'support_tickets');
    return {where(field,op,uid){
      assert.equal(field,'uid');assert.equal(op,'==');
      return {
        orderBy(field,order){const q=query();const existing=q.orderBy(field,order);const make=()=>rows.filter(r=>r.uid===uid);
          const oldSorted=sorted.splice(0,sorted.length,...make().sort((a,b)=>b.createdAt-a.createdAt));void oldSorted;
          return existing;
        }
      };
    }};
  }};
}
async function run(){
  for(let pass=0;pass<2;pass++){
    const rows=[];
    for(let i=0;i<62;i++)rows.push({uid:'trav',caseNo:'O'+String(i).padStart(3,'0'),kind:'support',category:'operator-insurance',createdAt:500-i});
    for(let i=0;i<5;i++)rows.push({uid:'trav',caseNo:'P'+i,kind:'support',category:'fare',createdAt:100-i});
    rows.push({uid:'other',caseNo:'X',kind:'support',createdAt:999});
    const counted={count:0};
    const results=await listTickets('trav',{limit:3,database:fakeDb(rows,counted)});
    assert.deepEqual(results.map(r=>r.caseNo),['P0','P1','P2'],'newest eligible cases after skipped Operator records');
    assert(counted.count<=100,'strict read cap');
    assert(counted.count>=63,'more than one page required');
    assert(results.every(r=>!r.caseNo.startsWith('O')),'never leak Operator-only case');
    const onlyOperator=Array.from({length:120},(_,i)=>({uid:'trav',caseNo:'O'+i,category:'operator-insurance',createdAt:1000-i}));
    const bound={count:0};
    const hidden=await listTickets('trav',{database:fakeDb(onlyOperator,bound)});
    assert.equal(hidden.length,0);
    assert.equal(hidden.possiblyIncomplete,true);
    assert.equal(bound.count,100,'bounded even when no eligible cases');
  }
  console.log('PASS TWICE: newest cases, progressive indexed pages, private Operator filtering, max 100 Firestore reads');
}
run().catch(err=>{console.error(err);process.exitCode=1});
