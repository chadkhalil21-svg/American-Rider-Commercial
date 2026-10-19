'use strict';
// Offline only. This verifies the intended endpoint in new signed/native builds;
// it does NOT verify deployed Cloud Run health or a prior TestFlight binary.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const {CANONICAL} = require('../scripts/verify-store-cloudrun-api.cjs');
const source = fs.readFileSync(path.join(root,'src/config.ts'),'utf8');
const eas = JSON.parse(fs.readFileSync(path.join(root,'eas.json'),'utf8'));
const parity = fs.readFileSync(path.join(root,'scripts/check-simulator-parity.mjs'),'utf8');
const match = source.match(/export const PAYMENT_SERVER_URL\s*=\s*process\.env\.EXPO_PUBLIC_API_URL\s*\|\|\s*'([^']+)'/);
assert(match,'native app must have an explicit auditable default backend');
assert.equal(match[1],CANONICAL,'native fallback must match the canonical paid Cloud Run API');
assert.equal(eas.build.production.env.EXPO_PUBLIC_API_URL,CANONICAL,'signed production build must use paid Google Cloud Run');
assert.match(parity,/new URL\(PROD_API\)\.host/, 'simulator parity must recognize Cloud Run as production');
assert.match(parity,/legacy Render/, 'simulator parity must classify Render as legacy, not production');
assert.match(parity,/american-rider-api-production-623854974930\.us-east1\.run\.app/);
assert(!parity.includes("if (text.includes('american-rider-server.onrender.com')) api = 'production'"),
  'old Render cannot be considered the new production endpoint');
// The internal preview remains explicit and must be migrated only after verified
// test-environment authority, to avoid silently charging real Travelers.
const preview = eas.build.preview.env.EXPO_PUBLIC_API_URL;
assert(typeof preview === 'string' && preview.startsWith('https://'));
console.log('PASS: native fallback, signed production and simulator parity agree on Cloud Run; internal preview separately identified.');
