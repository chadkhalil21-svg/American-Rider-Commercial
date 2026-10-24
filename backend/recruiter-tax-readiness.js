'use strict';
// Stripe reports verified US tax-identity fields on connected accounts.
// This is provider field verification, NOT a guarantee about Form 1099 filing.
// Do not request or persist SSNs, TINs, bank numbers, or tax document images.
function verifiedStripeTaxProfile(account){
 if(!account||account.country!=='US'||account.details_submitted!==true||
    account.payouts_enabled!==true)return false;
 if(account.business_type==='individual')
   return account.individual?.ssn_last_4_provided===true;
 if(account.business_type==='company')
   return account.company?.tax_id_provided===true;
 return false;
}
module.exports={verifiedStripeTaxProfile};
