export type SocialCategory = 'group' | 'channel' | 'social';

export interface SocialLink {
  id: string;
  label: string;
  url: string;
  category: SocialCategory;
  platform: string; // whatsapp | telegram | instagram | tiktok | youtube | facebook | x | website | other
  enabled?: boolean;
}

export const PLATFORMS = [
  'whatsapp',
  'telegram',
  'instagram',
  'tiktok',
  'youtube',
  'facebook',
  'x',
  'website',
  'other',
] as const;

/**
 * Reads links from `settings/general_settings.social_links`.
 * Falls back to the legacy single-URL fields so nothing disappears
 * for existing deployments until the admin saves the new list.
 */
export function resolveSocialLinks(settings: any): SocialLink[] {
  if (!settings) return [];
  if (Array.isArray(settings.social_links)) {
    return (settings.social_links as SocialLink[]).filter(
      (l) => l && l.url && l.enabled !== false
    );
  }
  const legacy: SocialLink[] = [];
  const add = (url: string | undefined, label: string, platform: string, category: SocialCategory) => {
    if (url && /^https?:\/\//i.test(url)) {
      legacy.push({ id: `legacy-${platform}-${category}`, label, url, platform, category });
    }
  };
  add(settings.whatsapp_channel_url, 'WhatsApp Channel', 'whatsapp', 'channel');
  add(settings.instagram_url, 'Instagram', 'instagram', 'social');
  add(settings.tiktok_url, 'TikTok', 'tiktok', 'social');
  add(settings.youtube_url, 'YouTube', 'youtube', 'social');
  return legacy;
}
