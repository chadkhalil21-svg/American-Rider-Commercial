'use strict';
// Operator payout fee collection authority is a *different* Stripe customer and card
// from any payment method a person saved when using American Rider as a Traveler.
const { currentConnectFeeConsent, FEE_CONSENT_VERSION }=require('./connect-fee-consent');
function operatorBillingReady(operator, now=Date.now()) {
  const bill=operator?.stripeOperatorFeeBilling;
  return currentConnectFeeConsent(operator?.stripeFeeConsent,now) &&
    bill?.feeConsentVersion===FEE_CONSENT_VERSION &&
    bill?.operatorOnly===true &&
    /^cus_[A-Za-z0-9]+$/.test(bill.customerId||'') &&
    /^pm_[A-Za-z0-9]+$/.test(bill.paymentMethodId||'') &&
    /^seti_[A-Za-z0-9]+$/.test(bill.setupIntentId||'') &&
    Number.isSafeInteger(bill.authorizedAt) && bill.authorizedAt>0 && bill.authorizedAt<=now &&
    operator.stripeFeeConsent.acceptedAt<=bill.authorizedAt;
}
function monthlyFeeKey(uid,month){
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(String(uid||''))|| !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month||'')))
    throw new Error('Invalid Operator month obligation');
  return `connect-account:${uid}:${month}`;
}
module.exports={operatorBillingReady,monthlyFeeKey};
