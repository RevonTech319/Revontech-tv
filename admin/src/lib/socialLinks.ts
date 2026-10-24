export type SocialCategory = 'group' | 'channel' | 'social';

export interface SocialLink {
  id: string;
  label: string;
  url: string;
  category: SocialCategory;
  platform: string;
  enabled: boolean;
}

export const PLATFORMS = [
  'whatsapp', 'telegram', 'instagram', 'tiktok', 'youtube', 'facebook', 'x', 'website', 'other',
] as const;

export const CATEGORY_LABELS: Record<SocialCategory, string> = {
  group: 'Group',
  channel: 'Channel',
  social: 'Social Media',
};

export const newLinkId = () => `l_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Seed the editor from the legacy single-URL fields the first time. */
export function seedFromLegacy(data: any): SocialLink[] {
  const out: SocialLink[] = [];
  const add = (url: string | undefined, label: string, platform: string, category: SocialCategory) => {
    if (url && /^https?:\/\//i.test(url)) {
      out.push({ id: newLinkId(), label, url, platform, category, enabled: true });
    }
  };
  add(data?.whatsapp_channel_url, 'WhatsApp Channel', 'whatsapp', 'channel');
  add(data?.instagram_url, 'Instagram', 'instagram', 'social');
  add(data?.tiktok_url, 'TikTok', 'tiktok', 'social');
  add(data?.youtube_url, 'YouTube', 'youtube', 'social');
  return out;
}
