'use strict';
// One prelaunch cross-role contract for the existing installed-app boundary.
// Source/synthetic proof only. Never claim actual wallet, 3DS, or device delivery.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const config=JSON.parse(read('app.json'));
const payment=read('src/backend/payments.ts');
const traveler=read('app/ride.tsx');
const safety=read('app/safety.tsx');
const operator=read('app/operator/pickup.tsx');
const pickupClient=read('src/backend/pickupVerification.ts');
const pickupServer=read('backend/adultpickup.js');
const progress=read('backend/travelprogress.js');
const native=config.expo.plugins.find(p=>Array.isArray(p)&&p[0]==='@stripe/stripe-react-native');
assert(native,'native Stripe plugin must be present');
assert.equal(native[1].merchantIdentifier,'merchant.com.americanrider.app');
assert.equal(native[1].enableGooglePay,true,'Android Google Pay must be enabled in native plugin');

// One payment UI, using the operating system's own platform wallet.
// The backend payment intent's test/live mode is authoritative and shared
// with its Google Pay environment. Do not offer Android Google Pay on iOS.
assert(payment.includes("Platform.OS === 'ios'"));
assert(payment.includes("applePay: { merchantCountryCode: 'US' }"));
assert(payment.includes("Platform.OS === 'android'"));
assert(payment.includes("googlePay: { merchantCountryCode: 'US', testEnv: walletTestEnv }"));
assert.equal((payment.match(/applePay: \{ merchantCountryCode: 'US' \}/g)||[]).length,2);
assert.equal((payment.match(/googlePay: \{ merchantCountryCode: 'US', testEnv: walletTestEnv \}/g)||[]).length,2);
assert.equal((payment.match(/const walletTestEnv = (?:intentMode|setupMode) === 'test';/g)||[]).length,2);
assert(payment.includes("allowsDelayedPaymentMethods: false"));
assert(payment.includes("intent.alreadyAuthorized === true"),'resumed card hold must not make a second hold');
assert(payment.includes("authorizationOnly:intent.capturePolicy==='manual_v1'"),
  'Traveler receipt must distinguish hold from captured charge');
assert(payment.includes("isPlatformPaySupported()"),'wallet capability queried from device');

// Founder decision, 21 Oct: ordinary adult pickup is verbal/name + vehicle/plate
// confirmation. No mandatory adult PIN, code request, extra per-arrival DB read,
// onboarding dialog or delay. Teen PIN remains enforced by the authoritative
// server and native Operator screen.
assert(!traveler.includes('pickupHandoffCard'),
  'do not reintroduce unwanted adult code prompt at pickup');
assert(!traveler.includes('getPickupSecurityCode'),
  'do not present the adult PIN as a mandatory Travel action');
assert(!safety.includes('travelerPickupCode('),
  'ordinary adult safety must not fetch or advertise a private pickup code');
assert(!safety.includes("import { travelerPickupCode }"));
assert(safety.includes("t('traveler.pickupSecurityIntro')"),
  'show the name, plate and Operator check without another user action');
assert(operator.includes("t('operator.confirmTravelerName')"),
  'Operator receives verbal name check guidance');
assert(!operator.includes('operatorPickupStatus('),
  'no extra Firestore read during ordinary adult arrival');
assert(!operator.includes('verifyOperatorPickupCode('),
  'no adult PIN obligation on the Operator screen');
assert(operator.includes('active.teen ? ('),
  'Teen still has a distinct code input');
assert(operator.includes("if (active.teen && !/^\\d{4}$/.test(pickupEntry))"),
  'the mandatory Teen code must remain four digits');
assert(operator.includes("op.beginTrip(active.teen ? pickupEntry : undefined)"),
  'normal adult boarding requires no PIN; Teen still sends proof');
assert(pickupServer.includes("String(readKey('ADULT_PICKUP_VERIFICATION') || '').toLowerCase() === 'on'"),
  'legacy adult backend mode stays explicitly OFF by default, never silently enabled');
assert(progress.includes('adult_pickup_unverified'),
  'legacy enrollment cannot be bypassed if a ride was previously enrolled');
const en=read('src/i18n/en.ts');
assert(en.includes('confirmTravelerName:')&&en.includes('No adult pickup code is required'));
assert(en.includes('pickupSecurityIntro:')&&en.includes('No code is needed'));
for(const lang of ['es','fr','it','de'])
  assert(read('src/i18n/'+lang+'.ts').includes('confirmTravelerName:'),
    'localized Operator guidance is required for '+lang);

// Existing Firestore query budgets and money guards stay in place.
// Do not migrate to H3 or degrade lossless payouts to save document reads.
const geo=read('backend/geooperators.js');
assert(geo.includes("const TIERS=Object.freeze([{precision:5},{precision:4}])"));
assert(geo.includes('const PER_PREFIX_LIMIT=40'));
assert(geo.includes('const SATURATION_LIMIT=120'));
assert(geo.includes('.startAfter(docs[docs.length-1])'));
assert(geo.includes('providerBilledReadsVerified:false'),
  'candidate counts must never be presented as actual billed reads');
const scheduler=read('backend/scheduler.js');
assert(scheduler.includes('dueReservationsQuery(db, now, WINDOW_MS, RESERVED_SCAN_LIMIT)'));
assert(scheduler.includes('shouldWriteWaitingState(prior,reason,now)'));
const ops=read('backend/scheduled-exception.js');
assert(ops.includes(".where('status','==','needs_attention')"));
assert(ops.includes('.limit(size+1)'));
const money=read('backend/travelmoney.js');
assert(money.includes("if (ride.status !== 'completed')"),
  'Operator payout must require completed Travel');
assert(money.includes('capturePending:true'),
  'failed capture must remain explicitly recoverable');

console.log('PASS native wallet iOS/Android source parity, verbal adult/mandatory Teen pickup, no extra adult reads, payout guards (not physical-device certification)');
