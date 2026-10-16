const assert = require('node:assert/strict');
const { authorizeTravelMessage } = require('./travel-message-policy');
const ride = { status:'assigned',travelerUid:'traveler1',operatorId:'operator1',tripNo:'AR-1',party:{teen:true,guardianUid:'guardian1'} };
const item = { travelerUid:'traveler1',tripNo:'AR-1',candidateTripNos:['AR-1'],status:'reported' };
const db = {collection(name){assert.equal(name,'lost_items');return {doc(id){return {
  get:async()=>id==='verified-item'?{exists:true,data:()=>({...item})}:{exists:false}
};}};}};
(async()=>{
 const check=(uid,status,lostItemId=null)=>authorizeTravelMessage({db,ride:{...ride,status},uid,lostItemId});
 assert.equal((await check('traveler1','assigned')).ok,true);
 assert.equal((await check('guardian1','assigned')).ok,true);
 assert.equal((await check('operator1','assigned')).ok,false,'offered operator cannot chat before acceptance');
 for(const status of ['accepted','arrived','onboard']){
   for(const uid of ['traveler1','operator1','guardian1']){
     const outcome=await check(uid,status);assert.equal(outcome.ok,true,status+' '+uid);
   }
 }
 assert.equal((await check('unrelated','accepted')).status,403);
 assert.equal((await check('operator1','cancelled','verified-item')).ok,false);
 assert.equal((await check('operator1','completed','fake')).ok,false);
 assert.equal((await check('operator1','completed','verified-item')).ok,true);
 assert.equal((await check('traveler1','completed','verified-item')).ok,true);
 assert.equal((await check('guardian1','completed','verified-item')).ok,false);
 assert.equal((await check('operator1','accepted','verified-item')).ok,false);
 const other = { collection(){return {doc(){return {get:async()=>({exists:true,data:()=>({...item,tripNo:'AR-ELSEWHERE',candidateTripNos:[]})})};}};} };
 assert.equal((await authorizeTravelMessage({db:other,ride:{...ride,status:'completed'},uid:'operator1',lostItemId:'verified-item'})).ok,false);
 const fs=require('node:fs'), path=require('node:path');
 const server=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
 const rules=fs.readFileSync(path.join(__dirname,'..','firestore.rules'),'utf8');
 assert.ok(server.includes('authorizeTravelMessage({db,ride:r,uid'), 'server must invoke shared identity guard');
 assert.ok(/match \/messages\/\{messageId\} \{[\s\S]*?allow create: if false;/.test(rules), 'direct client message spoofing blocked');
 console.log('PASS pre-pickup and active travel messaging, identity checks and verified lost-item follow-up');
})().catch(e=>{console.error(e);process.exitCode=1});
