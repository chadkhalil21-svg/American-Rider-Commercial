#!/usr/bin/env node
'use strict';
// Business-planning tool only: no network access, cloud operations, or billing.
// Baseline published Google Cloud us-east1 on-demand rates, Oct 2026.
// Model deliberately has NO implicit HERE contract/transaction price.
const HOURS_PER_MONTH=730;
const VM_HOURLY_USD=0.06701142;            // e2-standard-2, Google general-purpose VM pricing
const PD_BALANCED_PER_GIB_HOURLY=0.000136986; // Google persistent disk pricing
const DATA_GIB=120, BOOT_GIB=30;            // Actual reviewed proposed VM configuration
const OPERATIONS_ALLOWANCE_PER_TRAVEL_USD=0.25; // current American Rider operating allocation

function readNumber(env,key,fallback,{integer=false,required=false}={}){
  const raw=env[key];
  if((raw===undefined||raw==='')&&!required)return fallback;
  if(raw===undefined||raw==='')throw Error(key+' required');
  const value=Number(raw);
  if(!Number.isFinite(value)||value<0||(integer&&!Number.isSafeInteger(value)))
    throw Error(key+' must be a nonnegative '+(integer?'integer':'number'));
  return value;
}
function estimate(env=process.env){
  const hours=readNumber(env,'PHOTON_RUNNING_HOURS_PER_MONTH',HOURS_PER_MONTH);
  if(hours>744)throw Error('PHOTON_RUNNING_HOURS_PER_MONTH cannot exceed 744');
  const extras=readNumber(env,'PHOTON_EXTRA_USD_MONTH',0);
  const vm=hours*VM_HOURLY_USD;
  // A stopped VM still pays for its persistent disks. Model assumes disks kept all month.
  const disk=HOURS_PER_MONTH*(DATA_GIB+BOOT_GIB)*PD_BALANCED_PER_GIB_HOURLY;
  const total=vm+disk+extras;
  const travels=readNumber(env,'COMPLETED_TRAVELS_MONTH',0,{integer:true});
  const queriesPerTravel=readNumber(env,'SEARCH_REQUESTS_PER_TRAVEL',5);
  const additionalSearches=readNumber(env,'NONBOOKING_SEARCH_REQUESTS_MONTH',0,{integer:true});
  const searches=Math.ceil(travels*queriesPerTravel+additionalSearches);
  const hereRate=readNumber(env,'HERE_AUTOSUGGEST_USD_PER_1000',null);
  const hereFree=readNumber(env,'HERE_FREE_MONTHLY_REQUESTS',0,{integer:true});
  const hereFixed=readNumber(env,'HERE_BASE_FEE_USD_MONTH',0);
  const hereCost=hereRate===null?null:hereFixed+(Math.max(0,searches-hereFree)/1000)*hereRate;
  const bestKnown=hereCost===null?'unverified':hereCost<total?'here':'photon';
  const impliedPhotonPer1000=searches?total*1000/searches:null;
  const hereBreakEvenPer1000=(searches>hereFree)
    ?Math.max(0,total-hereFixed)*1000/(searches-hereFree):null;
  const perTravel=travels?total/travels:null;
  const budget=travels*OPERATIONS_ALLOWANCE_PER_TRAVEL_USD;
  return {vm,disk,extras,total,travels,searches,hereRate,hereFree,hereCost,
    bestKnown,hereBreakEvenPer1000,impliedPhotonPer1000,perTravel,budget,
    otherInfrastructureNeedsBudget:true};
}
function money(n){return '$'+n.toFixed(2)}
function report(r){
  const lines=[
    'AMERICAN RIDER | Photon vs HERE | Monthly estimate only',
    'Photon always-on VM: '+money(r.vm),
    'Photon persistent disks: '+money(r.disk),
    'Other network / operations costs supplied: '+money(r.extras),
    'Photon estimated total: '+money(r.total),
    'Modeled paid/attempted searches: '+r.searches.toLocaleString('en-US'),
    'HERE subscription in founder screenshot: $0 recurring, but actual autosuggest per-call rate and commercial permission NOT verified',
    r.hereCost===null?'HERE comparison: UNKNOWN (set the contracted HERE_AUTOSUGGEST_USD_PER_1000 only after verified terms)':
      'HERE estimated contracted cost: '+money(r.hereCost)+'; lower modeled cash cost: '+(r.bestKnown==='here'?'HERE':'Photon'),
    r.hereBreakEvenPer1000===null?'HERE break-even rate: UNAVAILABLE without billable searches':
      'Photon becomes less expensive if HERE actually charges MORE THAN '+money(r.hereBreakEvenPer1000)+' per 1,000 billable searches under modeled plan',
    r.perTravel===null?'Photon average per completed Travel: unavailable without completed-Travel estimate':
      'Photon per completed Travel: '+money(r.perTravel)+' (not proof of positive overall margin)',
    'Full infrastructure allocation at modeled completed Travels: '+money(r.budget),
    'IMPORTANT: 25-cent provision is shared with Cloud Run, Firestore and all other infrastructure; Photon cannot consume the whole allowance.',
    'Excludes taxes, bandwidth/egress, external IPv4 charges, backup, monitoring, import/refresh, redundancy and growth; no claim of 100,000 simultaneous-Travels capacity.',
    'Decision: Do not turn on a new billable Photon VM solely because the software is free. Benchmark legal permission, search quality, full HERE invoice and production peak first.'
  ];
  return lines.join('\n');
}
if(require.main===module){
  try{
    process.stdout.write(report(estimate())+'\n');
  }catch(e){process.stderr.write(String(e.message)+'\n');process.exitCode=1;}
}
module.exports={estimate,report,VM_HOURLY_USD,PD_BALANCED_PER_GIB_HOURLY};
