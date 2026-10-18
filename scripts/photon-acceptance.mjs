#!/usr/bin/env node
/**
 * Authenticated operator-side acceptance test against an American Rider-owned
 * Photon endpoint. Never touches the public Photon demo / public Nominatim.
 * CI stays offline: this script runs only when a commissioned URL is supplied.
 *
 * PHOTON_BASE_URL=https://private-search.example node scripts/photon-acceptance.mjs
 */
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

const raw = process.env.PHOTON_BASE_URL || '';
const dest = new URL(raw || 'https://invalid.invalid/');
assert.ok(raw, 'Set PHOTON_BASE_URL to the American Rider-operated HTTPS Photon address');
assert.equal(dest.protocol, 'https:', 'Photon must be HTTPS');
assert.ok(!['photon.komoot.io','nominatim.openstreetmap.org','invalid.invalid'].includes(dest.hostname),
  'Public demo/Nominatim or missing Photon endpoint cannot be used');
assert.ok(!dest.username && !dest.password && !dest.search && !dest.hash, 'Do not embed credentials in URL');
const testCases = [
  { q: 'Zoo Miami', near: [25.61,-80.40], category: 'South Florida business/POI', expected: ['zoo'] },
  { q: 'Miami International Airport', near: [25.79,-80.29], category: 'South Florida airport', expected: ['airport','mia'] },
  { q: 'Dadeland Mall', near: [25.69,-80.31], category: 'South Florida retail POI', expected: ['dadeland','mall'] },
  { q: 'Coral Gables', near: [25.75,-80.27], category: 'South Florida locality', expected: ['coral gables'] },
  { q: 'Grand Central Terminal', near: [40.75,-73.98], category: 'New York transit POI', expected: ['grand central'] },
  { q: 'Pike Place Market', near: [47.61,-122.34], category: 'Seattle market POI', expected: ['pike place'] },
  { q: 'Golden Gate Park', near: [37.77,-122.45], category: 'San Francisco place', expected: ['golden gate'] },
];
const deadlineMs = 5000;
let failures = 0;
const elapsed = [];
for (const t of testCases) {
  const url = new URL('/api', dest);
  url.searchParams.set('q', t.q);
  url.searchParams.set('limit', '8');
  url.searchParams.set('countrycode', 'US');
  url.searchParams.set('lat', String(t.near[0]));
  url.searchParams.set('lon', String(t.near[1]));
  const at = performance.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(deadlineMs), redirect: 'error' });
    assert.equal(res.ok, true, 'Photon HTTP success');
    const data = await res.json();
    assert.ok(Array.isArray(data.features), 'Photon GeoJSON features');
    const results = data.features.filter(f => {
      const [lon,lat] = f?.geometry?.coordinates || [];
      return Number.isFinite(lat) && Number.isFinite(lon) &&
        Math.abs(lat) <= 90 && Math.abs(lon) <= 180 &&
        String(f?.properties?.countrycode || 'US').toUpperCase() === 'US';
    });
    const found = results.some(f => {
      const p = f.properties || {};
      const combined = [p.name,p.street,p.city,p.district,p.state].join(' ').toLowerCase();
      return t.expected.some(x => combined.includes(x));
    });
    assert.ok(found, 'No matching US result for '+t.category);
    const ms = Math.round(performance.now()-at);
    elapsed.push(ms);
    process.stdout.write('PASS '+t.category+' '+ms+'ms\n');
  } catch (err) {
    failures++;
    process.stderr.write('FAIL '+t.category+': '+String(err.message || err)+'\n');
  }
}
elapsed.sort((a,b)=>a-b);
const p95 = elapsed.length ? elapsed[Math.ceil(elapsed.length*.95)-1] : null;
process.stdout.write('Result: '+(testCases.length-failures)+'/'+testCases.length+
  ' successful, observed p95='+String(p95)+'ms; this is a smoke test, NOT proof of production capacity.\n');
if(failures)process.exitCode=1;
