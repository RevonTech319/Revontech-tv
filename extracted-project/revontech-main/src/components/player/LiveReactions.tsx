import { useState, useEffect, useRef } from 'react';
import { Heart, Flame, ThumbsUp, Trophy, Sparkles } from 'lucide-react';
import { doc, getDoc, setDoc, updateDoc, increment } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface LiveReactionsProps {
  channelId: string;
  showReactions?: boolean;
}

interface FloatingReaction {
  id: number;
  emoji: string;
  x: number; // percentage from left
}

const REACTION_OPTIONS = [
  { key: 'heart', emoji: '❤️', label: 'Upendo', icon: Heart, color: 'text-red-500' },
  { key: 'fire', emoji: '🔥', label: 'Moto', icon: Flame, color: 'text-orange-500' },
  { key: 'clap', emoji: '👏', label: 'Makofi', icon: Sparkles, color: 'text-yellow-400' },
  { key: 'goal', emoji: '⚽', label: 'Goli!', icon: Trophy, color: 'text-emerald-400' },
  { key: 'like', emoji: '👍', label: 'Safi', icon: ThumbsUp, color: 'text-cyan-400' },
];

export default function LiveReactions({ channelId, showReactions = true }: LiveReactionsProps) {
  const [floating, setFloating] = useState<FloatingReaction[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const nextId = useRef(0);

  // If reactions are disabled by admin, return null
  if (showReactions === false) {
    return null;
  }

  // Fetch initial reaction counts
  useEffect(() => {
    if (!channelId || !db) return;
    const fetchCounts = async () => {
      try {
        const snap = await getDoc(doc(db, 'channel_reactions', channelId));
        if (snap.exists()) {
          setCounts(snap.data() as Record<string, number>);
        }
      } catch (e) {
        // Fallback local counts
      }
    };
    fetchCounts();
  }, [channelId]);

  const handleReact = async (key: string, emoji: string) => {
    // 1. Trigger local floating animation
    const id = nextId.current++;
    const randomOffset = Math.floor(Math.random() * 40) - 20; // -20% to +20%
    const baseOffset = 50 + randomOffset;
    
    setFloating((prev) => [...prev, { id, emoji, x: baseOffset }]);
    setTimeout(() => {
      setFloating((prev) => prev.filter((item) => item.id !== id));
    }, 1800);

    // 2. Optimistic count update
    setCounts((prev) => ({
      ...prev,
      [key]: (prev[key] || 0) + 1,
    }));

    // 3. Persist to Firestore
    try {
      const ref = doc(db, 'channel_reactions', channelId);
      await setDoc(ref, { [key]: increment(1) }, { merge: true });
    } catch (e) {
      // Ignore background firestore error
    }
  };

  const formatCount = (n: number) => {
    if (!n) return '';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return n.toString();
  };

  return (
    <div className="relative px-4 md:px-6 py-2 select-none">
      {/* Floating animated reactions container */}
      <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
        {floating.map((f) => (
          <span
            key={f.id}
            style={{ left: `${f.x}%` }}
            className="absolute bottom-28 text-3xl md:text-4xl animate-float-up opacity-90 filter drop-shadow-md"
          >
            {f.emoji}
          </span>
        ))}
      </div>

      {/* Live Reactions Bar */}
      <div className="glass rounded-2xl p-2.5 sm:p-3 flex items-center justify-between gap-2 border border-border/50">
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-pink-500"></span>
          </span>
          <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground hidden xs:inline">
            Reactions:
          </span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 flex-1 justify-end overflow-x-auto py-0.5">
          {REACTION_OPTIONS.map((opt) => {
            const count = counts[opt.key] || 0;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => handleReact(opt.key, opt.emoji)}
                className="group relative flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 active:scale-90 transition-all border border-white/5 hover:border-pink-500/30"
                title={opt.label}
              >
                <span className="text-base group-hover:scale-125 transition-transform">
                  {opt.emoji}
                </span>
                {count > 0 && (
                  <span className="text-[10px] font-black text-foreground font-mono">
                    {formatCount(count)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
