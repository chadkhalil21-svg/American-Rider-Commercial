'use strict';
// Low-cost, privacy-preserving snapshot of background activity.
// These are logical-work counters, NOT billed Firestore reads/writes.
// Do not log ride/operator IDs, documents, coordinates, replies or names.
const KEYS = Object.freeze(['considered','scanned','watching','activeTravelsRead','written','lastWritten','overCapacity','pendingCount','checked','providerAccepted','providerRejected','unverified','purged']);
const { NAMES } = require('./critical-sweep-recovery');
const SKIPPED = new Set(['cadence','optional_paused_during_quota_recovery']);
function summarizeBackgroundWork(report) {
  const out = {};
  for (const name of NAMES) {
    if (!Object.hasOwn(report || {},name)) continue;
    const raw = report[name];
    const value = raw && typeof raw === 'object' ? raw : {};
    const item = {ok:value.ok === true, failed:value.ok === false};
    if (typeof value.skipped === 'string') item.skipped = SKIPPED.has(value.skipped) ? value.skipped : 'other';
    for (const key of KEYS) {
      if (key === 'overCapacity') {if(typeof value[key]==='boolean')item[key]=value[key];continue;}
      if (Number.isSafeInteger(value[key]) && value[key]>=0) item[key]=value[key];
    }
    out[name]=item;
  }
  return out;
}
function createBackgroundReporter({intervalMs=60*60_000,emit=console.info,now=Date.now}={}) {
  if (!Number.isFinite(intervalMs)||intervalMs<60_000)throw new Error('Invalid telemetry interval');
  let last = null, lastStatus = null;
  return report => {
    // A lease already held by another instance is not this instance's success
    // or recovery. Do not emit another worker's result (or reset incident state).
    if (report?.ok === true && report.skipped === 'another server owns this sweep') return false;
    const summary=summarizeBackgroundWork(report);
    const blocked=report?.ok===false;
    const failed=Object.values(summary).some(item=>item.failed);
    const complete=NAMES.every(name=>summary[name]?.ok===true);
    const status=blocked?'blocked':failed?'reported_failure':complete?'no_reported_job_failures':'incomplete_report';
    const severity=blocked||failed?'ERROR':complete?'INFO':'WARNING';
    const at=now();
    // Stable states remain hourly; a real failure or recovery transition cannot
    // disappear behind a recent successful summary. No logs for cached requests.
    if (last!==null && at-last<intervalMs && status===lastStatus)return false;
    // Cloud Run parses a single JSON line as structured Cloud Logging. Reuse
    // its native sink: no exporter, network call, extra queue or database read.
    emit(JSON.stringify({severity,message:'American Rider background sweep summary',
      event:'background_summary',status,jobs:summary}));
    last=at;lastStatus=status;
    return true;
  };
}

// Place this wrapper INSIDE the existing single-flight worker, not around the
// HTTP endpoint. Cached/reentrant calls do not represent executed sweeps.
function observeBackgroundWork(work,reporter) {
  const safelyReport=report=>{try { reporter(report); } catch { /* logging cannot change an operational result */ }};
  return async (...args)=>{
    let report;
    try { report=await work(...args); }
    catch (error) { safelyReport({ok:false}); throw error; }
    safelyReport(report);
    return report;
  };
}
module.exports = {summarizeBackgroundWork,createBackgroundReporter,observeBackgroundWork};
