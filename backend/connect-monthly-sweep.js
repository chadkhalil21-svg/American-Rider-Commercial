'use strict';
// Automatically obtain provider-authenticated account-level monthly Connect
// charges on the existing leased scheduler. Never estimate or collect a fee
// until a Stripe-generated account-specific report is available and validated.
const {importMonthlyAccountFees,monthBounds}=require('./connect-monthly-account-fees');
const COLUMNS=['connected_account_id','currency','connect_monthly_active_account_fee_subtotal_amount'];
function previousMonth(now){
  const date=new Date(now),start=Date.UTC(date.getUTCFullYear(),date.getUTCMonth()-1,1);
  return new Date(start).toISOString().slice(0,7);
}
async function reportType(stripe){
  if(typeof stripe?.reporting?.reportTypes?.list!=='function')
    return null;
  const types=await stripe.reporting.reportTypes.list({limit:100});
  if(types.has_more)throw Error('Stripe report type enumeration incomplete');
  const matches=(types.data||[]).filter(t=>
    /^platform[._-]earnings[._-]/i.test(String(t.id||'')) &&
    /connected/i.test(String(t.id||'')+' '+String(t.name||'')) &&
    t.livemode===true);
  if(matches.length!==1)return null;
  return matches[0].id;
}
async function sweepMonthlyConnectFees({db,stripe,now=Date.now(),
  importer=importMonthlyAccountFees,discover=reportType}={}){
  if(!db?.collection||!stripe?.reporting?.reportRuns)
    return {ok:false,reason:'billing_provider_unavailable'};
  const month=previousMonth(now),{start,end}=monthBounds(month);
  if(now<end+7*86400000)return {ok:true,ready:false,reason:'monthly_report_not_mature'};
  const ref=db.collection('connect_monthly_report_windows').doc(month);
  const snap=await ref.get(),prior=snap.exists?snap.data()||{}:{};
  if(prior.state==='complete')return {ok:true,complete:true,already:true};
  if(prior.state==='failed')return {ok:false,reason:'stripe_monthly_report_failed'};
  if(!prior.runId){
    const type=await discover(stripe);
    if(!type)return {ok:true,ready:false,reason:'verified_platform_earnings_report_type_unavailable'};
    const run=await stripe.reporting.reportRuns.create({
      report_type:type,
      parameters:{interval_start:start/1000,interval_end:end/1000,
        currency:'usd',columns:COLUMNS},
    });
    if(!/^frr_[A-Za-z0-9]+$/.test(run?.id||'')||!run.livemode||run.report_type!==type)
      throw Error('Stripe report creation not authenticated');
    await ref.set({runId:run.id,state:'pending',type,createdAt:now},{merge:true});
    return {ok:true,ready:false,requested:true};
  }
  const result=await importer({db,stripe,runId:prior.runId,month,now});
  if(!result.ok)throw Error('Monthly Connect fee import did not succeed');
  await ref.set({state:'complete',completedAt:now,
    created:result.created,quarantined:result.quarantined},{merge:true});
  return {ok:true,complete:true,created:result.created,quarantined:result.quarantined};
}
module.exports={COLUMNS,previousMonth,reportType,sweepMonthlyConnectFees};
