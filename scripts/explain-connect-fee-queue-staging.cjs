#!/usr/bin/env node
'use strict';
// Deliberately staging-only, read-only Firestore Query Explain.
// Plan mode: 1 billed read; --analyze runs the query and incurs ordinary reads.
// Requires explicit project-id match; cannot accidentally inspect production.
async function main(args=process.argv.slice(2)){
  const projectPos=args.indexOf('--staging-project');
  const chosen=projectPos<0 ? '' : args[projectPos+1];
  if(!/^[a-z][a-z0-9-]{5,50}$/.test(chosen||''))throw Error('Use --staging-project <exact project ID>');
  if(chosen!==process.env.AR_STAGING_PROJECT_ID || process.env.AR_STAGING_ONLY!=='true')
    throw Error('Explicit staging project environment confirmation required');
  if(process.env.GOOGLE_CLOUD_PROJECT && process.env.GOOGLE_CLOUD_PROJECT!==chosen)
    throw Error('Active cloud project does not match staging');
  if(process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT!==chosen)
    throw Error('Active GCP project does not match staging');
  const admin=require('firebase-admin');
  if(!admin.apps.length)admin.initializeApp({projectId:chosen,credential:admin.credential.applicationDefault()});
  const db=admin.firestore();
  if(db.projectId && db.projectId!==chosen)throw Error('Firestore project mismatch');
  const now=Date.now();
  const q=db.collection('operator_connect_fee_obligations').where('status','==','due')
    .where('nextReviewAt','<=',now).orderBy('nextReviewAt').limit(80);
  const options={analyze:args.includes('--analyze')?'true':'false'};
  const result=await q.explain(options);
  const metrics=result?.metrics||{};
  console.log(JSON.stringify({
    scope:'STAGING-ONLY',mode:options.analyze==='true'?'analyze, billed':'plan only',
    project:chosen,indexes:metrics?.planSummary?.indexesUsed||null,
    readOperations:metrics?.executionStats?.readOperations??null,
    indexEntriesScanned:metrics?.executionStats?.debugStats?.index_entries_scanned??null,
    documentsScanned:metrics?.executionStats?.debugStats?.documents_scanned??null,
    outcome:'No fees or Stripe API called'
  },null,2));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={main};
