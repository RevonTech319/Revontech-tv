import { Radio, Tag } from 'lucide-react';

interface ChannelMetaProps {
  channel: {
    name: string;
    category?: string;
    description?: string;
    schedule?: string;
    is_free?: boolean | string;
  };
}

/**
 * Meta block shown below the video player: title, category, description,
 * and optional schedule/EPG blurb. All optional fields fall back to null,
 * so channels without them just show title + LIVE.
 */
export default function ChannelMeta({ channel }: ChannelMetaProps) {
  const isFree = channel.is_free === true || channel.is_free === 'true';
  return (
    <section className="px-4 md:px-6 py-5 animate-slide-up">
      <div className="flex items-center gap-2 text-caption mb-2">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-destructive/15 border border-destructive/30 text-destructive text-[10px] font-black">
          <Radio className="w-3 h-3 animate-pulse" /> LIVE
        </span>
        {channel.category && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full glass text-[10px] font-black uppercase tracking-wider text-foreground">
            <Tag className="w-3 h-3" /> {channel.category}
          </span>
        )}
        {isFree && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-success/15 border border-success/30 text-success text-[10px] font-black">
            FREE
          </span>
        )}
      </div>

      <h1 className="text-h1 text-foreground mb-2">{channel.name}</h1>

      {channel.description && (
        <p className="text-body text-muted-foreground whitespace-pre-line">
          {channel.description}
        </p>
      )}

      {channel.schedule && (
        <div className="mt-4 glass rounded-2xl p-4">
          <p className="text-caption font-black uppercase tracking-widest mb-2">
            Ratiba
          </p>
          <p className="text-body text-foreground whitespace-pre-line">
            {channel.schedule}
          </p>
        </div>
      )}
    </section>
  );
}
