'use strict';
// Scoped Founder MCP commands. Reuse the SAME authenticated Operations actor,
// existing transactional/audited domain services, and private Firestore.
// Never return consumer reports, insurance PDFs, bank coordinates or tokens.
const {readKey}=require('./env');
const recruiter=require('./recruiter-portal');
const qualification=require('./qualification');
const cases=require('./opscases');
const UID=/^[A-Za-z0-9_-]{6,128}$/;
function founderAuthorized(actor) {
  if(typeof actor!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(actor))return false;
  return String(readKey('AR_RECRUITER_FOUNDER_USERS')||'').split(',')
    .map(s=>s.trim()).some(v=>v===actor);
}
const validUid=uid=>typeof uid==='string'&&UID.test(uid);
function createFounderCommandServices(dbProvider){
  async function db(){const handle=dbProvider();if(!handle)throw Error('database_unavailable');return handle;}
  return {
    founderAuthorized,
    async recruiterStatus({email}){
      const address=recruiter.emailOf(email);
      if(!address)return {ok:false,code:'invalid_email'};
      const database=await db();
      const snap=await database.collection('recruiter_accounts')
        .where('verifiedEmail','==',address).limit(1).get();
      if(snap.empty)return {ok:false,code:'recruiter_not_found'};
      const item=snap.docs[0],d=item.data()||{};
      return {ok:true,uid:item.id,email:address,status:d.status||'unknown',
        allowedRoles:d.allowedRoles||[],reviewedAt:d.reviewedAt||null,
        note:'Founder approval is not payment or tax eligibility'};
    },
    async reviewRecruiter({uid,decision,actor}){
      if(!validUid(uid))return {ok:false,code:'invalid_uid'};
      return recruiter.founderDecision({db:await db(),uid,decision,actor});
    },
    async operatorStatus({uid}){
      if(!validUid(uid))return {ok:false,code:'invalid_uid'};
      const database=await db();
      const [person,driver]=await Promise.all([
        database.collection('users').doc(uid).get(),
        database.collection('operators').doc(uid).get(),
      ]);
      if(!person.exists)return {ok:false,code:'operator_not_found'};
      const u=person.data()||{},d=driver.exists?(driver.data()||{}):{};
      return {ok:true,uid,operatorProfileExists:driver.exists,
        suspended:u.suspension?.active===true,
        selfReportedAvailable:d.available===true,
        screeningStatus:u.screening?.decision||'unknown',
        insuranceMonitoring:u.insuranceMonitoring?.status||'unknown',
        note:'Availability does not establish independent eligibility'};
    },
    async suspendOperator({uid,suspended,note,actor}){
      if(!validUid(uid)||typeof suspended!=='boolean')return {ok:false,code:'invalid_request'};
      return qualification.setSuspension({
        db:await db(),uid,active:suspended,actor:{name:actor},note,
      });
    },
    async operationsCases({kind}){
      if(!['emergency','support'].includes(kind))return {ok:false,code:'invalid_kind'};
      const records=await cases.listOpsCases({db:await db(),kind});
      return {ok:true,kind,more:!!records.next,
        cases:records.cases.map(r=>({
          caseNo:r.id,kind:r.kind||null,category:r.category||null,
          createdAt:r.createdAt||null,status:r.status||'unknown',
          acknowledged:r.acknowledgedAt!=null,
        }))};
    },
    async operationsCaseAction({caseNo,action,note,actor}){
      return cases.actOnCase({db:await db(),caseNo,action,note,actor});
    },
  };
}
module.exports={createFounderCommandServices,founderAuthorized};
