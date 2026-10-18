import { Cast } from 'lucide-react';
import { useCastFramework } from '@/hooks/useCastFramework';
import { useTranslation } from '@/lib/i18n';
import { buildStreamUrl } from '@/lib/streamUtils';

interface CastButtonProps {
  channel: {
    name: string;
    url: string;
    type?: string;
  };
  token?: string;
}

/**
 * TV pairing button (Chromecast / Google Cast). This button is EXCLUSIVELY
 * for showing the channel on a Cast-enabled TV — it is not a generic
 * "share" or "download" action. When the SDK is unavailable (iOS Safari,
 * older browsers), the button stays hidden.
 *
 * DRM-protected channels may fail on the Default Media Receiver, in which
 * case we surface a translated alert.
 */
export default function CastButton({ channel, token }: CastButtonProps) {
  const cast = useCastFramework();
  const { t } = useTranslation();

  if (!cast.ready || !cast.available) return null;

  const handlePair = async () => {
    try {
      const framework = window.cast?.framework;
      const chromeCast = window.chrome?.cast;
      if (!framework || !chromeCast) return;

      const context = framework.CastContext.getInstance();
      await context.requestSession();
      const session = context.getCurrentSession();
      if (!session) return;

      const streamUrl = buildStreamUrl(channel.url, token);
      const contentType =
        channel.type === 'dash' || channel.url.includes('.mpd')
          ? 'application/dash+xml'
          : 'application/x-mpegURL';

      const mediaInfo = new chromeCast.media.MediaInfo(streamUrl, contentType);
      mediaInfo.metadata = new chromeCast.media.GenericMediaMetadata();
      mediaInfo.metadata.title = channel.name;

      const request = new chromeCast.media.LoadRequest(mediaInfo);
      await session.loadMedia(request);
    } catch (err) {
      console.warn('TV pair failed:', err);
      alert(t('pair_tv_fail'));
    }
  };

  return (
    <button
      onClick={handlePair}
      className="p-2 rounded-xl glass press tap-safe text-white hover:text-primary transition-colors relative group"
      aria-label={t('pair_tv')}
      title={t('pair_tv')}
    >
      <Cast className="w-5 h-5" />
      {/* Tooltip that clarifies this is TV-only, appears on hover (desktop) */}
      <span className="pointer-events-none absolute top-full mt-2 right-0 whitespace-nowrap rounded-lg glass-strong px-3 py-1.5 text-[10px] font-bold text-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-200 hidden md:block">
        {t('pair_tv_desc')}
      </span>
    </button>
  );
}
