import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { collection, query, where, limit, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { X, ExternalLink } from 'lucide-react';

interface Ad {
  id: string;
  image_url: string;
  link: string;
  description: string | null;
}

// Pages where the ad popup may appear (never on payment, login or player pages)
const AD_ROUTES = ['/', '/matches', '/livetv', '/movies'];
// Seconds before the Skip button becomes available
const SKIP_AFTER_SECONDS = 5;
const SEEN_KEY = 'revon_seen_ads';

const getSeen = (): string[] => {
  try {
    return JSON.parse(sessionStorage.getItem(SEEN_KEY) || '[]');
  } catch {
    return [];
  }
};

const markSeen = (id: string) => {
  try {
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...getSeen(), id]));
  } catch {
    /* storage unavailable – ignore */
  }
};

const safeUrl = (link: string): string | null => {
  const trimmed = (link || '').trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withProtocol);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
};

export default function AdOverlay() {
  const { pathname } = useLocation();
  const [ad, setAd] = useState<Ad | null>(null);
  const [countdown, setCountdown] = useState(SKIP_AFTER_SECONDS);
  const [dismissed, setDismissed] = useState(false);

  // Load one active ad that this visitor has not seen yet in this session
  useEffect(() => {
    const fetchAd = async () => {
      try {
        const q = query(collection(db, 'ads'), where('active', '==', true), limit(10));
        const snap = await getDocs(q);
        const seen = getSeen();
        const ads = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Ad))
          .filter((a) => a.image_url && !seen.includes(a.id));
        if (ads.length > 0) {
          setAd(ads[Math.floor(Math.random() * ads.length)]);
        }
      } catch (error) {
        console.error('Error fetching ads:', error);
      }
    };
    fetchAd();
  }, []);

  const onAllowedRoute = AD_ROUTES.includes(pathname);
  const visible = !!ad && !dismissed && onAllowedRoute;
  const canSkip = countdown <= 0;

  // Count down only while the ad is on screen
  useEffect(() => {
    if (!visible || countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [visible, countdown]);

  // Remember that this ad was shown, so it is not repeated every page visit
  useEffect(() => {
    if (visible && ad) markSeen(ad.id);
  }, [visible, ad]);

  const close = () => setDismissed(true);

  const handleAdClick = () => {
    if (!ad) return;
    const url = safeUrl(ad.link);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  if (!visible || !ad) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Dim backdrop – tap to close once skipping is allowed */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => canSkip && close()}
      />

      {/* Ad card */}
      <div className="relative w-full max-w-sm rounded-2xl overflow-hidden border border-border shadow-2xl bg-card">
        <div className="absolute top-2 left-2 z-10 bg-secondary text-secondary-foreground text-[9px] font-black px-1.5 py-0.5 rounded">
          TANGAZO
        </div>

        {/* Skip / countdown */}
        <div className="absolute top-2 right-2 z-10">
          {canSkip ? (
            <button
              onClick={close}
              className="flex items-center gap-1 bg-black/80 border border-white/20 text-white text-[11px] font-bold px-2.5 py-1.5 rounded-full backdrop-blur-sm active:scale-95 transition-transform"
            >
              <X className="w-3 h-3" />
              Ruka
            </button>
          ) : (
            <div className="bg-black/80 border border-white/20 text-white text-[11px] font-bold px-2.5 py-1.5 rounded-full backdrop-blur-sm">
              Ruka baada ya {countdown}s
            </div>
          )}
        </div>

        {/* Image */}
        <div className="relative w-full cursor-pointer" style={{ aspectRatio: '16/9' }} onClick={handleAdClick}>
          <img
            src={ad.image_url}
            alt="Tangazo"
            className="w-full h-full object-cover"
            draggable={false}
            onError={close}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />
        </div>

        {/* Bottom info bar */}
        {(ad.description || safeUrl(ad.link)) && (
          <div
            className="px-3 py-2.5 flex items-center gap-2 cursor-pointer active:bg-muted transition-colors"
            onClick={handleAdClick}
          >
            <div className="flex-1 min-w-0">
              {ad.description && (
                <p className="text-[12px] font-semibold text-foreground truncate leading-tight">{ad.description}</p>
              )}
            </div>
            <div className="flex items-center gap-1 bg-primary text-primary-foreground text-[11px] font-bold px-2.5 py-1.5 rounded-lg flex-shrink-0">
              <ExternalLink className="w-3 h-3" />
              Fungua
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
