/**
 * Utility functions for robust video stream URL handling.
 * Modeled directly on Tweve Max (CdnTokenManager.buildPlayUrl).
 */

/**
 * Builds an authorized stream URL.
 *
 * For Azam CDN streams (containing '/live/eds/' or 'azamtvltd'):
 * Formats as: <cdnHost>/tok_<token>/live/eds/<channelCode>/DASH/<channelCode>.mpd
 * exactly like Tweve Max.
 * This guarantees all DASH audio/video segments automatically inherit the token path
 * without query string issues or relative URI dropping.
 */
export function buildStreamUrl(rawUrl: string, token?: string, manual = false): string {
  if (!rawUrl) return '';

  // Manual / backup links are used exactly as an admin pasted them.
  if (manual) return rawUrl.trim();

  const trimmedToken = (token || '').trim();

  // Check if it's an Azam stream
  const isAzam = rawUrl.includes('/live/eds/') || rawUrl.includes('azamtvltd') || rawUrl.includes('/eds/');

  if (isAzam && trimmedToken) {
    // If it's a media segment/sub-resource, preserve the segment path!
    const isSegment = /\.(mp4|m4s|m4a|ts|aac|vtt)(\?|$)/i.test(rawUrl);
    if (isSegment) {
      if (/\/tok_[^/]+/.test(rawUrl)) {
        return rawUrl.replace(/\/tok_[^/]+/, `/tok_${trimmedToken}`);
      }
      return rawUrl.replace(/\/(live\/eds|eds)\//, `/tok_${trimmedToken}/$1/`);
    }

    // Extract channel code (e.g. AzamSport1, AzamSport2, AzamOne, etc.)
    const codeMatch =
      rawUrl.match(/\/live\/eds\/([^/]+)\/DASH\//i) ||
      rawUrl.match(/\/eds\/([^/]+)\//i) ||
      rawUrl.match(/\/live\/eds\/([^/]+)/i);

    const channelCode = codeMatch ? codeMatch[1] : '';

    if (channelCode) {
      // Determine host (default to cdnedgch2.azamtvltd.co.tz)
      let host = 'https://cdnedgch2.azamtvltd.co.tz';
      try {
        const parsed = new URL(rawUrl);
        host = `${parsed.protocol}//${parsed.host}`;
      } catch {}

      return `${host}/tok_${trimmedToken}/live/eds/${channelCode}/DASH/${channelCode}.mpd`;
    }
  }

  // Non-Azam streams or fallback:
  let clean = rawUrl.replace(/\/tok_[^/]+/, '');
  clean = clean
    .replace(/([?&])cdntoken=[^&#]*/g, '$1')
    .replace(/\?&/, '?')
    .replace(/[?&]$/, '');

  if (!trimmedToken) return clean;
  const separator = clean.includes('?') ? '&' : '?';
  return `${clean}${separator}cdntoken=${encodeURIComponent(trimmedToken)}`;
}

/**
 * Strips temporary tokens from a channel URL before saving to database.
 */
export function sanitizeChannelUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  return rawUrl
    .replace(/\/tok_[^/]+/, '')
    .replace(/([?&])cdntoken=[^&#]*/g, '$1')
    .replace(/\?&/, '?')
    .replace(/[?&]$/, '')
    .trim();
}

