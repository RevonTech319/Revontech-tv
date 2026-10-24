import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Tv2 } from 'lucide-react';

export interface ChannelCardData {
  id: string;
  name: string;
  img_url: string | null;
  is_free?: boolean;
  category?: string;
}

interface ChannelCardProps {
  ch: ChannelCardData;
}

/**
 * Standardized channel card used across homepage grid and Player recommended list.
 * Uses lazy loading + skeleton placeholder + subtle hover/press animations.
 */
export default function ChannelCard({ ch }: ChannelCardProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  return (
    <Link
      to={`/player/${ch.id}`}
      className="rounded-2xl overflow-hidden cursor-pointer group relative flex flex-col glass hover-lift press tap-safe"
    >
      {/* LIVE badge */}
      <span className="absolute top-2 left-2 z-10 flex items-center gap-1 bg-destructive/90 backdrop-blur-sm text-destructive-foreground text-[9px] font-black px-1.5 py-0.5 rounded-full">
        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse inline-block" />
        LIVE
      </span>
      {ch.is_free && (
        <span className="absolute top-2 right-2 z-10 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-primary/90 text-primary-foreground">
          FREE
        </span>
      )}

      <div className="w-full aspect-[4/5] bg-muted/30 overflow-hidden relative">
        {!imgLoaded && !imgError && <div className="absolute inset-0 skeleton" />}
        {ch.img_url && !imgError ? (
          <img
            src={ch.img_url}
            alt={ch.name}
            loading="lazy"
            referrerPolicy="no-referrer"
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgError(true)}
            className={`w-full h-full object-cover transition-all duration-500 ${
              imgLoaded ? 'opacity-100 group-hover:scale-105' : 'opacity-0'
            }`}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Tv2 className="w-10 h-10 text-muted-foreground opacity-40" />
          </div>
        )}
      </div>

      <div className="px-3 py-2.5 border-t border-border/40 flex items-center justify-between gap-1.5">
        <p className="text-[13px] font-bold text-foreground truncate leading-tight flex-1">{ch.name}</p>
      </div>
    </Link>
  );
}

