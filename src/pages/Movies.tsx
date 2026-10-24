import { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Header from '@/components/Header';
import { Film, AlertCircle, RefreshCw, Search, Loader2, Lock, Sparkles } from 'lucide-react';

/**
 * Native Movies catalog.
 *
 * Movies are fetched at runtime through an upstream content API and rendered
 * with our own UI. The upstream source is intentionally hidden from the user.
 */

const UPSTREAM = 'https://netswahili.com';
const CF_PROXY = 'https://us-central1-revontech-6c62d.cloudfunctions.net/movieProxy';
const FALLBACK_PROXY = 'https://api.allorigins.win/raw?url=';
const PAGE_SIZE = 10;
const INITIAL_PAGES = 5;       // 50 movies on first load
const LISTING_TYPE = 'latest'; // upstream listing type

interface MovieCard {
  slug: string;
  title: string;
  poster: string;
  type: string;
  source: 'manual' | 'upstream';
  is_free?: boolean;
}

function parseCards(html: string, dedupe: Set<string>): MovieCard[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const cards: MovieCard[] = [];
  doc.querySelectorAll('.post-card').forEach((card) => {
    const ancestorAnchor = card.closest('a') as HTMLAnchorElement | null;
    const childAnchor = card.querySelector('a[href*="/post/"]') as HTMLAnchorElement | null;
    const linkEl = ancestorAnchor || childAnchor;
    const href = linkEl?.getAttribute('href') || '';
    const slugMatch = href.match(/\/post\/([^/?#]+)/);
    const slug = slugMatch?.[1];
    if (!slug || dedupe.has(slug)) return;
    dedupe.add(slug);

    cards.push({
      slug,
      title:
        card.querySelector('.post-title')?.textContent?.trim() ||
        slug.replace(/-/g, ' '),
      poster: card.querySelector('img')?.getAttribute('src') || '',
      type: card.querySelector('.type')?.textContent?.trim() || 'Movie',
      source: 'upstream',
    });
  });
  return cards;
}

/** Fetch admin-curated movies from the Firestore `movies` collection. */
async function fetchManualMovies(dedupe: Set<string>): Promise<MovieCard[]> {
  try {
    const snap = await getDocs(collection(db, 'movies'));
    const list: MovieCard[] = [];
    snap.docs.forEach((d) => {
      const data = d.data() as any;
      if (data.active === false) return;
      const slug = data.slug || `m_${d.id}`;
      if (dedupe.has(slug)) return;
      dedupe.add(slug);
      list.push({
        slug,
        title: data.title || 'Untitled',
        poster: data.poster || '',
        type: data.category || 'Movie',
        source: 'manual',
        is_free: !!data.is_free,
      });
    });
    list.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    return list;
  } catch (e) {
    console.error('Failed to load manual movies:', e);
    return [];
  }
}

/** Fetch admin-set upstream slugs to hide from the catalog. */
async function fetchHiddenSlugs(): Promise<Set<string>> {
  try {
    const snap = await getDoc(doc(db, 'settings', 'movies_config'));
    if (!snap.exists()) return new Set();
    const data = snap.data() as any;
    return new Set(Array.isArray(data.hidden_slugs) ? data.hidden_slugs : []);
  } catch {
    return new Set();
  }
}

/** Fetch upstream slugs that have already been imported (so we don't show duplicates). */
async function fetchImportedSlugs(): Promise<Set<string>> {
  try {
    const snap = await getDocs(collection(db, 'movies'));
    const set = new Set<string>();
    snap.docs.forEach((d) => {
      const data = d.data() as any;
      if (data.imported_from) set.add(data.imported_from);
    });
    return set;
  } catch {
    return new Set();
  }
}

async function fetchPage(offset: number): Promise<string> {
  const targetUrl =
    offset === 0
      ? `${UPSTREAM}/all/latest`
      : `${UPSTREAM}/data/fetch_post.php`;

  const isPost = offset !== 0;
  const postBody = `starting=${offset}&type=${encodeURIComponent(LISTING_TYPE)}`;

  // 1. Try Cloud Function proxy
  try {
    const cfUrl = isPost ? CF_PROXY : `${CF_PROXY}?url=${encodeURIComponent(targetUrl)}`;
    const init: RequestInit = isPost
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `url=${encodeURIComponent(targetUrl)}&${postBody}`,
        }
      : {};
    const res = await fetch(cfUrl, init);
    if (res.ok) {
      const text = await res.text();
      if (text && text.length > 50) return text;
    }
  } catch (e) {
    console.warn('CF proxy error, trying fallback:', e);
  }

  // 2. Try AllOrigins fallback for GET
  if (!isPost) {
    try {
      const res = await fetch(`${FALLBACK_PROXY}${encodeURIComponent(targetUrl)}`);
      if (res.ok) {
        const text = await res.text();
        if (text && text.length > 50) return text;
      }
    } catch (e) {
      console.warn('Allorigins fallback error:', e);
    }
  }

  throw new Error('Huduma ya filamu inafanyiwa maboresho');
}

export default function Movies() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [movies, setMovies] = useState<MovieCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState(searchParams.get('q') || '');
  const [endReached, setEndReached] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [moviesDisabled, setMoviesDisabled] = useState(false);

  // Internal counters that survive re-renders without re-triggering effects
  const offsetRef = useRef(0);
  const seenRef = useRef<Set<string>>(new Set());

  const initialLoad = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMovies([]);
    setEndReached(false);
    offsetRef.current = 0;
    seenRef.current = new Set();

    // Check if admin turned off movies
    try {
      const setSnap = await getDoc(doc(db, 'settings', 'general_settings'));
      if (setSnap.exists() && setSnap.data()?.movies_enabled === false) {
        setMoviesDisabled(true);
        setLoading(false);
        return;
      } else {
        setMoviesDisabled(false);
      }
    } catch (e) {
      // Continue if settings fetch fails
    }

    try {
      // 0) Pre-populate dedupe with hidden + already-imported upstream slugs,
      //    so the upstream parser silently skips them.
      const [hidden, imported] = await Promise.all([
        fetchHiddenSlugs(),
        fetchImportedSlugs(),
      ]);
      hidden.forEach((s) => seenRef.current.add(s));
      imported.forEach((s) => seenRef.current.add(s));

      // 1) Admin-curated movies from Firestore first (shown at the top)
      const manual = await fetchManualMovies(seenRef.current);
      if (manual.length > 0) {
        setMovies(manual);
      }

      // 2) Load the first upstream page synchronously
      const firstHtml = await fetchPage(0);
      const firstBatch = parseCards(firstHtml, seenRef.current);
      offsetRef.current = PAGE_SIZE;
      if (firstBatch.length > 0) {
        setMovies((prev) => [...prev, ...firstBatch]);
      }

      if (manual.length === 0 && firstBatch.length === 0) {
        throw new Error('Hakuna movies kupatikana');
      }

      // 3) Then the next few upstream pages in parallel
      const morePromises: Promise<MovieCard[]>[] = [];
      for (let i = 1; i < INITIAL_PAGES; i++) {
        morePromises.push(
          fetchPage(i * PAGE_SIZE).then((html) => parseCards(html, seenRef.current)),
        );
      }
      const moreResults = await Promise.allSettled(morePromises);
      const combined: MovieCard[] = [];
      moreResults.forEach((r) => {
        if (r.status === 'fulfilled') combined.push(...r.value);
      });
      if (combined.length > 0) {
        setMovies((prev) => [...prev, ...combined]);
        offsetRef.current = INITIAL_PAGES * PAGE_SIZE;
      }
    } catch (e: any) {
      console.error('Movies fetch failed:', e);
      setError(e?.message || 'Imeshindwa kupakua movies. Jaribu tena.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore || endReached) return;
    setLoadingMore(true);
    try {
      const next = offsetRef.current;
      const html = await fetchPage(next);
      const batch = parseCards(html, seenRef.current);
      offsetRef.current = next + PAGE_SIZE;
      if (batch.length === 0) {
        setEndReached(true);
      } else {
        setMovies((prev) => [...prev, ...batch]);
      }
    } catch (e) {
      console.error('Load more failed:', e);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, endReached]);

  useEffect(() => {
    initialLoad();
  }, [initialLoad, refreshKey]);

  const filtered = searchTerm.trim()
    ? movies.filter((m) => m.title.toLowerCase().includes(searchTerm.toLowerCase()))
    : movies;

  if (moviesDisabled) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <Header />
        <div className="max-w-md mx-auto px-4 py-20 text-center">
          <div className="w-20 h-20 rounded-3xl bg-primary/10 border border-primary/30 flex items-center justify-center mx-auto mb-6 glow-cyan">
            <Film className="w-10 h-10 text-primary" />
          </div>
          <span className="text-xs font-black uppercase tracking-widest px-3 py-1 rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
            Maboresho Yanaendelea
          </span>
          <h1 className="text-2xl font-black text-foreground mt-4 mb-2">
            Sehemu ya Filamu Imefungwa kwa Muda
          </h1>
          <p className="text-xs text-muted-foreground leading-relaxed mb-6">
            Maboresho ya mfumo wa filamu yanaendelea. Vituo vyote vya Live TV vinafanya kazi vizuri bila hitilafu!
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-black text-xs glow-primary hover-lift press"
          >
            Tazama Vituo vya Live TV
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <Header />

      <div className="px-3 pt-4 pb-3">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
            <Film className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-black text-foreground leading-none">Movies</h1>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Filamu zilizotafsiriwa Kiswahili
            </p>
          </div>
          {!loading && (
            <button
              onClick={() => setRefreshKey((k) => k + 1)}
              className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2">
          <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              if (e.target.value) setSearchParams({ q: e.target.value });
              else setSearchParams({});
            }}
            placeholder="Tafuta movie..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
        </div>

        {!loading && movies.length > 0 && (
          <p className="text-[10px] text-muted-foreground mt-2 px-1">
            Onyesho la movies <span className="font-bold text-primary">{filtered.length}</span>
            {searchTerm && ` (kati ya ${movies.length})`}
          </p>
        )}
      </div>

      <div className="px-3">
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="aspect-[2/3] bg-muted rounded-xl animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <AlertCircle className="w-12 h-12 text-destructive mb-3" />
            <p className="font-black text-foreground mb-1">Imeshindwa kupakua</p>
            <p className="text-xs text-muted-foreground mb-4 max-w-xs">{error}</p>
            <button
              onClick={() => setRefreshKey((k) => k + 1)}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-bold text-sm glow-primary"
            >
              <RefreshCw className="w-3.5 h-3.5 inline mr-2" />
              Jaribu Tena
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Film className="w-12 h-12 text-muted-foreground/30 mb-3" />
            <p className="font-bold text-muted-foreground">
              {searchTerm ? 'Hakuna movie inayolingana' : 'Hakuna movies'}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
              {filtered.map((movie) => (
                <Link
                  key={movie.slug}
                  to={`/movies/${movie.slug}`}
                  className="cyber-card rounded-xl overflow-hidden cursor-pointer group relative flex flex-col"
                >
                  <div className="absolute top-2 right-2 z-10 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-primary/90 text-primary-foreground">
                    {movie.type.toUpperCase()}
                  </div>
                  {movie.source === 'manual' && movie.is_free ? (
                    <div className="absolute top-2 left-2 z-10 flex items-center gap-0.5 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-green-500/90 text-white">
                      FREE
                    </div>
                  ) : movie.source === 'manual' ? (
                    <div className="absolute top-2 left-2 z-10 flex items-center gap-0.5 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-yellow-400/90 text-black">
                      <Sparkles className="w-2.5 h-2.5" />
                      EXCLUSIVE
                    </div>
                  ) : (
                    <div className="absolute top-2 left-2 z-10 flex items-center gap-0.5 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-primary/80 text-primary-foreground">
                      <Lock className="w-2.5 h-2.5" />
                      PREMIUM
                    </div>
                  )}
                  <div className="w-full aspect-[2/3] bg-muted/30 overflow-hidden relative">
                    {movie.poster ? (
                      <img
                        src={movie.poster}
                        alt={movie.title}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Film className="w-10 h-10 text-muted-foreground opacity-40" />
                      </div>
                    )}
                  </div>
                  <div className="px-3 py-2.5 border-t border-border">
                    <p className="text-[12px] font-bold text-foreground leading-tight line-clamp-2">
                      {movie.title}
                    </p>
                  </div>
                </Link>
              ))}
            </div>

            {/* Load more — only when not searching */}
            {!searchTerm && (
              <div className="flex justify-center pt-6">
                {endReached ? (
                  <p className="text-xs text-muted-foreground font-bold">
                    Umefika mwisho wa orodha
                  </p>
                ) : (
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="px-5 py-2.5 rounded-xl bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary font-black text-sm transition-colors disabled:opacity-60 flex items-center gap-2"
                  >
                    {loadingMore ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Inapakua...
                      </>
                    ) : (
                      <>Pakua Zaidi</>
                    )}
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
