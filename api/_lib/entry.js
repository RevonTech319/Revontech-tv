/**
 * Vercel entry for the RevonTech API (type 1 Token API at /api/v1, type 2 Channels API at /api/v2).
 * The real logic lives in functions/tokenApi.js (shared with the Cloud Functions build).
 *
 * Needs NO new setup: it reuses the env vars the website already has on Vercel
 * (VITE_FIREBASE_API_KEY, VITE_FIREBASE_PROJECT_ID).
 */
import tokenApiModule from '../../functions/tokenApi.js';
import { createRestDb } from './firestoreRest.js';

const { createTokenApi } = tokenApiModule;

let cached = null;

function build() {
  if (cached) return cached;
  const apiKey = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY || '';
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || 'revontech-6c62d';
  if (!apiKey) return null;
  const site = (process.env.SITE_ORIGIN || 'https://www.revontechtv.online').replace(/\/+$/, '');
  const db = createRestDb({
    projectId,
    apiKey,
    referer: `${site}/`, // in case the web API key is restricted to your website
    base: process.env.FIRESTORE_REST_BASE || undefined,
    log: (...a) => console.warn('[api]', ...a),
  });
  cached = createTokenApi({
    getDb: () => db,
    FieldValue: { increment: (n) => n, serverTimestamp: () => null },
    keyPath: (hash) => `settings/apikey_${hash}`,
    log: (...a) => console.warn('[api]', ...a),
  });
  return cached;
}

/** Express-like response helpers on top of a plain Node ServerResponse. */
function adaptRes(res) {
  const out = {
    set(a, b) {
      if (a && typeof a === 'object') Object.entries(a).forEach(([k, v]) => res.setHeader(k, v));
      else res.setHeader(a, b);
      return out;
    },
    status(code) { res.statusCode = code; return out; },
    json(body) {
      if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(body));
      return out;
    },
    send(body) { res.end(body); return out; },
  };
  return out;
}

/**
 * @param version 'v1' | 'v2' when the file path already fixes it (api/v1/[...path].js),
 *                or null for the rewrite fallback (/api/token-api?__p=/v1/…).
 */
export function makeEntry(version) {
  return async function handler(req, res) {
    const out = adaptRes(res);
    const query = { ...(req.query || {}) };

    let p;
    if (version) {
      const segs = [].concat(query.path === undefined ? [] : query.path).map(String);
      delete query.path;
      p = `/${version}${segs.length ? '/' + segs.join('/') : ''}`;
    } else {
      p = String(query.__p || '/');
      delete query.__p;
      if (!p.startsWith('/')) p = '/' + p;
    }

    const api = build();
    if (!api) {
      return out.status(503).set('Cache-Control', 'no-store').json({
        success: false,
        error: { code: 'server_not_configured', message: 'Set VITE_FIREBASE_API_KEY (and VITE_FIREBASE_PROJECT_ID) in the Vercel project environment variables, then redeploy.' },
      });
    }

    // tokenApi.js strips a leading /api, so this works the same as behind Firebase Hosting.
    const areq = { method: req.method, path: '/api' + p, headers: req.headers || {}, query, body: req.body };
    try {
      await api(areq, out);
    } catch (e) {
      console.error('[api] unhandled', e && e.message);
      if (!res.headersSent) out.status(500).json({ success: false, error: { code: 'server_error', message: 'Something went wrong on our side. Try again.' } });
    }
  };
}
