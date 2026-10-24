import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, getDoc, doc, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ChevronLeft, ChevronRight, Play } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

interface SliderImage {
  id: string;
  img_url: string;
  title?: string | null;
  caption?: string | null;
  channel_id?: string | null;
  cta_label?: string | null;
  cta_target?: string | null;
  sort_order?: number;
  active?: boolean;
}

/**
 * The channel a slide opens. New slides store `channel_id`. Older slides
 * stored a plain channel ID in `cta_target`, which is still honoured
 * (external links and routes from the old format are ignored).
 */
function getChannelId(slide: SliderImage): string | null {
  if (slide.channel_id) return slide.channel_id;
  const legacy = (slide.cta_target || '').trim();
  if (legacy && !/^https?:\/\//i.test(legacy) && !legacy.startsWith('/')) return legacy;
  return null;
}

const AUTO_ADVANCE_MS = 5000;
const SWIPE_THRESHOLD_PX = 40;

export default function HeroSlider() {
  const { t } = useTranslation();
  const [validChannels, setValidChannels] = useState<Record<string, boolean>>({});
  const [slides, setSlides] = useState<SliderImage[]>([]);
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'slider_images')));
        const fetched: SliderImage[] = [];
        snap.forEach((d) => {
          const data = d.data() as any;
          if (data.active !== false && data.img_url) {
            fetched.push({ id: d.id, ...data });
          }
        });
        fetched.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
        setSlides(fetched);

        // Only show the Watch button when the linked channel still exists
        const ids = Array.from(new Set(fetched.map(getChannelId).filter(Boolean) as string[]));
        const entries = await Promise.all(
          ids.map(async (id) => {
            try {
              const ch = await getDoc(doc(db, 'channels', id));
              return [id, ch.exists() && ch.data().active !== false] as const;
            } catch {
              return [id, false] as const;
            }
          })
        );
        setValidChannels(Object.fromEntries(entries));
      } catch (err) {
        console.error('HeroSlider fetch failed:', err);
      }
    })();
  }, []);

  const total = slides.length;

  const next = useCallback(() => {
    setCurrent((c) => (total === 0 ? 0 : (c + 1) % total));
  }, [total]);

  const prev = useCallback(() => {
    setCurrent((c) => (total === 0 ? 0 : (c - 1 + total) % total));
  }, [total]);

  const goTo = useCallback(
    (i: number) => {
      if (total === 0) return;
      setCurrent(((i % total) + total) % total);
    },
    [total]
  );

  // Auto-advance
  useEffect(() => {
    if (total < 2 || paused) return;
    timerRef.current = setInterval(next, AUTO_ADVANCE_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [total, paused, next]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    setPaused(true);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > SWIPE_THRESHOLD_PX) {
      if (dx > 0) prev();
      else next();
    }
    touchStartX.current = null;
    // Resume auto-advance after touch
    setTimeout(() => setPaused(false), 500);
  };

  if (total === 0) return null;

  return (
    <section
      className="relative w-full aspect-[16/9] md:aspect-[21/9] max-h-[70vh] overflow-hidden bg-muted"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      aria-roledescription="carousel"
    >
      {slides.map((slide, i) => {
        const active = i === current;
        const channelId = getChannelId(slide);
        const hasChannel = !!channelId && validChannels[channelId] === true;
        const hasText = !!(slide.title || slide.caption);
        return (
          <div
            key={slide.id}
            aria-hidden={!active}
            className="absolute inset-0 transition-opacity duration-700"
            style={{ opacity: active ? 1 : 0, pointerEvents: active ? 'auto' : 'none' }}
          >
            <img
              src={slide.img_url}
              alt={slide.title || slide.caption || ''}
              loading={i === 0 ? 'eager' : 'lazy'}
              referrerPolicy="no-referrer"
              className={`w-full h-full object-cover ${active ? 'animate-ken-burns' : ''}`}
            />

            {/* Multi-layer gradient for text legibility */}
            {(hasText || hasChannel) && (
              <>
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-r from-background/70 via-transparent to-transparent md:from-background/50" />
              </>
            )}

            {/* Content stack (only rendered when there is text or a linked channel) */}
            {(hasText || hasChannel) && (
              <div className="absolute inset-0 flex flex-col justify-end p-3 md:p-10 pb-7 md:pb-8 max-w-3xl">
                {hasChannel && (
                  <span className="text-[10px] md:text-xs text-primary font-black uppercase tracking-widest mb-1 md:mb-2 flex items-center gap-1.5 animate-fade-in">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    LIVE NOW
                  </span>
                )}
                {hasText && (
                  <h1 className="text-xl leading-tight md:text-display font-black text-foreground text-glow-primary mb-2 md:mb-3 line-clamp-1 md:line-clamp-2 animate-slide-up">
                    {slide.title || slide.caption}
                  </h1>
                )}
                {slide.title && slide.caption && (
                  <p className="text-body text-muted-foreground mb-3 md:mb-5 line-clamp-1 md:line-clamp-2 max-w-xl animate-slide-up hidden sm:block">
                    {slide.caption}
                  </p>
                )}
                {hasChannel && (
                  <div className="animate-slide-up">
                    <Link
                      to={`/player/${channelId}`}
                      className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 md:px-5 md:py-2.5 rounded-full font-black text-xs md:text-base glow-primary press hover:brightness-110 tap-safe"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      {t('watch_now')}
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Arrows (hidden on very small screens if only 1) */}
      {total > 1 && (
        <>
          <button
            onClick={prev}
            aria-label="Slide ya awali"
            className="hidden md:block absolute left-4 top-1/2 -translate-y-1/2 glass p-2 rounded-full press tap-safe hover:bg-primary/20"
          >
            <ChevronLeft className="w-5 h-5 text-foreground" />
          </button>
          <button
            onClick={next}
            aria-label="Slide inayofuata"
            className="hidden md:block absolute right-4 top-1/2 -translate-y-1/2 glass p-2 rounded-full press tap-safe hover:bg-primary/20"
          >
            <ChevronRight className="w-5 h-5 text-foreground" />
          </button>
        </>
      )}

      {/* Dots */}
      {total > 1 && (
        <div className="absolute bottom-2 md:bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5" role="tablist">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              aria-label={`Nenda slide ${i + 1}`}
              aria-selected={i === current}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === current
                  ? 'w-6 bg-primary glow-primary'
                  : 'w-1.5 bg-foreground/40 hover:bg-foreground/60'
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
