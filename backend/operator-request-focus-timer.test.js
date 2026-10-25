'use strict';
// Regression for a real on-device Operator offer timing defect.
// Pure source contract: does not create or decline a real Travel.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync('app/operator/index.tsx','utf8');
assert.doesNotMatch(source,/useFocusEffect\(clearTimers\)/,
  'clearing offer timers on focus freezes visible request countdowns');
assert.match(source,/useFocusEffect\(useCallback\(\(\) => \{/,
  'focus callback must manage the offer lifecycle');
assert.match(source,/if \(requestRef\.current && AppState\.currentState === 'active'/,
  'returning to an active offer re-arms the timer');
assert.match(source,/openRequest\(requestRef\.current\)/,
  'returning to the Operator screen must restart countdown and visual progress');
assert.match(source,/return \(\) => \{\s*clearTimers\(\);\s*cbar\.stopAnimation\(\);\s*\}/,
  'leaving Operator screen must pause the timer and animation');
assert.match(source,/const openRequest = useCallback\(\(r: SimRequest\) => \{\s*\/\/[^\n]*\n\s*clearTimers\(\);/,
  'reopened offers must not leak competing intervals');
assert.match(source,/if \(await op\.acceptRequest\(request\)\)/,
  'keep acceptance authorized by the backend');
assert.match(source,/if \(await op\.declineRequest\(offered\)\)/,
  'keep explicit decline authorized by the backend');
console.log('PASS: Operator visible offer timers start on focus, pause on blur, and never duplicate');
