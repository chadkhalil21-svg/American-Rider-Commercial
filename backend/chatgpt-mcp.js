'use strict';
// Private founder-only ChatGPT MCP gateway. No new market authority is created here.
// OAuth 2.1 authorization-code/PKCE is bound to the existing named Ops MFA session.
// Token material is never stored in plaintext; all commercial checks remain in market-readiness.
const crypto = require('node:crypto');
const { readKey } = require('./env');
const { withinDeadline, OPS_MFA_DEADLINE_MS } = require('./opslatency');
const BASE = 'https://american-rider-server-3d7x.onrender.com';
const RESOURCE = BASE + '/mcp';
const CLIENT = 'https://chatgpt.com/oauth/client.json';
const REDIRECT = 'https://chatgpt.com/connector_platform_oauth_redirect';
const PENDING_COOKIE = 'ar_mcp_pending';
const SCOPES = ['market:read', 'market:plan', 'market:activate', 'market:pause'];
const CHALLENGE = /^[A-Za-z0-9_-]{43,128}$/;
const hash = x => crypto.createHash('sha256').update(x).digest('hex');
const b64 = x => Buffer.from(x).toString('base64url');
const random = () => crypto.randomBytes(32).toString('base64url');
const validScope = s => {
  const a = String(s || '').split(' ').filter(Boolean);
  return a.length > 0 && a.length <= SCOPES.length && new Set(a).size === a.length &&
    a.every(v => SCOPES.includes(v)) ? a : null;
};
function signPending(value) {
  const key = readKey('OPS_SESSION_SECRET');
  if (key.length < 32) return '';
  const body = b64(JSON.stringify(value));
  const sig = crypto.createHmac('sha256', key).update(body).digest('base64url');
  return body + '.' + sig;
}
function pendingFrom(req) {
  const raw = String(req.headers?.cookie || '').split(';').map(s => s.trim())
    .find(s => s.startsWith(PENDING_COOKIE + '='));
  if (!raw) return null;
  const token = raw.slice(PENDING_COOKIE.length + 1);
  const i = token.lastIndexOf('.');
  if (i < 0 || token.length > 3000) return null;
  const body = token.slice(0, i), signature = token.slice(i + 1);
  const expected = crypto.createHmac('sha256', readKey('OPS_SESSION_SECRET'))
    .update(body).digest('base64url');
  if (signature.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return p.expires > Date.now() && p.expires < Date.now() + 11 * 60 * 1000 &&
      p.client_id === CLIENT && p.redirect_uri === REDIRECT && p.resource === RESOURCE &&
      CHALLENGE.test(p.challenge) && validScope(p.scope)?.length ? p : null;
  } catch { return null; }
}
function cookie(res, val, maxAge) {
  res.setHeader('Set-Cookie', PENDING_COOKIE + '=' + val +
    '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + maxAge);
}
function jsonrpc(id, result) { return { jsonrpc: '2.0', id, result }; }
function error(id, code, message) { return { jsonrpc: '2.0', id, error: { code, message } }; }
function toolResult(result) { return { content: [{ type: 'text', text: JSON.stringify(result) }], isError: result.ok === false }; }
const TOOLS = [
  { name: 'market_status', title: 'Check service geography', description: 'Read the configured service area, without a second county approval.',
    inputSchema: { type: 'object', properties: { regionId: { type: 'string', description: 'Optional configured region ID, e.g. fl-southeast.' } }, additionalProperties: false },
    annotations: { readOnlyHint: true }, scope: 'market:read' },
  { name: 'prepare_market', title: 'Prepare a new jurisdiction', description: 'Record a noncommercial expansion plan for a U.S. state and optionally an imported county. Does not activate service or approve legal evidence.',
    inputSchema: { type: 'object', properties: { stateCode: { type: 'string' }, marketId: { type: 'string' }, city: { type: 'string' } }, required: ['stateCode'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false }, scope: 'market:plan' },
  { name: 'open_region', title: 'Verify an open region', description: 'Confirm that all counties in a configured service region are open. Individual Operator eligibility and payment controls are enforced separately.',
    inputSchema: { type: 'object', properties: { regionId: { type: 'string' }, confirmation: { type: 'string', description: 'Must exactly equal OPEN followed by a space and the requested region ID.' } }, required: ['regionId', 'confirmation'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true }, scope: 'market:activate' },
  { name: 'pause_market', title: 'Request geographic closure', description: 'A county closure must be applied to the geographic service configuration. The retired county admission register cannot suspend service.',
    inputSchema: { type: 'object', properties: { marketId: { type: 'string' }, reason: { type: 'string', minLength: 8, maxLength: 500 }, confirmation: { type: 'string', description: 'Must exactly equal PAUSE followed by a space and the market ID.' } }, required: ['marketId', 'reason', 'confirmation'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true }, scope: 'market:pause' },
].map(t => ({...t, securitySchemes: [{type:'oauth2',scopes:[t.scope]}],
  _meta: { securitySchemes: [{type:'oauth2',scopes:[t.scope]}]}}));
function mount(app, express, deps) {
  const db = () => deps.db();
  // Return the authenticated account identity, not a boolean.
  // Consent must bind the real named Ops principal to its credential fingerprint.
  const named = req => deps.authMode() === 'named' ? deps.opsSignedIn(req) : null;
  const operational = () => deps.isProduction() && deps.authMode() === 'named';
  const issueFingerprint = actor => deps.actorFingerprint(actor);
  const authError = (reason = 'invalid_token', detail = 'Connect your American Rider account to continue.') => ({
    content:[{type:'text',text:detail}], isError:true,
    _meta:{'mcp/www_authenticate':[
      'Bearer resource_metadata="' + BASE + '/.well-known/oauth-protected-resource", error="' +
      reason + '", error_description="' + detail + '"',
    ]},
  });
  const bearerFrom = req => {
    const v = String(req.get('authorization') || '');
    return v.startsWith('Bearer ') && v.length <= 500 ? v.slice(7) : null;
  };
  app.get('/.well-known/oauth-protected-resource', (_req, res) => res.json({
    resource: RESOURCE, authorization_servers: [BASE], scopes_supported: SCOPES,
  }));
  app.get('/.well-known/oauth-protected-resource/mcp', (_req, res) => res.json({
    resource: RESOURCE, authorization_servers: [BASE], scopes_supported: SCOPES,
  }));
  app.get('/.well-known/oauth-authorization-server', (_req, res) => res.json({
    issuer: BASE, authorization_response_iss_parameter_supported: true,
    authorization_endpoint: BASE + '/ar/oauth/authorize',
    token_endpoint: BASE + '/ar/oauth/token',
    token_endpoint_auth_methods_supported: ['none'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: SCOPES,
    client_id_metadata_document_supported: true,
  }));
  app.get('/ar/oauth/authorize', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const q = req.query || {}, scopes = validScope(q.scope);
    if (!operational()) return res.status(503).send('Named production Operations MFA is unavailable.');
    if (q.response_type !== 'code' || q.client_id !== CLIENT || q.redirect_uri !== REDIRECT ||
        q.resource !== RESOURCE || q.code_challenge_method !== 'S256' ||
        !CHALLENGE.test(String(q.code_challenge || '')) ||
        !/^[A-Za-z0-9_~-]{8,512}$/.test(String(q.state || '')) || !scopes) {
      return res.status(400).send('OAuth request parameters are invalid.');
    }
    const context = {
      client_id: CLIENT, redirect_uri: REDIRECT, resource: RESOURCE, scope: scopes.join(' '),
      challenge: q.code_challenge, state: q.state, nonce: random(), expires: Date.now() + 10 * 60 * 1000,
    };
    cookie(res, signPending(context), 600);
    res.redirect(303, '/ar/oauth/consent');
  });
  app.get('/ar/oauth/consent', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const ctx = pendingFrom(req);
    if (!ctx) return res.status(400).send('Connection request expired. Return to ChatGPT and reconnect.');
    if (!named(req)) return res.redirect(303, '/ops');
    const label = ctx.scope.split(' ').map(s => s.replace('market:', '')).join(', ');
    res.type('html').send('<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Authorize American Rider</title>' +
      '<body style="font:18px system-ui;max-width:540px;margin:50px auto;padding:22px"><h1>American Rider Operations</h1>' +
      '<p>Connect ChatGPT to your named, MFA-protected Operations account.</p><p><strong>Permissions:</strong> ' + label +
      '</p><p>Market openings remain conditional on independently verified evidence. You may disconnect this access.</p>' +
      '<form method="post" action="/ar/oauth/consent"><input type="hidden" name="nonce" value="' + ctx.nonce + '">' +
      '<button name="approve" value="yes" style="padding:16px;font-size:18px">Authorize connection</button></form>' +
      '<p><a href="/ops">Return to Operations</a></p></body></html>');
  });
  app.post('/ar/oauth/consent', express.urlencoded({extended: false}), async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const ctx = pendingFrom(req), actor = named(req);
    if (!ctx || !actor || !issueFingerprint(actor) || req.body?.nonce !== ctx.nonce ||
        req.body?.approve !== 'yes' || req.get('origin') !== BASE) {
      return res.status(403).send('Authorization denied or expired.');
    }
    const code = random(), store = db();
    if (!store) return res.status(503).send('Operations database unavailable.');
    try {
      await withinDeadline(() => store.collection('ar_mcp_oauth_codes').doc(hash(code)).create({
        actor, fingerprint: issueFingerprint(actor), scope: ctx.scope, client_id: CLIENT,
        redirect_uri: REDIRECT, resource: RESOURCE, challenge: ctx.challenge,
        expires: Date.now() + 90 * 1000, authorizedAt: Date.now(), consumed: false,
      }), OPS_MFA_DEADLINE_MS);
      cookie(res, '', 0);
      const callback = new URL(REDIRECT);
      callback.searchParams.set('code', code);
      callback.searchParams.set('state', ctx.state);
      callback.searchParams.set('iss', BASE);
      return res.redirect(303, callback.toString());
    } catch { return res.status(503).send('Could not authorize connection. Retry securely.'); }
  });
  app.post('/ar/oauth/token', deps.oauthLimit || ((_req,_res,next)=>next()), express.urlencoded({extended: false}), async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const q = req.body || {}, kind = q.grant_type;
    if (q.client_id !== CLIENT || q.resource !== RESOURCE || !operational() || !db()) {
      return res.status(400).json({ error: 'invalid_client' });
    }
    const store = db(), now = Date.now(), access = random(), refresh = random();
    let auth;
    try {
      auth = await withinDeadline(() => store.runTransaction(async tx => {
        let ref, previous;
        if (kind === 'authorization_code') {
          if (q.redirect_uri !== REDIRECT || !CHALLENGE.test(String(q.code_verifier || '')) ||
              typeof q.code !== 'string' || q.code.length > 200) return null;
          ref = store.collection('ar_mcp_oauth_codes').doc(hash(q.code));
          const snap = await tx.get(ref);
          if (!snap.exists) return null;
          previous = snap.data();
          const pkce = crypto.createHash('sha256').update(q.code_verifier).digest('base64url');
          if (previous.consumed || previous.expires <= now || previous.challenge !== pkce ||
              previous.client_id !== CLIENT || previous.redirect_uri !== REDIRECT ||
              previous.resource !== RESOURCE) return null;
        } else if (kind === 'refresh_token') {
          if (typeof q.refresh_token !== 'string' || q.refresh_token.length > 200) return null;
          ref = store.collection('ar_mcp_refresh').doc(hash(q.refresh_token));
          const snap = await tx.get(ref);
          if (!snap.exists) return null;
          previous = snap.data();
          if (previous.consumed || previous.expires <= now || previous.client_id !== CLIENT ||
              previous.resource !== RESOURCE) return null;
        } else return null;
        if (!previous.actor || issueFingerprint(previous.actor) !== previous.fingerprint) return null;
        const revokeSnap = await tx.get(store.collection('ar_mcp_revoke').doc(previous.actor));
        if (revokeSnap.exists && Number(revokeSnap.data().revokedAt) >= Number(previous.authorizedAt || 0)) return null;
        tx.set(ref, { consumed: true }, { merge: true });
        const detail = {
          actor: previous.actor, fingerprint: previous.fingerprint, scope: previous.scope,
          client_id: CLIENT, resource: RESOURCE, authorizedAt: previous.authorizedAt || now,
        };
        tx.create(store.collection('ar_mcp_access').doc(hash(access)), {
          ...detail, expires: now + 60 * 60 * 1000,
        });
        tx.create(store.collection('ar_mcp_refresh').doc(hash(refresh)), {
          ...detail, expires: now + 14 * 24 * 60 * 60 * 1000, consumed: false,
        });
        return detail;
      }), OPS_MFA_DEADLINE_MS);
    } catch { return res.status(503).json({error:'temporarily_unavailable'}); }
    if (!auth) return res.status(400).json({error:'invalid_grant'});
    return res.json({access_token: access, token_type:'Bearer', expires_in:3600,
      refresh_token: refresh, scope: auth.scope});
  });
  // An authenticated founder can revoke every prior OAuth grant with one phone action.
  app.get('/ar/oauth/connections', (req,res) => {
    if (!named(req)) return res.redirect(303,'/ops');
    res.set('Cache-Control','no-store').type('html').send(
      '<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<body style="font:18px system-ui;max-width:540px;margin:50px auto;padding:22px">' +
      '<h1>ChatGPT connection</h1><p>Disconnect any existing delegated American Rider sessions.</p>' +
      '<form method="post" action="/ar/oauth/disconnect">' +
      '<button style="padding:14px">Disconnect ChatGPT</button></form>' +
      '<p><a href="/ops">Return to Operations</a></p></body></html>');
  });
  app.post('/ar/oauth/disconnect', express.urlencoded({extended:false}), async (req,res) => {
    const actor=named(req);
    if (!actor || req.get('origin') !== BASE) return res.status(403).send('Named Operations MFA required.');
    try {
      await db().collection('ar_mcp_revoke').doc(actor).set({revokedAt:Date.now()},{merge:true});
      return res.type('html').send('<h1>ChatGPT disconnected</h1><p>Existing access and refresh tokens are now invalid.</p><p><a href="/ops">Operations</a></p>');
    } catch { return res.status(503).send('Disconnection not confirmed. Retry from Operations.'); }
  });
  app.post('/mcp', deps.mcpLimit || ((_req,_res,next)=>next()), async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const data = req.body;
    if (!data || typeof data !== 'object' || Array.isArray(data) || JSON.stringify(data).length > 10000) {
      return res.status(400).json(error(null, -32600, 'Invalid MCP request.'));
    }
    const id = data.id, method = data.method;
    if (method === 'notifications/initialized') return res.status(202).end();
    if (id == null) return res.status(400).json(error(null, -32600, 'Request ID required.'));
    if (method === 'initialize') return res.json(jsonrpc(id, {
      protocolVersion: '2025-06-18', capabilities: { tools: { listChanged: false } },
      serverInfo: {name: 'american-rider-operations', version:'0.1.0'},
      instructions: 'Use market_status before opening. Actions affect real service. Never fabricate legal, screening, insurance or payment approvals. All market changes require the founder command and remain subject to authoritative admission checks.',
    }));
    if (method === 'tools/list') return res.json(jsonrpc(id, { tools: TOOLS }));
    if (method === 'ping') return res.json(jsonrpc(id, {}));
    if (method !== 'tools/call') return res.status(400).json(error(id, -32601, 'Unknown method.'));
    const bearer = bearerFrom(req);
    if (!bearer) return res.json(jsonrpc(id, authError()));
    const chosen = TOOLS.find(t => t.name === data.params?.name);
    if (!chosen) return res.json(error(id, -32602, 'Unknown tool.'));
    const args = data.params?.arguments || {};
    if (typeof args !== 'object' || Array.isArray(args)) return res.json(error(id, -32602, 'Invalid tool arguments.'));
    let auth;
    try {
      const snap = await withinDeadline(() => db()?.collection('ar_mcp_access').doc(hash(bearer)).get(), OPS_MFA_DEADLINE_MS);
      auth = snap?.exists ? snap.data() : null;
    } catch { return res.status(503).json(error(id, -32000, 'Authorization unavailable.')); }
    let revoked=false;
    if (auth?.actor) {
      try {
        const snapshot=await withinDeadline(() => db().collection('ar_mcp_revoke').doc(auth.actor).get(), OPS_MFA_DEADLINE_MS);
        revoked=snapshot.exists && Number(snapshot.data().revokedAt) >= Number(auth.authorizedAt || 0);
      } catch { return res.status(503).json(error(id,-32000,'Credential revocation status unavailable.')); }
    }
    if (!auth || revoked || auth.expires <= Date.now() || auth.client_id !== CLIENT ||
        auth.resource !== RESOURCE || issueFingerprint(auth.actor) !== auth.fingerprint ||
        !String(auth.scope || '').split(' ').includes(chosen.scope)) {
      return res.json(jsonrpc(id, authError('insufficient_scope',
        'Authorization expired, revoked or insufficient. Reconnect American Rider.')));
    }
    try {
      let out;
      const configured = deps.markets().filter(m => !!m.regionId);
      if (chosen.name === 'market_status') {
        const regionId = args.regionId ? String(args.regionId) : null;
        const entries = configured.filter(m => !regionId || m.regionId === regionId);
        if (regionId && !deps.regions.some(r => r.id === regionId)) out = {ok:false,code:'unknown_region'};
        else if (entries.length > 100) out = {ok:false,code:'too_many_markets'};
        else out = {ok:true,markets:entries.map(market => ({
          marketId:market.id,regionId:market.regionId,status:market.status,
          geographicStatus:market.geographicStatus,
          countyApprovalRequired:false,operatorEligibility:'individual',
        }))};
      } else if (chosen.name === 'prepare_market') {
        out = await deps.proposeMarket({db:db(),actor:auth.actor,input:{
          stateCode:String(args.stateCode||''),marketId:String(args.marketId||''),city:String(args.city||''),
        }});
      } else if (chosen.name === 'open_region') {
        const regionId = String(args.regionId||'');
        if (!operational()) out={ok:false,code:'production_authority_required'};
        else if (args.confirmation !== 'OPEN '+regionId) out={ok:false,code:'explicit_confirmation_required'};
        else {
          const region = deps.regions.find(r=>r.id===regionId);
          const entries=configured.filter(m=>m.regionId===regionId);
          if (!region || !entries.length) out={ok:false,code:'unknown_or_unconfigured_region'};
          else {
            const inactive=entries.filter(m=>m.status!=='active').map(m=>m.id);
            out=inactive.length
              ? {ok:false,code:'geography_configuration_required',regionId,inactiveMarkets:inactive}
              : {ok:true,code:'already_active',regionId,status:'active',
                marketIds:entries.map(m=>m.id)};
          }
        }
      } else if (chosen.name === 'pause_market') {
        const marketId=String(args.marketId||''), reason=String(args.reason||'');
        const market=configured.find(m=>m.id===marketId);
        if (!operational()) out={ok:false,code:'production_authority_required'};
        else if (!market) out={ok:false,code:'unknown_market'};
        else if (args.confirmation !== 'PAUSE '+marketId || reason.trim().length < 8 || reason.length > 500)
          out={ok:false,code:'explicit_confirmation_required'};
        else out={ok:false,code:'geography_configuration_required',marketId,
          message:'Change the configured service area to close this county.'};
      }
      return res.json(jsonrpc(id,toolResult(out || {ok:false,code:'action_unavailable'})));
    } catch {
      return res.status(503).json(error(id,-32000,'Operations temporarily unavailable; verify live status before retry.'));
    }
  });
  app.get('/mcp', (_req,res) => res.status(405).set('Allow','POST').end());
}
module.exports = { mount, validScope, signPending, pendingFrom, TOOLS, BASE, RESOURCE };
