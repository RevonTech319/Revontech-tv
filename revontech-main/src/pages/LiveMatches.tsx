import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import Header from '@/components/Header';
import {
  Play,
  X,
  Radio,
  Search,
  RefreshCw,
  Trophy,
  Crown,
  Lock,
  ArrowRight,
  AlertCircle,
  Loader2,
  Tv2
} from 'lucide-react';

interface MatchStream {
  streamId: string;
  label: string;
  rawUrl: string;
  language?: string;
}

interface Match {
  matchId: string;
  homeTeam: string;
  awayTeam?: string;
  competition: string;
  matchTime?: string;
  status: 'live' | 'upcoming';
  streams: MatchStream[];
  homeScore?: number;
  awayScore?: number;
  minute?: string;
}

const SUPABASE_URL = 'https://fjhcapigewntognadfuy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Z8krc7O--nZ-R5BPYelIiA_J-XJ6Q-G';
const TRIAL_SECONDS = 30;

// Dynamic HLS script loader
function loadHls(): Promise<any> {
  if (typeof window !== 'undefined' && (window as any).Hls) {
    return Promise.resolve((window as any).Hls);
  }
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.15/dist/hls.min.js';
    s.async = true;
    s.onload = () => resolve((window as any).Hls);
    s.onerror = (e) => reject(e);
    document.head.appendChild(s);
  });
}

export default function LiveMatches() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'live' | 'upcoming'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCompetition, setSelectedCompetition] = useState<string>('All');

  // Subscription state
  const [isPremium, setIsPremium] = useState(false);

  // Player modal state
  const [activeMatch, setActiveMatch] = useState<Match | null>(null);
  const [selectedStream, setSelectedStream] = useState<MatchStream | null>(null);
  const [failedStreamIds, setFailedStreamIds] = useState<string[]>([]);
  const [streamLoading, setStreamLoading] = useState(false);
  const [streamOffline, setStreamOffline] = useState(false);
  const [trialTimeLeft, setTrialTimeLeft] = useState(TRIAL_SECONDS);
  const [showPaywall, setShowPaywall] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<any>(null);
  const streamTimeoutRef = useRef<any>(null);
  const trialIntervalRef = useRef<any>(null);

  // Listen for user subscription in Firestore
  useEffect(() => {
    if (!user || !db) {
      setIsPremium(false);
      return;
    }
    const q = query(
      collection(db, 'subscriptions'),
      where('user_id', '==', user.uid),
      where('status', '==', 'active')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const hasValid = snap.docs.some((d) => {
          const data = d.data();
          if (!data.expires_at) return true;
          return new Date(data.expires_at).getTime() > Date.now();
        });
        setIsPremium(hasValid);
      },
      (err) => console.warn('LiveMatches sub listen error:', err)
    );
    return () => unsub();
  }, [user]);

  // Fetch matches from live API
  const fetchMatches = async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/fetch-matches`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data?.matches && Array.isArray(data.matches)) {
        setMatches(data.matches);
      }
    } catch (err) {
      console.error('Failed to fetch live matches:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchMatches();
    const interval = setInterval(() => fetchMatches(), 30000);
    return () => clearInterval(interval);
  }, []);

  // Filter and search
  const competitions = useMemo(() => {
    const set = new Set<string>();
    matches.forEach((m) => {
      if (m.competition) set.add(m.competition.trim());
    });
    return ['All', ...Array.from(set)];
  }, [matches]);

  const liveCount = useMemo(() => {
    return matches.filter((m) => m.status === 'live').length;
  }, [matches]);

  const filteredMatches = useMemo(() => {
    return matches.filter((m) => {
      if (activeTab === 'live' && m.status !== 'live') return false;
      if (activeTab === 'upcoming' && m.status !== 'upcoming') return false;

      if (selectedCompetition !== 'All' && m.competition !== selectedCompetition) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const home = m.homeTeam?.toLowerCase() || '';
        const away = m.awayTeam?.toLowerCase() || '';
        const comp = m.competition?.toLowerCase() || '';
        return home.includes(q) || away.includes(q) || comp.includes(q);
      }

      return true;
    });
  }, [matches, activeTab, selectedCompetition, searchQuery]);

  // Open match player
  const handlePlayMatch = (match: Match) => {
    setActiveMatch(match);
    setFailedStreamIds([]);
    setStreamOffline(false);
    setTrialTimeLeft(TRIAL_SECONDS);

    // If not premium, check trial
    if (!isPremium) {
      const trialDone = sessionStorage.getItem('revon_matches_trial_done') === 'true';
      if (trialDone) {
        setShowPaywall(true);
        setSelectedStream(null);
        return;
      }
    }

    setShowPaywall(false);
    if (match.streams && match.streams.length > 0) {
      setSelectedStream(match.streams[0]);
    } else {
      setSelectedStream(null);
      setStreamOffline(true);
    }
  };

  const closePlayer = () => {
    destroyPlayer();
    if (trialIntervalRef.current) {
      clearInterval(trialIntervalRef.current);
      trialIntervalRef.current = null;
    }
    setActiveMatch(null);
    setSelectedStream(null);
    setFailedStreamIds([]);
    setShowPaywall(false);
    setStreamOffline(false);
  };

  const destroyPlayer = () => {
    if (streamTimeoutRef.current) {
      clearTimeout(streamTimeoutRef.current);
      streamTimeoutRef.current = null;
    }
    if (hlsRef.current) {
      try {
        hlsRef.current.destroy();
      } catch {}
      hlsRef.current = null;
    }
    if (videoRef.current) {
      try {
        videoRef.current.pause();
        videoRef.current.removeAttribute('src');
        videoRef.current.load();
      } catch {}
    }
  };

  // Trial countdown timer
  useEffect(() => {
    if (!activeMatch || !selectedStream || showPaywall || isPremium) {
      if (trialIntervalRef.current) {
        clearInterval(trialIntervalRef.current);
        trialIntervalRef.current = null;
      }
      return;
    }

    trialIntervalRef.current = setInterval(() => {
      setTrialTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(trialIntervalRef.current);
          trialIntervalRef.current = null;
          sessionStorage.setItem('revon_matches_trial_done', 'true');
          destroyPlayer();
          setShowPaywall(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (trialIntervalRef.current) {
        clearInterval(trialIntervalRef.current);
        trialIntervalRef.current = null;
      }
    };
  }, [activeMatch, selectedStream, showPaywall, isPremium]);

  // Fallback to next stream if current stream fails
  const handleStreamFailure = (failedStream: MatchStream) => {
    if (!activeMatch) return;
    const nextFailed = [...failedStreamIds, failedStream.streamId];
    setFailedStreamIds(nextFailed);

    const nextStream = activeMatch.streams.find(
      (s) => !nextFailed.includes(s.streamId)
    );
    if (nextStream) {
      setSelectedStream(nextStream);
    } else {
      setStreamOffline(true);
      setStreamLoading(false);
    }
  };

  // Resolve and play stream
  useEffect(() => {
    if (!activeMatch || !selectedStream || showPaywall) return;

    let isCancelled = false;
    destroyPlayer();
    setStreamOffline(false);
    setStreamLoading(true);

    const startPlayback = async () => {
      try {
        const proxyRes = await fetch(`${SUPABASE_URL}/functions/v1/stream-proxy`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
          },
          body: JSON.stringify({ url: selectedStream.rawUrl }),
        });
        const proxyData = await proxyRes.json();

        if (isCancelled) return;

        if (!proxyData?.success || !proxyData?.proxyUrl) {
          handleStreamFailure(selectedStream);
          return;
        }

        const video = videoRef.current;
        if (!video) return;

        const Hls = await loadHls();
        if (isCancelled) return;

        if (Hls && Hls.isSupported()) {
          const hls = new Hls({
            lowLatencyMode: true,
            backBufferLength: 30,
            maxBufferLength: 12,
            enableWorker: true,
          });
          hlsRef.current = hls;
          hls.loadSource(proxyData.proxyUrl);
          hls.attachMedia(video);

          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            video.play().catch(() => {});
          });

          hls.on(Hls.Events.ERROR, (_: any, data: any) => {
            if (data?.fatal) {
              if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                hls.startLoad();
              } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                hls.recoverMediaError();
              } else {
                handleStreamFailure(selectedStream);
              }
            }
          });
        } else {
          video.src = proxyData.proxyUrl;
          video.play().catch(() => {});
        }

        // Safety timeout: if not playing in 14s, try next stream
        streamTimeoutRef.current = setTimeout(() => {
          const v = videoRef.current;
          if (!v || v.readyState < 3 || v.paused) {
            handleStreamFailure(selectedStream);
          }
        }, 14000);
      } catch (err) {
        if (!isCancelled) {
          handleStreamFailure(selectedStream);
        }
      }
    };

    startPlayback();

    return () => {
      isCancelled = true;
    };
  }, [selectedStream, activeMatch, showPaywall]);

  return (
    <div className="min-h-screen bg-background pb-20">
      <Header />

      {/* Hero Header */}
      <div className="relative overflow-hidden bg-gradient-to-b from-red-950/40 via-card/50 to-background border-b border-border/40 px-4 py-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-600/20 border border-red-500/40 text-red-400 text-xs font-black tracking-wide">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                {liveCount > 0 ? `${liveCount} LIVE SASA` : 'LIVE MATCHES'}
              </span>
              <span className="text-xs text-muted-foreground font-semibold">
                NBC · EPL · UEFA · La Liga · CAF
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight flex items-center gap-2">
              <Trophy className="w-7 h-7 text-yellow-400" />
              Mechi za Live
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-xl">
              Tazama matangazo ya mechi zote za leo live na zijazo. Chagua mechi na ubonyeze Play Now kuanza kuangalia papo hapo.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchMatches(true)}
              disabled={refreshing}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-card border border-border/80 text-foreground text-xs font-bold hover:bg-muted/50 transition-colors press tap-safe"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-primary' : ''}`} />
              Onyesha Upya
            </button>
            <Link
              to="/payment"
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-yellow-500 to-amber-600 text-black text-xs font-black hover:brightness-110 transition-all press tap-safe shadow-md shadow-amber-500/20"
            >
              <Crown className="w-3.5 h-3.5" />
              VIP Pass
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 space-y-4">
        {/* Search & Tabs Controls */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-card/80 border border-border/60 rounded-xl overflow-x-auto">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all ${
                activeTab === 'all'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Zote ({matches.length})
            </button>
            <button
              onClick={() => setActiveTab('live')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-black transition-all ${
                activeTab === 'live'
                  ? 'bg-red-600 text-white shadow-sm shadow-red-600/30'
                  : 'text-red-400 hover:bg-red-500/10'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              Live Sasa ({liveCount})
            </button>
            <button
              onClick={() => setActiveTab('upcoming')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all ${
                activeTab === 'upcoming'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Zijazo ({matches.filter((m) => m.status === 'upcoming').length})
            </button>
          </div>

          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tafuta mechi, timu au ligi..."
              className="w-full bg-card/70 border border-border/60 rounded-xl pl-9 pr-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* Competition Badges Filter */}
        {competitions.length > 2 && (
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {competitions.map((comp) => {
              const isSelected = selectedCompetition === comp;
              return (
                <button
                  key={comp}
                  onClick={() => setSelectedCompetition(comp)}
                  className={`shrink-0 px-3 py-1 rounded-full text-[11px] font-bold transition-all ${
                    isSelected
                      ? 'bg-primary/20 text-primary border border-primary/40'
                      : 'bg-card/60 text-muted-foreground border border-border/40 hover:text-foreground'
                  }`}
                >
                  {comp}
                </button>
              );
            })}
          </div>
        )}

        {/* Matches Grid / List */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="cyber-card rounded-2xl p-4 bg-card/60 border border-border/40 animate-pulse space-y-3"
              >
                <div className="flex justify-between items-center">
                  <div className="h-3 w-28 bg-muted rounded" />
                  <div className="h-3 w-16 bg-muted rounded" />
                </div>
                <div className="h-5 w-3/4 bg-muted rounded" />
                <div className="h-10 w-full bg-muted rounded-xl" />
              </div>
            ))}
          </div>
        ) : filteredMatches.length === 0 ? (
          <div className="p-12 text-center cyber-card rounded-2xl border border-border/40 bg-card/40 my-6">
            <Radio className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <h3 className="text-base font-black text-foreground">Hakuna Mechi</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
              Hakuna mechi zilizopatikana kwenye kipengele hiki kwa sasa. Tafadhali angalia tena baadae au chagua tab nyingine.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            {filteredMatches.map((match) => {
              const isLive = match.status === 'live';
              return (
                <div
                  key={match.matchId}
                  className="rounded-2xl p-4 bg-card/80 border border-border/60 hover:border-primary/40 transition-all flex flex-col justify-between shadow-lg shadow-black/20 relative group"
                >
                  {/* Top Bar: Status & League */}
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    {isLive ? (
                      <span className="flex items-center gap-1.5 text-[10px] font-black text-red-400 bg-red-500/15 border border-red-500/30 px-2 py-0.5 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                        LIVE
                      </span>
                    ) : (
                      <span className="text-[10px] font-black text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full uppercase">
                        UPCOMING
                      </span>
                    )}

                    <span className="text-[11px] font-bold text-muted-foreground truncate max-w-[65%] text-right">
                      {match.competition || 'Michezo'}
                    </span>
                  </div>

                  {/* Teams vs Display */}
                  <div className="my-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-black text-foreground leading-snug truncate">
                          {match.homeTeam}
                        </h3>
                        {match.awayTeam && (
                          <h3 className="text-base font-black text-foreground leading-snug truncate mt-0.5">
                            {match.awayTeam}
                          </h3>
                        )}
                      </div>

                      {/* Score or Match Time */}
                      {isLive && match.homeScore !== undefined && match.awayScore !== undefined ? (
                        <div className="text-right shrink-0">
                          <span className="text-2xl font-black text-red-500 tracking-tight">
                            {match.homeScore} - {match.awayScore}
                          </span>
                          {match.minute && (
                            <p className="text-[11px] font-black text-yellow-400">
                              {match.minute}
                            </p>
                          )}
                        </div>
                      ) : match.matchTime ? (
                        <div className="text-right shrink-0 bg-muted/40 px-2.5 py-1.5 rounded-xl border border-border/30">
                          <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                            Muda
                          </span>
                          <span className="text-xs font-black text-primary">
                            {match.matchTime}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {/* Available Stream Labels */}
                  <div className="flex flex-wrap items-center gap-1.5 my-3">
                    {match.streams && match.streams.length > 0 ? (
                      match.streams.slice(0, 4).map((s, idx) => (
                        <span
                          key={s.streamId || idx}
                          className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20 text-primary"
                        >
                          {s.label || `Server ${idx + 1}`}
                        </span>
                      ))
                    ) : (
                      <span className="text-[10px] text-muted-foreground italic">
                        Stream itawekwa muda mfupi kabla ya mechi
                      </span>
                    )}
                  </div>

                  {/* Action Button */}
                  <button
                    onClick={() => handlePlayMatch(match)}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-primary to-cyan-500 text-primary-foreground font-black text-xs sm:text-sm shadow-md shadow-primary/20 hover:brightness-110 transition-all press tap-safe"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    PLAY NOW
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Built-in Fullscreen Match Video Modal */}
      {activeMatch && (
        <div
          className="fixed inset-0 z-[120] bg-black/95 flex flex-col justify-between backdrop-blur-md animate-fade-in"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/90 to-transparent border-b border-white/10 z-20">
            <div className="flex items-center gap-2 min-w-0 pr-3">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
              <div className="truncate">
                <p className="text-xs sm:text-sm font-black text-white truncate">
                  {activeMatch.homeTeam} {activeMatch.awayTeam ? `vs ${activeMatch.awayTeam}` : ''}
                </p>
                <p className="text-[10px] text-zinc-400 truncate">
                  {activeMatch.competition}
                  {activeMatch.minute ? ` · ${activeMatch.minute}` : ''}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Trial Badge */}
              {!isPremium && !showPaywall && selectedStream && (
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-yellow-500/20 border border-yellow-500/40 text-yellow-400">
                  Jaribio: {trialTimeLeft}s
                </span>
              )}
              {isPremium && (
                <span className="flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400">
                  <Crown className="w-3 h-3" /> VIP ACTIVE
                </span>
              )}

              <button
                onClick={closePlayer}
                className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
                aria-label="Funga"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Stream Selector Chips */}
          {activeMatch.streams && activeMatch.streams.length > 0 && (
            <div className="flex gap-2 overflow-x-auto px-4 py-2 bg-black/60 border-b border-white/5 z-20">
              {activeMatch.streams.map((s, idx) => {
                const isSelected = selectedStream?.streamId === s.streamId;
                const isFailed = failedStreamIds.includes(s.streamId);
                return (
                  <button
                    key={s.streamId || idx}
                    onClick={() => {
                      setFailedStreamIds((prev) => prev.filter((id) => id !== s.streamId));
                      setSelectedStream(s);
                    }}
                    className={`shrink-0 px-3 py-1 rounded-xl text-xs font-black transition-all ${
                      isSelected
                        ? 'bg-primary text-primary-foreground shadow-md'
                        : isFailed
                        ? 'bg-red-950/40 text-red-400 border border-red-500/30'
                        : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                  >
                    {s.label || `Server ${idx + 1}`}
                  </button>
                );
              })}
            </div>
          )}

          {/* Video Container Area */}
          <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
            <video
              ref={videoRef}
              controls
              autoPlay
              playsInline
              onPlaying={() => setStreamLoading(false)}
              className="w-full h-full object-contain max-h-[85vh]"
            />

            {/* Loading Spinner */}
            {streamLoading && !showPaywall && !streamOffline && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 z-10 pointer-events-none">
                <Loader2 className="w-10 h-10 text-primary animate-spin mb-3" />
                <p className="text-white text-xs font-bold">Inaunganisha server ya mechi...</p>
              </div>
            )}

            {/* Offline Stream Message */}
            {streamOffline && !showPaywall && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 p-6 text-center z-10">
                <AlertCircle className="w-12 h-12 text-red-500 mb-3" />
                <h3 className="text-white font-black text-base mb-1">
                  Server ya Mechi Hii Imezimwa au Bado Haijaanza
                </h3>
                <p className="text-zinc-400 text-xs max-w-sm mb-4">
                  Jaribu kuchagua server nyingine hapo juu au rudi muda mfupi kabla ya mechi kuanza.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setFailedStreamIds([]);
                      setStreamOffline(false);
                      if (activeMatch.streams[0]) setSelectedStream(activeMatch.streams[0]);
                    }}
                    className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-black hover:brightness-110"
                  >
                    Jaribu Tena
                  </button>
                  <button
                    onClick={closePlayer}
                    className="px-4 py-2 rounded-xl bg-white/10 text-white text-xs font-bold hover:bg-white/20"
                  >
                    Funga
                  </button>
                </div>
              </div>
            )}

            {/* Paywall Overlay */}
            {showPaywall && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/95 p-4 z-30">
                <div className="w-full max-w-md p-6 rounded-2xl bg-gradient-to-b from-card via-card/95 to-black border border-yellow-500/40 text-center shadow-2xl space-y-4">
                  <div className="w-16 h-16 rounded-full bg-yellow-500/20 border-2 border-yellow-500 flex items-center justify-center mx-auto shadow-lg shadow-yellow-500/20">
                    <Crown className="w-8 h-8 text-yellow-400" />
                  </div>

                  <div>
                    <h2 className="text-xl font-black text-white">Muda wa Majaribio Umeisha</h2>
                    <p className="text-zinc-300 text-xs mt-1 leading-relaxed">
                      Ili kuendelea kutazama mechi zote za live na vituo bila kikomo, lipia kifurushi cha RevonTech TV.
                    </p>
                  </div>

                  {/* Plan highlights */}
                  <div className="grid grid-cols-2 gap-2 text-left">
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                      <p className="text-[10px] text-zinc-400 font-bold uppercase">Siku 1</p>
                      <p className="text-sm font-black text-yellow-400 mt-0.5">TZS 1,000</p>
                    </div>
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                      <p className="text-[10px] text-zinc-400 font-bold uppercase">Mwezi 1 (Popular)</p>
                      <p className="text-sm font-black text-yellow-400 mt-0.5">TZS 8,000</p>
                    </div>
                  </div>

                  <div className="space-y-2 pt-2">
                    <button
                      onClick={() => navigate('/payment')}
                      className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-yellow-500 text-black font-black text-sm hover:bg-yellow-400 transition-all shadow-lg shadow-yellow-500/30"
                    >
                      LIPIA SASA
                      <ArrowRight className="w-4 h-4" />
                    </button>
                    <button
                      onClick={closePlayer}
                      className="w-full py-2.5 text-xs text-zinc-400 hover:text-white transition-colors"
                    >
                      Funga na Rudi Baadaye
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
