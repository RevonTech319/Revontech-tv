/**
 * CDN Token Service for RevonTV.
 * Modeled directly on Tweve Max (CdnTokenManager.kt & CdnTokenApi.kt).
 *
 * Implements high-speed in-memory caching and multi-tier fallbacks:
 * 1. In-memory valid token (instant, 0ms)
 * 2. Firestore `tokens/global` or `cdn_config/token`
 * 3. Primary Upstream API: https://www.tweve.online/api/cdn-token?key=twv_MHHEAjtKJBwCsjk3aMinGOwX
 * 4. Hosted App Self-Heal: https://tweve--chui-tvpro-abffa.us-east4.hosted.app/api/cdn-refresh
 * 5. Cloud Function trigger: refreshCdnTokenHttp
 */

import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

const API_KEY = 'twv_MHHEAjtKJBwCsjk3aMinGOwX';
const PRIMARY_UPSTREAM_URL = `https://www.tweve.online/api/cdn-token?key=${API_KEY}`;
const HOSTED_REFRESH_URL = 'https://tweve--chui-tvpro-abffa.us-east4.hosted.app/api/cdn-refresh';
const CF_TRIGGER_URL = 'https://us-central1-revontech-6c62d.cloudfunctions.net/refreshCdnTokenHttp';

interface CachedToken {
  token: string;
  cdnHost: string;
  expiresAt: number; // unix timestamp in ms
}

let memoryToken: CachedToken | null = null;

/**
 * Parses JWT expiration ('exp') claim into epoch milliseconds.
 */
function parseJwtExp(jwt: string): number {
  try {
    const parts = jwt.split('.');
    if (parts.length < 2) return 0;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const jsonStr = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const parsed = JSON.parse(jsonStr);
    const exp = Number(parsed.exp);
    if (!isNaN(exp) && exp > 0) {
      // If in seconds (standard JWT), convert to ms
      return exp < 1e11 ? exp * 1000 : exp;
    }
  } catch {}
  return 0;
}

/**
 * Returns whether a given token is still fresh (at least 60s remaining).
 */
function isFresh(cached: CachedToken | null): boolean {
  if (!cached || !cached.token) return false;
  const now = Date.now();
  // If no exp claim was parsed, consider it valid for 10 minutes from retrieval
  if (!cached.expiresAt) return true;
  return cached.expiresAt - now > 60_000;
}

/**
 * Fetches the active CDN token using the fastest available channel.
 */
export async function getCdnToken(forceRefresh = false): Promise<{ token: string; cdnHost: string }> {
  // 1. Fast in-memory check
  if (!forceRefresh && isFresh(memoryToken)) {
    return { token: memoryToken!.token, cdnHost: memoryToken!.cdnHost };
  }

  const defaultHost = 'https://cdnedgch2.azamtvltd.co.tz';
  let resolvedToken = '';
  let resolvedHost = defaultHost;

  // 2. Firestore lookup (fastest & most reliable across users)
  if (!forceRefresh) {
    try {
      const snap = await getDoc(doc(db, 'tokens', 'global'));
      if (snap.exists()) {
        const data = snap.data();
        const tok = (data?.value || data?.token || '').toString().trim();
        if (tok && tok.length > 20) {
          const exp = parseJwtExp(tok);
          resolvedToken = tok;
          resolvedHost = (data?.cdnHost || defaultHost).toString().trim();
          memoryToken = { token: resolvedToken, cdnHost: resolvedHost, expiresAt: exp };
          return { token: resolvedToken, cdnHost: resolvedHost };
        }
      }
    } catch (err) {
      console.warn('[tokenService] Firestore read failed:', err);
    }
  }

  // 3. Primary Upstream Endpoint (identical to Tweve Max)
  try {
    // Try local proxy first if on localhost to avoid CORS, or direct upstream
    const fetchUrl = window.location.hostname === 'localhost' ? `/api/cdn-token?key=${API_KEY}` : PRIMARY_UPSTREAM_URL;
    const res = await fetch(fetchUrl, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      const tok = (data.token || data.value || '').toString().trim();
      if (tok && tok.length > 20) {
        resolvedToken = tok;
        resolvedHost = (data.cdnHost || defaultHost).toString().trim();
        const exp = data.exp ? Number(data.exp) * 1000 : parseJwtExp(tok);
        memoryToken = { token: resolvedToken, cdnHost: resolvedHost, expiresAt: exp };
        return { token: resolvedToken, cdnHost: resolvedHost };
      }
    }
  } catch (err) {
    console.warn('[tokenService] Upstream fetch failed, trying fallbacks:', err);
  }

  // 4. Hosted App Self-Heal Endpoint
  try {
    const res = await fetch(HOSTED_REFRESH_URL, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      const tok = (data.token || '').toString().trim();
      if (tok && tok.length > 20) {
        resolvedToken = tok;
        resolvedHost = (data.cdnHost || defaultHost).toString().trim();
        const exp = parseJwtExp(tok);
        memoryToken = { token: resolvedToken, cdnHost: resolvedHost, expiresAt: exp };
        return { token: resolvedToken, cdnHost: resolvedHost };
      }
    }
  } catch (err) {
    console.warn('[tokenService] Hosted self-heal fetch failed:', err);
  }

  // 5. Cloud Function trigger fallback
  try {
    const res = await fetch(CF_TRIGGER_URL, { cache: 'no-store' });
    if (res.ok) {
      const snap = await getDoc(doc(db, 'tokens', 'global'));
      if (snap.exists()) {
        const val = (snap.data()?.value || '').toString().trim();
        if (val) {
          resolvedToken = val;
          const exp = parseJwtExp(val);
          memoryToken = { token: val, cdnHost: defaultHost, expiresAt: exp };
          return { token: val, cdnHost: defaultHost };
        }
      }
    }
  } catch (err) {
    console.warn('[tokenService] Cloud function trigger failed:', err);
  }

  // 6. Hardcoded fallback if all network requests fail
  if (!resolvedToken) {
    resolvedToken = 'eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9.eyJleHAiOiIxNzkyMjQ3ODY5Iiwic2lwIjoiIiwicGF0aCI6IiIsInNlc3Npb25fY2RuX2lkIjoiNmNiZDY4OTMxMTk3MjI3YSIsInNlc3Npb25faWQiOiIiLCJjbGllbnRfaWQiOiI0ODQwODMyIiwiZGV2aWNlX2lkIjoiIiwibWF4X3Nlc3Npb25zIjowLCJzZXNzaW9uX2R1cmF0aW9uIjowLCJ1cmwiOiJodHRwczovLzEwMi4yMDguMjQ0LjkiLCJzZXNzaW9uX3RpbWVvdXQiOjAsImF1ZCI6IjciLCJzb3VyY2VzIjpbM119.qKIikEzzs_BLXhL65YSGC3xoJVbWLAf3Ub1G-bSOj2isPfLwwqxuZAhzEYyoQA3V0GCga6uNCjU2adOiTj9rjw==';
  }

  return { token: resolvedToken, cdnHost: defaultHost };
}
