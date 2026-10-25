/**
 * Minimal read-only Firestore client over the public REST API.
 *
 * Why: the API runs on Vercel, with no Firebase Admin credentials and no Cloud Functions.
 * Your security rules already let anyone read `channels`, `tokens` and `settings`
 * (the apps need that), so a plain request with the public web API key is enough.
 *
 * It exposes just the shape tokenApi.js needs:
 *   db.doc('tokens/global').get()      -> { exists, data() }
 *   db.collection('channels').get()    -> { docs: [{ id, data() }] }
 *   db.doc(path).update(...)           -> no-op (nothing can be written without credentials)
 */

const DEFAULT_BASE = 'https://firestore.googleapis.com/v1';

/** Firestore REST value -> plain JS value. */
export function decodeValue(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) {
    const iso = v.timestampValue;
    return { toDate: () => new Date(iso), toMillis: () => new Date(iso).getTime(), seconds: Math.floor(new Date(iso).getTime() / 1000) };
  }
  if ('arrayValue' in v) return ((v.arrayValue && v.arrayValue.values) || []).map(decodeValue);
  if ('mapValue' in v) return decodeFields((v.mapValue && v.mapValue.fields) || {});
  if ('referenceValue' in v) return v.referenceValue;
  if ('bytesValue' in v) return v.bytesValue;
  if ('geoPointValue' in v) return { latitude: v.geoPointValue.latitude, longitude: v.geoPointValue.longitude };
  return null;
}

export function decodeFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) out[k] = decodeValue(v);
  return out;
}

export function createRestDb({ projectId, apiKey, referer, base = DEFAULT_BASE, fetchImpl = fetch, timeoutMs = 8000, log = () => {} }) {
  const root = `${base}/projects/${encodeURIComponent(projectId)}/databases/(default)/documents`;
  const encodePath = (p) => p.split('/').filter(Boolean).map(encodeURIComponent).join('/');

  async function request(url) {
    let lastErr;
    for (let attempt = 0; attempt < 2; attempt++) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), timeoutMs);
      try {
        const res = await fetchImpl(url, {
          signal: ctl.signal,
          headers: { Accept: 'application/json', ...(referer ? { Referer: referer } : {}) },
        });
        clearTimeout(timer);
        if (res.status === 404) return { status: 404, json: null };
        if (res.ok) return { status: res.status, json: await res.json() };
        const body = await res.text().catch(() => '');
        lastErr = new Error(`Firestore REST ${res.status}: ${body.slice(0, 200)}`);
        if (res.status < 500) throw lastErr; // 4xx will not fix itself
      } catch (e) {
        clearTimeout(timer);
        lastErr = e;
        if (e && /Firestore REST 4\d\d/.test(String(e.message))) throw e;
        log('firestore request failed, attempt', attempt + 1, e && e.message);
      }
    }
    throw lastErr;
  }

  const q = (extra = '') => `?key=${encodeURIComponent(apiKey)}${extra}`;

  return {
    doc(path) {
      return {
        async get() {
          const { status, json } = await request(`${root}/${encodePath(path)}${q()}`);
          if (status === 404 || !json) return { exists: false, data: () => undefined };
          const data = decodeFields(json.fields);
          return { exists: true, data: () => data };
        },
        // Reads only: usage counters cannot be written without credentials.
        async update() {},
      };
    },
    collection(name) {
      return {
        async get() {
          const docs = [];
          let token = '';
          for (let page = 0; page < 30; page++) {
            const { status, json } = await request(`${root}/${encodePath(name)}${q('&pageSize=300' + (token ? `&pageToken=${encodeURIComponent(token)}` : ''))}`);
            if (status === 404 || !json) break;
            (json.documents || []).forEach((d) => {
              const id = String(d.name || '').split('/').pop();
              const data = decodeFields(d.fields);
              docs.push({ id, data: () => data });
            });
            token = json.nextPageToken || '';
            if (!token) break;
          }
          return { docs };
        },
      };
    },
  };
}
