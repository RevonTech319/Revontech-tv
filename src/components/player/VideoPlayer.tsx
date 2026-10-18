import { useEffect, useRef, useState, useCallback } from 'react';
import {
  X,
  Volume2,
  VolumeX,
  Crown,
  Loader2,
  Settings,
  Check,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import CastButton from './CastButton';
import QualitySelector, { QualityOption } from './QualitySelector';
import { buildStreamUrl } from '@/lib/streamUtils';

declare global {
  interface Window {
    shaka: any;
    Hls: any;
  }
}

export interface PlayerChannel {
  id: string;
  name: string;
  type: string;
  url: string;
  kid?: string | null;
  key?: string | null;
  img_url?: string | null;
  is_free?: boolean;
  drmClearKey?: string | null;
  drmKid?: string | null;
  drmKey?: string | null;
}

interface VideoPlayerProps {
  channel: PlayerChannel;
  token: string;
  isPremium: boolean;
  onTrialEnd?: () => void;
  onPay?: () => void;
  onLogin?: () => void;
  paywallOverlay?: React.ReactNode;
  showPaywall?: boolean;
}

// === DRM Helpers ===

function ensureHex(input: string): string {
  if (!input) return '';
  const cleaned = input.toString().trim().replace(/[\s\-"']/g, '');
  if (/^[0-9A-Fa-f]{32}$/.test(cleaned)) return cleaned.toLowerCase();
  if (/^[0-9A-Fa-f]{16}$/.test(cleaned)) return cleaned.toLowerCase();
  try {
    let b64 = cleaned.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4 !== 0) b64 += '=';
    const binary = atob(b64);
    let hex = '';
    for (let i = 0; i < binary.length; i++) {
      const h = binary.charCodeAt(i).toString(16);
      hex += h.length === 1 ? '0' + h : h;
    }
    return hex.toLowerCase();
  } catch {
    return cleaned.toLowerCase();
  }
}

function parseDrmKeys(channel: PlayerChannel): Record<string, string> {
  const keys: Record<string, string> = {};
  if (channel.kid && channel.key) {
    keys[ensureHex(channel.kid)] = ensureHex(channel.key);
    return keys;
  }
  if (channel.drmKid && channel.drmKey) {
    keys[ensureHex(channel.drmKid)] = ensureHex(channel.drmKey);
    return keys;
  }
  if (channel.drmClearKey) {
    try {
      const parsed = JSON.parse(channel.drmClearKey);
      if (parsed.keys && Array.isArray(parsed.keys)) {
        parsed.keys.forEach((k: any) => {
          if (k.kid && k.k) keys[ensureHex(k.kid)] = ensureHex(k.k);
        });
      } else {
        Object.entries(parsed).forEach(([k, v]) => {
          keys[ensureHex(k)] = ensureHex(v as string);
        });
      }
      if (Object.keys(keys).length > 0) return keys;
    } catch {
      /* try colon format */
    }
    if (channel.drmClearKey.includes(':')) {
      const parts = channel.drmClearKey.split(':');
      if (parts.length >= 2) {
        keys[ensureHex(parts[0])] = ensureHex(parts[1]);
        return keys;
      }
    }
  }
  return keys;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => resolve();
    document.head.appendChild(s);
  });
}

const TRIAL_SECONDS = 30;

export default function VideoPlayer({
  channel,
  token,
  isPremium,
  onTrialEnd,
  paywallOverlay,
  showPaywall,
}: VideoPlayerProps) {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const shakaRef = useRef<any>(null);
  const hlsRef = useRef<any>(null);
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const [muted, setMuted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [trialLeft, setTrialLeft] = useState(TRIAL_SECONDS);
  const [trialDone, setTrialDone] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [audioTracks, setAudioTracks] = useState<any[]>([]);
  const [textTracks, setTextTracks] = useState<any[]>([]);
  const [currentAudio, setCurrentAudio] = useState<number>(-1);
  const [currentText, setCurrentText] = useState<number>(-1);
  const [qualityOptions, setQualityOptions] = useState<QualityOption[]>([]);
  const [currentQuality, setCurrentQuality] = useState<number>(-1); // -1 = Auto

  const isChannelFree = channel.is_free === true;
  const shouldRunTrial = !isPremium && !isChannelFree && !showPaywall;

  // === Playback setup ===

  const cleanup = useCallback(() => {
    if (shakaRef.current) {
      try {
        shakaRef.current.destroy();
      } catch {}
      shakaRef.current = null;
    }
    if (hlsRef.current) {
      try {
        hlsRef.current.destroy();
      } catch {}
      hlsRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.src = '';
      videoRef.current.load();
    }
  }, []);

  const buildShakaQualityOptions = useCallback((player: any): QualityOption[] => {
    const tracks = player.getVariantTracks() as any[];
    const heights = new Set<number>();
    tracks.forEach((t) => {
      if (t.height && t.height > 0) heights.add(t.height);
    });
    return Array.from(heights)
      .sort((a, b) => b - a)
      .map((h) => ({ height: h, label: `${h}p` }));
  }, []);

  const buildHlsQualityOptions = useCallback((hls: any): QualityOption[] => {
    const levels = hls.levels || [];
    const heights = new Set<number>();
    levels.forEach((l: any) => {
      if (l.height && l.height > 0) heights.add(l.height);
    });
    return Array.from(heights)
      .sort((a, b) => b - a)
      .map((h) => ({ height: h, label: `${h}p` }));
  }, []);

  const startPlayback = useCallback(async () => {
    if (!videoRef.current) return;
    cleanup();
    setLoading(true);
    setCurrentQuality(-1);
    setQualityOptions([]);

    const video = videoRef.current;
    const isDash =
      channel.type === 'dash' || channel.type === 'mpd' || channel.url.includes('.mpd');

    try {
      if (isDash) {
        let attempts = 0;
        while (!window.shaka && attempts < 20) {
          await new Promise((r) => setTimeout(r, 200));
          attempts++;
        }
        if (!window.shaka) {
          video.src = channel.url;
          video.play().catch(() => {});
          setLoading(false);
          return;
        }
        window.shaka.polyfill.installAll();
        const player = new window.shaka.Player(video);
        shakaRef.current = player;

        const clearKeys = parseDrmKeys(channel);
        if (Object.keys(clearKeys).length > 0) {
          player.configure({ drm: { clearKeys } });
        }
        player.configure({
          streaming: {
            retryParameters: {
              maxAttempts: 5,
              baseDelay: 1000,
              backoffFactor: 1.5,
              fuzzFactor: 0.5,
            },
            bufferingGoal: 10,
            rebufferingGoal: 2,
          },
          manifest: { retryParameters: { maxAttempts: 5, baseDelay: 500 } },
        });

        const netEngine = player.getNetworkingEngine();
        if (netEngine) {
          netEngine.registerRequestFilter((_type: any, request: any) => {
            const currentToken = tokenRef.current;
            if (request && Array.isArray(request.uris)) {
              request.uris = request.uris.map((uri: string) => buildStreamUrl(uri, currentToken));
            }
          });
        }

        const dashUrl = buildStreamUrl(channel.url, token);
        await player.load(dashUrl);

        const variants = player.getVariantTracks() as any[];
        setAudioTracks(
          variants.filter(
            (t: any, i: number, self: any[]) =>
              self.findIndex((x) => x.language === t.language) === i
          )
        );
        setTextTracks(player.getTextTracks());
        setQualityOptions(buildShakaQualityOptions(player));

        video.play().catch(() => {});
        setLoading(false);
      } else {
        let hlsAttempts = 0;
        while (!window.Hls && hlsAttempts < 20) {
          await new Promise((r) => setTimeout(r, 200));
          hlsAttempts++;
        }

        if (window.Hls && window.Hls.isSupported()) {
          const hls = new window.Hls({
            enableWorker: true,
            lowLatencyMode: false,
            liveSyncDurationCount: 3,
            liveMaxLatencyDurationCount: 10,
            backBufferLength: 60,
            maxBufferLength: 30,
            maxBufferSize: 60 * 1000 * 1000,
            maxLoadingDelay: 8,
            fragLoadingTimeOut: 20000,
            manifestLoadingTimeOut: 20000,
            levelLoadingTimeOut: 20000,
            fragLoadingMaxRetry: 6,
            manifestLoadingMaxRetry: 6,
            levelLoadingMaxRetry: 6,
            fragLoadingRetryDelay: 1000,
            xhrSetup: (xhr: XMLHttpRequest) => {
              xhr.withCredentials = false;
            },
          });
          hlsRef.current = hls;

          hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
            setLoading(false);
            setAudioTracks(hls.audioTracks);
            setTextTracks(hls.subtitleTracks);
            setQualityOptions(buildHlsQualityOptions(hls));
            video.play().catch(() => {});
          });

          hls.on(window.Hls.Events.ERROR, (_: any, data: any) => {
            if (data.fatal) {
              switch (data.type) {
                case window.Hls.ErrorTypes.NETWORK_ERROR:
                  setTimeout(() => hls.startLoad(), 1000);
                  break;
                case window.Hls.ErrorTypes.MEDIA_ERROR:
                  hls.recoverMediaError();
                  break;
                default:
                  hls.destroy();
                  setTimeout(() => startPlayback(), 3000);
                  break;
              }
            }
          });

          const playSource = buildStreamUrl(channel.url, token);
          hls.loadSource(playSource);
          hls.attachMedia(video);
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = buildStreamUrl(channel.url, token);
          video.load();
          video.play().catch(() => {});
          setLoading(false);
        } else {
          video.src = buildStreamUrl(channel.url, token);
          video.load();
          video.play().catch(() => {});
          setLoading(false);
        }
      }
    } catch (err) {
      console.error('Playback error:', err);
      setLoading(false);
    }
  }, [
    channel,
    token,
    cleanup,
    buildShakaQualityOptions,
    buildHlsQualityOptions,
  ]);

  // Load required libraries once
  useEffect(() => {
    const promises: Promise<void>[] = [];
    if (!window.shaka)
      promises.push(
        loadScript(
          'https://cdnjs.cloudflare.com/ajax/libs/shaka-player/4.7.11/shaka-player.compiled.js'
        )
      );
    if (!window.Hls)
      promises.push(loadScript('https://cdn.jsdelivr.net/npm/hls.js@1.5.15/dist/hls.min.js'));
    Promise.all(promises).then(() => {
      // trigger playback after libs loaded
      startPlayback();
    });
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.id]);

  // Restart playback when token updates
  useEffect(() => {
    if (!token || !videoRef.current) return;
    // Only restart for DASH since HLS URLs don't have token concat
    const isDash =
      channel.type === 'dash' || channel.type === 'mpd' || channel.url.includes('.mpd');
    if (!isDash) return;
    // Only restart if a player is already active (avoid double-start on initial mount)
    if (shakaRef.current) {
      startPlayback();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Trial timer
  useEffect(() => {
    if (!shouldRunTrial) return;
    setTrialLeft(TRIAL_SECONDS);
    setTrialDone(false);
    const timer = setInterval(() => {
      setTrialLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setTrialDone(true);
          cleanup();
          onTrialEnd?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [shouldRunTrial, cleanup, onTrialEnd]);

  // Auto-hide controls
  const showControlsTemporarily = useCallback(() => {
    setControlsVisible(true);
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    hideControlsTimer.current = setTimeout(() => setControlsVisible(false), 3000);
  }, []);

  useEffect(() => {
    showControlsTemporarily();
    return () => {
      if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    };
  }, [showControlsTemporarily]);

  // Fullscreen tracking
  useEffect(() => {
    const handler = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    } else {
      containerRef.current.requestFullscreen?.().catch(() => {});
    }
  };

  const switchAudio = (track: any, index: number) => {
    if (shakaRef.current) {
      shakaRef.current.selectVariantTrack(track, true);
      setCurrentAudio(index);
    } else if (hlsRef.current) {
      hlsRef.current.audioTrack = index;
      setCurrentAudio(index);
    }
  };

  const switchText = (track: any, index: number) => {
    if (shakaRef.current) {
      if (index === -1) {
        shakaRef.current.setTextTrackVisibility(false);
      } else {
        shakaRef.current.setTextTrackVisibility(true);
        shakaRef.current.selectTextTrack(track);
      }
      setCurrentText(index);
    } else if (hlsRef.current) {
      hlsRef.current.subtitleTrack = index;
      setCurrentText(index);
    }
  };

  const switchQuality = (height: number) => {
    setCurrentQuality(height);
    if (shakaRef.current) {
      const player = shakaRef.current;
      if (height === -1) {
        player.configure({ abr: { enabled: true } });
      } else {
        player.configure({ abr: { enabled: false } });
        const track = (player.getVariantTracks() as any[]).find((t: any) => t.height === height);
        if (track) player.selectVariantTrack(track, true);
      }
    } else if (hlsRef.current) {
      const hls = hlsRef.current;
      if (height === -1) {
        hls.currentLevel = -1; // auto
      } else {
        const idx = (hls.levels as any[]).findIndex((l: any) => l.height === height);
        if (idx >= 0) hls.currentLevel = idx;
      }
    }
  };

  const streamUrl = buildStreamUrl(channel.url, token);
  const streamType =
    channel.type === 'dash' || channel.url.includes('.mpd') ? 'dash' : 'hls';

  return (
    <div
      ref={containerRef}
      className="relative w-full aspect-video bg-black overflow-hidden group"
      onMouseMove={showControlsTemporarily}
      onTouchStart={showControlsTemporarily}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        crossOrigin="anonymous"
        className="w-full h-full object-contain bg-black"
        onClick={showControlsTemporarily}
      />

      {/* Top bar */}
      <div
        className={`absolute top-0 left-0 right-0 flex items-center gap-2 px-3 md:px-4 py-3 bg-gradient-to-b from-black/90 to-transparent transition-opacity duration-300 ${
          controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <button
          onClick={() => {
            cleanup();
            navigate(-1);
          }}
          aria-label="Rudi"
          className="p-2 rounded-xl glass press tap-safe hover:bg-primary/20"
        >
          <X className="w-5 h-5 text-white" />
        </button>

        <span className="font-bold text-sm text-white truncate flex-1 ml-1">{channel.name}</span>

        <div className="flex items-center gap-1.5">
          <span className="flex items-center gap-1 bg-red-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-white inline-block" />
            LIVE
          </span>

          {shouldRunTrial && !trialDone && (
            <span className="text-xs font-bold text-yellow-400 bg-yellow-400/10 border border-yellow-400/30 px-2 py-0.5 rounded-full">
              {trialLeft}s
            </span>
          )}

          <button
            onClick={() => {
              if (videoRef.current) {
                videoRef.current.muted = !videoRef.current.muted;
                setMuted(!muted);
              }
            }}
            aria-label={muted ? 'Rejesha sauti' : 'Zima sauti'}
            className="p-2 rounded-xl glass press tap-safe hover:bg-primary/20"
          >
            {muted ? (
              <VolumeX className="w-4 h-4 text-white" />
            ) : (
              <Volume2 className="w-4 h-4 text-white" />
            )}
          </button>

          <CastButton
            streamUrl={streamUrl}
            streamType={streamType}
            title={channel.name}
            poster={channel.img_url || undefined}
          />

          <button
            onClick={() => setShowSettings((s) => !s)}
            aria-label="Mipangilio"
            className={`p-2 rounded-xl press tap-safe transition-all ${
              showSettings
                ? 'bg-primary text-white shadow-lg shadow-primary/20 scale-110'
                : 'glass hover:bg-primary/20'
            }`}
          >
            <Settings className="w-5 h-5 text-white" />
          </button>

          <button
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? 'Toka fullscreen' : 'Fullscreen'}
            className="p-2 rounded-xl glass press tap-safe hover:bg-primary/20"
          >
            {isFullscreen ? (
              <Minimize2 className="w-5 h-5 text-white" />
            ) : (
              <Maximize2 className="w-5 h-5 text-white" />
            )}
          </button>
        </div>
      </div>

      {/* Settings overlay */}
      {showSettings && (
        <div className="absolute top-16 right-3 md:right-4 w-72 glass-strong rounded-3xl p-5 z-30 shadow-2xl animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-black text-primary uppercase tracking-widest">
              Mipangilio
            </h3>
            <button
              onClick={() => setShowSettings(false)}
              className="p-1 rounded-full hover:bg-white/10 press tap-safe"
              aria-label="Funga mipangilio"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>

          {/* Audio */}
          {audioTracks.length > 0 ? (
            <div className="mb-4">
              <p className="text-[10px] text-muted-foreground font-bold mb-2 uppercase">
                Lugha ya Sauti
              </p>
              <div className="space-y-1 max-h-40 overflow-y-auto no-scrollbar">
                {audioTracks.map((t, i) => (
                  <button
                    key={i}
                    onClick={() => switchAudio(t, i)}
                    className={`flex items-center justify-between w-full p-2 rounded-lg text-xs font-bold transition-colors press tap-safe ${
                      currentAudio === i || (i === 0 && currentAudio === -1)
                        ? 'bg-primary/20 text-primary'
                        : 'hover:bg-white/5 text-white'
                    }`}
                  >
                    {t.name || t.language?.toUpperCase() || `Language ${i + 1}`}
                    {(currentAudio === i || (i === 0 && currentAudio === -1)) && (
                      <Check className="w-3.5 h-3.5" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mb-4">
              <p className="text-[10px] text-muted-foreground font-bold mb-2 uppercase">
                Lugha ya Sauti
              </p>
              <div className="p-2 rounded-lg text-xs font-bold bg-primary/20 text-primary flex items-center justify-between">
                Default
                <Check className="w-3.5 h-3.5" />
              </div>
            </div>
          )}

          {/* Subtitles */}
          {textTracks.length > 0 && (
            <div className="mb-4">
              <p className="text-[10px] text-muted-foreground font-bold mb-2 uppercase">
                Subtitles
              </p>
              <div className="space-y-1 max-h-40 overflow-y-auto no-scrollbar">
                <button
                  onClick={() => switchText(null, -1)}
                  className={`flex items-center justify-between w-full p-2 rounded-lg text-xs font-bold transition-colors press tap-safe ${
                    currentText === -1
                      ? 'bg-primary/20 text-primary'
                      : 'hover:bg-white/5 text-white'
                  }`}
                >
                  Zima
                  {currentText === -1 && <Check className="w-3.5 h-3.5" />}
                </button>
                {textTracks.map((t, i) => (
                  <button
                    key={i}
                    onClick={() => switchText(t, i)}
                    className={`flex items-center justify-between w-full p-2 rounded-lg text-xs font-bold transition-colors press tap-safe ${
                      currentText === i
                        ? 'bg-primary/20 text-primary'
                        : 'hover:bg-white/5 text-white'
                    }`}
                  >
                    {t.language?.toUpperCase() || `Sub ${i + 1}`}
                    {currentText === i && <Check className="w-3.5 h-3.5" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quality */}
          <QualitySelector
            options={qualityOptions}
            current={currentQuality}
            onSelect={switchQuality}
          />
        </div>
      )}

      {/* Loading spinner */}
      {loading && !showPaywall && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Loader2 className="w-10 h-10 text-primary animate-spin opacity-80" />
        </div>
      )}

      {/* Paywall overlay (provided by parent) */}
      {showPaywall && paywallOverlay && (
        <div className="absolute inset-0 z-20">{paywallOverlay}</div>
      )}
    </div>
  );
}

// Re-export Crown for parent paywall convenience
export { Crown };
