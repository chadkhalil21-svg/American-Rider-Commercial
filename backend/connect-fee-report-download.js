'use strict';
// Download only a provider-confirmed finance_report_run CSV. Never expose the
// file, signed link or credentials through a public route or client response.
const https=require('node:https');
const {readKey}=require('./env');
const MAX_SIZE=6000000;
async function downloadReportCsv({stripe,fileId}){
  if(!stripe?.files?.retrieve||!/^file_[a-zA-Z0-9]+$/.test(fileId||''))
    throw Error('Stripe report file unavailable');
  const file=await stripe.files.retrieve(fileId);
  const expected='https://files.stripe.com/v1/files/'+fileId+'/contents';
  if(file.id!==fileId||file.purpose!=='finance_report_run'||file.url!==expected||
     file.size>MAX_SIZE) throw Error('invalid Stripe finance report file');
  const credential=readKey('STRIPE_SECRET_KEY');
  if(!credential.startsWith('sk_live_'))throw Error('live Stripe report credential required');
  return new Promise((resolve,reject)=>{
    const request=https.get(expected,{headers:{Authorization:'Bearer '+credential},timeout:15000},response=>{
      if(response.statusCode!==200){response.resume();return reject(Error('Stripe report download failed'));}
      let bytes=0;const chunks=[];
      response.on('data',chunk=>{
        bytes+=chunk.length;
        if(bytes>MAX_SIZE)return request.destroy(Error('Stripe fee report exceeds maximum size'));
        chunks.push(chunk);
      });
      response.once('end',()=>resolve(Buffer.concat(chunks).toString('utf8')));
      response.once('error',reject);
    });
    request.once('timeout',()=>request.destroy(Error('Stripe report timeout')));
    request.once('error',reject);
  });
}
module.exports={downloadReportCsv};
