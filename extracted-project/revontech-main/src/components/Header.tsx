import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Bell,
  User,
  Menu,
  X,
  Home,
  CreditCard,
  Info,
  Youtube,
  MessageCircle,
  Search,
  Smartphone,
  Film,
  Instagram,
  Music2,
  Trophy,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/lib/i18n';
import LanguageToggle from '@/components/LanguageToggle';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  doc,
  setDoc,
  getDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface Notification {
  id: string;
  title: string;
  message: string;
  created_at: any;
  is_read: boolean;
  un_id?: string;
}

interface HeaderSettings {
  whatsapp_url?: string;
  whatsapp_channel_url?: string;
  youtube_url?: string;
  instagram_url?: string;
  tiktok_url?: string;
  movies_enabled?: boolean;
}

export default function Header() {
  const { user, profile } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showMenu, setShowMenu] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [settings, setSettings] = useState<HeaderSettings | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  useEffect(() => {
    if (user) fetchNotifications();
  }, [user]);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        // Prefer canonical single doc
        const single = await getDoc(doc(db, 'settings', 'general_settings'));
        if (single.exists()) {
          setSettings(single.data() as HeaderSettings);
          return;
        }
        // Fallback: legacy first-doc pattern
        const q = query(collection(db, 'settings'), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty) {
          setSettings(snap.docs[0].data() as HeaderSettings);
        }
      } catch (error) {
        console.error('Error fetching settings:', error);
      }
    };
    fetchSettings();
  }, []);

  useEffect(() => {
    if (showSearch && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [showSearch]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/?search=${encodeURIComponent(searchQuery.trim())}`);
      setShowSearch(false);
      setSearchQuery('');
    }
  };

  const fetchNotifications = async () => {
    if (!user) return;
    try {
      const allNotifsQuery = query(
        collection(db, 'notifications'),
        orderBy('created_at', 'desc'),
        limit(20)
      );
      const allNotifsSnap = await getDocs(allNotifsQuery);
      const allNotifs = allNotifsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const userNotifsQuery = query(
        collection(db, 'user_notifications'),
        where('user_id', '==', user.uid)
      );
      const userNotifsSnap = await getDocs(userNotifsQuery);
      const userNotifs = userNotifsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const readMap = new Map((userNotifs as any[]).map((un: any) => [un.notification_id, un]));
      setNotifications(
        (allNotifs as any[])
          .map((n: any) => ({
            ...n,
            is_read: readMap.has(n.id) ? (readMap.get(n.id) as any).is_read : false,
            is_deleted: readMap.has(n.id) ? (readMap.get(n.id) as any).is_deleted : false,
            un_id: (readMap.get(n.id) as any)?.id,
          }))
          .filter((n) => !n.is_deleted)
      );
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  };

  // Social links that are shown only if their URL is configured
  const socialLinks = [
    settings?.whatsapp_channel_url && {
      href: settings.whatsapp_channel_url,
      label: 'WhatsApp Channel',
      Icon: MessageCircle,
      bg: 'bg-green-500/10',
      border: 'border-green-500/30',
      text: 'text-green-500',
    },
    settings?.instagram_url && {
      href: settings.instagram_url,
      label: 'Instagram',
      Icon: Instagram,
      bg: 'bg-gradient-to-br from-pink-500/10 to-orange-400/10',
      border: 'border-pink-500/30',
      text: 'text-pink-400',
    },
    settings?.tiktok_url && {
      href: settings.tiktok_url,
      label: 'TikTok',
      Icon: Music2,
      bg: 'bg-black/40',
      border: 'border-white/20',
      text: 'text-white',
    },
    settings?.youtube_url && {
      href: settings.youtube_url,
      label: 'YouTube',
      Icon: Youtube,
      bg: 'bg-red-500/10',
      border: 'border-red-500/30',
      text: 'text-red-500',
    },
  ].filter(Boolean) as Array<{
    href: string;
    label: string;
    Icon: typeof Youtube;
    bg: string;
    border: string;
    text: string;
  }>;

  return (
    <>
      <header className="sticky top-0 z-50 glass-strong border-b border-border/40">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowMenu(true)}
              className="p-1.5 -ml-1 rounded-full hover:bg-white/5 transition-colors text-foreground press tap-safe"
              aria-label="Fungua menu"
            >
              <Menu className="w-6 h-6" />
            </button>
            <Link to="/" className="flex items-center gap-2.5 tap-safe">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center glow-primary overflow-hidden">
                <img src="/logo.jpg" alt="RT" className="w-full h-full object-cover" />
              </div>
              <div className="flex flex-col leading-none">
                <span className="text-[13px] font-black tracking-widest text-primary text-glow-primary uppercase">
                  REVONTECH
                </span>
                <span className="text-[9px] font-bold tracking-[0.2em] text-secondary uppercase">
                  TV
                </span>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <Link
              to="/livetv"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-600/15 border border-red-500/30 text-red-400 text-xs font-black press tap-safe hover:bg-red-600/25 transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              <span className="hidden xs:inline">MECHI</span> LIVE
            </Link>

            <LanguageToggle variant="icon" />

            <button
              onClick={() => setShowSearch(true)}
              className="p-2 rounded-full hover:bg-white/5 transition-colors text-foreground press tap-safe"
              aria-label={t('search')}
            >
              <Search className="w-5 h-5" />
            </button>

            {user && (
              <button
                onClick={() => navigate('/notifications')}
                className="relative p-2 rounded-full hover:bg-white/5 transition-colors press tap-safe"
                aria-label={t('notifications')}
              >
                <Bell className="w-5 h-5 text-foreground" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
            )}

            {user ? (
              <Link
                to="/profile"
                className="flex items-center gap-1.5 p-1.5 rounded-full hover:bg-white/5 transition-colors press tap-safe"
                aria-label="Profile"
              >
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt="avatar"
                    className="w-7 h-7 rounded-full object-cover border border-primary/50"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/50 flex items-center justify-center">
                    <User className="w-4 h-4 text-primary" />
                  </div>
                )}
              </Link>
            ) : (
              <Link
                to="/login"
                className="text-sm font-bold px-3 py-1.5 rounded-full bg-primary text-primary-foreground hover:bg-primary/80 transition-colors press tap-safe"
              >
                {t('login')}
              </Link>
            )}
          </div>
        </div>

        {showSearch && (
          <div className="px-4 pb-3 animate-fade-in">
            <form
              onSubmit={handleSearchSubmit}
              className="flex items-center gap-2 glass rounded-xl px-3 py-2"
            >
              <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('search_channels')}
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  setShowSearch(false);
                  setSearchQuery('');
                }}
                className="p-0.5 rounded-full hover:bg-background/50 transition-colors text-muted-foreground tap-safe"
                aria-label={t('close_search')}
              >
                <X className="w-4 h-4" />
              </button>
            </form>
          </div>
        )}
      </header>

      {/* Slide menu drawer */}
      {showMenu && (
        <div className="fixed inset-0 z-[100] flex">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in"
            onClick={() => setShowMenu(false)}
          />
          <div className="relative w-72 max-w-[80vw] h-full glass-strong border-r border-border/40 flex flex-col pt-6 shadow-2xl animate-slide-up">
            <button
              onClick={() => setShowMenu(false)}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/5 text-foreground press tap-safe"
              aria-label="Funga menu"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="px-6 mb-6 mt-2 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center glow-primary overflow-hidden">
                <img src="/logo.jpg" alt="RT" className="w-full h-full object-cover" />
              </div>
              <div className="flex flex-col leading-none">
                <span className="text-[13px] font-black tracking-widest text-primary uppercase">
                  REVONTECH
                </span>
                <span className="text-[9px] font-bold tracking-[0.2em] text-secondary uppercase">
                  TV
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto py-2">
              <nav className="space-y-1 px-3">
                {[
                  { to: '/', icon: Home, label: t('home') },
                  { to: '/livetv', icon: Trophy, label: 'Mechi za Live', badge: 'LIVE' },
                  ...(settings?.movies_enabled !== false ? [{ to: '/movies', icon: Film, label: t('movies') }] : []),
                  { to: '/notifications', icon: Bell, label: t('notifications') },
                  { to: '/payment', icon: CreditCard, label: t('pay') },
                  { to: '/profile', icon: User, label: t('profile') },
                  { to: '/about', icon: Info, label: t('about') },
                  { to: '/app', icon: Smartphone, label: t('download_app') },
                ].map((item) => {
                  const active = location.pathname === item.to;
                  return (
                    <Link
                      key={item.to}
                      onClick={() => setShowMenu(false)}
                      to={item.to}
                      className={`flex items-center gap-4 px-4 py-3 rounded-xl font-bold transition-colors press tap-safe ${
                        active
                          ? 'bg-primary/20 text-primary glow-primary'
                          : 'hover:bg-white/5 text-foreground'
                      }`}
                    >
                      <item.icon
                        className={`w-5 h-5 ${active ? 'text-primary' : 'text-muted-foreground'}`}
                      />{' '}
                      <span className="flex-1 text-left">{item.label}</span>
                      {item.badge && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-red-600 text-white animate-pulse">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </nav>

              <div className="mt-6 px-6">
                <p className="text-caption font-black uppercase tracking-widest mb-3">
                  {t('language')}
                </p>
                <LanguageToggle variant="menu" />
              </div>

              {socialLinks.length > 0 && (
                <div className="mt-6 px-6">
                  <p className="text-caption font-black uppercase tracking-widest mb-3">
                    {t('follow_us')}
                  </p>
                  <div className="space-y-2">
                    {socialLinks.map((s) => (
                      <a
                        key={s.label}
                        href={s.href}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => setShowMenu(false)}
                        className={`flex items-center gap-3 w-full py-2.5 px-4 rounded-xl ${s.bg} ${s.text} font-bold transition-colors border ${s.border} press tap-safe hover:brightness-110`}
                      >
                        <s.Icon className="w-5 h-5" />
                        <span className="flex-1 text-sm text-left">{s.label}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-border/40">
              <p className="text-xs text-muted-foreground font-bold">© 2026 REVONTECH TV</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
