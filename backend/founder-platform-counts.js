'use strict';
// Founder-only counts. Do not use samples as national totals and never download
// people's private account records just to calculate the size of the network.
const {withinDeadline,OPS_BOARD_DEADLINE_MS}=require('./opslatency');
const QUERIES=Object.freeze([
  ['registeredAccountProfiles', db=>db.collection('users')],
  ['operatorProfiles', db=>db.collection('operators')],
  ['operatorsReportingAvailable', db=>db.collection('operators').where('available','==',true)],
  ['completedTravelRecords', db=>db.collection('rides').where('status','==','completed')],
  ['recruiterAccounts', db=>db.collection('recruiter_accounts')],
]);
async function founderPlatformCounts(db,{deadlineMs=OPS_BOARD_DEADLINE_MS}={}){
  if(!db)return {ok:false,reason:'database_unavailable'};
  const settled=await Promise.allSettled(QUERIES.map(async ([,query])=>{
    const snap=await withinDeadline(()=>query(db).count().get(),deadlineMs);
    const count=snap?.data()?.count;
    if(!Number.isSafeInteger(count)||count<0)
      throw new Error('count_not_verified');
    return count;
  }));
  const counts={},unavailable=[];
  QUERIES.forEach(([name],i)=>{
    if(settled[i].status==='fulfilled')counts[name]=settled[i].value;
    else{counts[name]=null;unavailable.push(name);}
  });
  return {ok:unavailable.length===0,counts,unavailable,
    meanings:{
      registeredAccountProfiles:'Firestore user profiles, not distinct Traveler-only people',
      operatorProfiles:'Operator registration records, not currently qualified or dispatchable Operators',
      operatorsReportingAvailable:'Self-reported available, not dispatch qualification',
      completedTravelRecords:'Completed Travel records, not verified paid or settled Travels',
      recruiterAccounts:'Recruiter account records, not active paying partners',
    },
  };
}
function overviewMarkup(result){
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[c]);
  const labels=[
    ['registeredAccountProfiles','Registered accounts'],
    ['operatorProfiles','Operator profiles'],
    ['operatorsReportingAvailable','Operators reporting available'],
    ['completedTravelRecords','Completed Travel records'],
    ['recruiterAccounts','Recruiter accounts'],
  ];
  const cards=labels.map(([key,label])=>
    '<div style="padding:16px;border:1px solid #d9dee4;border-radius:12px">'+
      '<div style="font-size:13px">'+esc(label)+'</div>'+
      '<strong style="font-size:28px">'+(result?.counts?.[key]??'Unavailable')+'</strong></div>').join('');
  return '<h1>Platform Overview</h1><p>Company-wide database totals · on-demand</p>'+
    (result?.unavailable?.length?'<p role="alert">Some totals could not be verified. Unavailable is not zero.</p>':'')+
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px">'+cards+'</div>'+
    '<p>Registered accounts may also be Operators. A separate exact Traveler-only count is not presently supported by existing account records. Do not subtract Operator profiles from registered accounts to invent it.</p>'+
    '<p>Reported available does not mean qualified to accept Travel. Completed records are not necessarily paid, and these figures are not a financial ledger.</p>'+
    '<p><a href="/ops">Return to Operations</a></p>';
}
module.exports={QUERIES,founderPlatformCounts,overviewMarkup};
