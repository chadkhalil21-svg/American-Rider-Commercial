'use strict';
// Isolated launch regression: temporary /config or Wallet outages must be
// visibly recoverable without app restart, invented saved cards, or live money.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const payments = fs.readFileSync(path.join(root, 'src/backend/payments.ts'), 'utf8');
const provider = fs.readFileSync(path.join(root, 'src/state/PaymentConfigContext.tsx'), 'utf8');
const wallet = fs.readFileSync(path.join(root, 'app/wallet.tsx'), 'utf8');

function section(src, begin, end) {
  const at = src.indexOf(begin);
  const until = src.indexOf(end, at);
  assert(at >= 0 && until > at, 'missing payment reader boundary');
  return src.slice(at, until);
}
const isolatedSource =
  section(payments, 'async function paymentReadWithDeadline', '// Exported because presence') +
  '\n' +
  section(payments, 'export async function fetchPaymentMethods', '/** Stripe\'s sheet in setup mode');
const js = ts.transpileModule(isolatedSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  reportDiagnostics: true,
});
assert.equal(js.diagnostics.length, 0, 'payment reader parses and transpiles');
function harness(fetcher, getHeaders = async () => ({ Authorization: 'Bearer synthetic' })) {
  const signals = [];
  const sandbox = {
    exports: {},
    PAYMENT_SERVER_URL: 'https://payment.example.invalid',
    authHeaders: getHeaders,
    fetch: fetcher,
    AbortController: class extends AbortController {
      constructor() { super(); signals.push(this.signal); }
    },
    // Exercise the real abort-and-resolve timer without a 12-second test delay.
    setTimeout: (cb, ms) => setTimeout(cb, Math.min(ms, 25)),
    clearTimeout,
  };
  vm.runInNewContext(js.outputText, sandbox, { timeout: 2000 });
  return { ...sandbox.exports, signals };
}
const ok = value => ({ ok: true, json: async () => value });
(async () => {
  const live = harness(async () => ok({
    stripePublishableKey: 'pk_live_synthetic',
    mode: 'live', canManagePaymentMethods: true,
    canTakePayment: true, manualTravelAuthorization: true,
    cancellationFeeGrossCents:400,verifiedNoShowEnabled:true,
  }));
  const configured = await live.fetchPaymentConfig();
  assert.equal(configured.mode, 'live');
  assert.equal(configured.canTakePayment, true);
  assert.equal(configured.verifiedNoShowEnabled,true,
    'verified release flags can enable the Operator control only after server authorization');
  const unrelated = await harness(async()=>ok({
    canTakePayment:true,manualTravelAuthorization:true,
    cancellationFeeGrossCents:null,verifiedNoShowEnabled:true,
  })).fetchPaymentConfig();
  assert.equal(unrelated.verifiedNoShowEnabled,false,
    'a partial, inconsistent fee configuration must not expose paid no-show');


  const down = harness(async () => { throw new Error('simulated outage'); });
  const unavailable = await down.fetchPaymentConfig();
  assert.equal(unavailable.canTakePayment, false);
  assert.equal(unavailable.canManagePaymentMethods, false);
  assert.equal(unavailable.stripePublishableKey, null);
  assert.notEqual(unavailable.verifiedNoShowEnabled,true,
    'unavailable config must not expose the paid no-show control');
  const unreadable = await down.fetchPaymentMethods();
  assert.notEqual(unreadable.unavailable, undefined);
  assert.equal(unreadable.methods.length, 0);

  const hanging = harness(async () => new Promise(() => {}));
  const stalledConfig = await hanging.fetchPaymentConfig();
  assert.equal(stalledConfig.canTakePayment, false);
  assert(hanging.signals.some(signal => signal.aborted),
    'unresponsive configuration read must abort');

  const stalledAuth = harness(async () => {
    throw new Error('must not fetch after stalled authorization');
  }, async () => new Promise(() => {}));
  const stalledMethods = await stalledAuth.fetchPaymentMethods();
  assert.equal(stalledMethods.unavailable, 'unreachable');
  assert(stalledAuth.signals.some(signal => signal.aborted));

  const noCards = harness(async () => ok({ methods: [] }));
  const genuineEmpty = await noCards.fetchPaymentMethods();
  assert.equal(genuineEmpty.unavailable, undefined);
  assert.equal(genuineEmpty.methods.length, 0);

  let tries = 0;
  const recovering = harness(async () => {
    tries += 1;
    if (tries === 1) throw new Error('temporary outage');
    return ok({ stripePublishableKey: 'pk_test_synthetic', mode: 'test',
      canTakePayment: true, canManagePaymentMethods: true });
  });
  assert.equal((await recovering.fetchPaymentConfig()).canTakePayment, false);
  assert.equal((await recovering.fetchPaymentConfig()).canTakePayment, true,
    'same session must recover after outage');

  // The actual screen and provider must expose the recovery, not merely the API.
  assert(provider.includes('AppState.addEventListener'), 'refresh on foreground');
  assert(provider.includes('startupRetry'), 'one automatic startup retry');
  assert(provider.includes('inFlight.current'), 'coalesce simultaneous checks');
  assert(provider.includes('usePaymentConfigRefresh'), 'manual refresh hook');
  assert(wallet.includes('usePaymentConfigRefresh()'), 'Wallet uses refresh hook');
  assert(wallet.includes('await refreshPaymentConfig();'), 'retry rechecks configuration');
  assert(wallet.includes("t('traveler.tryAgain')"), 'visible Retry control');
  assert(wallet.includes('readSequence.current++'), 'ignore stale Wallet results');
  assert(wallet.includes("state !== 'ready' || !payConfig.canManagePaymentMethods"),
    'unreadable account cannot open card mutations while provider state is uncertain');
  console.log('PASS: configuration and Wallet success, outage, timeout and recovery; safe source wiring');
})().catch(error => { console.error(error); process.exitCode = 1; });
