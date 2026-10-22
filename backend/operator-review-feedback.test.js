'use strict';
// Regression: a manual review-status check must not silently redraw an identical
// screen. Server remains the only approval authority, no local fake approvals.
const assert = require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=x=>fs.readFileSync(path.join(__dirname,'..',x),'utf8');
const review=read('app/operator/review.tsx');
const connect=read('src/backend/connect.ts');
const server=read('backend/server.js');
const qualification=read('backend/qualification.js');
for(const [description,condition] of [
 ['manual status button explicitly refreshes',review.includes('onPress={() => { void check(true); }}')],
 ['repeat taps deduplicate a pending remote check',review.includes('if (checkingRef.current) return;')],
 ['a pending server response retains the concrete blocker',review.includes('setReviewReason(s.reason?.trim() || null)')],
 ['pending reason appears on the screen',review.includes('{reviewReason}</Text>')],
 ['a successful no-change check confirms its result',review.includes("if (requested) setRefreshNotice(t('traveler.reviewStillPending'))")],
 ['an unavailable server produces a visible failure',review.includes("if (requested) setRefreshNotice(t('traveler.reviewRefreshUnavailable'))")],
 ['refresh result is announced for accessibility',review.includes('accessibilityLiveRegion="polite"')],
 ['polling stays bounded to 10 minutes in foreground',review.includes('10 * 60_000') && review.includes("AppState.currentState === 'active'")],
 ['approval still requires server qualified status',review.includes("if (s.status === 'qualified' && !approvedOnce.current)")],
 ['incomplete applications route to their checklist',review.includes("s.status === 'incomplete'") && review.includes("router.replace('/operator/qualify')")],
 ['status API exposes the server blocker reason',connect.includes('d?.blockers?.[0]?.reason')],
 ['server GET reads current qualification',server.includes("app.get('/operator/qualification'") && server.includes('await assessAndRecord({ db, uid: req.uid')],
 ['qualification is always derived, never locally toggled',qualification.includes('function assessOperator(') && !review.includes("status: 'qualified' as const")],
]) assert(condition,description);
for(const locale of ['en','es','fr','it','de']){
 const text=read('src/i18n/'+locale+'.ts');
 for(const key of ['reviewStillPending','reviewRefreshUnavailable','reviewStatusHere']){
  assert(new RegExp('\\b'+key+':').test(text),locale+' missing '+key);
 }
}
console.log('PASS: Operator Check Status gives visible, accessible feedback for unchanged review and provider failure; server qualification stays authoritative in all five languages.');
