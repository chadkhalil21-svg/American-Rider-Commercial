'use strict';
// Source: Stripe "All Fees" itemized report. This is an evidence-only parser.
// An external trusted Stripe reporting client must verify the report-run status
// and supply its CSV. Never infer a monthly charge from Stripe's public rates.
const {createHash}=require('node:crypto');
const REQUIRED=['fee_transaction_id','incurred_by','fee_description','amount',
  'tax','currency','suite','product','feature_name','settled_via'];
function parseCsv(input){
  if(typeof input!=='string'||Buffer.byteLength(input)>6000000)throw Error('invalid report size');
  const rows=[];let row=[],field='',quoted=false;
  for(let i=0;i<input.length;i++){
    const c=input[i];
    if(quoted){
      if(c==='"'&&input[i+1]==='"'){field+='"';i++;}
      else if(c==='"')quoted=false;
      else field+=c;
    }else if(c==='"'&&field==='')quoted=true;
    else if(c===','){row.push(field);field='';}
    else if(c==='\n'){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field='';}
    else field+=c;
  }
  if(quoted)throw Error('malformed quoted CSV');
  if(row.length||field){row.push(field);rows.push(row);}
  if(rows.length===0)return [];
  const headings=rows.shift().map(x=>x.replace(/^\uFEFF/,'').trim());
  for(const name of REQUIRED)if(!headings.includes(name))throw Error('missing required fee column '+name);
  if(new Set(headings).size!==headings.length)throw Error('duplicate column');
  return rows.filter(r=>r.length>1||r[0]!=='').map(r=>{
    if(r.length!==headings.length)throw Error('malformed report row');
    return Object.fromEntries(headings.map((k,i)=>[k,r[i]]));
  });
}
function cents(input){
  const s=String(input||'').trim();
  if(!/^-?\d+(\.\d{1,2})?$/.test(s))throw Error('bad fee amount');
  const neg=s.startsWith('-'),n=s.replace('-','').split('.');
  const v=Number(n[0])*100+Number((n[1]||'').padEnd(2,'0'));
  if(!Number.isSafeInteger(v))throw Error('fee amount overflow');
  return neg?-v:v;
}
function reviewFeeReport(csv,{reportRunId,reportComplete,reportLive}={}){
  if(!reportComplete||!reportLive||!/^frr_[a-zA-Z0-9]+$/.test(reportRunId||''))
    throw Error('completed live provider report metadata required');
  const accepted=[],needsReview=[],fingerprints=new Set();
  const rows=parseCsv(csv);
  for(const row of rows){
    if(String(row.suite).toLowerCase()!=='connect'&&
       String(row.product).toLowerCase()!=='connect')continue;
    const amountCents=cents(row.amount)+cents(row.tax);
    const incurredBy=String(row.incurred_by||'');
    const fingerprint=createHash('sha256').update([
      row.fee_transaction_id,incurredBy,row.fee_description,row.amount,row.tax,
      row.currency,row.feature_name].join('|')).digest('hex');
    if(fingerprints.has(fingerprint))throw Error('duplicate fee row; provider reconciliation required');
    fingerprints.add(fingerprint);
    const record={id:fingerprint,providerFeeTransactionId:row.fee_transaction_id,
      incurredBy,amountCents,currency:row.currency.toLowerCase(),reportRunId,
      description:row.fee_description,featureName:row.feature_name,
      settledVia:row.settled_via};
    // No guessed attribution. Provider invoice settlement, tax credits and
    // monthly aggregate items all require separate reconciliation.
    const reason=record.currency!=='usd'?'currency_unverified':
      !record.providerFeeTransactionId?'provider_id_missing':
      amountCents<=0?'refund_or_credit_review':
      !['balance','v2_balance'].includes(record.settledVia)?'invoice_or_settlement_unverified':
      !/^po_[A-Za-z0-9]+$/.test(incurredBy)?'no_unique_operator_payout_id':null;
    if(reason)needsReview.push({...record,reason});
    else accepted.push({...record,classification:'unclassified_connect_fee',
      operatorAttributionVerified:false});
  }
  return {rowCount:rows.length,accepted,needsReview,
    operatorFeeCollectionAuthorized:false};
}
module.exports={parseCsv,cents,reviewFeeReport};
