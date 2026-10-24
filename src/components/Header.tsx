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
  ChevronDown,
  ExternalLink,
  Facebook,
  Send,
  Globe,
  Users,
  Megaphone,
  FileText,
  ShieldCheck,
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
import { resolveSocialLinks, SocialLink } from '@/lib/socialLinks';

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
  support_number?: string;
  social_links?: SocialLink[];
}

export default function Header({ sticky = true }: { sticky?: boolean } = {}) {
  const { user, profile } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showMenu, setShowMenu] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showSocial, setShowSocial] = useState(false);
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

  const socialLinks = resolveSocialLinks(settings);
  const supportDigits = (settings?.support_number || '').replace(/\D/g, '');

  const platformIcon = (platform: string, category: string) => {
    switch (platform) {
      case 'whatsapp': return category === 'group' ? Users : category === 'channel' ? Megaphone : MessageCircle;
      case 'telegram': return Send;
      case 'instagram': return Instagram;
      case 'tiktok': return Music2;
      case 'youtube': return Youtube;
      case 'facebook': return Facebook;
      case 'website': return Globe;
      default: return category === 'group' ? Users : category === 'channel' ? Megaphone : Globe;
    }
  };

  const platformTint = (platform: string) => {
    switch (platform) {
      case 'whatsapp': return 'text-green-400 bg-green-500/15';
      case 'telegram': return 'text-sky-400 bg-sky-500/15';
      case 'instagram': return 'text-pink-400 bg-pink-500/15';
      case 'tiktok': return 'text-white bg-white/10';
      case 'youtube': return 'text-red-400 bg-red-500/15';
      case 'facebook': return 'text-blue-400 bg-blue-500/15';
      default: return 'text-primary bg-primary/15';
    }
  };

  const socialGroups: Array<{ key: string; title: string; items: SocialLink[] }> = [
    { key: 'group', title: t('social_groups'), items: socialLinks.filter((l) => l.category === 'group') },
    { key: 'channel', title: t('social_channels'), items: socialLinks.filter((l) => l.category === 'channel') },
    { key: 'social', title: t('social_media'), items: socialLinks.filter((l) => l.category === 'social') },
  ].filter((g) => g.items.length > 0);

  return (
    <>
      <header className={`${sticky ? 'sticky top-0' : 'relative'} z-50 glass-strong border-b border-border/40`}>
        <div className="flex items-center justify-between gap-1 px-3 sm:px-4 py-2.5 sm:py-3">
          <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
            <button
              onClick={() => setShowMenu(true)}
              className="p-1.5 -ml-1 shrink-0 rounded-full hover:bg-white/5 transition-colors text-foreground press tap-safe"
              aria-label="Fungua menu"
            >
              <Menu className="w-6 h-6" />
            </button>
            <Link to="/" className="flex items-center gap-2 sm:gap-2.5 tap-safe min-w-0">
              <div className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-xl flex items-center justify-center overflow-hidden">
                <img src="/favicon-192.png" alt="RevonTech" className="w-full h-full object-contain" />
              </div>
              <div className="flex flex-col leading-none min-w-0">
                <span className="text-[12px] sm:text-[13px] font-black tracking-wider sm:tracking-widest text-primary text-glow-primary uppercase truncate">
                  REVONTECH
                </span>
                <span className="text-[9px] font-bold tracking-[0.2em] text-secondary uppercase">
                  TV
                </span>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-0 sm:gap-2 shrink-0">
            <LanguageToggle variant="icon" className="!p-1.5 sm:!p-2" />

            <button
              onClick={() => setShowSearch(true)}
              className="p-1.5 sm:p-2 rounded-full hover:bg-white/5 transition-colors text-foreground press tap-safe"
              aria-label={t('search')}
            >
              <Search className="w-5 h-5" />
            </button>

            {user && (
              <button
                onClick={() => navigate('/notifications')}
                className="relative p-1.5 sm:p-2 rounded-full hover:bg-white/5 transition-colors press tap-safe"
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
                className="flex items-center p-1 sm:p-1.5 rounded-full hover:bg-white/5 transition-colors press tap-safe"
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
              <div className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-xl flex items-center justify-center overflow-hidden">
                <img src="/favicon-192.png" alt="RevonTech" className="w-full h-full object-contain" />
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

              {/* WhatsApp support */}
              {supportDigits && (
                <div className="mt-6 px-4">
                  <a
                    href={`https://wa.me/${supportDigits}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => setShowMenu(false)}
                    className="group relative flex items-center gap-3 overflow-hidden rounded-2xl border border-green-500/30 bg-gradient-to-br from-green-500/20 via-green-500/10 to-transparent p-3.5 press tap-safe"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#25D366] shadow-lg shadow-green-500/30">
                      <svg viewBox="0 0 24 24" className="h-6 w-6 text-white" fill="currentColor" aria-hidden="true">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
                      </svg>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-black text-foreground">{t('support_whatsapp')}</span>
                      <span className="block truncate text-xs text-muted-foreground">{t('support_sub')}</span>
                    </span>
                    <ExternalLink className="h-4 w-4 shrink-0 text-green-400" />
                  </a>
                </div>
              )}

              {/* RevonTech Social (expandable, managed in admin) */}
              {socialGroups.length > 0 && (
                <div className="mt-3 px-4">
                  <div className="overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent">
                    <button
                      onClick={() => setShowSocial((v) => !v)}
                      aria-expanded={showSocial}
                      className="flex w-full items-center gap-3 p-3.5 text-left press tap-safe"
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/20 text-primary">
                        <Users className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-black text-foreground">{t('revontech_social')}</span>
                        <span className="block truncate text-xs text-muted-foreground">{t('social_sub')}</span>
                      </span>
                      <ChevronDown className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-300 ${showSocial ? 'rotate-180' : ''}`} />
                    </button>

                    {showSocial && (
                      <div className="space-y-3 border-t border-white/5 px-3 pb-3 pt-3 animate-fade-in">
                        {socialGroups.map((g) => (
                          <div key={g.key}>
                            <p className="mb-1.5 px-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">{g.title}</p>
                            <div className="space-y-1.5">
                              {g.items.map((l) => {
                                const Icon = platformIcon(l.platform, l.category);
                                return (
                                  <a
                                    key={l.id}
                                    href={l.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={() => setShowMenu(false)}
                                    className="flex items-center gap-3 rounded-xl border border-white/5 bg-black/20 px-3 py-2.5 transition-colors hover:bg-white/5 press tap-safe"
                                  >
                                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${platformTint(l.platform)}`}>
                                      <Icon className="h-4 w-4" />
                                    </span>
                                    <span className="min-w-0 flex-1 truncate text-sm font-bold text-foreground">{l.label}</span>
                                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                  </a>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Legal */}
              <div className="mt-6 px-4">
                <p className="mb-2 px-2 text-caption font-black uppercase tracking-widest">{t('legal_section')}</p>
                <div className="space-y-1">
                  {[
                    { to: '/terms', label: t('terms'), Icon: FileText },
                    { to: '/privacy', label: t('privacy'), Icon: ShieldCheck },
                  ].map(({ to, label, Icon }) => (
                    <Link
                      key={to}
                      to={to}
                      onClick={() => setShowMenu(false)}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-foreground transition-colors hover:bg-white/5 press tap-safe"
                    >
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span className="flex-1">{label}</span>
                    </Link>
                  ))}
                </div>
              </div>
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
