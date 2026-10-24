import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import {
  LayoutDashboard, Tv, Image, Key, Users, Bell, LogOut, CreditCard,
  Settings, DollarSign, Gift, Film, Megaphone, MessageCircle, UserCheck, Scale, ShieldAlert, Terminal,
} from 'lucide-react';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const [channelUrl, setChannelUrl] = useState('');

  useEffect(() => {
    getDoc(doc(db, 'settings', 'general_settings'))
      .then((snap) => {
        const url = snap.exists() ? snap.data().whatsapp_channel_url : '';
        if (/^https?:\/\//i.test(url || '')) setChannelUrl(url);
      })
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Ruhusa imekataliwa</p>
          <button
            onClick={() => navigate('/login')}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-bold"
          >
            Ingia kama Admin
          </button>
        </div>
      </div>
    );
  }

  const navItems = [
    { to: '/',              label: 'Dashibodi',  icon: LayoutDashboard },
    { to: '/channels',      label: 'Vituo',      icon: Tv },
    { to: '/movies',        label: 'Movies',     icon: Film },
    { to: '/slider',        label: 'Slider',     icon: Image },
    { to: '/plans',         label: 'Mipango',    icon: CreditCard },
    { to: '/payments',      label: 'Malipo',     icon: DollarSign },
    { to: '/token',         label: 'Token',      icon: Key },
    { to: '/users',         label: 'Watumiaji',  icon: Users },
    { to: '/subscribers',   label: 'Wasajili',   icon: UserCheck },
    { to: '/referrals',     label: 'Referrals',  icon: Gift },
    { to: '/ads',           label: 'Matangazo',  icon: Megaphone },
    { to: '/notifications', label: 'Arifa',      icon: Bell },
    { to: '/api-access',    label: 'API',        icon: Terminal },
    { to: '/backup',        label: 'Backup Links', icon: ShieldAlert },
    { to: '/legal',         label: 'Sheria',     icon: Scale },
    { to: '/settings',      label: 'Settings',   icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="bg-card border-b border-border px-4 py-3 flex items-center justify-between sticky top-0 z-40">
        <span className="text-lg font-black tracking-widest text-primary text-glow-cyan">
          ADMIN
        </span>
        <div className="flex items-center gap-4">
          {channelUrl && (
            <a
              href={channelUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-bold text-green-500 hover:text-green-400"
            >
              <MessageCircle className="w-3.5 h-3.5" /> WhatsApp Channel
            </a>
          )}
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 text-xs text-destructive hover:text-destructive/80"
        >
          <LogOut className="w-3.5 h-3.5" /> Toka
        </button>
        </div>
      </header>

      <div className="overflow-x-auto border-b border-border bg-card">
        <div className="flex min-w-max px-2 py-2 gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = window.location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>

      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}
