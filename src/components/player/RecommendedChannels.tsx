import { useEffect, useState } from 'react';
import { collection, getDocs, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import ChannelCard, { ChannelCardData } from '@/components/ChannelCard';

interface Channel extends ChannelCardData {
  category?: string;
  sort_order?: number;
  active?: boolean;
}

interface RecommendedChannelsProps {
  currentId: string;
  category?: string;
  limit?: number;
}

/**
 * Grid of recommended channels shown below the current player. Prioritizes
 * channels in the same category; falls back to other active channels if the
 * category has too few siblings.
 */
export default function RecommendedChannels({
  currentId,
  category,
  limit = 10,
}: RecommendedChannelsProps) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'channels')));
        const all: Channel[] = [];
        snap.forEach((d) => {
          const data = d.data() as Channel;
          if (d.id === currentId) return;
          if (data.active === false) return;
          all.push({ id: d.id, ...data });
        });

        // Sort by sort_order asc, then by name
        all.sort((a, b) => {
          const so = (a.sort_order || 0) - (b.sort_order || 0);
          if (so !== 0) return so;
          return (a.name || '').localeCompare(b.name || '');
        });

        // Prefer same-category first, then fill remaining with any others
        const sameCat = category
          ? all.filter((c) => (c.category || '') === category)
          : [];
        const otherCat = all.filter((c) => !sameCat.includes(c));

        const merged = [...sameCat, ...otherCat].slice(0, limit);
        if (!cancelled) setChannels(merged);
      } catch (err) {
        console.error('RecommendedChannels: fetch failed', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentId, category, limit]);

  if (!loading && channels.length === 0) return null;

  return (
    <section className="px-3 md:px-6 py-6">
      <div className="flex items-center gap-2 mb-4 px-1">
        <div className="w-1 h-5 bg-primary rounded-full glow-primary" />
        <h2 className="text-sm font-black tracking-widest text-foreground uppercase">
          Vituo Vingine
        </h2>
      </div>
      {loading ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[4/5] rounded-2xl skeleton"
              style={{ animationDelay: `${i * 40}ms` }}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
          {channels.map((ch) => (
            <ChannelCard key={ch.id} ch={ch} />
          ))}
        </div>
      )}
    </section>
  );
}
