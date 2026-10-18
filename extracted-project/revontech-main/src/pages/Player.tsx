import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/lib/i18n';
import {
  ArrowLeft,
  Loader2,
} from 'lucide-react';
import Header from '@/components/Header';
import CastButton from '@/components/player/CastButton';
import ChannelMeta from '@/components/player/ChannelMeta';
import RecommendedChannels from '@/components/player/RecommendedChannels';
import LiveReactions from '@/components/player/LiveReactions';
import UniversalPlayer from '@/components/player/UniversalPlayer';
import { getCdnToken } from '@/lib/tokenService';

interface Channel {
  id: string;
  name: string;
  type: string;
  url: string;
  kid: string | null;
  key: string | null;
  img_url: string | null;
  is_free: boolean;
  category?: string;
  description?: string;
  schedule?: string;
  drmClearKey?: string | null;
  drmKid?: string | null;
  drmKey?: string | null;
}

interface Plan {
  name: string;
  plan_key: string;
  amount: number;
  currency: string;
}

export default function Player() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [token, setToken] = useState('');
  const [isPremium, setIsPremium] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [, setPlans] = useState<Plan[]>([]);

  // Check user subscription
  useEffect(() => {
    let unsubSubs: any = null;
    if (user) {
      const q = query(collection(db, 'subscriptions'), where('user_id', '==', user.uid));
      unsubSubs = onSnapshot(q, (snap) => {
        const hasActive = snap.docs.some(d => {
          const data = d.data();
          if (data.status !== 'active') return false;
          if (data.expires_at) {
            const expires = new Date(data.expires_at).getTime();
            if (expires < Date.now()) return false;
          }
          return true;
        });
        setIsPremium(hasActive);
      });
    }
    return () => { if (unsubSubs) unsubSubs(); };
  }, [user]);

  // Load channel & plans on id change
  useEffect(() => {
    const fetchChannelAndToken = async () => {
      try {
        const [tokenResult, channelSnap] = await Promise.all([
          getCdnToken().catch((e) => {
            console.warn("getCdnToken error:", e);
            return { token: '', cdnHost: '' };
          }),
          getDoc(doc(db, 'channels', id!)).catch((e) => {
            console.error("Channel getDoc error:", e);
            return null;
          })
        ]);

        if (tokenResult?.token) {
          setToken(tokenResult.token.trim());
        }

        if (channelSnap && channelSnap.exists()) {
          setChannel({ id: channelSnap.id, ...channelSnap.data() } as Channel);
        } else {
          console.error("Channel not found!");
        }
      } catch (err) {
        console.error("Critical error in fetchChannelAndToken:", err);
      }
    };

    fetchChannelAndToken();

    const fetchPlans = async () => {
      try {
        const q = query(collection(db, 'plans'));
        const snap = await getDocs(q);
        const fetchedPlans: Plan[] = [];
        snap.forEach(d => {
          const data = d.data() as Plan;
          if ((data as any).active !== false) fetchedPlans.push(data);
        });
        fetchedPlans.sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));
        setPlans(fetchedPlans);
      } catch (error) {
        console.error("Error fetching plans:", error);
      }
    };
    fetchPlans();
  }, [id]);

  // Live-subscribe to tokens/global
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'tokens', 'global'),
      (snap) => {
        if (!snap.exists()) return;
        const value = (snap.data()?.value || '').toString().trim();
        if (value && value.length >= 10) {
          setToken((prev) => (prev !== value ? value : prev));
        }
      },
      (err) => console.warn('tokens/global listener error:', err)
    );
    return () => unsub();
  }, []);

  // Fullscreen change listener
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const isChannelFree = channel && (channel.is_free === true || (channel.is_free as any) === 'true');

  return (
    <div className="min-h-screen pb-20">
      {!isFullscreen && <Header />}

      <div className="max-w-6xl mx-auto">
        {/* Video container with UniversalPlayer */}
        <div
          ref={containerRef}
          className={`relative bg-black overflow-hidden ${
            isFullscreen ? 'w-screen h-screen' : 'aspect-video md:rounded-b-2xl'
          }`}
        >
          {/* Top navigation overlay with Back button & Cast */}
          <div className="absolute top-0 left-0 right-0 flex items-center gap-2 px-3 md:px-4 py-3 bg-gradient-to-b from-black/85 via-black/40 to-transparent z-40 pointer-events-auto">
            <button
              onClick={() => navigate(-1)}
              className="p-2 rounded-xl glass press tap-safe"
              aria-label={t('back')}
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <span className="font-bold text-sm text-white truncate flex-1">
              {channel?.name || '...'}
            </span>

            <div className="flex items-center gap-1.5">
              <span className="flex items-center gap-1 bg-red-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-white inline-block" />
                {t('live')}
              </span>
              {channel && <CastButton channel={channel} token={token} />}
            </div>
          </div>

          {channel ? (
            <UniversalPlayer
              key={`live-${channel.id}-${token}`}
              streamUrl={channel.url}
              linkType={channel.type}
              drmConfig={{
                drmClearKey: channel.drmClearKey,
                drmKid: channel.drmKid || channel.kid,
                drmKey: channel.drmKey || channel.key,
              }}
              globalToken={token}
              isPremium={isPremium}
              requiresPayment={!isChannelFree}
              isLive={true}
              poster={channel.img_url || ''}
              programInfo={channel.schedule ? { title: channel.schedule } : null}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-black">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          )}
        </div>

        {/* Channel Details, Reactions, and Recommended */}
        {channel && (
          <div className="px-4 py-4 space-y-6">
            <ChannelMeta channel={channel} />
            <LiveReactions channelId={channel.id} showReactions={(channel as any).show_reactions !== false} />
            
            {/* Live Matches Discovery Card */}
            <Link
              to="/livetv"
              className="block p-3.5 rounded-2xl glass hover-lift border border-red-500/25 bg-gradient-to-r from-red-950/20 via-card to-card press tap-safe"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-600/20 border border-red-500/30 flex items-center justify-center shrink-0">
                  <span className="text-xl">⚽</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-black text-sm text-foreground">Mechi za Live (Live Matches)</p>
                    <span className="flex items-center gap-1 text-[9px] font-black text-red-400 bg-red-500/20 border border-red-500/30 px-1.5 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                      LIVE
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    Tazama mechi zote za leo live bila kikomo
                  </p>
                </div>
                <span className="text-xs font-black text-primary px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/20 shrink-0">
                  FUNGUA &rarr;
                </span>
              </div>
            </Link>

            <RecommendedChannels currentId={channel.id} category={channel.category} />
          </div>
        )}
      </div>
    </div>
  );
}
