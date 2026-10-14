// Internal Operations control: no evidence is approved by rendering a green checklist.
const { page } = require('./shell');
const { REQUIRED_EVIDENCE } = require('./market-readiness');
const { conciseMarketIssues, founderResolutionPlan } = require('./market-launch-summary');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
const title = (id) => id.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
function marketChecklistPage(items, { production = false, expansion = null } = {}) {
  const c = expansion?.catalog || {jurisdictions:[], counties:[]};
  const plans = Array.isArray(expansion?.plans) ? expansion.plans : [];
  const planner = `<section id="expansion">
    <h2>Expand American Rider</h2>
    <p>Choose a state or territory once to prepare a new market. No individual county
      forms are required at this stage. This creates a planning record only:
      it does not authorize paid Travel or spend money.</p>
    ${expansion?.ok === false ? '<p role="alert">Expansion records are temporarily unavailable. No planning status can be confirmed.</p>' : ''}
    <form id="expansion-plan">
      <label>State or jurisdiction
        <select name="stateCode" id="expansion-state" required>
          <option value="">Choose a jurisdiction</option>
          ${c.jurisdictions.map(j=>`<option value="${esc(j.code)}">${esc(j.name)} (${esc(j.code)})</option>`).join('')}
        </select>
      </label>
      <details class="expansion-advanced">
        <summary>Focus on a particular county or city (optional)</summary>
      <label>County (only where official boundaries have been imported)
        <select name="marketId" id="expansion-county">
          <option value="">State-level expansion plan</option>
          ${c.counties.map(m=>`<option value="${esc(m.id)}" data-state="${esc(m.state)}">${esc(m.name)}${m.configured?' · configured region':''}</option>`).join('')}
        </select>
      </label>
      <label>City focus (optional, requires an imported county)
        <input name="city" id="expansion-city" maxlength="80" placeholder="City name, not an address">
      </label>
      </details>
      <button type="submit">Prepare selected market — no activation</button>
      <p id="expansion-result" role="status" aria-live="polite"></p>
    </form>
    <details><summary>Saved expansion plans (${plans.length})</summary>
      ${expansion?.ok===false ? '<p>Plans cannot currently be retrieved.</p>' :
      plans.length ? `<ul>${plans.map(p=>`<li>${esc(p.label || p.id)}
        ${p.city ? ' · '+esc(p.city):''} · Proposed only — not commissioned</li>`).join('')}</ul>` :
      '<p>No expansion plans recorded yet.</p>'}
      ${expansion?.truncated ? '<p role="alert">More than 100 plans exist. This is an incomplete list.</p>' : ''}
    </details>
  </section>`;

  // Global infrastructure blockers are shared across counties. Showing them
  // three times can look like three separate contracts or purchases are needed.
  // The same problem should be visible once, without weakening each county gate.
  const sharedDependencies = [...new Set(items.flatMap(({ state }) =>
    (state.missing || []).filter(m => m.id?.startsWith('provider:')).map(m => m.id.slice(9))))].sort();
  // All South Florida counties are controlled together, rather than three founder
  // actions. An incomplete market is shown as an exception; only the backend can
  // approve and commit activation after a fresh transactional recheck.
  const southFlorida = items.filter(({ market }) =>
    market.regionId === 'fl-southeast' ||
    ['fl-miami-dade', 'fl-broward', 'fl-palm-beach'].includes(market.id));
  const southVersions = Object.fromEntries(southFlorida.map(({market,state}) =>
    [market.id, state.manifestVersion || '']));
  const southVersionsJson = JSON.stringify(southVersions).replace(/</g, '\\u003c');
  const southActive = southFlorida.length > 0 && southFlorida.every(({ state }) => state.status === 'active');
  const southReady = southFlorida.length > 0 && southFlorida.every(({ state }) => state.readyToActivate);
  const southernPaperIds = REQUIRED_EVIDENCE.filter(id =>
    !southFlorida.length || !southFlorida.every(({state})=>state.enforcedInCode?.includes(id)));
  const southStatus = southActive ? 'Open' : southReady ? 'Ready to open' :
    'Not yet cleared for paid Travel';
  // Show one regional exception summary, not 14 technical identifiers times
  // three counties. Full scoped evidence remains under each county's details.
  const exceptionSummary=conciseMarketIssues(southFlorida.flatMap(({state})=>state.missing||[]));
  const exceptionHtml=exceptionSummary.length
    ? `<p><strong>What needs attention</strong> (these are groups of existing checks, not new permits):</p>
       <ul id="founder-launch-issues">${exceptionSummary.map(g=>
         `<li><strong>${esc(g.label)}</strong>: ${esc(g.message)}</li>`).join('')}</ul>
       <p>Missing records do not mean earlier work or testing was never completed.</p>`
    : '<p>No further launch exceptions reported by the current checklist.</p>';
  // Show THREE types of source work, not 14 purported regulatory permits
  // or 3 separate county approvals. A missing record is NOT a failed audit.
  const resolution = founderResolutionPlan(southFlorida.flatMap(({state})=>state.missing||[]));
  const resolutionHtml = resolution.length ? `<details id="founder-resolution">
    <summary>Resolve the existing evidence once — ${resolution.length} source workstreams</summary>
    <p>Our founder's region-opening instruction is already recorded. None of these groups requests another founder decision.</p>
    <p><strong>Florida's statewide TNC law generally prohibits extra county and city TNC operating licenses.</strong>
       Airport and seaport pickup locations and fees remain separately controlled.
       <a href="https://www.flsenate.gov/Laws/Statutes/2026/627.748" target="_blank" rel="noopener noreferrer">Florida Statute 627.748(17)</a>.</p>
    ${resolution.map(g=>`<section class="founder-source-group">
      <p><strong>${esc(g.label)}</strong> · ${g.items} unique record${g.items===1?'':'s'}${g.unrecorded?' · '+g.unrecorded+' not yet filed':''}</p>
      <p>${esc(g.next)}</p>
    </section>`).join('')}
    <p>Our existing one-source/three-county filing route below reuses real verified records. No approval can be inferred from a CI test alone.</p>
  </details>` : '';
  const quickAction = `<section id="south-florida-launch" aria-label="South Florida launch">
    <h2>South Florida</h2>
    <p>Miami-Dade · Broward · Palm Beach</p>
    <p><strong>Status: ${esc(southStatus)}</strong> · ${southFlorida.filter(({ state }) => state.status === 'active').length} of ${southFlorida.length} counties open</p>
    <button type="button" id="open-south-florida" ${!production || !southFlorida.length || southActive ? 'disabled' : ''}>Open South Florida</button>
    <p id="south-florida-result" role="status" aria-live="polite">One action. The server rechecks all counties and either opens them together or tells you exactly what remains. No partial launch.</p>
    ${exceptionHtml}
    ${resolutionHtml}
    <details id="regional-source-proof">
      <summary>Record one verified document covering all three counties</summary>
      <p>Only for a genuine source whose scope has been checked. Use county-specific records if the source does not cover all three.</p>
      <form id="region-evidence-form">
        <label>Existing review category
          <select name="domain" required>${southernPaperIds.map(r=>`<option value="${esc(r)}">${esc(title(r))}</option>`).join('')}</select>
        </label>
        <label>Independent evidence reference <input name="reference" required minlength="8" maxlength="500"></label>
        <label>Issuing authority <input name="issuer" required minlength="3" maxlength="120"></label>
        <label>Valid until <input type="date" name="validUntil" required></label>
        <label><input type="checkbox" name="allCountiesVerified" required> Independent review confirms this exact source covers Miami-Dade, Broward and Palm Beach</label>
        <button type="submit">Record source for all three counties</button>
      </form>
      <p id="region-evidence-result" role="status" aria-live="polite"></p>
    </details>
  </section>`;
  const cards = items.map(({ market, state }) => {
    const localMissing = (state.missing || []).filter(m => !m.id?.startsWith('provider:'));
    const paperIds=REQUIRED_EVIDENCE.filter(id=>!state.enforcedInCode?.includes(id));
    const id = esc(market.id);
    const ready = production && state.readyToActivate && state.manifestVersion && state.status !== 'active';
    const canOnboard = production && state.readyToOnboard && state.manifestVersion && state.status === 'waitlist';
    return `<section data-market="${id}">
  <details class="county-review">
    <summary>${esc(market.name)} · ${esc(market.state)} · ${esc(state.status)} ${ready ? '· Ready for final authorization' : ''}</summary>
    <p>County-specific commissioning evidence and controls are available below.</p>
  <p>${state.status === 'active' ? 'New bookings are admitted in this county.' : state.status === 'onboarding' ? 'Only approved Operator intake is allowed; no paid Travel or duty is admitted.' : 'No paid Travel or expensive Operator onboarding is admitted in this county.'} Evidence references must be independently checked against real contracts, coverage and staffed service.</p>
  <p>Manifest ${esc(state.manifestVersion?.slice(0, 16) || 'not configured')} ·
     ${localMissing.length} county evidence or configuration requirement${localMissing.length === 1 ? '' : 's'} ·
     ${sharedDependencies.length} shared production dependenc${sharedDependencies.length === 1 ? 'y' : 'ies'}.</p>
  <p>County status reflects BOTH the production dependencies shown above and this county's own approved evidence. Shared Florida-wide documents need not be purchased again for each county, but they may be referenced only where their actual coverage and validity apply.</p>
  ${state.fleetCleanupPending ? '<p role="alert"><strong>Fleet shutdown pending:</strong> new offers are blocked, but some Operator devices may still show on-duty. The leased cleanup must finish and be checked before reactivation.</p>' : ''}
  ${state.onboardingMissing?.length ? `<p>Prelaunch intake needs: ${state.onboardingMissing.map((m) => esc(title(m.id))).join(', ')}.</p>` : ''}
  ${localMissing.length ? `<ul>${localMissing.map((m) => `<li><strong>${esc(title(m.id))}</strong>: ${esc(m.reason)}</li>`).join('')}</ul>` :
    '<p>No remaining county-specific evidence or geography blockers. This is not permission to activate while shared dependencies are missing.</p>'}
  <details><summary>Record independently reviewed evidence</summary>
    <p>Paste only a document reference, independent issuer and expiry, not personal data or the document itself. This pauses an active county until it is re-approved.</p>
    <form class="evidence" data-market="${id}" data-version="${esc(state.manifestVersion || '')}">
      <label>Requirement <select name="domain">${paperIds.map((r) => `<option value="${esc(r)}">${esc(title(r))}</option>`).join('')}</select></label>
      <label>External record reference <input name="reference" minlength="8" maxlength="500" required></label>
      <label>Issuer or independent authority <input name="issuer" minlength="3" maxlength="120" required></label>
      <label>Valid through <input name="validUntil" type="date" required></label>
      <button type="submit">Record evidence and pause market</button>
    </form>
  </details>
  <button class="onboard" data-market="${id}" data-version="${esc(state.manifestVersion || '')}" ${canOnboard ? '' : 'disabled'}>Authorize prelaunch Operator intake</button>
  <button class="activate" data-market="${id}" data-version="${esc(state.manifestVersion || '')}" ${ready ? '' : 'disabled'}>Activate ${esc(market.name)}</button>
  <form class="pause" data-market="${id}">
    <label>Pause reason <input name="reason" minlength="8" maxlength="500" required></label>
    <button type="submit" ${['active', 'onboarding'].includes(state.status) ? '' : 'disabled'}>Pause intake and new offers</button>
  </form>
  </details>
</section>`;
  }).join('');
  return page('Market readiness · Operations', `<style>
section[data-market] { margin-top:18px; }
#south-florida-launch { margin:16px 0; padding:16px; border:1px solid var(--hairline); border-radius:12px; }
#south-florida-launch button { min-height:48px; width:100%; border-radius:10px; font:600 16px Arial,sans-serif; background:var(--blue); color:#fff; border:0; cursor:pointer; }
#south-florida-launch button:disabled { background:#F1F1EF; color:#555; cursor:not-allowed; }
#south-florida-launch button:focus-visible { outline:3px solid var(--blue); outline-offset:3px; }
#south-florida-result { white-space:pre-wrap; }

#expansion { margin-top:12px; }
#expansion form { display:grid; gap:12px; }
#expansion label { display:block; font-size:14px; font-weight:600; }
#expansion select, #expansion input { display:block; width:100%; min-height:46px; padding:10px 12px; margin-top:6px;
  border:1px solid var(--border); border-radius:10px; background:#fff; color:var(--ink); font:16px Arial,sans-serif; }
#expansion button { width:100%; min-height:48px; padding:12px 14px;
  background:var(--blue); color:#fff; border:1px solid var(--blue);
  border-radius:12px; cursor:pointer; font:600 16px Arial,sans-serif; }
#expansion details.expansion-advanced { margin:0; padding:0; }
#expansion details.expansion-advanced label { margin-top:10px; }
#expansion details.expansion-advanced summary, section[data-market] details.county-review>summary {
  min-height:44px; display:flex; align-items:center; cursor:pointer; font-weight:600; }
#expansion :focus-visible, section[data-market] summary:focus-visible {
  outline:3px solid var(--blue); outline-offset:3px;
}
@media (max-width:560px) {
  #expansion { padding:16px; }
  section[data-market] { padding:12px; }
  #expansion button { min-height:52px; }
}
section[data-market] h2 { margin-bottom:16px; }
section[data-market] details { margin:16px 0; border-top:1px solid var(--hairline); padding-top:10px; }
section[data-market] summary { cursor:pointer; min-height:44px; display:flex; align-items:center; font-weight:600; color:var(--blue); }
section[data-market] form.evidence { display:grid; gap:12px; margin-top:12px; }
section[data-market] label { display:block; font-size:14px; font-weight:600; }
section[data-market] input, section[data-market] select {
  display:block; width:100%; min-height:46px; margin-top:6px; padding:9px 12px;
  border:1px solid var(--border); border-radius:10px; color:var(--ink); background:#fff; font:16px Arial,sans-serif;
}
section[data-market] button {
  display:block; width:100%; min-height:46px; margin:12px 0 0; padding:10px 14px;
  border:1px solid var(--blue); border-radius:12px; color:#fff; background:var(--blue);
  font-size:15px; font-weight:600; text-align:center; cursor:pointer;
}
section[data-market] button.onboard { background:#fff; color:var(--blue); }
section[data-market] button:disabled { border-color:#D9D9D3; color:#777; background:#F1F1EF; cursor:not-allowed; }
section[data-market] form.pause { margin-top:20px; border-top:1px solid var(--hairline); padding-top:12px; }
section[data-market] form.pause button { border-color:#B54949; color:#8F2525; background:#fff; }
section[data-market] button:focus-visible,section[data-market] input:focus-visible,
section[data-market] select:focus-visible,section[data-market] summary:focus-visible {outline:3px solid var(--blue);outline-offset:3px;}
#result:not(:empty) { padding:10px 12px; border:1px solid var(--blue-border); background:var(--blue-tint); border-radius:10px; }
</style>
<h1>Markets</h1>
<p class="lede"><a href="/ops">← Operations</a> · Commission markets here, not in Operator screening.</p>
${quickAction}
<details id="other-markets"><summary>Plan another city or state</summary>
${planner}
</details>
<h2>South Florida · commissioning details</h2>
<p>These counties are already configured geographically. The system checks their operational requirements automatically.
Expand a county's details only when you need to investigate an exception or authorize a market that is genuinely ready.</p>
<p><strong>Two separate controls:</strong> counties are configured geographically, but paid Travel requires separate commercial approval.
Operator screening is an ongoing eligibility process, not a button that opens a county. You should not manually process every Operator's routine documents to activate a market.</p>
<p><strong>Shared production dependencies:</strong> ${sharedDependencies.length ? sharedDependencies.map(x => esc(title(x))).join(' · ') : 'No missing shared infrastructure reported in this checklist.'}
These are one platform-wide requirement each, not a new expense in every county. This screen does not verify the contents of external reports.</p>
<p>Only named, MFA-authenticated Operations users may record independently checked evidence. The platform requires actual insurance coverage, provider arrangements and tested operational safeguards. Never invent evidence or enable a market merely to clear a warning.</p>
<p id="result" role="status" aria-live="polite"></p>
${cards || '<section><p>No configured service counties.</p></section>'}
<script>
const southVersions=${southVersionsJson};
const southButton=document.getElementById('open-south-florida');
if (southButton) southButton.addEventListener('click',async()=>{
  if(southButton.disabled)return;
  const output=document.getElementById('south-florida-result');
  southButton.disabled=true;
  output.textContent='Checking all counties together…';
  try {
    const r=await fetch('/ops/markets/regions/fl-southeast/activate',{
      method:'POST',credentials:'same-origin',
      headers:{'content-type':'application/json','x-ar-ops-action':'1'},
      body:JSON.stringify({manifestVersions:southVersions}),
    });
    const result=await r.json();
    if(!r.ok){
      const issues=Array.isArray(result.missing)?result.missing:[];
      const details=issues.slice(0,16).map(x=>
        String(x.id||'requirement').replaceAll('_',' ') +
        (Array.isArray(x.markets)&&x.markets.length ? ' ('+x.markets.length+' counties)' : '')
      );
      output.textContent='South Florida was not opened. '+
        (details.length?details.join('; '):String(result.code||'Not yet authorized'))+
        '. See commissioning details below.';
      southButton.disabled=false;
      return;
    }
    output.textContent=result.code==='already_active'?'All counties are already open.':
      'South Florida opened. Verifying updated county status…';
    location.reload();
  } catch {
    output.textContent='Activation not confirmed. Check current market status before retrying.';
    southButton.disabled=false;
  }
});
// One authenticated operation, one independently reviewed source, three
// county-scoped records. This does not approve commercial booking by itself.
const regionalProofForm=document.getElementById('region-evidence-form');
if(regionalProofForm) regionalProofForm.addEventListener('submit',async e=>{
  e.preventDefault();
  const out=document.getElementById('region-evidence-result');
  const button=regionalProofForm.querySelector('button[type="submit"]');
  const values=new FormData(regionalProofForm);
  if(values.get('allCountiesVerified')!=='on'){out.textContent='Confirm verified coverage for all three counties.';return;}
  const validUntil=Date.parse(String(values.get('validUntil')||'')+'T23:59:59Z');
  if(!Number.isFinite(validUntil)){out.textContent='Enter a valid expiration date.';return;}
  button.disabled=true;
  out.textContent='Recording one verified region-wide source…';
  try{
    const response=await fetch('/ops/markets/regions/fl-southeast/evidence',{
      method:'POST',credentials:'same-origin',
      headers:{'content-type':'application/json','x-ar-ops-action':'1'},
      body:JSON.stringify({manifestVersions:southVersions,
        domain:values.get('domain'),reference:values.get('reference'),
        issuer:values.get('issuer'),validUntil,allCountiesVerified:true}),
    });
    const result=await response.json();
    if(!response.ok){out.textContent='Not recorded: '+String(result.code||'Verification unavailable');button.disabled=false;return;}
    out.textContent='Verified source recorded for all three counties. Market admission will recheck.';
    location.reload();
  }catch{out.textContent='Could not confirm the record. Check current status before retrying.';button.disabled=false;}
});
const expansionForm=document.getElementById('expansion-plan');
const expansionState=document.getElementById('expansion-state');
const expansionCounty=document.getElementById('expansion-county');
function filterCounties() {
  const chosen=expansionState.value;
  for(const option of expansionCounty.options) {
    if(!option.value) continue;
    option.hidden=option.dataset.state!==chosen;
    option.disabled=option.dataset.state!==chosen;
  }
  if(expansionCounty.selectedOptions[0]?.disabled) expansionCounty.value='';
}
if(expansionForm) {
  expansionState.addEventListener('change',filterCounties);
  filterCounties();
  expansionForm.addEventListener('submit',async e=>{
    e.preventDefault();
    const status=document.getElementById('expansion-result');
    const f=new FormData(expansionForm);
    status.textContent='Recording a planning request…';
    try{
      const r=await fetch('/ops/markets/plan',{
        method:'POST',credentials:'same-origin',
        headers:{'content-type':'application/json','x-ar-ops-action':'1'},
        body:JSON.stringify({
          stateCode:f.get('stateCode'),marketId:f.get('marketId'),city:f.get('city'),
        })
      });
      const result=await r.json();
      if(!r.ok) {status.textContent='Not recorded: '+String(result.error||result.code||'unavailable');return;}
      status.textContent='Expansion plan recorded. No market has been opened. Refreshing…';
      location.reload();
    }catch{status.textContent='No plan was confirmed. Check the list before trying again.';}
  });
}
async function action(market, verb, body) {
  const status=document.getElementById('result'); status.textContent='Saving…';
  try {
    const r=await fetch('/ops/markets/'+encodeURIComponent(market)+'/'+verb,{
      method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','x-ar-ops-action':'1'},body:JSON.stringify(body)
    });
    const result=await r.json();
    if(!r.ok) { status.textContent='No change: '+String(result.code||result.error||'unavailable'); return; }
    status.textContent='Saved. Refreshing checklist…'; location.reload();
  } catch { status.textContent='No change confirmed. Recheck the market before retrying.'; }
}
document.querySelectorAll('form.evidence').forEach(form=>form.addEventListener('submit', e=>{
  e.preventDefault();const f=new FormData(form);
  const validUntil=Date.parse(String(f.get('validUntil'))+'T23:59:59Z');
  action(form.dataset.market,'evidence',{domain:f.get('domain'),reference:f.get('reference'),issuer:f.get('issuer'),validUntil,manifestVersion:form.dataset.version});
}));
document.querySelectorAll('button.activate').forEach(button=>button.addEventListener('click',()=>{
  if(!button.disabled) action(button.dataset.market,'activate',{manifestVersion:button.dataset.version});
}));
document.querySelectorAll('button.onboard').forEach(button=>button.addEventListener('click',()=>{
  if(!button.disabled) action(button.dataset.market,'onboard',{manifestVersion:button.dataset.version});
}));
document.querySelectorAll('form.pause').forEach(form=>form.addEventListener('submit',e=>{
  e.preventDefault();action(form.dataset.market,'pause',{reason:new FormData(form).get('reason')});
}));
</script>`, '');
}
// Current Operations view: geographic service status, not an approval checklist.
function geographyMarketPage(markets) {
  const active = markets.filter((market) => market.status === 'active');
  const rows = markets.map((market) =>
    '<li><strong>' + esc(market.name) + '</strong> · ' +
    (market.status === 'active' ? 'Open for Travel' : 'Outside active service area') +
    '</li>').join('');
  return page('Service geography · Operations',
    '<h1>Service geography</h1>' +
    '<p>County availability comes from the configured service area. ' +
    'No additional county approval is required for bookings.</p>' +
    '<p>Operator applications, insurance, screening and duty eligibility are checked individually.</p>' +
    '<p><strong>' + active.length + ' active counties</strong></p>' +
    '<ul>' + rows + '</ul>' +
    '<p>Changing service geography requires updating the service-region configuration. ' +
    'Restricted pickup locations and individual Travel controls remain separate.</p>', '');
}
module.exports = { marketChecklistPage, geographyMarketPage };
