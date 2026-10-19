#!/usr/bin/env node
// Does the simulator show what TestFlight will show?
//
// The simulator can never run the TestFlight binary itself, so "reflects" has to mean
// something checkable: the SAME COMMIT, the SAME VERSION, and the SAME CONFIGURATION (the
// production API, not a laptop's). This script reads all three from where they actually
// live — the compiled bundle installed on every booted simulator, the repository, and EAS's
// record of the last iOS build — and gives one verdict. It never guesses: a build nobody
// stamped is reported as unprovable, not assumed.
//
//   npm run parity            human-readable report, exit 0 always
//   npm run parity -- --json  the same as JSON (what the watch loop compares between runs)
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const sh = (cmd, timeout = 30000) => {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout }).trim();
  } catch {
    return '';
  }
};
const BUNDLE_ID = 'com.americanrider.app';
const PROD_API = 'https://american-rider-api-production-623854974930.us-east1.run.app';
const short = (sha) => (sha ? sha.slice(0, 7) : '—');

// ---- the candidate: what the repository says should ship ----------------------------------
const head = sh('git rev-parse HEAD');
const branch = sh('git branch --show-current');
const dirtyFiles = sh('git status --porcelain').split('\n').filter(Boolean).length;
const version = JSON.parse(fs.readFileSync('app.json', 'utf8')).expo.version;

// ---- the simulators: what is actually installed -------------------------------------------
function simulators() {
  const out = [];
  let list;
  try {
    list = JSON.parse(sh('xcrun simctl list devices booted -j') || '{"devices":{}}');
  } catch {
    return out;
  }
  for (const devices of Object.values(list.devices || {})) {
    for (const d of devices) {
      if (d.state !== 'Booted') continue;
      if (!/^iPhone/.test(d.name)) continue; // phones only: that is what operators and travelers carry
      const container = sh(`xcrun simctl get_app_container ${d.udid} ${BUNDLE_ID}`);
      if (!container) {
        out.push({ name: d.name, udid: d.udid, installed: false });
        continue;
      }
      const plist = path.join(container, 'Info.plist');
      const appVersion = sh(`/usr/libexec/PlistBuddy -c "Print CFBundleShortVersionString" "${plist}"`);
      const buildNumber = sh(`/usr/libexec/PlistBuddy -c "Print CFBundleVersion" "${plist}"`);
      let commit = null;
      let api = 'unknown';
      let bundleMtime = null;
      try {
        const bundlePath = path.join(container, 'main.jsbundle');
        const text = fs.readFileSync(bundlePath, 'latin1');
        bundleMtime = fs.statSync(bundlePath).mtime.toISOString();
        // One literal, "ar-commit:<sha>", because Release bundles are Hermes bytecode whose
        // string table would keep a prefix and a concatenated sha apart.
        const m = text.match(/ar-commit:([0-9a-f]{40})/);
        commit = m ? m[1] : null;
        // A build of a commit older than the stamp proves itself another way: the build script
        // records the hash of the bundle it produced and which commit it built; if the installed
        // bundle hashes the same, that record is the stamp.
        if (!commit) {
          try {
            const rec = JSON.parse(fs.readFileSync('.expo/simulator-build.json', 'utf8'));
            const sha = crypto.createHash('sha256').update(fs.readFileSync(bundlePath)).digest('hex');
            if (rec.bundleSha256 && rec.bundleSha256 === sha) commit = rec.commit;
          } catch {
            /* no record */
          }
        }
        // Hermes/Metro generally retain the endpoint hostname as a literal. Only the
        // canonical paid Cloud Run hostname proves production: Render is an old backend.
        // A missing literal leaves this as unknown rather than falsely certifying a build.
        if (text.includes(new URL(PROD_API).host)) api = 'production';
        else if (text.includes('american-rider-server-3d7x.onrender.com') ||
                 text.includes('american-rider-server.onrender.com')) api = 'legacy Render';
        else if (text.includes('localhost:4242') || text.includes('127.0.0.1:4242')) api = 'local (localhost:4242)';
      } catch {
        /* no bundle: a debug build served by Metro */
      }
      out.push({ name: d.name, udid: d.udid, installed: true, appVersion, buildNumber, commit, api, bundleMtime });
    }
  }
  return out;
}
const sims = simulators();

// ---- TestFlight, as far as EAS can see -----------------------------------------------------
// EAS records the commit each build was made from. Whether Apple has finished processing it
// for testers is App Store Connect's knowledge, which needs Chad's account; this reports the
// last build EAS finished, which is the most recent thing TestFlight can be showing.
let eas = null;
try {
  // Bounded: EAS has taken minutes to answer, and a watch that hangs on it verifies nothing.
  const raw = sh('npx eas-cli build:list --platform ios --limit 1 --json --non-interactive', 90000);
  const b = JSON.parse(raw || '[]')[0];
  if (b) {
    eas = {
      status: b.status,
      appVersion: b.appVersion,
      buildNumber: b.appBuildVersion,
      commit: b.gitCommitHash,
      createdAt: b.createdAt,
      profile: b.buildProfile,
      distribution: b.distribution,
    };
  }
} catch {
  eas = null;
}
const aheadOfTestFlight = eas?.commit ? Number(sh(`git rev-list --count ${eas.commit}..${head}`) || 0) : null;
const behindTestFlight = eas?.commit ? Number(sh(`git rev-list --count ${head}..${eas.commit}`) || 0) : null;

// ---- the verdict ---------------------------------------------------------------------------
function verdictFor(sim) {
  if (!sim.installed) return { code: 'NO_APP', text: 'the app is not installed on this simulator' };
  // Without EAS's answer, nothing can be said about TestFlight — and nothing should be
  // rebuilt on the strength of that silence. Report what the simulator runs and stop.
  if (!eas) return { code: 'EAS_UNREACHABLE', text: `runs ${short(sim.commit) || 'an unstamped build'} on ${sim.api}; EAS did not answer, so TestFlight could not be compared` };
  if (!sim.commit) return { code: 'UNSTAMPED', text: 'this build carries no commit stamp, so what it runs cannot be proved; rebuild with npm run build:sim' };
  const prod = sim.api === 'production';
  if (eas?.commit && sim.commit === eas.commit && prod) {
    return { code: 'MATCHES_TESTFLIGHT', text: `runs the same commit as TestFlight build ${eas.buildNumber}, on the production API` };
  }
  if (sim.commit === head && prod) {
    const n = aheadOfTestFlight == null ? 'an unknown number of' : aheadOfTestFlight;
    return { code: 'CANDIDATE', text: `runs the candidate (HEAD), ${n} commit(s) ahead of TestFlight build ${eas?.buildNumber ?? '?'}, on the production API` };
  }
  if (sim.commit === head && !prod) {
    return { code: 'CONFIG_MISMATCH', text: `runs the candidate (HEAD) but talks to ${sim.api}; TestFlight talks to production` };
  }
  const n = Number(sh(`git rev-list --count ${sim.commit}..${head}`) || 0);
  // A commit that touches nothing the app is built from — scripts, docs, the backend, the
  // website — does not make the installed build stale. Only what ships in the binary counts.
  const changed = sh(`git diff --name-only ${sim.commit}..${head}`).split('\n').filter(Boolean);
  const shipping = changed.filter((f) => /^(app|src|assets|plugins)\/|^(app\.json|package\.json|package-lock\.json|eas\.json|babel\.config\.js|metro\.config\.js|tsconfig\.json)$/.test(f));
  if (n > 0 && shipping.length === 0 && prod) {
    return { code: 'CANDIDATE', text: `runs ${short(sim.commit)}; the ${n} commit(s) since (${short(head)}) changed nothing that ships in the app, on the production API` };
  }
  return { code: 'STALE', text: `runs ${short(sim.commit)}; the candidate is ${short(head)}, ${n} commit(s) later (${shipping.length} shipping file(s) changed); rebuild with npm run build:sim` };
}
const results = sims.map((s) => ({ ...s, verdict: verdictFor(s) }));
const overall =
  results.length === 0
    ? { code: 'NO_SIMULATOR', text: 'no simulator is booted' }
    : results.find((r) => r.verdict.code === 'EAS_UNREACHABLE')?.verdict ??
      results.find((r) => r.verdict.code === 'MATCHES_TESTFLIGHT')?.verdict ??
      results.find((r) => r.verdict.code === 'CANDIDATE')?.verdict ??
      results[0].verdict;

const report = {
  checkedAt: new Date().toISOString(),
  candidate: { commit: head, branch, version, dirtyFiles },
  testflight: eas,
  aheadOfTestFlight,
  behindTestFlight,
  simulators: results,
  verdict: overall,
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const pad = (s, n) => String(s ?? '—').padEnd(n);
  console.log(`${pad('', 26)}${pad('commit', 9)}${pad('version', 9)}${pad('build', 7)}${pad('api', 24)}when`);
  console.log(`${pad('candidate', 26)}${pad(short(head), 9)}${pad(version, 9)}${pad('—', 7)}${pad('—', 24)}${branch}${dirtyFiles ? ` (${dirtyFiles} uncommitted files)` : ''}`);
  for (const s of results) {
    console.log(`${pad(`sim ${s.name}`, 26)}${pad(short(s.commit), 9)}${pad(s.appVersion, 9)}${pad(s.buildNumber, 7)}${pad(s.api, 24)}${s.bundleMtime ?? ''}`);
  }
  console.log(`${pad('testflight', 26)}${pad(short(eas?.commit), 9)}${pad(eas?.appVersion, 9)}${pad(eas?.buildNumber, 7)}${pad(eas ? 'production (eas.json)' : 'EAS unreachable', 24)}${eas?.createdAt ?? ''} ${eas ? `(${eas.status.toLowerCase()})` : ''}`);
  console.log('');
  for (const s of results) console.log(`${s.name}: ${s.verdict.code} — ${s.verdict.text}`);
  if (results.length === 0) console.log(`${overall.code} — ${overall.text}`);
  if (aheadOfTestFlight) console.log(`\nThe candidate is ${aheadOfTestFlight} commit(s) ahead of TestFlight build ${eas.buildNumber}.`);
}
