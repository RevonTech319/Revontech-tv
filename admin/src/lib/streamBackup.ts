export type BackupType = '' | 'dash' | 'hls';

export function detectType(url: string, hint?: string): 'dash' | 'hls' {
  const h = (hint || '').toLowerCase();
  if (h === 'dash' || h === 'mpd') return 'dash';
  if (h === 'hls' || h === 'm3u8') return 'hls';
  return /\.mpd(\?|#|$)/i.test(url) || /\/DASH\//i.test(url) ? 'dash' : 'hls';
}

export const isHttpUrl = (u: string) => /^https?:\/\/\S+$/i.test(u.trim());

export function jwtExpMs(jwt: string): number | null {
  try {
    const part = jwt.split('.')[1];
    if (!part) return null;
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    const exp = Number(json.exp);
    if (!Number.isFinite(exp) || exp <= 0) return null;
    return exp < 1e11 ? exp * 1000 : exp;
  } catch {
    return null;
  }
}

export interface LinkInfo {
  type: 'dash' | 'hls';
  insecure: boolean; // http:// links are blocked as mixed-content on the https site
  tokenExpiresMs: number | null; // from an embedded /tok_<jwt>/ or ?cdntoken=<jwt>
}

/** Reads what we can from a pasted link (type, embedded token expiry). */
export function describeLink(url: string, typeHint?: string): LinkInfo {
  const u = url.trim();
  const tok = u.match(/\/tok_([^/]+)/)?.[1] || u.match(/[?&]cdntoken=([^&#]+)/)?.[1] || '';
  return {
    type: detectType(u, typeHint),
    insecure: /^http:\/\//i.test(u),
    tokenExpiresMs: tok ? jwtExpMs(decodeURIComponent(tok)) : null,
  };
}

/** True when the link carries a CDN token (path `/tok_<jwt>/` or `?cdntoken=`). */
export function hasTokenSlot(url: string): boolean {
  return /\/tok_[^/]+/.test(url) || /[?&]cdntoken=/.test(url);
}

export const isAzamUrl = (url: string) => /azamtvltd/i.test(url);

/** Links the token replacement applies to: Azam hosts and anything carrying a token. */
export const usesCdnToken = (url: string) => hasTokenSlot(url) || isAzamUrl(url);

/**
 * Puts `token` into a backup link.
 *  - replaces an existing /tok_<old>/ or cdntoken=<old>
 *  - inserts /tok_<token> into an Azam link that has none
 *  - leaves every other link (other hosts, no token) untouched
 * With an empty token the link is returned as pasted.
 */
export function applyBackupToken(url: string, token?: string): string {
  const u = (url || '').trim();
  const t = (token || '').trim();
  if (!u || !t) return u;
  if (/\/tok_[^/]+/.test(u)) return u.replace(/\/tok_[^/]+/, () => `/tok_${t}`);
  if (/[?&]cdntoken=[^&#]*/.test(u)) return u.replace(/([?&]cdntoken=)[^&#]*/, (_m, p1) => `${p1}${t}`);
  if (isAzamUrl(u)) return u.replace(/\/((?:live\/)?eds)\//, (_m, p1) => `/tok_${t}/${p1}/`);
  return u;
}

/** Accepts a bare token, `tok_<token>`, `/tok_<token>/…` or a full link and returns just the token. */
export function extractToken(raw: string): string {
  let s = (raw || '').trim().replace(/^["'`]+|["'`]+$/g, '');
  const m = s.match(/\/tok_([^/\s]+)/) || s.match(/[?&]cdntoken=([^&#\s]+)/);
  if (m) s = m[1];
  s = s.replace(/^Bearer\s+/i, '').replace(/^tok_/, '');
  return s.replace(/\s+/g, '');
}

export const isTokenLike = (t: string) => t.length > 40 && t.split('.').length === 3;
