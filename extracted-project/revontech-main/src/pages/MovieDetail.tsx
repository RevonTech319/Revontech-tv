import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  collection, doc, getDoc, getDocs, query, where, onSnapshot,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import Header from '@/components/Header';
import {
  ChevronLeft, Play, Film, AlertCircle, RefreshCw, Lock, Crown, CreditCard, Loader2,
} from 'lucide-react';

const SOURCE_ORIGIN = 'https://netswahili.com';
const CF_PROXY = 'https://us-central1-revontech-6c62d.cloudfunctions.net/movieProxy';
const FALLBACK_PROXY = 'https://api.allorigins.win/raw?url=';
const TRIAL_SECONDS = 30;
const EPISODE_PAGE_SIZE = 5;       // upstream returns 5 episodes per page

async function fetchProxied(url: string, isPost = false, postBody = ''): Promise<string> {
  // 1. Cloud Function
  try {
    const cfUrl = isPost ? CF_PROXY : `${CF_PROXY}?url=${encodeURIComponent(url)}`;
    const init: RequestInit = isPost
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `url=${encodeURIComponent(url)}&${postBody}`,
        }
      : {};
    const res = await fetch(cfUrl, init);
    if (res.ok) {
      const text = await res.text();
      if (text && text.length > 50) return text;
    }
  } catch (e) {
    console.warn('CF proxy error in detail, trying fallback:', e);
  }

  // 2. Fallback AllOrigins for GET
  if (!isPost) {
    try {
      const res = await fetch(`${FALLBACK_PROXY}${encodeURIComponent(url)}`);
      if (res.ok) {
        const text = await res.text();
        if (text && text.length > 50) return text;
      }
    } catch (e) {
      console.warn('AllOrigins fallback error:', e);
    }
  }

  throw new Error('Huduma ya filamu inafanyiwa maboresho');
}

interface Episode {
  title: string;
  driveId: string;
}

interface MovieDetailData {
  title: string;
  poster: string;
  description: string;
  episodes: Episode[];
  related: Array<{ slug: string; title: string; poster: string }>;
  isFree: boolean;
}

interface Plan {
  name: string;
  plan_key: string;
  amount: number;
  currency: string;
}

/* ─────────── parsers for upstream movies (netswahili) ─────────── */

/** Parse `.list-epsode` elements (initial page OR pagination response). */
function parseEpisodesFromElement(root: ParentNode): Episode[] {
  const episodes: Episode[] = [];
  root.querySelectorAll('.list-epsode').forEach((el) => {
    const onclick = el.getAttribute('onclick') || '';
    const driveMatch = onclick.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
    const titleMatch = onclick.match(/,\s*['"]([^'"]+)['"]/);
    if (driveMatch) {
      episodes.push({
        title:
          titleMatch?.[1] ||
          el.querySelector('.epsodes-number')?.textContent?.trim() ||
          `Episode ${episodes.length + 1}`,
        driveId: driveMatch[1],
      });
    }
  });
  return episodes;
}

/** Fetch ALL paginated episodes for a series from the upstream load-more
 *  endpoint. Used when the initial page indicates there are more episodes
 *  via the `#episode-load` button. */
async function fetchRemainingEpisodes(slug: string, startOffset: number): Promise<Episode[]> {
  const all: Episode[] = [];
  const MAX_PAGES = 40; // hard cap to avoid runaway loops
  let offset = startOffset;
  for (let i = 0; i < MAX_PAGES; i++) {
    try {
      const html = await fetchProxied(
        `${SOURCE_ORIGIN}/data/fetch_episode.php`,
        true,
        `starting=${offset}&slug=${encodeURIComponent(slug)}`
      );
      if (!html || !html.trim()) break;
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      const batch = parseEpisodesFromElement(tmp);
      if (batch.length === 0) break;
      all.push(...batch);
      offset += EPISODE_PAGE_SIZE;
    } catch {
      break;
    }
  }
  return all;
}

function parseMoviePage(html: string): { data: MovieDetailData; hasMoreEpisodes: boolean } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const title =
    doc.querySelector('.movie-details h1')?.textContent?.trim() ||
    doc.querySelector('h1')?.textContent?.trim() ||
    'Movie';

  const poster =
    doc.querySelector('.details-image img')?.getAttribute('src') ||
    doc.querySelector('img')?.getAttribute('src') ||
    '';

  const description =
    doc.querySelector('.details-description')?.textContent?.trim() || '';

  const episodes = parseEpisodesFromElement(doc);

  // If the page shows a #episode-load button, there are more episodes to fetch
  const hasMoreEpisodes = !!doc.querySelector('#episode-load');

  const related: MovieDetailData['related'] = [];
  const seenRelated = new Set<string>();
  doc.querySelectorAll('.latest-grid .post-card').forEach((card) => {
    const ancestorAnchor = card.closest('a') as HTMLAnchorElement | null;
    const childAnchor = card.querySelector('a[href*="/post/"]') as HTMLAnchorElement | null;
    const link = ancestorAnchor || childAnchor;
    const href = link?.getAttribute('href') || '';
    const slugMatch = href.match(/\/post\/([^/?#]+)/);
    const slug = slugMatch?.[1];
    if (!slug || seenRelated.has(slug)) return;
    seenRelated.add(slug);
    related.push({
      slug,
      title: card.querySelector('.post-title')?.textContent?.trim() || slug,
      poster: card.querySelector('img')?.getAttribute('src') || '',
    });
  });

  return {
    data: { title, poster, description, episodes, related, isFree: false },
    hasMoreEpisodes,
  };
}

/* ─────────── component ─────────── */
export default function MovieDetail() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [data, setData] = useState<MovieDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Subscription state
  const [isPremium, setIsPremium] = useState(false);
  const [trialLeft, setTrialLeft] = useState(TRIAL_SECONDS);
  const [trialDone, setTrialDone] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [moviesDisabled, setMoviesDisabled] = useState(false);
  const trialTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* — fetch movie data based on slug — */
  const fetchMovie = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    setSelectedEpisode(null);
    setShowPaywall(false);
    setTrialDone(false);
    setTrialLeft(TRIAL_SECONDS);

    try {
      const setSnap = await getDoc(doc(db, 'settings', 'general_settings'));
      if (setSnap.exists() && setSnap.data()?.movies_enabled === false) {
        setMoviesDisabled(true);
        setLoading(false);
        return;
      } else {
        setMoviesDisabled(false);
      }
    } catch (e) {}

    try {
      // Firestore-backed movies can be reached by either:
      //   - m_<docId>  (auto-generated slug fallback)
      //   - any custom slug stored in the movie's `slug` field (admin imports)
      // We try BOTH before falling back to the upstream proxy.
      let firestoreMovie: any = null;

      if (slug.startsWith('m_')) {
        const docId = slug.slice(2);
        const snap = await getDoc(doc(db, 'movies', docId));
        if (snap.exists()) firestoreMovie = { id: snap.id, ...snap.data() };
      } else {
        // Look up by `slug` field
        const q = query(collection(db, 'movies'), where('slug', '==', slug));
        const qs = await getDocs(q);
        if (!qs.empty) {
          const d = qs.docs[0];
          firestoreMovie = { id: d.id, ...d.data() };
        } else {
          // Fallback: look up by `imported_from` (in case the slug equals
          // the original netswahili slug — e.g. user navigated via direct URL)
          const q2 = query(collection(db, 'movies'), where('imported_from', '==', slug));
          const qs2 = await getDocs(q2);
          if (!qs2.empty) {
            const d = qs2.docs[0];
            firestoreMovie = { id: d.id, ...d.data() };
          }
        }
      }

      if (firestoreMovie) {
        // Firestore movies can have either:
        //  - episodes: [{title, driveId}]  (preferred, for series + imported netswahili)
        //  - drive_id: string              (legacy / single-movie shape)
        let episodes: Episode[] = [];
        if (Array.isArray(firestoreMovie.episodes) && firestoreMovie.episodes.length > 0) {
          episodes = firestoreMovie.episodes
            .map((ep: any) => ({
              title: ep.title || 'Episode',
              driveId: ep.driveId || ep.drive_id || '',
            }))
            .filter((e: Episode) => !!e.driveId);
        } else if (firestoreMovie.drive_id) {
          episodes = [{ title: firestoreMovie.title || 'Play', driveId: firestoreMovie.drive_id }];
        }
        const parsed: MovieDetailData = {
          title: firestoreMovie.title || 'Untitled',
          poster: firestoreMovie.poster || '',
          description: firestoreMovie.description || '',
          episodes,
          related: [],
          isFree: !!firestoreMovie.is_free,
        };
        setData(parsed);
        if (parsed.episodes.length > 0) setSelectedEpisode(parsed.episodes[0]);
      } else {
        // Upstream movie via proxy
        const html = await fetchProxied(`${SOURCE_ORIGIN}/post/${slug}`);
        const { data: parsed, hasMoreEpisodes } = parseMoviePage(html);

        // Show first episode immediately
        setData(parsed);
        if (parsed.episodes.length > 0) setSelectedEpisode(parsed.episodes[0]);

        // Fetch additional episodes in the background if this is a series
        if (hasMoreEpisodes && slug) {
          const more = await fetchRemainingEpisodes(slug, parsed.episodes.length);
          if (more.length > 0) {
            setData((prev) =>
              prev ? { ...prev, episodes: [...prev.episodes, ...more] } : prev,
            );
          }
        }
      }
    } catch (e: any) {
      console.error('Movie fetch failed:', e);
      setError(e?.message || 'Imeshindwa kupakua movie.');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    fetchMovie();
  }, [fetchMovie, refreshKey]);

  /* — real-time subscription check — */
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'subscriptions'), where('user_id', '==', user.uid));
    const unsub = onSnapshot(q, (snap) => {
      const hasActive = snap.docs.some((d) => {
        const data = d.data() as any;
        if (data.status !== 'active') return false;
        if (data.expires_at) {
          const exp = new Date(data.expires_at).getTime();
          if (exp < Date.now()) return false;
        }
        return true;
      });
      setIsPremium(hasActive);
      if (hasActive) {
        setShowPaywall(false);
        setTrialDone(false);
      }
    });
    return () => unsub();
  }, [user]);

  /* — fetch plans for paywall — */
  useEffect(() => {
    (async () => {
      try {
        const plansSnap = await getDocs(query(collection(db, 'plans')));
        const list: Plan[] = [];
        plansSnap.forEach((d) => {
          const data = d.data() as any;
          if (data.active !== false) list.push(data as Plan);
        });
        list.sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));
        setPlans(list);
      } catch (e) {
        console.error('plans fetch failed', e);
      }
    })();
  }, []);

  /* — trial countdown for non-premium users on premium movies — */
  useEffect(() => {
    if (trialTimerRef.current) {
      clearInterval(trialTimerRef.current);
      trialTimerRef.current = null;
    }
    if (!data) return;
    if (data.isFree || isPremium || showPaywall || !selectedEpisode) return;

    trialTimerRef.current = setInterval(() => {
      setTrialLeft((prev) => {
        if (prev <= 1) {
          if (trialTimerRef.current) {
            clearInterval(trialTimerRef.current);
            trialTimerRef.current = null;
          }
          setTrialDone(true);
          setShowPaywall(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (trialTimerRef.current) clearInterval(trialTimerRef.current);
    };
  }, [data, isPremium, selectedEpisode, showPaywall]);

  /* — derived flags — */
  const canPlay = !!data && (data.isFree || isPremium || (!trialDone && !showPaywall));
  const formatPrice = (amt: number) => amt.toLocaleString();

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

      <div className="max-w-5xl mx-auto">
        {/* Top bar */}
        <div className="sticky top-[61px] z-30 bg-background/95 backdrop-blur-sm border-b border-border px-3 py-2 flex items-center gap-2">
          <button
            onClick={() => navigate('/movies')}
            className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-xs font-bold text-muted-foreground">Rudi kwa Movies</span>
        </div>

        {loading ? (
          <div className="px-4 pt-6">
            <div className="aspect-video bg-muted rounded-2xl animate-pulse mb-4" />
            <div className="h-6 bg-muted rounded-md w-3/4 mb-2 animate-pulse" />
            <div className="h-4 bg-muted rounded-md w-1/2 animate-pulse" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-4">
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
        ) : data ? (
          <>
            {/* Video player area */}
            <div className="bg-black relative">
              {selectedEpisode && canPlay ? (
                <div className="relative w-full aspect-video">
                  <iframe
                    key={selectedEpisode.driveId}
                    src={`https://drive.google.com/file/d/${selectedEpisode.driveId}/preview`}
                    title={selectedEpisode.title}
                    className="absolute inset-0 w-full h-full"
                    allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                    allowFullScreen
                    referrerPolicy="no-referrer"
                  />
                  {/* Trial countdown */}
                  {!isPremium && !data.isFree && !trialDone && (
                    <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 px-2 py-1 rounded-full bg-yellow-500/90 text-black text-[10px] font-black">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Jaribio: {trialLeft}s
                    </div>
                  )}
                </div>
              ) : showPaywall || (data && !data.isFree && !isPremium && trialDone) ? (
                /* Paywall */
                <div
                  className="relative w-full aspect-video flex items-center justify-center bg-cover bg-center"
                  style={data.poster ? { backgroundImage: `url(${data.poster})` } : undefined}
                >
                  <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" />
                  <div className="relative z-10 text-center px-6 max-w-md">
                    <div className="w-16 h-16 mx-auto rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center mb-4">
                      <Lock className="w-8 h-8 text-primary" />
                    </div>
                    <h2 className="text-xl sm:text-2xl font-black text-white mb-2">
                      Movie hii ni ya Premium
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-300 mb-5">
                      Lipia kifurushi cha subscription ili kuangalia bila kikomo
                    </p>

                    {plans.length > 0 && (
                      <div className="grid grid-cols-2 gap-2 mb-4">
                        {plans.slice(0, 4).map((p) => (
                          <div
                            key={p.plan_key}
                            className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-left"
                          >
                            <p className="text-[10px] text-slate-400 font-bold">{p.name}</p>
                            <p className="text-sm font-black text-primary mt-0.5">
                              {formatPrice(p.amount)} {p.currency}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}

                    <button
                      onClick={() => navigate('/payment')}
                      className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-black text-sm glow-primary flex items-center justify-center gap-2"
                    >
                      <CreditCard className="w-4 h-4" />
                      LIPIA SASA
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="relative w-full aspect-video flex items-center justify-center bg-cover bg-center"
                  style={data.poster ? { backgroundImage: `url(${data.poster})` } : undefined}
                >
                  <div className="absolute inset-0 bg-black/60" />
                  <p className="relative text-muted-foreground text-sm">Hakuna episode</p>
                </div>
              )}
            </div>

            {/* Info */}
            <div className="px-4 py-5">
              <div className="flex items-start gap-2 mb-1">
                <h1 className="text-lg sm:text-xl font-black text-foreground leading-tight flex-1">
                  {data.title}
                </h1>
                {data.isFree ? (
                  <span className="text-[10px] font-black px-2 py-1 rounded-full bg-green-500/10 border border-green-500/30 text-green-400 flex-shrink-0">
                    FREE
                  </span>
                ) : isPremium ? (
                  <span className="text-[10px] font-black px-2 py-1 rounded-full bg-yellow-400/10 border border-yellow-400/30 text-yellow-400 flex-shrink-0 flex items-center gap-1">
                    <Crown className="w-3 h-3" /> PREMIUM
                  </span>
                ) : (
                  <span className="text-[10px] font-black px-2 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary flex-shrink-0 flex items-center gap-1">
                    <Lock className="w-3 h-3" /> PREMIUM
                  </span>
                )}
              </div>

              {selectedEpisode && (
                <p className="text-xs text-primary font-bold mb-3">
                  Inacheza: {selectedEpisode.title}
                </p>
              )}
              {data.description && (
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                  {data.description}
                </p>
              )}

              {/* Episode list — shown when there are multiple episodes */}
              {data.episodes.length > 1 && (
                <div className="mb-6">
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2 flex items-center gap-2">
                    Episodes ({data.episodes.length})
                    <span className="text-[9px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                      SERIES
                    </span>
                  </p>
                  <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-7 gap-2">
                    {data.episodes.map((ep) => {
                      const active = selectedEpisode?.driveId === ep.driveId;
                      return (
                        <button
                          key={ep.driveId}
                          onClick={() => {
                            setSelectedEpisode(ep);
                            if (!data.isFree && !isPremium) {
                              setTrialLeft(TRIAL_SECONDS);
                              setTrialDone(false);
                              setShowPaywall(false);
                            }
                          }}
                          className={`flex items-center gap-1.5 px-2 py-2 rounded-xl text-xs font-bold transition-colors text-left ${
                            active
                              ? 'bg-primary text-primary-foreground glow-primary'
                              : 'bg-muted hover:bg-muted/70 text-foreground'
                          }`}
                        >
                          <Play
                            className={`w-3 h-3 flex-shrink-0 ${active ? '' : 'text-primary'}`}
                          />
                          <span className="truncate flex-1 text-[11px]">{ep.title}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Related */}
              {data.related.length > 0 && (
                <div>
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">
                    Movies Nyingine
                  </p>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                    {data.related.slice(0, 10).map((r) => (
                      <Link
                        key={r.slug}
                        to={`/movies/${r.slug}`}
                        className="cyber-card rounded-xl overflow-hidden cursor-pointer group flex flex-col"
                      >
                        <div className="w-full aspect-[2/3] bg-muted/30 overflow-hidden">
                          {r.poster && (
                            <img
                              src={r.poster}
                              alt={r.title}
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            />
                          )}
                        </div>
                        <div className="px-2 py-1.5 border-t border-border">
                          <p className="text-[11px] font-bold text-foreground line-clamp-2 leading-tight">
                            {r.title}
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
