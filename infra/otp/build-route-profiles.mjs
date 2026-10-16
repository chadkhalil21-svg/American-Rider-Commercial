#!/usr/bin/env node
// Build a verified weekday/Saturday/Sunday bus-route allow-list from the exact
// same refreshed GTFS zip files used to build the OTP graph. Offline and free.
// Usage: node infra/otp/build-route-profiles.mjs --out /path/routes.json
// Run after refreshing the three bus agencies' official GTFS files; rail feeds
// are independent and must never block the bus timetable decision.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, renameSync, rmSync, existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
if (outIndex < 0 || !args[outIndex + 1]) {
  console.error('Usage: node infra/otp/build-route-profiles.mjs --out /path/routes.json [--data /path/to/otp-data/build]');
  process.exit(2);
}
const outPath = resolve(args[outIndex + 1]);
const dataIndex = args.indexOf('--data');
const dataDir = resolve(dataIndex >= 0 && args[dataIndex + 1] ? args[dataIndex + 1] : join(homedir(), 'otp-data', 'build'));
const feeds = [
  ['MDT', 'mdt-gtfs.zip'], ['BCT', 'bct-gtfs.zip'], ['PALMTRAN', 'palmtran-gtfs.zip'],
];
const localDate = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
}).formatToParts(new Date());
const val = (key) => localDate.find((p) => p.type === key)?.value;
const base = new Date(Date.UTC(Number(val('year')), Number(val('month')) - 1, Number(val('day')), 12));
const dateForDay = (weekday) => {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + (weekday - d.getUTCDay() + 7) % 7);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
};
const profiles = [
  ['weekday', 3, 15, 30], // Wednesday daytime
  ['saturday', 6, 30, 45],
  ['sunday', 0, 30, 45],
];
const missing = feeds.map(([id, file]) => [id, join(dataDir, file)]).filter(([, p]) => !existsSync(p));
if (missing.length) {
  console.error('Refusing to publish: missing refreshed GTFS files: ' + missing.map(([id]) => id).join(', '));
  process.exit(1);
}
const tmp = mkdtempSync(join(tmpdir(), 'ar-transit-profiles-'));
try {
  const result = {
    generatedAt: new Date().toISOString(),
    region: 'fl-southeast',
    source: 'Three public bus-agency GTFS schedule files also used by OpenTripPlanner',
    profiles: {},
    profileReferences: {},
  };
  for (const [profile, day, limit, maxGap] of profiles) {
    const referenceDate = dateForDay(day);
    const lists = [];
    for (const [feedId, file] of feeds) {
      const output = join(tmp, `${profile}-${feedId}.json`);
      const cmd = spawnSync(process.execPath, [
        join(dir, 'frequent-routes.mjs'), join(dataDir, file), output,
        '--feed-id', feedId, '--date', referenceDate, '--max-headway', String(limit),
        '--max-gap', String(maxGap), '--percentile', '90',
      ], { encoding: 'utf8', timeout: 120000 });
      if (cmd.status !== 0 || cmd.error) {
        throw new Error(`${feedId} ${profile}: ${(cmd.stderr || cmd.error?.message || 'unknown failure').slice(0, 600)}`);
      }
      const fileResult = JSON.parse(readFileSync(output, 'utf8'));
      if (fileResult.feedId !== feedId || fileResult.referenceDate !== referenceDate ||
          !Array.isArray(fileResult.routes)) throw new Error(`Unverified ${feedId} ${profile} schedule output`);
      lists.push(fileResult);
    }
    result.profiles[profile] = lists;
    result.profileReferences[profile] = referenceDate;
  }
  const stagingPath = join(tmp, 'out.json');
  writeFileSync(stagingPath, JSON.stringify(result, null, 2) + '\n');
  // Atomic rename is safe when both files are on the same filesystem; when
  // temp and output are on different mounts, fall back to a staged output file.
  try { renameSync(stagingPath, outPath); }
  catch (error) {
    if (error.code !== 'EXDEV') throw error;
    const stageNearOut = outPath + '.tmp-profile';
    writeFileSync(stageNearOut, JSON.stringify(result, null, 2) + '\n');
    renameSync(stageNearOut, outPath);
  }
  console.log('Verified GTFS route profiles written for weekday, Saturday and Sunday');
} catch (error) {
  console.error('No route profiles published: ' + (error?.message || String(error)));
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
