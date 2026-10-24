import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getCountFromServer } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AdminLayout from '@/components/AdminLayout';
import EarningsPanel from '@/components/EarningsPanel';
import { Tv, Image, Key, Users, Bell, TrendingUp, Megaphone, DollarSign } from 'lucide-react';

export default function AdminDashboard() {
  const [stats, setStats] = useState({ channels: 0, sliders: 0, users: 0, notifications: 0 });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [chCount, slCount, notifCount] = await Promise.all([
          getCountFromServer(collection(db, 'channels')),
          getCountFromServer(collection(db, 'slider_images')),
          getCountFromServer(collection(db, 'notifications')),
        ]);
        setStats((s) => ({
          ...s,
          channels: chCount.data().count,
          sliders: slCount.data().count,
          notifications: notifCount.data().count,
        }));
      } catch (error) {
        console.error("Error fetching stats:", error);
      }
    };
    fetchStats();
  }, []);

  const cards = [
    { label: 'Vituo', value: stats.channels, icon: Tv, to: '/channels', color: 'primary' },
    { label: 'Slider', value: stats.sliders, icon: Image, to: '/slider', color: 'primary' },
    { label: 'Arifa', value: stats.notifications, icon: Bell, to: '/notifications', color: 'primary' },
    { label: 'Token', value: '•••', icon: Key, to: '/token', color: 'primary' },
  ];

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-xl font-black tracking-wide text-foreground">Muhtasari</h1>
        <p className="text-sm text-muted-foreground">Welcome to REVONTECH TV Dashboard</p>
      </div>

      <EarningsPanel />

      <div className="grid grid-cols-2 gap-3 mb-6">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link key={c.label} to={c.to} className="cyber-card rounded-2xl p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="p-2 bg-primary/10 rounded-xl">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-black text-foreground">{c.value}</p>
                <p className="text-xs text-muted-foreground">{c.label}</p>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="cyber-card rounded-2xl p-4">
        <h2 className="text-sm font-black text-muted-foreground uppercase tracking-widest mb-3">Viungo vya Haraka</h2>
        <div className="space-y-2">
          {[
            { label: 'Ongeza Kituo Kipya', to: '/channels', icon: Tv },
            { label: 'Simamia Matangazo (Ads)', to: '/ads', icon: Megaphone },
            { label: 'Sasisha Token ya Leo', to: '/token', icon: Key },
            { label: 'Tuma Arifa kwa Watumiaji', to: '/notifications', icon: Bell },
            { label: 'Simamia Picha za Slider', to: '/slider', icon: Image },
            { label: 'Angalia Watumiaji', to: '/users', icon: Users },
            { label: 'Angalia Ripoti za Malipo', to: '/payments', icon: DollarSign },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.to} to={item.to} className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors">
                <Icon className="w-4 h-4 text-primary" />
                <span className="text-sm text-foreground">{item.label}</span>
                <span className="ml-auto text-muted-foreground">›</span>
              </Link>
            );
          })}
        </div>
      </div>
    </AdminLayout>
  );
}
