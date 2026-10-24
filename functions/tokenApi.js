/**
 * RevonTech API – two separate systems, one function, one key store.
 *
 * TYPE 1 · Token API (/v1) – share the CDN token with your other websites
 *   GET  /v1/status    public health check
 *   GET  /v1/token     current token + expiry                       (scope: token)
 *   GET  /v1/resolve   ?url=…  → URL with the live token inside     (scope: resolve)
 *   POST /v1/resolve   {url} or {urls:[…]} (max 50)                 (scope: resolve)
 *   GET  /v1/channels  free channels with ready URLs                (scope: channels; premium / drm scopes)
 *
 * TYPE 2 · Channels API (/v2) – share the channels uploaded in RevonTech TV, ready to play
 *   GET  /v2/channels[?category=&type=&q=]  channels + play.url (live token) + play.drm (ClearKey)
 *   GET  /v2/channels/:id                   one channel
 *   GET  /v2/categories                     categories with counts
 *   GET  /v2/play/:id[.m3u8|.mpd]           302 → current playable URL (never stale)
 *   GET  /v2/playlist.m3u[?mode=redirect]   M3U for IPTV apps (Kodi / TiviMate / OTT Navigator)
 *
 * A key belongs to exactly one type (api_keys/{hash}.type: 'token' | 'channels'; missing = token)
 * and is rejected with 403 wrong_key_type on the other system.
 * Type-2 keys carry their own sharing rules: share_mode (all | categories | selected),
 * categories[], channel_ids[], include_premium, include_drm. Anything missing = share less.
 *
 * Keys live in Firestore `api_keys/{sha256(key)}` (created in Admin → API Access).
 * The raw key is never stored – only its SHA-256 hash – so it is shown once.
 *
 * Kept free of firebase imports so it can be unit-tested with a fake database.
 */
const crypto = require('crypto');

const TOKEN_DOC_PATH = 'tokens/global';
const KEY_CACHE_MS = 30_000;     // key revoke/disable takes effect within ~30s
const TOKEN_CACHE_MS = 5_000;
const CHANNEL_CACHE_MS = 30_000;
const STATS_FLUSH_MS = 30_000;
const MAX_BULK = 50;

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

/** exp (seconds) of a JWT, or null. Handles numeric and string exp. */
function jwtExpSeconds(token) {
  try {
    const part = String(token).split('.')[1];
    if (!part) return null;
    const json = JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    let exp = Number(json.exp);
    if (!Number.isFinite(exp) || exp <= 0) return null;
    if (exp > 1e11) exp = Math.floor(exp / 1000);
    return exp;
  } catch (_e) {
    return null;
  }
}

const isAzamUrl = (u) => /azamtvltd/i.test(u);

/** Same rules the apps use for backup links: swap/insert the CDN token, leave other hosts alone. */
function applyToken(url, token) {
  const u = String(url || '').trim();
  const t = String(token || '').trim();
  if (!u || !t) return { url: u, tokenized: false };
  if (/\/tok_[^/]+/.test(u)) return { url: u.replace(/\/tok_[^/]+/, () => `/tok_${t}`), tokenized: true };
  if (/[?&]cdntoken=[^&#]*/.test(u)) return { url: u.replace(/([?&]cdntoken=)[^&#]*/, (_m, p1) => `${p1}${t}`), tokenized: true };
  if (isAzamUrl(u)) {
    const out = u.replace(/\/((?:live\/)?eds)\//, (_m, p1) => `/tok_${t}/${p1}/`);
    return { url: out, tokenized: out !== u };
  }
  return { url: u, tokenized: false };
}

function originAllowed(origin, list) {
  if (!Array.isArray(list) || list.length === 0) return true;
  const o = String(origin).toLowerCase().replace(/\/+$/, '');
  return list.some((raw) => {
    const a = String(raw || '').trim().toLowerCase().replace(/\/+$/, '');
    if (!a) return false;
    if (a === '*') return true;
    if (!a.includes('*')) return a === o;
    const re = new RegExp('^' + a.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[a-z0-9.-]+') + '$');
    return re.test(o);
  });
}


// ── Channels API (type 2) helpers ───────────────────────────────────────────

const isFreeChannel = (c) => c.is_free === true || c.is_free === 'true';

/** 'dash' or 'hls' – same rules the apps use. */
function kindOf(c) {
  const t = String(c.type || c.link_type || '').toLowerCase();
  return t === 'dash' || t === 'shaka' || t === 'mpd' || /\.mpd(\?|#|$)/i.test(String(c.url || '')) ? 'dash' : 'hls';
}

/**
 * Normalises a ClearKey kid/key to lower-case hex. Accepts hex (also UUID-style
 * with dashes) or base64 / base64url. Dashes are only dropped for hex – in
 * base64url they are real characters and must be kept.
 */
function ensureHex(input) {
  if (!input) return '';
  const cleaned = String(input).trim().replace(/[\s"']/g, '');
  const noDash = cleaned.replace(/-/g, '');
  if (/^[0-9A-Fa-f]{32}$/.test(noDash) || /^[0-9A-Fa-f]{16}$/.test(noDash)) return noDash.toLowerCase();
  const b64 = cleaned.replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) return cleaned.toLowerCase();
  try {
    return Buffer.from(b64, 'base64').toString('hex').toLowerCase();
  } catch (_e) {
    return cleaned.toLowerCase();
  }
}

/**
 * All ClearKey pairs of a channel as [{kid, key}] (lower-case hex).
 * Understands the four formats channels are stored in: kid+key fields,
 * drmClearKey as JSON ({keys:[{kid,k}]} or {kid:key}), "kid:key", or a lone key.
 */
function parseDrmKeys(c) {
  const out = [];
  const seen = new Set();
  const add = (kid, key) => {
    const k = ensureHex(kid);
    const v = ensureHex(key);
    if (k && v && !seen.has(k)) { seen.add(k); out.push({ kid: k, key: v }); }
  };
  const kid = c.drmKid || c.kid;
  const key = c.drmKey || c.key;
  if (kid && key) { add(kid, key); return out; }
  const raw = c.drmClearKey;
  if (!raw) return out;
  const str = String(raw).trim();
  try {
    const p = JSON.parse(str);
    if (p && Array.isArray(p.keys)) p.keys.forEach((k) => k && k.kid && k.k && add(k.kid, k.k));
    else if (p && typeof p === 'object') Object.entries(p).forEach(([k, v]) => add(k, v));
    if (out.length) return out;
  } catch (_e) { /* not JSON */ }
  if (str.includes(':')) {
    const parts = str.split(':');
    if (parts.length >= 2) { add(parts[0], parts[1]); return out; }
  }
  add('00000000000000000000000000000001', str);
  return out;
}

/** Which of the (active) channels this Channels-API key may share. Safe by default. */
function selectShared(list, key) {
  let out = list;
  if (key.share_mode === 'all') {
    out = list;
  } else if (key.share_mode === 'categories') {
    const cats = (Array.isArray(key.categories) ? key.categories : []).map((x) => String(x).toLowerCase());
    out = list.filter((c) => cats.includes(String(c.category || '').toLowerCase()));
  } else if (key.share_mode === 'selected') {
    const ids = new Set(Array.isArray(key.channel_ids) ? key.channel_ids : []);
    out = list.filter((c) => ids.has(c.id));
  } else {
    out = []; // unknown / missing mode → share nothing
  }
  if (key.include_premium !== true) out = out.filter(isFreeChannel);
  return out;
}

/** Public base of THIS api for building links (works via Hosting rewrite, direct URL and Cloud Run). */
function selfBase(req, ver) {
  const h = req.headers || {};
  const proto = String(h['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = String(h['x-forwarded-host'] || h.host || '').split(',')[0].trim();
  const viaHosting = /^\/api\//.test(String(req.path || ''));
  const prefix = viaHosting ? '/api' : /cloudfunctions\.net$/i.test(host) ? '/tokenApi' : '';
  return `${proto}://${host}${prefix}/${ver}`;
}

const m3uAttr = (v) => String(v == null ? '' : v).replace(/["\r\n]+/g, ' ').trim();

/** M3U playlist for IPTV apps (Kodi / TiviMate / OTT Navigator / VLC for HLS). */
function buildM3u(items, { mode = 'direct', base = '', apiKey = '' } = {}) {
  const L = ['#EXTM3U'];
  items.forEach((it) => {
    L.push(`#EXTINF:-1 tvg-id="${m3uAttr(it.id)}" tvg-name="${m3uAttr(it.name)}" tvg-logo="${m3uAttr(it.logo)}" group-title="${m3uAttr(it.category)}",${m3uAttr(it.name)}`);
    if (it.type === 'dash') {
      L.push('#KODIPROP:inputstream.adaptive.manifest_type=mpd');
      if (it.play.drm && it.play.drm.keys && it.play.drm.keys.length) {
        L.push('#KODIPROP:inputstream.adaptive.license_type=clearkey');
        L.push(`#KODIPROP:inputstream.adaptive.license_key=${it.play.drm.keys.map((k) => `${k.kid}:${k.key}`).join(',')}`);
      }
    }
    L.push(mode === 'redirect'
      ? `${base}/play/${encodeURIComponent(it.id)}.${it.type === 'dash' ? 'mpd' : 'm3u8'}?api_key=${encodeURIComponent(apiKey)}`
      : it.play.url);
  });
  return L.join('\n') + '\n';
}

function createTokenApi({ getDb, FieldValue, now = () => Date.now(), log = () => {} }) {
  const keyCache = new Map();   // hash -> { at, data }
  const rate = new Map();       // hash -> { start, count }
  const usage = new Map();      // hash -> { pending, lastFlush }
  let tokenCache = { at: 0, data: null };
  let channelCache = { at: 0, data: null };

  async function getKey(db, hash) {
    const hit = keyCache.get(hash);
    if (hit && now() - hit.at < KEY_CACHE_MS) return hit.data;
    const snap = await db.doc(`api_keys/${hash}`).get();
    const data = snap.exists ? snap.data() : null;
    keyCache.set(hash, { at: now(), data });
    return data;
  }

  async function getToken(db) {
    if (tokenCache.data && now() - tokenCache.at < TOKEN_CACHE_MS) return tokenCache.data;
    const snap = await db.doc(TOKEN_DOC_PATH).get();
    const d = snap.exists ? snap.data() : {};
    const token = String(d.value || '').trim();
    if (!token) return null;
    const updated = d.updated_at && typeof d.updated_at.toDate === 'function' ? d.updated_at.toDate().toISOString() : null;
    const data = { token, exp: jwtExpSeconds(token), updated_at: updated, source: d.source || null };
    tokenCache = { at: now(), data };
    return data;
  }

  const tokenView = (t) => {
    const nowSec = Math.floor(now() / 1000);
    return {
      token: t.token,
      expires_at: t.exp ? new Date(t.exp * 1000).toISOString() : null,
      expires_in: t.exp ? Math.max(0, t.exp - nowSec) : null,
      expired: t.exp ? t.exp <= nowSec : false,
      updated_at: t.updated_at,
      source: t.source,
    };
  };

  async function getChannels(db) {
    if (channelCache.data && now() - channelCache.at < CHANNEL_CACHE_MS) return channelCache.data;
    const snap = await db.collection('channels').get();
    const list = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((c) => c.active !== false && c.url)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || String(a.name).localeCompare(String(b.name)));
    channelCache = { at: now(), data: list };
    return list;
  }

  function track(db, hash) {
    const u = usage.get(hash) || { pending: 0, lastFlush: 0 };
    u.pending += 1;
    usage.set(hash, u);
    if (now() - u.lastFlush < STATS_FLUSH_MS) return;
    const n = u.pending;
    u.pending = 0;
    u.lastFlush = now();
    db.doc(`api_keys/${hash}`)
      .update({ request_count: FieldValue.increment(n), last_used_at: FieldValue.serverTimestamp() })
      .catch((e) => log('usage flush failed', e && e.message));
  }


  // ════════════════════════════════════════════════════════════════════════
  //  Channels API (type 2) – /v2
  //    GET /v2/channels[?category=&type=&q=]   shared channels with everything needed to play
  //    GET /v2/channels/:id                    one channel
  //    GET /v2/categories                      categories with counts
  //    GET /v2/play/:id[.m3u8|.mpd]            302 → current playable URL (never goes stale)
  //    GET /v2/playlist.m3u[?mode=redirect]    M3U for IPTV apps
  // ════════════════════════════════════════════════════════════════════════
  async function handleChannelsApi({ req, res, route, key, rawKey, db, send, fail }) {
    if (req.method !== 'GET') return fail(405, 'method_not_allowed', 'Use GET.');

    const [list, tok] = await Promise.all([getChannels(db), getToken(db)]);
    const shared = selectShared(list, key);
    const view = tok ? tokenView(tok) : null;
    const includeDrm = key.include_drm === true;
    const q = req.query || {};

    const toItem = (c) => {
      const stream = tok ? applyToken(c.url, tok.token) : { url: c.url, tokenized: false };
      const keys = parseDrmKeys(c);
      return {
        id: c.id,
        name: c.name || '',
        logo: c.img_url || null,
        category: c.category || null,
        type: kindOf(c),
        is_free: isFreeChannel(c),
        drm_protected: keys.length > 0,
        play: {
          url: stream.url,
          tokenized: stream.tokenized,
          expires_at: stream.tokenized && view ? view.expires_at : null,
          expires_in: stream.tokenized && view ? view.expires_in : null,
          drm: includeDrm && keys.length ? { type: 'clearkey', kid: keys[0].kid, key: keys[0].key, keys } : null,
        },
      };
    };

    const filtered = () => {
      const cat = q.category ? String(q.category).toLowerCase() : '';
      const typ = q.type ? String(q.type).toLowerCase() : '';
      const text = q.q ? String(q.q).toLowerCase() : '';
      return shared
        .filter((c) => !cat || String(c.category || '').toLowerCase() === cat)
        .filter((c) => !typ || kindOf(c) === typ)
        .filter((c) => !text || String(c.name || '').toLowerCase().includes(text));
    };

    // GET /v2/channels
    if (route === '/channels') {
      const items = filtered().map(toItem);
      return send(200, {
        success: true,
        data: { count: items.length, token_expires_at: view ? view.expires_at : null, token_expired: view ? view.expired : null, channels: items },
      });
    }

    // GET /v2/channels/:id
    const one = route.match(/^\/channels\/([^/]+)$/);
    if (one) {
      const c = shared.find((x) => x.id === decodeURIComponent(one[1]));
      if (!c) return fail(404, 'channel_not_found', 'No such channel in this API.');
      return send(200, { success: true, data: toItem(c) });
    }

    // GET /v2/categories
    if (route === '/categories') {
      const counts = new Map();
      shared.forEach((c) => { const n = c.category || 'Other'; counts.set(n, (counts.get(n) || 0) + 1); });
      const categories = [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
      return send(200, { success: true, data: { count: categories.length, categories } });
    }

    // GET /v2/play/:id  → 302 to the current playable URL
    const play = route.match(/^\/play\/([^/.]+)(?:\.[A-Za-z0-9]+)?$/);
    if (play) {
      const c = shared.find((x) => x.id === decodeURIComponent(play[1]));
      if (!c) return fail(404, 'channel_not_found', 'No such channel in this API.');
      const item = toItem(c);
      if (/azamtvltd/i.test(c.url) && !item.play.tokenized) return fail(503, 'token_unavailable', 'No token is available right now.');
      res.set('Location', item.play.url);
      return res.status(302).send('');
    }

    // GET /v2/playlist.m3u
    if (route === '/playlist.m3u' || route === '/playlist') {
      const items = filtered().map(toItem);
      const mode = String(q.mode || '').toLowerCase() === 'redirect' ? 'redirect' : 'direct';
      res.set('Content-Type', 'audio/x-mpegurl; charset=utf-8');
      res.set('Content-Disposition', 'inline; filename="revontech.m3u"');
      return res.status(200).send(buildM3u(items, { mode, base: selfBase(req, 'v2'), apiKey: rawKey }));
    }

    return fail(404, 'not_found', 'Unknown endpoint. See /v2/channels, /v2/categories, /v2/play/:id, /v2/playlist.m3u.');
  }

  return async function handle(req, res) {
    const db = getDb();
    const origin = String(req.headers.origin || '');

    res.set('Vary', 'Origin');
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');

    const send = (status, body) => res.status(status).json(body);
    const fail = (status, code, message) => send(status, { success: false, error: { code, message } });

    // CORS preflight – the key is not sent on preflight, so it is enforced on the real request.
    if (req.method === 'OPTIONS') {
      res.set({
        'Access-Control-Allow-Origin': origin || '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'X-API-Key, Authorization, Content-Type',
        'Access-Control-Max-Age': '600',
      });
      return res.status(204).send('');
    }

    // /api/v1/x (hosting rewrite) and /v1/x (direct function URL) are the same thing.
    const path = (String(req.path || '/').replace(/^\/api(?=\/)/, '').replace(/\/+$/, '')) || '/';
    const verMatch = path.match(/^\/(v[12])(?=\/|$)/);
    if (!verMatch) return fail(404, 'not_found', 'Unknown endpoint. Start from /v1/status.');
    const ver = verMatch[1];
    const route = path.slice(verMatch[0].length) || '/';

    if (route === '/status') {
      res.set('Access-Control-Allow-Origin', '*');
      return send(200, { ok: true, service: 'revontech-token-api', version: '1', time: new Date(now()).toISOString() });
    }

    // ── authentication ──────────────────────────────────────────────────────
    const rawKey = String(
      req.headers['x-api-key'] || String(req.headers.authorization || '').replace(/^Bearer\s+/i, '') || (req.query && req.query.api_key) || ''
    ).trim();
    if (!rawKey) return fail(401, 'missing_key', 'Send your API key in the X-API-Key header.');

    const hash = sha256(rawKey);
    let key;
    try {
      key = await getKey(db, hash);
    } catch (e) {
      log('key lookup failed', e && e.message);
      return fail(500, 'server_error', 'Could not verify the key. Try again.');
    }
    if (!key) return fail(401, 'invalid_key', 'This API key is not valid.');
    if (key.active === false) return fail(403, 'key_disabled', 'This API key has been disabled.');

    // Two separate API systems: type 1 (Token API, /v1) and type 2 (Channels API, /v2).
    const keyType = key.type === 'channels' ? 'channels' : 'token';
    if (ver === 'v1' && keyType !== 'token') return fail(403, 'wrong_key_type', 'This is a Channels API (type 2) key. Use the /v2 endpoints.');
    if (ver === 'v2' && keyType !== 'channels') return fail(403, 'wrong_key_type', 'This is a Token API (type 1) key. Use the /v1 endpoints.');

    if (origin) {
      if (!originAllowed(origin, key.allowed_origins)) {
        return fail(403, 'origin_not_allowed', 'This key is not allowed from this website origin.');
      }
      res.set('Access-Control-Allow-Origin', origin);
    }

    // ── rate limit (per key, per minute, per server instance – best effort) ──
    const limit = Number(key.rate_limit_per_min) > 0 ? Number(key.rate_limit_per_min) : 60;
    const w = rate.get(hash);
    const t = now();
    if (!w || t - w.start >= 60_000) {
      rate.set(hash, { start: t, count: 1 });
    } else if (++w.count > limit) {
      const wait = Math.max(1, Math.ceil((60_000 - (t - w.start)) / 1000));
      res.set('Retry-After', String(wait));
      return fail(429, 'rate_limited', `Too many requests. Limit is ${limit} per minute.`);
    }
    track(db, hash);

    const scopes = Array.isArray(key.scopes) ? key.scopes : [];
    const need = (s) => scopes.includes(s);
    const denyScope = (s) => fail(403, 'scope_missing', `This key does not have the "${s}" permission.`);
    const method = req.method;

    try {
      if (ver === 'v2') return await handleChannelsApi({ req, res, route, key, rawKey, db, send, fail });

      // ── GET /v1/token ─────────────────────────────────────────────────────
      if (route === '/token') {
        if (method !== 'GET') return fail(405, 'method_not_allowed', 'Use GET.');
        if (!need('token')) return denyScope('token');
        const tok = await getToken(db);
        if (!tok) return fail(503, 'token_unavailable', 'No token is available right now.');
        return send(200, { success: true, data: tokenView(tok) });
      }

      // ── GET|POST /v1/resolve ──────────────────────────────────────────────
      if (route === '/resolve') {
        if (method !== 'GET' && method !== 'POST') return fail(405, 'method_not_allowed', 'Use GET or POST.');
        if (!need('resolve')) return denyScope('resolve');

        let urls;
        if (method === 'GET') {
          urls = req.query && req.query.url ? [String(req.query.url)] : [];
        } else {
          const b = req.body && typeof req.body === 'object' ? req.body : {};
          urls = Array.isArray(b.urls) ? b.urls.map(String) : b.url ? [String(b.url)] : [];
        }
        if (!urls.length) return fail(400, 'bad_request', 'Provide ?url=… (GET) or {"urls":[…]} (POST).');
        if (urls.length > MAX_BULK) return fail(400, 'bad_request', `At most ${MAX_BULK} urls per request.`);
        if (urls.some((u) => !/^https?:\/\//i.test(u.trim()))) return fail(400, 'bad_request', 'Every url must start with http:// or https://');

        const tok = await getToken(db);
        if (!tok) return fail(503, 'token_unavailable', 'No token is available right now.');
        const view = tokenView(tok);
        const items = urls.map((u) => ({ input: u, ...applyToken(u, tok.token) }));
        const data = method === 'GET' && urls.length === 1
          ? { url: items[0].url, tokenized: items[0].tokenized, expires_at: view.expires_at, expires_in: view.expires_in, expired: view.expired }
          : { items, expires_at: view.expires_at, expires_in: view.expires_in, expired: view.expired };
        return send(200, { success: true, data });
      }

      // ── GET /v1/channels ──────────────────────────────────────────────────
      if (route === '/channels') {
        if (method !== 'GET') return fail(405, 'method_not_allowed', 'Use GET.');
        if (!need('channels')) return denyScope('channels');

        const [list, tok] = await Promise.all([getChannels(db), getToken(db)]);
        const view = tok ? tokenView(tok) : null;
        const q = req.query || {};
        const wantCat = q.category ? String(q.category).toLowerCase() : '';
        const wantType = q.type ? String(q.type).toLowerCase() : '';
        const premiumOk = need('premium');
        const drmOk = need('drm');

        const out = list
          .filter((c) => premiumOk || c.is_free === true || c.is_free === 'true')
          .filter((c) => !wantCat || String(c.category || '').toLowerCase() === wantCat)
          .filter((c) => !wantType || String(c.type || '').toLowerCase() === wantType)
          .map((c) => {
            const stream = tok ? applyToken(c.url, tok.token) : { url: c.url, tokenized: false };
            const item = {
              id: c.id,
              name: c.name,
              logo: c.img_url || null,
              category: c.category || null,
              type: String(c.type || '').toLowerCase() === 'dash' || /\.mpd(\?|#|$)/i.test(c.url) ? 'dash' : 'hls',
              is_free: c.is_free === true || c.is_free === 'true',
              stream_url: stream.url,
              tokenized: stream.tokenized,
            };
            if (drmOk) {
              const kid = c.drmKid || c.kid;
              const k = c.drmKey || c.key;
              if (kid && k) item.drm = { kid, key: k };
            }
            return item;
          });

        return send(200, {
          success: true,
          data: {
            count: out.length,
            token_expires_at: view ? view.expires_at : null,
            token_expired: view ? view.expired : null,
            channels: out,
          },
        });
      }

      return fail(404, 'not_found', 'Unknown endpoint.');
    } catch (e) {
      log('tokenApi error', e && e.message);
      return fail(500, 'server_error', 'Something went wrong. Try again.');
    }
  };
}

module.exports = { createTokenApi, applyToken, originAllowed, jwtExpSeconds, sha256, parseDrmKeys, selectShared, buildM3u, kindOf, ensureHex, selfBase };
