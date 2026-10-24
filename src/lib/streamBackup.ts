/**
 * Manual backup source for live channels.
 *
 * Primary path  : channel.url + auto CDN token (tokenService).
 * Backup path   : channel.backup_url, pasted by an admin, played EXACTLY as
 *                 written (no token injection / rewriting) – use it when the
 *                 token API or the primary link is down.
 *
 * Global switches live in Firestore `settings/stream`.
 */
export interface StreamConfig {
  /** Use every channel's backup link (where one exists) instead of the primary. */
  force_backup_all: boolean;
  /** Automatically switch a viewer to the backup when the primary keeps failing. */
  auto_failover: boolean;
  /** ON: Azam backup links use the live dashboard token. OFF: they use `backup_manual_token`. */
  backup_token_sync: boolean;
  /** Token pasted by an admin (used when sync is OFF). Empty = links keep their own token. */
  backup_manual_token: string;
}

export const DEFAULT_STREAM_CONFIG: StreamConfig = {
  force_backup_all: false,
  auto_failover: true,
  backup_token_sync: false,
  backup_manual_token: '',
};

export interface BackupSource {
  url: string;
  type: 'dash' | 'hls';
  drm: { drmClearKey?: string | null; drmKid?: string | null; drmKey?: string | null };
}

export function detectStreamType(url: string, hint?: string | null): 'dash' | 'hls' {
  const h = (hint || '').toLowerCase();
  if (h === 'dash' || h === 'mpd') return 'dash';
  if (h === 'hls' || h === 'm3u8') return 'hls';
  return /\.mpd(\?|#|$)/i.test(url) || /\/DASH\//i.test(url) ? 'dash' : 'hls';
}

/** Returns the channel's backup source, or null when none is configured. */
export function resolveBackup(channel: any): BackupSource | null {
  const url = String(channel?.backup_url || '').trim();
  if (!/^https?:\/\//i.test(url)) return null;
  const kid = String(channel?.backup_kid || '').trim();
  const key = String(channel?.backup_key || '').trim();
  return {
    url,
    type: detectStreamType(url, channel?.backup_type),
    // Backup-specific ClearKey wins; otherwise reuse the channel's own keys.
    drm:
      kid && key
        ? { drmKid: kid, drmKey: key }
        : {
            drmClearKey: channel?.drmClearKey,
            drmKid: channel?.drmKid || channel?.kid,
            drmKey: channel?.drmKey || channel?.key,
          },
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
