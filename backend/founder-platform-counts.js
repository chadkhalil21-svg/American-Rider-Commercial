'use strict';
// Verified on-demand aggregates. No national record dump, no invented role counts.
const {withinDeadline,OPS_BOARD_DEADLINE_MS}=require('./opslatency');
const ZONE='America/New_York';
function newYorkBusinessDay(now=Date.now()){
  if(!Number.isSafeInteger(now)||now<=0)throw Error('invalid_time');
  const fmt=new Intl.DateTimeFormat('en-US',{timeZone:ZONE,
    year:'numeric',month:'2-digit',day:'2-digit'});
  const p=Object.fromEntries(fmt.formatToParts(new Date(now))
    .filter(x=>['year','month','day'].includes(x.type)).map(x=>[x.type,Number(x.value)]));
  const offsetAt=guess=>{
    const part=new Intl.DateTimeFormat('en-US',{timeZone:ZONE,timeZoneName:'shortOffset'})
      .formatToParts(new Date(guess)).find(x=>x.type==='timeZoneName')?.value;
    const match=/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(part||'');
    if(!match)throw Error('timezone_unavailable');
    const m=(Number(match[2])*60+Number(match[3]||0));
    return (match[1]==='-'?-1:1)*m*60000;
  };
  const localMidnightUtc=dayOffset=>{
    const midnight=Date.UTC(p.year,p.month-1,p.day+dayOffset);
    return midnight-offsetAt(midnight);
  };
  return {date:[p.year,String(p.month).padStart(2,'0'),String(p.day).padStart(2,'0')].join('-'),
    timezone:ZONE,start:localMidnightUtc(0),end:localMidnightUtc(1)};
}
const QUERIES=Object.freeze([
  ['registeredAccountProfiles',db=>db.collection('users')],
  ['operatorProfiles',db=>db.collection('operators')],
  ['operatorsStartedOnboardingToday',(db,day)=>db.collection('users')
    .where('operatorOnboardingStartedAt','>=',day.start)
    .where('operatorOnboardingStartedAt','<',day.end)],
  ['operatorsQualifiedToday',(db,day)=>db.collection('users')
    .where('qualification.qualifiedAt','>=',day.start)
    .where('qualification.qualifiedAt','<',day.end)],
  ['operatorsReportingAvailable',db=>db.collection('operators').where('available','==',true)],
  ['activeTravelRecords',db=>db.collection('rides').where('status','in',['assigned','accepted','arrived','onboard'])],
  ['completedTravelRecords',db=>db.collection('rides').where('status','==','completed')],
  ['travelsCreatedToday',(db,day)=>db.collection('rides').where('createdAt','>=',day.start)
    .where('createdAt','<',day.end)],
  ['travelsSettledToday',(db,day)=>db.collection('rides').where('settledAt','>=',day.start)
    .where('settledAt','<',day.end)],
  ['recruiterAccounts',db=>db.collection('recruiter_accounts')],
]);
async function founderPlatformCounts(db,{deadlineMs=OPS_BOARD_DEADLINE_MS,now=Date.now()}={}){
  if(!db)return {ok:false,reason:'database_unavailable'};
  let day;
  try{day=newYorkBusinessDay(now);}catch{return {ok:false,reason:'time_unavailable'};}
  const settled=await Promise.allSettled(QUERIES.map(async ([,query])=>{
    const snap=await withinDeadline(()=>query(db,day).count().get(),deadlineMs);
    const count=snap?.data()?.count;
    if(!Number.isSafeInteger(count)||count<0)throw Error('unverified_count');
    return count;
  }));
  const counts={},unavailable=[];
  QUERIES.forEach(([name],i)=>{
    if(settled[i].status==='fulfilled')counts[name]=settled[i].value;
    else{counts[name]=null;unavailable.push(name);}
  });
  return {ok:unavailable.length===0,counts,unavailable,day,asOf:now,
    meanings:{
      registeredAccountProfiles:'Firebase-linked user profiles; Operators may have the same user profile, not distinct Traveler-only people',
      operatorProfiles:'Operator fleet records, not necessarily qualified or dispatchable',
      operatorsStartedOnboardingToday:'First recorded active-market Operator enrollment start today; historical starts before tracking are not backfilled',
      operatorsQualifiedToday:'Operator profiles whose current verified qualification period began today; not a first-ever onboarded count or live duty availability',
      operatorsReportingAvailable:'Self-reported available; not proof of eligibility',
      activeTravelRecords:'Assigned through onboard records as currently stored',
      completedTravelRecords:'Completed Travel records, not proof of collection',
      travelsCreatedToday:'Travel records created on the stated Eastern calendar date',
      travelsSettledToday:'Travel records with a server-recorded settlement date today; later refunds or disputes may change net receipts',
      recruiterAccounts:'Private invited recruiter accounts, not earning participants',
    }};
}
function overviewMarkup(result){
  const labels=[
    ['registeredAccountProfiles','Registered accounts'],
    ['operatorProfiles','Operator profiles'],
    ['operatorsStartedOnboardingToday','Operators beginning onboarding today'],
    ['operatorsQualifiedToday','Operators qualifying today'],
    ['operatorsReportingAvailable','Operators reporting available'],
    ['activeTravelRecords','Travels in progress'],
    ['completedTravelRecords','Completed Travel records, all time'],
    ['travelsCreatedToday','Travels created today'],
    ['travelsSettledToday','Travels settled today'],
    ['recruiterAccounts','Recruiter accounts'],
  ];
  const day=result?.day?.date||'Unavailable';
  const cards=labels.map(([key,label])=>
    '<div style="padding:16px;border:1px solid #d9dee4;border-radius:12px">'+
      '<div style="font-size:13px">'+label+'</div>'+
      '<strong style="font-size:28px">'+(result?.counts?.[key]??'Unavailable')+'</strong></div>').join('');
  return '<h1>Platform Overview</h1><p>Company-wide indexed totals · on-demand · Eastern date '+day+'</p>'+
    (result?.unavailable?.length?'<p role="alert">Some totals could not be verified. Unavailable is not zero.</p>':'')+
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px">'+cards+'</div>'+
    '<p>Registered accounts may also be Operators. We cannot yet provide an exact distinct Traveler-only count or genuine enrollment geography from unverified role/location fields; no identities or precise locations are exposed.</p>'+
    '<p>New onboarding totals only include events recorded after this reporting feature is deployed. Qualifying today describes the current qualified period, not first-ever account creation. Available is not qualified. Completed is not paid. Settled is not final net revenue after possible reversals. These are operational counts, not a financial statement.</p>'+
    '<p><a href="/ops">Return to Operations</a></p>';
}
module.exports={QUERIES,ZONE,newYorkBusinessDay,founderPlatformCounts,overviewMarkup};
