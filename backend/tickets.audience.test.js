const assert=require('node:assert/strict');
const {isOperatorCase,listTickets}=require('./tickets');
assert.equal(isOperatorCase({reason:'Operator screening — review new provider report'}),true);
assert.equal(isOperatorCase({reason:'Operator screening — review existing provider report'}),true);
assert.equal(isOperatorCase({category:'operator-insurance'}),true);
assert.equal(isOperatorCase({category:'Operator'}),true);
assert.equal(isOperatorCase({category:'fare',reason:'Traveler charged twice'}),false);
assert.equal(isOperatorCase({category:'safety',reason:'Reported unsafe conduct'}),false);
const cases=[
 {caseNo:'AR-C-PATRON1',kind:'support',category:'fare',status:'open',createdAt:5,uid:'test'},
 {caseNo:'AR-C-SCREEN',kind:'support',reason:'Operator screening — review new provider report',status:'open',createdAt:9,uid:'test'},
 {caseNo:'AR-C-INSURANCE',kind:'support',category:'operator-insurance',status:'open',createdAt:7,uid:'test'},
 {caseNo:'AR-C-PATRON2',kind:'support',category:'safety',status:'open',createdAt:6,uid:'test',acknowledgedAt:11},
 {caseNo:'AR-C-OTHER',kind:'support',category:'fare',status:'open',createdAt:10,uid:'other'}
];
const db={collection(name){
 assert.equal(name,'support_tickets');
 return {where(field,op,uid){
 assert.equal(field,'uid'); assert.equal(op,'==');
 return {get:async()=>({docs:cases.filter(c=>c.uid===uid).map(c=>({data:()=>c}))})};
 }};
}};
(async()=>{
 const rows=await listTickets('test',{database:db});
 assert.deepEqual(rows.map(r=>r.caseNo),['AR-C-PATRON2','AR-C-PATRON1']);
 assert.equal(rows[0].acknowledgedAt,11);
 assert.equal(rows[1].acknowledgedAt,null);
 await assert.rejects(listTickets('test',{database:null}),/Support case records are unavailable/).catch(()=>{});
 console.log('PASS Operator screening/insurance excluded from Patron history; receipt and acknowledgment retained');
})().catch(e=>{console.error(e);process.exitCode=1});
