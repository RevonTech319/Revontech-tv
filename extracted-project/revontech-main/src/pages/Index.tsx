import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { collection, query, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Tv2, AlertCircle, Film, Trophy, MessageCircle } from 'lucide-react';
import Header from '@/components/Header';
import HeroSlider from '@/components/HeroSlider';
import CategoryChips from '@/components/CategoryChips';
import ChannelCard, { ChannelCardData } from '@/components/ChannelCard';
import { useTranslation } from '@/lib/i18n';

interface Channel extends ChannelCardData {
  is_free: boolean;
  category: string;
  sort_order?: number;
  active?: boolean;
}

export default function Index() {
  const { t } = useTranslation();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [categories, setCategories] = useState<string[]>(['All']);
  const [moviesEnabled, setMoviesEnabled] = useState(true);
  const [channelUrl, setChannelUrl] = useState('');
  const [searchParams] = useSearchParams();
  const searchQuery = searchParams.get('search') || '';

  useEffect(() => {
    fetchChannels();
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const snap = await getDoc(doc(db, 'settings', 'general_settings'));
      if (snap.exists()) {
        const data = snap.data();
        if (/^https?:\/\//i.test(data.whatsapp_channel_url || '')) {
          setChannelUrl(data.whatsapp_channel_url);
        }
        if (data.movies_enabled !== undefined) {
          setMoviesEnabled(!!data.movies_enabled);
        }
      }
    } catch (e) {
      // Default to enabled if error
    }
  };

  const fetchChannels = async () => {
    if (!db) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const q = query(collection(db, 'channels'));
      const querySnapshot = await getDocs(q);
      const fetched: Channel[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.active !== false) {
          fetched.push({ id: doc.id, ...data } as Channel);
        }
      });

      fetched.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

      setChannels(fetched);
      const cats = ['All', ...new Set(fetched.map((ch) => ch.category || 'General'))];
      setCategories(cats);
    } catch (error) {
      console.error('Error fetching channels:', error);
    }
    setLoading(false);
  };

  const filteredChannels = channels.filter((ch) => {
    const matchesCategory =
      selectedCategory === 'All' || (ch.category || 'General') === selectedCategory;
    const matchesSearch =
      !searchQuery || ch.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  if (!db) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="w-16 h-16 text-primary mb-4 animate-pulse" />
        <h1 className="text-h1 text-foreground mb-2">Setup Required</h1>
        <p className="text-muted-foreground max-w-sm">Please check your Firebase configuration.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20">
      <Header />
      {!searchQuery && <HeroSlider />}

      {/* Live Matches CTA banner */}
      {!searchQuery && (
        <Link
          to="/livetv"
          className="block mx-3 mt-4 mb-2 rounded-2xl overflow-hidden glass hover-lift press tap-safe border border-red-500/25 bg-gradient-to-r from-red-950/30 via-card to-card"
        >
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="w-10 h-10 rounded-xl bg-red-600/20 border border-red-500/30 flex items-center justify-center flex-shrink-0">
              <Trophy className="w-5 h-5 text-yellow-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-black text-sm text-foreground">Mechi za Live (Live Matches)</p>
                <span className="flex items-center gap-1 text-[9px] font-black text-red-400 bg-red-500/20 border border-red-500/30 px-1.5 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  LIVE
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground truncate">
                Tazama mechi zote za leo live bila kikomo!
              </p>
            </div>
            <div className="text-red-400 text-xs font-black px-2.5 py-1 rounded-lg bg-red-500/15 border border-red-500/30 flex-shrink-0">
              ANGALIA &rarr;
            </div>
          </div>
        </Link>
      )}

      {/* Movies CTA banner */}
      {!searchQuery && moviesEnabled && (
        <Link
          to="/movies"
          className="block mx-3 mt-4 mb-2 rounded-2xl overflow-hidden glass hover-lift press tap-safe"
        >
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
              <Film className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-black text-sm text-foreground">{t('new_movies')}</p>
              <p className="text-[11px] text-muted-foreground">
                {t('new_movies_desc')}
              </p>
            </div>
            <div className="text-primary text-xs font-black px-2 py-1 rounded-lg bg-primary/10 border border-primary/30 flex-shrink-0">
              {t('open')} &rarr;
            </div>
          </div>
        </Link>
      )}

      {/* WhatsApp Channel banner */}
      {!searchQuery && channelUrl && (
        <a
          href={channelUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block mx-3 mt-2 mb-2 rounded-2xl overflow-hidden glass hover-lift press tap-safe"
        >
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center flex-shrink-0">
              <MessageCircle className="w-5 h-5 text-green-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-black text-sm text-foreground">Jiunge na WhatsApp Channel</p>
              <p className="text-[11px] text-muted-foreground">
                Pata taarifa za mechi, ofa na vifurushi vipya kwanza.
              </p>
            </div>
            <div className="text-green-500 text-xs font-black px-2 py-1 rounded-lg bg-green-500/10 border border-green-500/30 flex-shrink-0">
              JIUNGE &rarr;
            </div>
          </div>
        </a>
      )}

      {/* Search results banner */}
      {searchQuery && (
        <div className="px-4 pt-4 pb-1 flex items-center gap-2">
          <div className="w-1 h-5 bg-primary rounded-full glow-primary" />
          <h2 className="text-sm font-black tracking-widest text-foreground uppercase">
            {t('results_for')}: &quot;{searchQuery}&quot;
          </h2>
          <Link
            to="/"
            className="ml-auto text-xs text-primary font-bold hover:underline tap-safe"
          >
            {t('clear')}
          </Link>
        </div>
      )}

      {!loading && !searchQuery && (
        <CategoryChips
          categories={categories}
          selected={selectedCategory}
          onSelect={setSelectedCategory}
        />
      )}

      <div className="px-3 py-4">
        <div className="flex items-center gap-2 mb-4 px-1">
          <div className="w-1 h-5 bg-primary rounded-full glow-primary" />
          <h2 className="text-sm font-black tracking-widest text-foreground uppercase">
            {searchQuery
              ? t('search_results')
              : selectedCategory === 'All'
              ? t('all_channels')
              : selectedCategory}
          </h2>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="aspect-[4/5] rounded-2xl skeleton"
                style={{ animationDelay: `${i * 40}ms` }}
              />
            ))}
          </div>
        ) : filteredChannels.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Tv2 className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm">{t('no_channels')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
            {filteredChannels.map((ch) => (
              <ChannelCard key={ch.id} ch={ch} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
