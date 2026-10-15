'use strict';
// The rendered Smart Travel service must share the production backend's Render region.
// Verified backend region: Ohio, 2026-10-15 (Render service srv-daq8vlou01pc73f9qho0).
// If the backend is migrated, update this assertion and both service locations together.
// This is a source configuration check, not proof the planner is commissioned.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const blueprint = fs.readFileSync(path.join(__dirname, '..', 'infra', 'otp', 'render.yaml'), 'utf8');
assert.match(blueprint, /^\s+region:\s+ohio\s*$/m,
  'Smart Travel OTP must be co-located with production backend before Render deployment');
assert.match(blueprint, /healthCheckPath:\s*\/otp\/actuators\/health/,
  'OTP service must expose an explicit health check');
console.log('Smart Travel Render colocation source checks passed; live OTP still requires verification');
