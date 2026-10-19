'use strict';
// Read-only last gate before building an Apple App Store or Google Play binary.
// The backend must be PUBLIC, serving from the actual Google Cloud Run production
// service, with real payments and real operator qualification. Nothing is changed.
const fs = require('node:fs');
const path = require('node:path');

const CANONICAL = 'https://american-rider-api-production-623854974930.us-east1.run.app';

function verifyProductionSource(root = path.resolve(__dirname, '..')) {
  const eas = JSON.parse(fs.readFileSync(path.join(root, 'eas.json'), 'utf8'));
  const uri = eas.build?.production?.env?.EXPO_PUBLIC_API_URL;
  if (uri !== CANONICAL) {
    throw Error('The certified native production API must use the exact Google production Cloud Run endpoint, not Render or staging.');
  }
  if (eas.build?.production?.distribution === 'internal' ||
      eas.build?.production?.android?.buildType === 'apk') {
    throw Error('Certified production profile is not configured for public stores.');
  }
  return uri;
}

function verifyProductionResponses(live, health, config) {
  if (live?.ok !== true) throw Error('The public Google API /live endpoint did not confirm liveness.');
  if (health?.deployment !== 'production' || health?.stripe !== 'live') {
    throw Error('The public Google API is not in real-money production mode.');
  }
  if (health?.support?.firestore !== 'on' || !Number.isInteger(health?.fleet?.operators)) {
    throw Error('The public Google API cannot demonstrate its production Firestore read.');
  }
  if (health?.operationalReady !== true) {
    throw Error('Public production API is not ready for payment creation; inspect the provider names in /health.');
  }
  if (health?.screening !== 'on') {
    throw Error('Operator screening intake is not independently verified for first public launch.');
  }
  if (health?.scheduler !== 'authenticated') {
    throw Error('Production scheduled Travel is missing an authenticated scheduler token.');
  }
  if (config?.mode !== 'live') {
    throw Error('Native payment configuration has no confirmed live Stripe publishable key.');
  }
  return true;
}

async function readJson(api, pathPart) {
  const response = await fetch(api + pathPart, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(15000),
    redirect: 'error',
  });
  if (!response.ok) {
    throw Error('Production API endpoint ' + pathPart + ' returned HTTP ' + response.status + '.');
  }
  return await response.json();
}

async function main() {
  const url = verifyProductionSource();
  // All requests are GET. Do not create payment intents or call sweeps.
  const [live, health, config] = await Promise.all([
    readJson(url, '/live'),
    readJson(url, '/health'),
    readJson(url, '/config'),
  ]);
  verifyProductionResponses(live, health, config);
  console.log('PASS: Google Cloud Run production API publicly reachable, Stripe live,');
  console.log('Firestore connected, screening and scheduler verified. Safe to request certified store builds.');
}

if (require.main === module) {
  main().catch((error) => {
    // Strictly avoid printing complete provider response bodies or secrets.
    console.error('BLOCKED:', String(error.message || error).slice(0, 300));
    process.exitCode = 1;
  });
}

module.exports = { CANONICAL, verifyProductionSource, verifyProductionResponses };
