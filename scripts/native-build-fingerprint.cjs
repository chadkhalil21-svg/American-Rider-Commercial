'use strict';
// A fail-closed digest of every tracked native-input file, except test-only
// paths which cannot change the produced mobile binary. No production secrets.
const fs = require('node:fs');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const files = cp.execFileSync('git', ['ls-files', '-z'], { maxBuffer: 128 * 1024 * 1024 })
  .toString('utf8').split('\0').filter(Boolean).sort();
const ignored = (p) => p.startsWith('.github/') || p.startsWith('.maestro/') ||
  p.startsWith('backend/') || p.startsWith('docs/') ||
  p.startsWith('infra/') || ['AGENTS.md','PROJECT-LEDGER.md',
  'scripts/native-build-fingerprint.cjs',
  'scripts/verify-native-maestro-selectors.cjs',
  'scripts/native-qa-android-network.cjs',
  'scripts/native-qa-android-network.test.cjs',
  'scripts/native-commercial-android-runner.sh',
  'scripts/native-commercial-env-preflight.cjs',
  // Only talks to Stripe from the CI runner; never bundled into the native app.
  'scripts/native-qa-stripe-pair-fastcheck.cjs',
  'scripts/prepare-native-maestro-stable-ids.cjs',
  'scripts/prepare-native-maestro-parallel-roles.cjs',
  'scripts/verify-native-accessibility-contract.cjs',
  'scripts/native-qa-stage-report.cjs',
  'scripts/native-qa-stage-report.test.cjs'].includes(p);
const h = crypto.createHash('sha256');
h.update('american-rider-native-release-qa-v1\0');
for (const prop of ['EXPO_PUBLIC_API_URL','EXPO_PUBLIC_AR_NATIVE_QA','EXPO_PUBLIC_REFERRALS_ENABLED']) {
  h.update(prop + '=' + (process.env[prop] || '') + '\0');
}
let count=0;
for (const p of files) {
  if (ignored(p)) continue;
  if (!fs.existsSync(p) || !fs.statSync(p).isFile()) throw new Error('Missing native build input: '+p);
  h.update(p+'\0');
  h.update(crypto.createHash('sha256').update(fs.readFileSync(p)).digest());
  count++;
}
if (count < 20) throw new Error('Too few native files; refusing an unsafe cache key: '+count);
// A generator modifies only the Android QA *native manifest* after Expo prebuild.
// Include its exact bytes in the Android APK key but not the iOS simulator key.
if (process.env.AR_NATIVE_PLATFORM === 'android') {
  const patch='scripts/native-qa-android-network.cjs';
  if (!fs.existsSync(patch)) throw new Error('Missing Android QA security policy generator');
  h.update(patch+'\0');
  h.update(crypto.createHash('sha256').update(fs.readFileSync(patch)).digest());
}
process.stdout.write(h.digest('hex')+'\n');
