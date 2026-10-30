'use strict';
// Operator self-service document correction messages. Never transmit extracted
// licence numbers, account-holder names, policy numbers or private OCR text in email.
// Read details inside the authenticated app. A notice is NOT a qualification decision.
const LABELS={license:'driver licence',registration:'vehicle registration',
  insurance:'insurance evidence',inspection:'vehicle inspection'};
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function correctionNotice({kind,verdict,reasons=[]}={}){
  if(!LABELS[kind]||!['review','refuse'].includes(verdict))return null;
  const reason=Array.isArray(reasons)?reasons.map(s=>String(s)).join(' ').toLowerCase():'';
  let action='Please open American Rider, review the document details and provide the missing or corrected evidence.';
  if(/insur|cover|policy|livery|for.hire|commercial|limit|pip|motorist/.test(reason))
    action='Please provide your current insurance declarations page or relevant endorsement showing the insured person, covered vehicle, policy dates, qualifying for-hire coverage and limits.';
  else if(/expir|validity|date/.test(reason))
    action='Please open American Rider and provide the current document showing its valid dates.';
  else if(/could not be read|unclear|text extraction|illegible|unavailable|photo|conclusive|skipped|temporarily|busy/.test(reason))
    action='Please open American Rider and provide a clearer photo or original PDF. Make sure the full document and its dates are visible.';
  else if(/match|plate|account|owner|name/.test(reason))
    action='Please check that your account and vehicle details match your document. If they are correct, use Support within American Rider for assistance.';
  const subject='American Rider | Your '+LABELS[kind]+' needs one more detail';
  const text='American Rider\n\nWe received and saved your '+LABELS[kind]+'. We could not yet verify every required detail.\n\n'+
    action+'\n\nYou do not need to start registration again. Your original file remains saved. '+
    'Specific details are available securely inside the app. You cannot accept paid Travels until qualification is complete.\n\n'+
    'American Rider Support';
  const html='<!doctype html><html><body style="font-family:Arial,sans-serif;color:#202a33;max-width:520px;margin:auto;padding:24px">'+
    '<h2 style="letter-spacing:2px;font-size:16px">AMERICAN RIDER</h2><p>We received and saved your '+escape(LABELS[kind])+
    '. We could not yet verify every required detail.</p><p>'+escape(action)+'</p>'+
    '<p>You do not need to start registration again. Your original file remains saved. '+
    'Specific details are available securely inside the app. Paid Travels remain unavailable until qualification is complete.</p>'+
    '<p>American Rider Support</p></body></html>';
  return {subject,text,html};
}
module.exports={correctionNotice};
