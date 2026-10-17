'use strict';
// Preparation allows paperwork in configured jurisdictions without opening paid
// Travel or bypassing Operator eligibility. No Firestore access or side effects.
const { markets } = require('./markets');
const { REGIONS } = require('./regions');
const { forMarket: insuranceForMarket } = require('./insurance-jurisdictions');
const { screeningPreparationFor } = require('./screening-jurisdictions');

function operatorPreparationGate(user,{getMarkets=markets,regions=REGIONS}={}) {
  const id=user?.operatingMarket?.id;
  const market=id ? getMarkets().find(m=>m.id===id) : null;
  const region=market?.regionId ? regions.find(r=>r.id===market.regionId) : null;
  const screen=screeningPreparationFor(market,region);
  if(!screen.ok) return {code:screen.code,error:screen.error};
  if(!insuranceForMarket(market)) return {
    code:'insurance_jurisdiction_not_configured',
    error:'Insurance preparation is not available in this jurisdiction. Choose a configured operating area.',
  };
  return null;
}
module.exports={operatorPreparationGate};
