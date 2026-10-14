'use strict';
// The Operations screen reports configured service geography only.
// It does not grant a second county-wide approval for paid Travel.
const { page } = require('./shell');
const esc = (value) => String(value ?? '').replace(/[&<>"']/g,
  (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function geographyMarketPage(markets = []) {
  const active = markets.filter((market) => market.status === 'active');
  const rows = markets.map((market) =>
    '<li><strong>' + esc(market.name) + '</strong> · ' +
    (market.status === 'active' ? 'Open for Travel' : 'Outside active service area') +
    '</li>').join('');
  return page('Service geography · Operations',
    '<h1>Service geography</h1>' +
    '<p>Service area availability comes from the configured counties. ' +
    'No extra county approval is required for booking.</p>' +
    '<p>Operator insurance, screening, account status, and eligibility are checked individually.</p>' +
    '<p><strong>' + active.length + ' active counties</strong></p>' +
    '<ul>' + rows + '</ul>' +
    '<p>To change coverage, update the authorized geographic service configuration. ' +
    'Trip-level protections remain in place.</p>', '');
}
module.exports = { geographyMarketPage };
