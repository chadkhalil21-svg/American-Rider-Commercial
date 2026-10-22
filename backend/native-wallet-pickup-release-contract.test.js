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

// One private, correctly bound pickup code per Travel; not a publicly
// guessable Travel Number or a new unguarded client-side generator.
assert(safety.includes("import { travelerPickupCode }"));
assert(safety.includes("const result = await travelerPickupCode(currentRideId);"));
assert(safety.includes("pickupCodePendingRollout"));
assert(safety.includes("getPickupSecurityCode"));
assert(traveler.includes("st === 2 && ride.travelParty.mode === 'self' && ride.matchedOp?.rideId"));
assert(traveler.includes("router.navigate('/safety')"),
  'Traveler pickup must have a direct route to existing authenticated code screen');
assert(!traveler.includes('travelerPickupCode('),
  'do not add automatic Firestore reads on every Traveler Travel render');
assert(operator.includes("operatorPickupStatus(active.rideId)"));
assert(operator.includes("verifyOperatorPickupCode(active.rideId,pickupEntry)"));
assert(operator.includes("op.beginTrip(active.teen ? pickupEntry : undefined)"));
assert(pickupClient.includes("'/travel/adult-pickup/verify'"));
assert(pickupClient.includes("'/travel/pickup/code?rideId='"));
assert(pickupServer.includes("String(readKey('ADULT_PICKUP_VERIFICATION') || '').toLowerCase() === 'on'"),
  'rollout flag must remain explicitly off unless separately commissioned');
assert(pickupServer.includes("String(ride.travelerUid||'')!==String(travelerUid||'')"),
  'only authenticated bound Traveler sees code');
assert(pickupServer.includes("String(ride.operatorId||'')!==String(operatorUid||'')"),
  'only assigned Operator checks code');
assert(pickupServer.includes("crypto.timingSafeEqual"));
assert(pickupServer.includes('failedAttempts')&&pickupServer.includes('>=5'));
assert(progress.includes('adult_pickup_unverified'),
  'server boarding must enforce verified private proof when required');

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

console.log('PASS synthetic native wallet iOS/Android mode separation, authorized pickup handoff, server boarding guard, bounded reads and payout invariants (not physical-device certification)');
