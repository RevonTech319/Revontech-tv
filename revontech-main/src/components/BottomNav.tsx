import { useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, Trophy, Film, User } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

/**
 * Floating glass tab bar (mobile-first). Home · Matches · Movies · Profile.
 * Hidden on immersive / auth pages. While visible it adds `has-bottom-nav`
 * to <body> so pages get bottom padding and nothing is hidden behind it.
 */
const HIDDEN_PREFIXES = ['/player/', '/login', '/app'];

export default function BottomNav() {
  const { pathname } = useLocation();
  const { t } = useTranslation();

  const hidden =
    HIDDEN_PREFIXES.some((p) => pathname.startsWith(p)) ||
    /^\/movies\/[^/]+$/.test(pathname);

  useEffect(() => {
    document.body.classList.toggle('has-bottom-nav', !hidden);
    return () => document.body.classList.remove('has-bottom-nav');
  }, [hidden]);

  if (hidden) return null;

  const tabs = [
    { to: '/', label: t('home'), Icon: Home, match: (p: string) => p === '/' },
    { to: '/livetv', label: t('nav_matches'), Icon: Trophy, match: (p: string) => p === '/livetv' || p === '/matches' },
    { to: '/movies', label: t('movies'), Icon: Film, match: (p: string) => p.startsWith('/movies') },
    { to: '/profile', label: t('profile'), Icon: User, match: (p: string) => p === '/profile' },
  ];

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-[60] flex justify-center px-4 pointer-events-none"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
    >
      <ul className="pointer-events-auto grid grid-cols-4 w-full max-w-sm items-center gap-1 rounded-full border border-white/10 bg-[#0b1220]/70 p-1.5 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.9)] backdrop-blur-xl">
        {tabs.map(({ to, label, Icon, match }) => {
          const active = match(pathname);
          return (
            <li key={to} className="min-w-0">
              <NavLink
                to={to}
                aria-current={active ? 'page' : undefined}
                className="relative flex h-14 flex-col items-center justify-center gap-0.5 rounded-full tap-safe"
              >
                {active && (
                  <span
                    aria-hidden
                    className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_40%,rgba(239,68,68,0.55),rgba(239,68,68,0.12)_60%,transparent_80%)]"
                  />
                )}
                <Icon
                  className={`relative h-[22px] w-[22px] transition-all duration-200 ${
                    active ? 'text-white scale-110 drop-shadow-[0_0_8px_rgba(248,113,113,0.9)]' : 'text-white/45'
                  }`}
                  strokeWidth={active ? 2.4 : 1.8}
                  fill={active && to === '/' ? 'currentColor' : 'none'}
                />
                <span
                  className={`relative max-w-full truncate px-1 text-[10px] font-bold leading-none transition-colors ${
                    active ? 'text-white' : 'text-white/45'
                  }`}
                >
                  {label}
                </span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
