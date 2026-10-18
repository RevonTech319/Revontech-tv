import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Settings, Volume2, Maximize, Play, Pause, ChevronUp, Lock, Zap, ArrowRight, Crown, Check, Sparkles, X, CreditCard, ShieldCheck } from 'lucide-react';
import './UniversalPlayer.css';
import { getCdnToken } from '../../lib/tokenService';
import { db } from '../../lib/firebase';
import { collection, query, getDocs } from 'firebase/firestore';

const DEFAULT_PLAYER_PLANS = [
    {
        plan_key: 'siku_1',
        name: 'Siku 1',
        amount: 1000,
        currency: 'TZS',
        duration_days: 1,
        popular: false
    },
    {
        plan_key: 'wiki_1',
        name: 'Wiki 1',
        amount: 3000,
        currency: 'TZS',
        duration_days: 7,
        popular: false
    },
    {
        plan_key: 'mwezi_1',
        name: 'Mwezi 1',
        amount: 8000,
        currency: 'TZS',
        duration_days: 30,
        popular: true
    },
    {
        plan_key: 'miezi_3',
        name: 'Miezi 3',
        amount: 20000,
        currency: 'TZS',
        duration_days: 90,
        popular: false
    }
];

/**
 * UniversalPlayer — Enhanced with professional UI components
 */

// Module-level token cache shared across all player instances & channel switches.
// Avoids re-fetching the token on every channel click (token is valid for minutes).
let _cachedToken = '';
let _cachedCdnHost = '';
let _cachedTokenAt = 0;
const TOKEN_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

const UniversalPlayer = ({
    streamUrl,
    linkType,
    drmConfig = {},
    globalToken = '',
    isPremium = false,
    requiresPayment = false,
    onError,
    onLoading,
    maxRetries = 5,
    autoPlay = true,
    poster = "",
    onTimeUpdate,
    initialTime = 0,
    isLive = false,
    onTokenRefreshRequest = null,  // Optional callback to force a fresh token fetch
    programInfo = null  // Optional: { title, description, startTime, endTime } for live channels
}) => {
    const videoRef = useRef(null);
    const shakaRef = useRef(null);
    const hlsRef = useRef(null);
    const retryTimeoutRef = useRef(null);
    const playerContainerRef = useRef(null);
    const globalTokenRef = useRef(globalToken); // Track latest token without triggering re-render
    const cdnHostRef = useRef(''); // CDN host returned by the token service (for embedded /tok_/ URLs)
    const tokenRefreshTimerRef = useRef(null);  // Periodic token freshness check
    const destroyingPromiseRef = useRef(null);  // Track active player destruction promise

    // Helper: detect if a URL is an AzamTV CDN URL (needs cdntoken)
    const isAzamCdnUrl = useCallback((url) => {
        return url && url.toLowerCase().includes('azamtvltd.co.tz');
    }, []);

    const fetchCdnToken = useCallback(async () => {
        if (globalTokenRef.current && globalTokenRef.current.length >= 10) {
            return globalTokenRef.current;
        }
        // Use cached token if still fresh (avoids slow re-fetch on every channel switch)
        if (_cachedToken && (Date.now() - _cachedTokenAt) < TOKEN_CACHE_TTL) {
            globalTokenRef.current = _cachedToken;
            if (_cachedCdnHost) cdnHostRef.current = _cachedCdnHost;
            return _cachedToken;
        }
        try {
            const tokenData = await getCdnToken();
            if (tokenData && tokenData.token) {
                globalTokenRef.current = tokenData.token;
                _cachedToken = tokenData.token;
                _cachedTokenAt = Date.now();
                if (tokenData.cdnHost) { cdnHostRef.current = tokenData.cdnHost; _cachedCdnHost = tokenData.cdnHost; }
                return tokenData.token;
            }
        } catch (e) {
            console.warn('[UniversalPlayer] getCdnToken failed, trying /api/cdn-token:', e);
        }
        try {
            // Fetch the CDN token from the server-side route.
            const response = await fetch(`/api/cdn-token?t=${Date.now()}`, { cache: 'no-store' });
            if (response.ok) {
                const data = await response.json();
                if (data?.token) {
                    globalTokenRef.current = data.token;
                    _cachedToken = data.token;
                    _cachedTokenAt = Date.now();
                    if (data.cdnHost) { cdnHostRef.current = data.cdnHost; _cachedCdnHost = data.cdnHost; }
                    return data.token;
                }
            }
        } catch (e) {
            console.warn('[UniversalPlayer] Server-side token fetch failed:', e);
        }
        return globalTokenRef.current;
    }, []);

    const [loading, setLoading] = useState(true);
    const [retryCount, setRetryCount] = useState(0);
    const [internalError, setInternalError] = useState(null);
    const [showPaywall, setShowPaywall] = useState(false);
    const [showPackagesDialog, setShowPackagesDialog] = useState(false);
    const [availablePlans, setAvailablePlans] = useState(DEFAULT_PLAYER_PLANS);
    const [selectedPlanKey, setSelectedPlanKey] = useState('mwezi_1');
    const [trialTimeLeft, setTrialTimeLeft] = useState(30);
    const [shakaLoaded, setShakaLoaded] = useState(false);
    const [needsUnmute, setNeedsUnmute] = useState(false);
    const [showTapToPlay, setShowTapToPlay] = useState(false);

    // Fetch active plans for Package Dialog
    useEffect(() => {
        let isCancelled = false;
        const loadPlans = async () => {
            if (!db) return;
            try {
                const q = query(collection(db, 'plans'));
                const snap = await getDocs(q);
                const fetched = [];
                snap.forEach(d => {
                    const data = d.data();
                    if (data.active !== false) {
                        fetched.push({ id: d.id, ...data });
                    }
                });
                if (!isCancelled && fetched.length > 0) {
                    fetched.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
                    setAvailablePlans(fetched);
                    const pop = fetched.find(p => p.popular) || fetched[0];
                    if (pop) setSelectedPlanKey(pop.plan_key || pop.name);
                }
            } catch (err) {
                console.warn('[UniversalPlayer] Error fetching plans:', err);
            }
        };
        loadPlans();
        return () => { isCancelled = true; };
    }, []);
    
    // New UI state
    const [showSettings, setShowSettings] = useState(false);
    const [selectedQuality, setSelectedQuality] = useState('auto');
    const [selectedLanguage, setSelectedLanguage] = useState('');
    const [availableLanguages, setAvailableLanguages] = useState([]);
    const [availableQualities, setAvailableQualities] = useState([]);
    const [isPlaying, setIsPlaying] = useState(autoPlay);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const controlsTimeoutRef = useRef(null);

    // Load Shaka Player library
    useEffect(() => {
        const loadScripts = async () => {
            // Load Shaka
            if (!window.shaka) {
                await loadScript('https://cdnjs.cloudflare.com/ajax/libs/shaka-player/4.7.11/shaka-player.compiled.js');
            }
            // Load HLS.js
            if (!window.Hls) {
                await loadScript('https://cdn.jsdelivr.net/npm/hls.js@1.5.15/dist/hls.min.js');
            }
            setShakaLoaded(true);
        };
        loadScripts();
    }, []);

    useEffect(() => {
        if (globalToken) {
            globalTokenRef.current = globalToken;
        }
    }, [globalToken]);

    // Handle controls visibility
    const handleMouseMove = () => {
        setShowControls(true);
        if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
        controlsTimeoutRef.current = setTimeout(() => {
            if (isPlaying) setShowControls(false);
        }, 3000);
    };

    // Apply quality selection to Shaka or HLS
    const applyQuality = (quality) => {
        setSelectedQuality(quality);
        if (shakaRef.current) {
            const tracks = shakaRef.current.getVariantTracks();
            if (quality === 'auto') {
                shakaRef.current.configure({ abr: { enabled: true } });
            } else {
                const heightMap = { '1080p': 1080, '720p': 720, '480p': 480, '360p': 360 };
                const targetHeight = heightMap[quality];
                const match = tracks
                    .filter(t => t.height)
                    .sort((a, b) => Math.abs(a.height - targetHeight) - Math.abs(b.height - targetHeight))[0];
                if (match) {
                    shakaRef.current.configure({ abr: { enabled: false } });
                    shakaRef.current.selectVariantTrack(match, true);
                }
            }
        } else if (hlsRef.current) {
            if (quality === 'auto') {
                hlsRef.current.currentLevel = -1;
            } else {
                const heightMap = { '1080p': 1080, '720p': 720, '480p': 480, '360p': 360 };
                const targetHeight = heightMap[quality];
                const levels = hlsRef.current.levels;
                let bestIdx = -1;
                let bestDiff = Infinity;
                levels.forEach((lvl, idx) => {
                    const diff = Math.abs((lvl.height || 0) - targetHeight);
                    if (diff < bestDiff) { bestDiff = diff; bestIdx = idx; }
                });
                if (bestIdx >= 0) hlsRef.current.currentLevel = bestIdx;
            }
        }
    };

    // Apply language/audio track selection
    const applyLanguage = (lang) => {
        setSelectedLanguage(lang);
        if (shakaRef.current) {
            shakaRef.current.selectAudioLanguage(lang);
        } else if (hlsRef.current) {
            const tracks = hlsRef.current.audioTracks;
            const idx = tracks.findIndex(t =>
                t.lang === lang || t.name?.toLowerCase() === lang.toLowerCase()
            );
            if (idx >= 0) hlsRef.current.audioTrack = idx;
        }
    };

    // Handle fullscreen
    const handleFullscreen = () => {
        if (playerContainerRef.current) {
            if (!document.fullscreenElement) {
                playerContainerRef.current.requestFullscreen().catch(err => {
                    console.error(`Error attempting fullscreen: ${err.message}`);
                });
                setIsFullscreen(true);
            } else {
                document.exitFullscreen();
                setIsFullscreen(false);
            }
        }
    };

    const loadScript = (src) => new Promise((resolve) => {
        if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
        const s = document.createElement('script');
        s.src = src;
        s.onload = () => resolve();
        s.onerror = () => resolve();
        document.head.appendChild(s);
    });

    // Trial Logic
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key.toLowerCase() === 'f') {
                if (videoRef.current) {
                    if (document.fullscreenElement) {
                        document.exitFullscreen();
                    } else {
                        videoRef.current.requestFullscreen().catch(err => {
                            console.error(`Error attempting to enable full-screen mode: ${err.message}`);
                        });
                    }
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    useEffect(() => {
        if (!requiresPayment || isPremium || showPaywall) return;

        const timer = setInterval(() => {
            setTrialTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    setShowPaywall(true);
                    if (videoRef.current) videoRef.current.pause();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [requiresPayment, isPremium, showPaywall]);

    // Hex/Base64 converter
    const ensureHex = (input) => {
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
        } catch (e) {
            return cleaned.toLowerCase();
        }
    };

    const parseDrmKeys = (drmClearKey, kidField, keyField) => {
        const keys = {};
        const registerKey = (rawKid, rawKey) => {
            const hKid = ensureHex(rawKid);
            const hKey = ensureHex(rawKey);
            if (hKid && hKey) {
                keys[hKid] = hKey;
                if (hKid.length === 32) {
                    const uuidKid = `${hKid.slice(0, 8)}-${hKid.slice(8, 12)}-${hKid.slice(12, 16)}-${hKid.slice(16, 20)}-${hKid.slice(20)}`;
                    keys[uuidKid] = hKey;
                }
            }
        };

        if (kidField && keyField) {
            registerKey(kidField, keyField);
            return keys;
        }
        if (!drmClearKey) return keys;
        try {
            const parsed = JSON.parse(drmClearKey);
            if (parsed.keys && Array.isArray(parsed.keys)) {
                parsed.keys.forEach(k => {
                    if (k.kid && k.k) registerKey(k.kid, k.k);
                });
            } else {
                Object.entries(parsed).forEach(([k, v]) => {
                    registerKey(k, v);
                });
            }
            if (Object.keys(keys).length > 0) return keys;
        } catch (e) {}
        if (drmClearKey.includes(':')) {
            const parts = drmClearKey.split(':');
            if (parts.length >= 2) {
                registerKey(parts[0], parts[1]);
                return keys;
            }
        }
        registerKey('00000000000000000000000000000001', drmClearKey);
        return keys;
    };

    // Cleanup function
    const cleanup = async () => {
        // First wait for any ongoing background destruction to finish
        if (destroyingPromiseRef.current) {
            try {
                await destroyingPromiseRef.current;
            } catch (e) {
                console.error('[UniversalPlayer] Error waiting for previous destruction:', e);
            }
        }

        if (shakaRef.current) {
            const player = shakaRef.current;
            shakaRef.current = null;
            try {
                destroyingPromiseRef.current = player.destroy();
                await destroyingPromiseRef.current;
            } catch (e) {
                console.error('[UniversalPlayer] Error destroying shaka player:', e);
            } finally {
                destroyingPromiseRef.current = null;
            }
        }
        if (hlsRef.current) {
            try { hlsRef.current.destroy(); } catch (e) {}
            hlsRef.current = null;
        }
        if (videoRef.current) {
            try {
                videoRef.current.pause();
                videoRef.current.removeAttribute('src');
                videoRef.current.load();
                if (typeof videoRef.current.setMediaKeys === 'function') {
                    await videoRef.current.setMediaKeys(null);
                }
            } catch (e) {
                console.warn('[UniversalPlayer] Error clearing video element media keys:', e);
            }
        }
    };

    // Main playback effect — mirrors the reference project exactly
    useEffect(() => {
        if (!streamUrl || !shakaLoaded || !videoRef.current || showPaywall) return;

        let intervalId;
        let cancelled = false;

        // Safety timeout: if loading state persists for 60s, show error (increased from 30s for slow streams)
        let loadingTimeoutId = setTimeout(() => {
            if (!cancelled) {
                console.error('[UniversalPlayer] Loading timeout — stream did not start within 60s');
                setLoading(false);
                setInternalError('Stream took too long to load. The channel may be offline.');
                if (onLoading) onLoading(false);
                if (onError) onError('Loading timeout');
            }
        }, 60000);

        const clearLoadingTimeout = () => {
            if (loadingTimeoutId) { clearTimeout(loadingTimeoutId); loadingTimeoutId = null; }
        };

        const handleReload = (err) => {
            console.error("[UniversalPlayer] Playback Error:", err);
            if (retryCount < maxRetries) {
                const delay = Math.min(2000 * (retryCount + 1), 10000);
                retryTimeoutRef.current = setTimeout(() => {
                    setRetryCount(prev => prev + 1);
                }, delay);
            } else {
                const errorMsg = err?.message || (err?.code ? `Stream Error ${err.code}` : 'Playback failed. Stream may be offline.');
                setInternalError(errorMsg);
                setLoading(false);
                if (onError) onError(errorMsg);
                if (onLoading) onLoading(false);
            }
        };

        const playMediaWithFallback = async (vid) => {
            if (!vid) return;
            try {
                await vid.play();
                setNeedsUnmute(false);
                setShowTapToPlay(false);
            } catch (err) {
                if (err.name === 'NotAllowedError') {
                    console.warn('[UniversalPlayer] Autoplay blocked by browser. Falling back to muted autoplay...');
                    vid.muted = true;
                    try {
                        await vid.play();
                        setNeedsUnmute(true);
                        setShowTapToPlay(false);
                    } catch (mutedErr) {
                        console.warn('[UniversalPlayer] Muted playback also blocked, awaiting user tap:', mutedErr);
                        setShowTapToPlay(true);
                    }
                } else {
                    console.warn('[UniversalPlayer] Play call error:', err);
                }
            }
        };

        const startPlayback = async () => {
            await cleanup();
            setLoading(true);
            setInternalError(null);
            setShowTapToPlay(false);
            if (onLoading) onLoading(true);

            // Only fetch CDN token for AzamTV streams (they need IP-matched JWT tokens)
            let freshToken = '';
            const needsToken = isAzamCdnUrl(streamUrl);
            if (needsToken) {
                freshToken = await fetchCdnToken();
                if (cancelled) return;
            } else {
            }

            let finalStreamUrl = streamUrl;
            if (freshToken && needsToken) {
                const targetCdn = (cdnHostRef.current || 'https://cdnedgch2.azamtvltd.co.tz').replace(/\/+$/, '');
                const edsMatch = streamUrl.match(/\/live\/eds\/[^\s?#]+/i);
                if (edsMatch) {
                    finalStreamUrl = `${targetCdn}/tok_${freshToken}${edsMatch[0]}`;
                } else if (streamUrl.includes('/tok_')) {
                    finalStreamUrl = streamUrl.replace(/\/tok_[^/]+/, `/tok_${freshToken}`);
                } else {
                    finalStreamUrl = `${targetCdn}/tok_${freshToken}/${streamUrl.replace(/^https?:\/\/[^/]+\//, '')}`;
                }
            } else if (!needsToken && (streamUrl.startsWith('http://') || streamUrl.includes('.m3u8'))) {
                // Route non-Azam HTTP and HLS streams through proxy for HTTPS mixed-content and CORS safety
                if (typeof window !== 'undefined' && (window.location.protocol === 'https:' || streamUrl.startsWith('http://'))) {
                    finalStreamUrl = `/api/proxy?url=${encodeURIComponent(streamUrl)}`;
                }
            }

            const video = videoRef.current;
            if (!video) return;

            const isDirect = linkType === 'DIRECT' || linkType === 'direct' || finalStreamUrl.includes('.mp4') || finalStreamUrl.includes('.webm');
            const isDash = !isDirect && (linkType === 'dash' || linkType === 'mpd' || linkType?.toUpperCase() === 'DRM' || streamUrl.includes('.mpd'));

            try {
                if (isDirect) {
                    clearLoadingTimeout();
                    video.src = finalStreamUrl;
                    video.load();
                    
                    let directLoadTimeout = setTimeout(() => {
                        if (video.readyState < 2) { // HAVE_CURRENT_DATA
                            console.warn('[Direct] Video taking too long to load, may have failed');
                            setInternalError('Video failed to load. Stream may be offline or incompatible.');
                            setLoading(false);
                            if (onLoading) onLoading(false);
                            if (onError) onError('Direct load timeout');
                        }
                    }, 45000); // 45 seconds for direct video

                    video.onloadeddata = () => {
                        clearTimeout(directLoadTimeout);
                        setLoading(false);
                        if (onLoading) onLoading(false);
                    };
                    video.oncanplay = () => {
                        clearTimeout(directLoadTimeout);
                        setLoading(false);
                        if (onLoading) onLoading(false);
                    };
                    video.onerror = (e) => {
                        clearTimeout(directLoadTimeout);
                        console.error('[Direct] Video error:', e, video.error);
                        const errorMsg = video.error?.message || 'Failed to load video. Format may not be supported.';
                        setInternalError(errorMsg);
                        setLoading(false);
                        if (onLoading) onLoading(false);
                        if (onError) onError(errorMsg);
                    };
                    
                    await playMediaWithFallback(video);
                    setAvailableQualities(['auto', '1080p', '720p', '480p', '360p']);
                    if (initialTime > 0) {
                        video.currentTime = initialTime;
                    }
                    return;
                }

                if (isDash) {
                    // ===== DASH via Shaka Player (Reference pattern) =====
                    let attempts = 0;
                    while (!window.shaka && attempts < 20) {
                        await new Promise(r => setTimeout(r, 200));
                        attempts++;
                    }
                    if (!window.shaka) {
                        video.src = streamUrl;
                        video.play().catch(() => {});
                        setLoading(false);
                        if (onLoading) onLoading(false);
                        return;
                    }

                    window.shaka.polyfill.installAll();
                    const player = new window.shaka.Player(video);
                    shakaRef.current = player;

                    const clearKeys = parseDrmKeys(drmConfig.drmClearKey, drmConfig.drmKid, drmConfig.drmKey);

                    // Configure DRM ClearKey if available (Reference pattern: separate configure call)
                    if (Object.keys(clearKeys).length > 0) {
                        player.configure({
                            drm: {
                                clearKeys: clearKeys,
                                preferredKeySystems: ['org.w3.clearkey'],
                            },
                        });
                    } else {
                    }

                    // Configure retry/network settings for resilience (Reference pattern)
                    player.configure({
                        streaming: {
                            retryParameters: {
                                maxAttempts: 6,
                                baseDelay: 1000,
                                backoffFactor: 1.5,
                                fuzzFactor: 0.5,
                            },
                            // Start playback quickly (rebufferingGoal) but keep a LARGE buffer ahead
                            // (bufferingGoal) so proxy/network jitter doesn't cause freezing.
                            bufferingGoal: 30,
                            rebufferingGoal: 0.5,
                            bufferBehind: 30,
                            stallEnabled: true,
                            stallThreshold: 1,
                        },
                        manifest: {
                            retryParameters: {
                                maxAttempts: 6,
                                baseDelay: 500,
                            },
                        },
                    });

                    // Error listener — includes 403 recovery
                    player.addEventListener('error', async (event) => {
                        const detail = event.detail;
                        // Extract actual error info from minified Shaka error
                        const errorInfo = {
                            code: detail?.code,
                            severity: detail?.severity,
                            category: detail?.category,
                            data: detail?.data,
                            message: detail?.message || String(detail),
                        };
                        console.error('Shaka Error (full):', JSON.stringify(errorInfo, null, 2));
                        console.error('Shaka Error (raw detail):', detail);
                        
                        // Detect 403 (token expired) — attempt token refresh before retry
                        const is403 = detail?.code === 1001 || // HTTP error
                            detail?.data?.[1] === 403 ||
                            String(detail?.message || '').includes('403');
                        
                        if (is403) {
                            console.warn('🔑 403 detected — requesting fresh token before retry');
                            await fetchCdnToken();
                            if (onTokenRefreshRequest) onTokenRefreshRequest();
                            // Give the token refresh a moment to propagate
                            setTimeout(() => handleReload(detail), 1500);
                        } else {
                            handleReload(detail);
                        }
                    });




                    await player.load(finalStreamUrl);
                    await playMediaWithFallback(video);
                    clearLoadingTimeout();
                    setLoading(false);
                    if (onLoading) onLoading(false);

                    // Populate quality and language options from loaded tracks
                    const variantTracks = player.getVariantTracks();
                    const heights = [...new Set(variantTracks.map(t => t.height).filter(Boolean))].sort((a, b) => b - a);
                    const qualityLabels = heights.map(h => `${h}p`);
                    setAvailableQualities(['auto', ...qualityLabels]);

                    const langs = [...new Set(variantTracks.map(t => t.language).filter(Boolean))];
                    if (langs.length > 0) {
                        setAvailableLanguages(langs);
                        setSelectedLanguage(langs[0]);
                    }

                } else {
                    // ===== HLS via HLS.js (Reference pattern) =====
                    let hlsAttempts = 0;
                    while (!window.Hls && hlsAttempts < 20) {
                        await new Promise(r => setTimeout(r, 200));
                        hlsAttempts++;
                    }

                    if (window.Hls && window.Hls.isSupported()) {
                        // Custom HLS.js loader — route requests through the proxy and inject token
                        const customLoader = function(config) {
                            const loader = new window.Hls.DefaultConfig.loader(config);
                            this.abort = () => loader.abort();
                            this.destroy = () => loader.destroy();
                            this.load = (context, config, callbacks) => {
                                if (context.url && !context.url.includes('/api/proxy')) {
                                    if (isAzamCdnUrl(context.url)) {
                                        const currentToken = globalTokenRef.current;
                                        if (currentToken) {
                                            try {
                                                const sep = context.url.includes('?') ? '&' : '?';
                                                const urlWithToken = context.url.includes('cdntoken=')
                                                    ? context.url.replace(/cdntoken=[^&]+/, `cdntoken=${currentToken}`)
                                                    : `${context.url}${sep}cdntoken=${currentToken}`;
                                                context.url = `/api/proxy?url=${encodeURIComponent(urlWithToken)}`;
                                            } catch (e) {
                                                console.warn('[HLS] Failed to proxy segment URL:', e);
                                            }
                                        }
                                    } else if (context.url.startsWith('http://')) {
                                        context.url = `/api/proxy?url=${encodeURIComponent(context.url)}`;
                                    }
                                }
                                loader.load(context, config, callbacks);
                            };
                        };

                        const hls = new window.Hls({
                            enableWorker: true,
                            lowLatencyMode: true,
                            // Stay a few segments behind the live edge so proxy latency doesn't stall
                            liveSyncDurationCount: 2,
                            liveMaxLatencyDurationCount: 10,
                            // Keep a large buffer ahead/behind to absorb jitter (no freezing)
                            backBufferLength: 30,
                            maxBufferLength: 60,
                            maxMaxBufferLength: 120,
                            maxBufferSize: 120 * 1000 * 1000,
                            maxBufferHole: 0.5,
                            maxLoadingDelay: 8,
                            fragLoadingTimeOut: 30000,
                            manifestLoadingTimeOut: 20000,
                            levelLoadingTimeOut: 20000,
                            fragLoadingMaxRetry: 8,
                            manifestLoadingMaxRetry: 6,
                            levelLoadingMaxRetry: 6,
                            fragLoadingRetryDelay: 800,
                            pLoader: customLoader, // playlist loader
                            fLoader: customLoader, // fragment loader
                            xhrSetup: (xhr) => {
                                xhr.withCredentials = false;
                            },
                        });
                        hlsRef.current = hls;

                        hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
                            clearLoadingTimeout();
                            setLoading(false);
                            if (onLoading) onLoading(false);
                            playMediaWithFallback(video);

                            // Populate quality options from HLS levels
                            const levels = hls.levels || [];
                            const heights = [...new Set(levels.map(l => l.height).filter(Boolean))].sort((a, b) => b - a);
                            const qualityLabels = heights.map(h => `${h}p`);
                            setAvailableQualities(['auto', ...qualityLabels]);

                            // Populate language options from audio tracks
                            const audioTracks = hls.audioTracks || [];
                            if (audioTracks.length > 0) {
                                const langs = [...new Set(audioTracks.map(t => t.lang || t.name).filter(Boolean))];
                                setAvailableLanguages(langs);
                                setSelectedLanguage(langs[0]);
                            }
                        });

                        // Track HLS network error retries to prevent infinite retry loops
                        let hlsNetworkRetries = 0;
                        const MAX_HLS_NETWORK_RETRIES = 8; // Increased from 5 to 8 for better resilience

                        hls.on(window.Hls.Events.ERROR, async (_, data) => {
                            if (data.fatal) {
                                // Check for 403 errors (token expired) in HLS
                                const is403 = data.response?.code === 403 || 
                                             data.networkDetails?.status === 403 ||
                                             String(data.details || '').includes('403');
                                
                                if (is403) {
                                    console.warn('🔑 HLS 403 detected — requesting fresh token before retry');
                                    await fetchCdnToken();
                                    if (onTokenRefreshRequest) onTokenRefreshRequest();
                                    // Force a reload with fresh token
                                    setTimeout(() => {
                                        setPlayerKey(prev => prev + 1);
                                        setRetryCount(0);
                                    }, 1500);
                                    return;
                                }

                                switch (data.type) {
                                    case window.Hls.ErrorTypes.NETWORK_ERROR:
                                        hlsNetworkRetries++;
                                        if (hlsNetworkRetries <= MAX_HLS_NETWORK_RETRIES) {
                                            console.warn(`[HLS] Network error retry ${hlsNetworkRetries}/${MAX_HLS_NETWORK_RETRIES}`);
                                            setTimeout(() => hls.startLoad(), 1000 * hlsNetworkRetries);
                                        } else {
                                            console.error('[HLS] Max network retries reached, giving up');
                                            clearLoadingTimeout();
                                            setLoading(false);
                                            setInternalError('Channel is offline or unreachable. Please try another channel.');
                                            if (onLoading) onLoading(false);
                                            if (onError) onError('Network error');
                                            hls.destroy();
                                        }
                                        break;
                                    case window.Hls.ErrorTypes.MEDIA_ERROR:
                                        console.warn('[HLS] Media error, attempting recovery');
                                        hls.recoverMediaError();
                                        break;
                                    default:
                                        console.warn('[HLS] Fatal error, restarting playback in 3s:', data);
                                        hls.destroy();
                                        setTimeout(() => startPlayback(), 3000);
                                        break;
                                }
                            }
                        });

                        hls.loadSource(finalStreamUrl);
                        hls.attachMedia(video);
                    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                        // Native HLS (Safari/iOS)
                        video.src = finalStreamUrl;
                        video.load();
                        playMediaWithFallback(video);
                        setLoading(false);
                        if (onLoading) onLoading(false);
                    } else {
                        // Direct fallback
                        video.src = finalStreamUrl;
                        video.load();
                        playMediaWithFallback(video);
                        setLoading(false);
                        if (onLoading) onLoading(false);
                    }
                    return; // loading handled by MANIFEST_PARSED
                }

                // Apply initial time if provided
                if (initialTime > 0) {
                    video.currentTime = initialTime;
                }
            } catch (err) {
                console.error('Playback startup error (full):', err, JSON.stringify(err, Object.getOwnPropertyNames(err || {})));
                handleReload(err);
            }
        };

        startPlayback();

        // Refresh token every 2 minutes
        intervalId = setInterval(fetchCdnToken, 2 * 60 * 1000);

        return () => {
            cancelled = true;
            clearLoadingTimeout();
            if (intervalId) clearInterval(intervalId);
            if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
            cleanup();
        };
    }, [streamUrl, shakaLoaded, retryCount, drmConfig.drmClearKey, drmConfig.drmKid, drmConfig.drmKey, showPaywall, fetchCdnToken]);

    // Periodic token freshness check handled by setInterval inside main useEffect now

    return (
        <div 
            className="universal-player-wrapper" 
            ref={playerContainerRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => {
                if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
                if (isPlaying) setShowControls(false);
            }}
            style={{ width: '100%', height: '100%', position: 'relative' }}
        >
            {internalError ? (
                <div className="player-error">
                    <div className="error-icon">⚠️</div>
                    <p className="error-title">Playback Error</p>
                    <p className="error-message">{internalError}</p>
                    <button className="error-retry-btn" onClick={() => { setRetryCount(0); setInternalError(null); }}>
                        <i className="fas fa-redo"></i> Retry Now
                    </button>
                </div>
            ) : (
                <>
                    <video
                        ref={videoRef}
                        autoPlay={autoPlay}
                        playsInline
                        crossOrigin="anonymous"
                        poster={poster}
                        style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
                        onTimeUpdate={(e) => onTimeUpdate && onTimeUpdate(e.target.currentTime)}
                        onPlay={() => setIsPlaying(true)}
                        onPause={() => setIsPlaying(false)}
                    />

                    {/* Live Program Info - Kipindi Display */}
                    {isLive && programInfo && (
                        <div className={`program-info-overlay ${showControls ? 'visible' : 'hidden'}`}>
                            <div className="program-info-content">
                                <div className="program-badge">
                                    <span className="live-dot"></span>
                                    <span>LIVE</span>
                                </div>
                                <div className="program-details">
                                    <h3 className="program-title">{programInfo.title || 'Live Program'}</h3>
                                    {programInfo.description && (
                                        <p className="program-description">{programInfo.description}</p>
                                    )}
                                    {programInfo.startTime && programInfo.endTime && (
                                        <span className="program-time">
                                            {formatProgramTime(programInfo.startTime)} - {formatProgramTime(programInfo.endTime)}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Professional Player Controls */}
                    <div className={`player-controls ${showControls ? 'visible' : 'hidden'}`}>
                        {/* Progress Bar — hidden for live streams */}
                        {!isLive && (
                        <div className="progress-container">
                            <input 
                                type="range" 
                                className="progress-bar-input"
                                min="0"
                                max={videoRef.current?.duration || 0}
                                value={videoRef.current?.currentTime || 0}
                                onChange={(e) => {
                                    if (videoRef.current) {
                                        videoRef.current.currentTime = e.target.value;
                                    }
                                }}
                            />
                        </div>
                        )}

                        {/* Bottom Controls */}
                        <div className="controls-bottom">
                            <div className="controls-left">
                                <button 
                                    className="control-btn"
                                    onClick={() => {
                                        if (videoRef.current) {
                                            if (videoRef.current.paused) {
                                                videoRef.current.play();
                                            } else {
                                                videoRef.current.pause();
                                            }
                                        }
                                    }}
                                >
                                    {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                                </button>

                                <button className="control-btn volume-btn">
                                    <Volume2 size={20} />
                                </button>
                            </div>

                            <div className="controls-right">
                                <button 
                                    className="control-btn"
                                    onClick={() => setShowSettings(!showSettings)}
                                >
                                    <Settings size={20} />
                                </button>

                                <button 
                                    className="control-btn"
                                    onClick={handleFullscreen}
                                >
                                    <Maximize size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Settings Panel */}
                        {showSettings && (
                            <div className="settings-panel">
                                <div className="settings-header">
                                    <h3>Settings</h3>
                                    <button 
                                        className="close-settings"
                                        onClick={() => setShowSettings(false)}
                                    >
                                        ✕
                                    </button>
                                </div>

                                {/* Quality Selection */}
                                <div className="settings-section">
                                    <label className="settings-label">Quality</label>
                                    <div className="quality-options">
                                        {(availableQualities.length > 0 ? availableQualities : ['auto', '1080p', '720p', '480p', '360p']).map(quality => (
                                            <button
                                                key={quality}
                                                className={`quality-option ${selectedQuality === quality ? 'active' : ''}`}
                                                onClick={() => applyQuality(quality)}
                                            >
                                                {quality === 'auto' ? 'Auto' : quality}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Language Selection */}
                                {availableLanguages.length > 1 && (
                                <div className="settings-section">
                                    <label className="settings-label">Language</label>
                                    <div className="language-options">
                                        {availableLanguages.map(lang => (
                                            <button
                                                key={lang}
                                                className={`language-option ${selectedLanguage === lang ? 'active' : ''}`}
                                                onClick={() => applyLanguage(lang)}
                                            >
                                                {lang}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                )}

                                {/* Premium Badge */}
                                {isPremium && (
                                    <div className="premium-badge">
                                        <Zap size={16} />
                                        <span>Premium Member</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Unmute Pill for autoplay fallback */}
                    {needsUnmute && !internalError && (
                        <button 
                            type="button" 
                            className="unmute-banner-btn"
                            onClick={() => {
                                if (videoRef.current) {
                                    videoRef.current.muted = false;
                                    setNeedsUnmute(false);
                                }
                            }}
                        >
                            <Volume2 size={16} />
                            <span>Washa Sauti / Tap to Unmute</span>
                        </button>
                    )}

                    {/* Tap to Play Overlay if browser blocked both audio and muted autoplay */}
                    {showTapToPlay && !internalError && !loading && (
                        <div 
                            className="tap-to-play-overlay" 
                            onClick={() => {
                                if (videoRef.current) {
                                    videoRef.current.muted = false;
                                    videoRef.current.play().catch(() => {
                                        videoRef.current.muted = true;
                                        videoRef.current.play().catch(() => {});
                                    });
                                    setShowTapToPlay(false);
                                    setNeedsUnmute(false);
                                }
                            }}
                        >
                            <div className="tap-to-play-btn">
                                <Play size={36} fill="#ffffff" />
                                <span>Bonyeza Kucheza / Tap to Play</span>
                            </div>
                        </div>
                    )}

                    {/* Loading Overlay */}
                    {loading && !internalError && (
                        <div className="player-loading-overlay">
                            <div className="modern-player-loader">
                                <div className="loader-circles">
                                    <div className="circle circle-1"></div>
                                    <div className="circle circle-2"></div>
                                    <div className="circle circle-3"></div>
                                </div>
                                <div className="loader-content">
                                    <h3 className="loader-title">Preparing Stream</h3>
                                    <p className="loader-subtitle">Connecting to server...</p>
                                    <div className="loader-progress">
                                        <div className="progress-bar"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Retry Overlay */}
                    {retryCount > 0 && !internalError && (
                        <div className="player-retry-overlay">
                            <div className="retry-content">
                                <div className="retry-spinner"></div>
                                <p className="retry-text">Reconnecting...</p>
                                <p className="retry-attempt">Attempt {retryCount} of {maxRetries}</p>
                            </div>
                        </div>
                    )}

                    {/* Trial Badge with Quick View Packages button */}
                    {requiresPayment && !isPremium && !showPaywall && !showPackagesDialog && (
                        <div
                            className="trial-badge"
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowPackagesDialog(true);
                            }}
                            title="Bofya kuangalia vifurushi"
                        >
                            <div className="trial-dot"></div>
                            <span className="trial-text">Trial: {trialTimeLeft}s left</span>
                            <span className="trial-cta">Angalia Vifurushi &rarr;</span>
                        </div>
                    )}

                    {/* Modern UI/UX Paywall & Packages Dialog */}
                    {(showPaywall || showPackagesDialog) && (
                        <div
                            className="paywall-overlay"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="paywall-card">
                                {/* Close Button */}
                                <button
                                    className="paywall-dismiss-btn"
                                    onClick={() => {
                                        setShowPaywall(false);
                                        setShowPackagesDialog(false);
                                    }}
                                    title="Funga"
                                    aria-label="Funga"
                                >
                                    <X className="w-5 h-5" />
                                </button>

                                {/* Header with glowing VIP Crown */}
                                <div className="paywall-header">
                                    <div className="crown-glow-wrapper">
                                        <div className="crown-ring"></div>
                                        <div className="crown-icon">👑</div>
                                    </div>
                                    <span className="paywall-vip-pill">
                                        <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
                                        REVONTECH TV VIP
                                    </span>
                                    <h2 className="paywall-title">
                                        {showPaywall ? 'Muda wa Majaribio Umeisha' : 'Vifurushi vya Premium'}
                                    </h2>
                                    <p className="paywall-desc">
                                        Fungua vituo vyote 60+, mechi zote za live na sinema mpya bila kikwazo!
                                    </p>
                                </div>

                                {/* Dynamic Plans Grid */}
                                <div className="paywall-plans-grid">
                                    {availablePlans.map((plan) => {
                                        const isSelected = selectedPlanKey === (plan.plan_key || plan.name);
                                        return (
                                            <div
                                                key={plan.plan_key || plan.id || plan.name}
                                                className={`paywall-plan-item ${isSelected ? 'selected' : ''}`}
                                                onClick={() => setSelectedPlanKey(plan.plan_key || plan.name)}
                                            >
                                                {plan.popular && (
                                                    <span className="plan-badge-popular">
                                                        POPULAR ⭐
                                                    </span>
                                                )}
                                                <div className="plan-item-header">
                                                    <div>
                                                        <h4 className="plan-item-name">{plan.name}</h4>
                                                        <span className="plan-item-duration">
                                                            {plan.duration_days ? `${plan.duration_days} siku za access` : 'Bila kikomo'}
                                                        </span>
                                                    </div>
                                                    <div className={`plan-radio ${isSelected ? 'checked' : ''}`}>
                                                        {isSelected && <Check className="w-3.5 h-3.5" />}
                                                    </div>
                                                </div>
                                                <div className="plan-item-price">
                                                    <span className="price-amount">{Number(plan.amount).toLocaleString()}</span>
                                                    <span className="price-currency">{plan.currency || 'TZS'}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Perks List */}
                                <div className="paywall-features-list">
                                    <div className="feature-item">
                                        <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                                        <span>Vituo vyote 60+ (Azam Sports, Habari, Katuni)</span>
                                    </div>
                                    <div className="feature-item">
                                        <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                                        <span>Mechi zote za Live bila kikwazo</span>
                                    </div>
                                    <div className="feature-item">
                                        <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                                        <span>Ubora wa juu wa HD & Server zenye kasi</span>
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                <div className="paywall-actions">
                                    <button
                                        className="btn-pay-now"
                                        onClick={() => {
                                            const targetPlan = availablePlans.find(p => (p.plan_key || p.name) === selectedPlanKey) || availablePlans[0];
                                            const pKey = targetPlan?.plan_key || selectedPlanKey || 'mwezi_1';
                                            window.location.href = `/payment?plan=${encodeURIComponent(pKey)}`;
                                        }}
                                    >
                                        <CreditCard className="w-5 h-5" />
                                        <span>
                                            LIPIA SASA ({(() => {
                                                const current = availablePlans.find(p => (p.plan_key || p.name) === selectedPlanKey);
                                                return current ? `${Number(current.amount).toLocaleString()} ${current.currency || 'TZS'}` : 'ENDELEA';
                                            })()})
                                        </span>
                                        <ArrowRight className="w-4 h-4" />
                                    </button>
                                    <button
                                        className="btn-close-subtle"
                                        onClick={() => {
                                            setShowPaywall(false);
                                            setShowPackagesDialog(false);
                                        }}
                                    >
                                        Endelea Baadaye
                                    </button>
                                </div>

                                <p className="paywall-footnote">
                                    🔒 Malipo salama ya papo hapo kupitia M-Pesa, Airtel Money, Tigo Pesa na HaloPesa.
                                </p>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

// Helper function to format time
const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

// Helper function to format program time (HH:MM format)
const formatProgramTime = (time) => {
    if (!time) return '';
    try {
        // Handle ISO strings, timestamps, or time strings
        const date = typeof time === 'string' && time.includes(':') 
            ? new Date(`1970-01-01T${time}`) 
            : new Date(time);
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${hours}:${minutes}`;
    } catch (e) {
        return String(time);
    }
};

export default UniversalPlayer;
