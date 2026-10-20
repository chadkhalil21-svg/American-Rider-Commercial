'use strict';
const assert=require('node:assert/strict');
const {parseCsv,cents,reviewFeeReport}=require('./connect-fee-reconciliation');
const header='fee_transaction_id,incurred_by,fee_description,amount,tax,currency,suite,product,feature_name,settled_via';
const r=(...cells)=>cells.join(',');
const payout=r('ftxn_paid','po_One','Payout processing','0.50','0.00','USD','Connect','Connect','Payouts','balance');
const monthly=r('ftxn_month','', 'Monthly account fee','2.00','0.00','USD','Connect','Connect','Account management','balance');
const invoice=r('ftxn_invoice','po_Two','Payout invoiced','1.00','0.00','USD','Connect','Connect','Payouts','invoice');
const credit=r('ftxn_credit','po_One','Fee refund','-0.50','0.00','USD','Connect','Connect','Payouts','balance');
const caseReport=(lines,override={})=>reviewFeeReport([header,...lines].join('\n'),{
  reportRunId:'frr_ConfirmedRun',reportComplete:true,reportLive:true,...override});
assert.equal(cents('0.50'),50);assert.equal(cents('0.01'),1);
assert.equal(cents('1.15'),115);assert.equal(cents('-0.01'),-1);
assert.throws(()=>cents('1e3'),/bad fee amount/);
assert.equal(parseCsv([header,r('ftxn_2','po_One','"x,y"','0.10','0','USD','Connect','Connect','Payouts','balance')].join(String.fromCharCode(10))).length,1);
assert.equal(parseCsv([header,r('ftxn_1','po_One','"Payout, processing"','0.50','0','USD','Connect','Connect','Payouts','balance')].join('\n'))[0].fee_description,'Payout, processing');
assert.equal(caseReport([payout]).accepted.length,1);
const mix=caseReport([payout,monthly,invoice,credit]);
assert.equal(mix.accepted.length,1);
assert.deepEqual(mix.needsReview.map(x=>x.reason),[
  'no_unique_operator_payout_id','invoice_or_settlement_unverified','refund_or_credit_review']);
assert.equal(mix.operatorFeeCollectionAuthorized,false);
assert.throws(()=>caseReport([payout,payout]),/duplicate fee row/);
assert.throws(()=>caseReport([payout],{reportLive:false}),/completed live/);
assert.throws(()=>caseReport([payout],{reportComplete:false}),/completed live/);
assert.throws(()=>parseCsv('fee_transaction_id,amount\nftxn_x,2'),/missing required/);
console.log('PASS: Stripe Connect itemized fees quarantine invoices, monthly aggregate costs and fee credits; never authorize collection');
