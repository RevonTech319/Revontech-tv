import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { uploadToImgBB } from '@/lib/imgbb';
import Header from '@/components/Header';
import {
  Camera, Save, CreditCard, LogOut, Crown, Clock,
  CheckCircle, XCircle, RefreshCw, Gift, Copy, ChevronRight
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

interface Subscription {
  id: string; plan: string; status: string; expires_at: any; starts_at: any; amount: number;
}

const planLabels: Record<string, string> = {
  day: '1 Day', week: '1 Week', week2: '2 Weeks', month: '1 Month', free: 'Free'
};

const SITE_URL = 'https://revontechtv.online';

export default function Profile() {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState('');
  const [subscription, setSubscription] = useState<Subscription | null>(null);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || '');
      setPhone(profile.phone || '');
    }
  }, [profile]);

  useEffect(() => {
    if (user) fetchSubscription();
  }, [user]);

  const fetchSubscription = async () => {
    try {
      const q = query(collection(db, 'subscriptions'), where('user_id', '==', user!.uid));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const activeSubs = snap.docs
          .map(d => ({ id: d.id, ...d.data() } as Subscription))
          .filter(s => s.status === 'active');
        if (activeSubs.length > 0) {
          activeSubs.sort((a, b) => {
            const ms = (v: any) => {
              if (!v) return 0;
              if (typeof v.toMillis === 'function') return v.toMillis();
              if (typeof v.toDate === 'function') return v.toDate().getTime();
              return new Date(v).getTime() || 0;
            };
            return ms(b.expires_at) - ms(a.expires_at);
          });
          setSubscription(activeSubs[0]);
        }
      }
    } catch (e) {
      console.error('Error fetching subscription:', e);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'profiles', user.uid), { display_name: displayName, phone });
      await refreshProfile();
      setMsg('Saved!');
      setTimeout(() => setMsg(''), 3000);
    } catch (e) {
      setMsg('Error saving profile');
    }
    setSaving(false);
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!user || !e.target.files?.[0]) return;
    setUploading(true);
    try {
      const url = await uploadToImgBB(e.target.files[0]);
      await updateDoc(doc(db, 'profiles', user.uid), { avatar_url: url });
      await refreshProfile();
    } catch (e) {
      console.error('Avatar upload error:', e);
    }
    setUploading(false);
  };

  const handleLogout = async () => { await signOut(); navigate('/login'); };

  const isSubActive = subscription?.status === 'active' && subscription.expires_at && (
    (subscription.expires_at.toDate ? subscription.expires_at.toDate() : new Date(subscription.expires_at)) > new Date()
  );

  const expiryDate = subscription?.expires_at
    ? (subscription.expires_at.toDate ? subscription.expires_at.toDate() : new Date(subscription.expires_at))
    : null;

  const daysLeft = expiryDate ? Math.ceil((expiryDate.getTime() - Date.now()) / 86400000) : 0;

  // Referral banner data
  const referralCount = profile?.referral_count || 0;
  const referralPaidCount = (profile as any)?.referral_paid_count || 0;
  const rewardDaysEarned = (profile as any)?.referral_reward_days || 0;
  const shareUrl = profile?.referral_code ? `${SITE_URL}/login?ref=${profile.referral_code}` : '';

  if (!user) return (
    <div className="min-h-screen bg-background pb-20">
      <Header />
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">You need to log in first</p>
          <Button onClick={() => navigate('/login')} className="bg-primary text-primary-foreground">Login</Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background pb-20">
      <Header />
      <div className="px-4 py-6 max-w-lg mx-auto">

        {/* ── Avatar ── */}
        <div className="flex flex-col items-center mb-6">
          <div className="relative">
            <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-primary glow-cyan">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-primary/10 flex items-center justify-center">
                  <span className="text-3xl font-black text-primary">
                    {(profile?.display_name || 'U')[0].toUpperCase()}
                  </span>
                </div>
              )}
            </div>
            <button
              onClick={() => fileRef.current?.click()} disabled={uploading}
              className="absolute bottom-0 right-0 p-1.5 bg-primary rounded-full text-primary-foreground hover:bg-primary/80 transition-colors"
            >
              <Camera className="w-3.5 h-3.5" />
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          </div>
          <p className="mt-3 font-black text-lg text-foreground">{profile?.display_name || 'User'}</p>
          <p className="text-sm text-muted-foreground">{profile?.phone || user.email}</p>
        </div>

        {/* ── Subscription Status ── */}
        <div className={`rounded-2xl p-5 mb-4 border-2 ${isSubActive ? 'border-green-500/40 bg-green-500/5' : 'border-destructive/30 bg-destructive/5'}`}>
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isSubActive ? 'bg-green-500/20' : 'bg-destructive/20'}`}>
              {isSubActive
                ? <CheckCircle className="w-5 h-5 text-green-400" />
                : <XCircle className="w-5 h-5 text-destructive" />}
            </div>
            <div>
              <p className="font-black text-sm text-foreground">
                {isSubActive ? 'Active Subscription' : 'No Subscription'}
              </p>
              {isSubActive && subscription ? (
                <p className="text-xs text-green-400 font-bold">
                  {(subscription as any).plan_label || planLabels[subscription.plan] || subscription.plan} · {daysLeft} days remaining
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Subscribe to watch all channels</p>
              )}
            </div>
            {isSubActive && <Crown className="w-6 h-6 text-yellow-400 ml-auto" />}
          </div>

          {isSubActive && expiryDate && (
            <div className="flex items-center gap-2 bg-card/60 rounded-xl px-3 py-2 mb-3">
              <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <p className="text-xs text-muted-foreground">
                Expires: <span className="text-foreground font-bold">
                  {expiryDate.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
              </p>
            </div>
          )}

          <Button
            onClick={() => navigate('/payment')}
            className={`w-full font-black ${isSubActive ? 'bg-card border border-primary/40 text-primary hover:bg-primary/10' : 'bg-primary text-primary-foreground glow-cyan'}`}
          >
            {isSubActive
              ? <><RefreshCw className="w-4 h-4 mr-2" /> Renew Subscription</>
              : <><CreditCard className="w-4 h-4 mr-2" /> Subscribe Now</>}
          </Button>
        </div>

        {/* ── Referral Banner (taps through to /referral) ── */}
        {profile?.referral_code && (
          <div
            className="rounded-2xl mb-4 border border-primary/30 overflow-hidden cursor-pointer active:scale-[0.99] transition-transform"
            onClick={() => navigate('/referral')}
          >
            {/* Header strip */}
            <div className="bg-primary/10 px-4 py-3 flex items-center gap-3 border-b border-border">
              <div className="w-8 h-8 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
                <Gift className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-black text-sm text-foreground">Referral & Earn</p>
                <p className="text-[10px] text-muted-foreground">Kila watu 3 wanaojisajili = siku 1 bure</p>
              </div>
              <ChevronRight className="w-4 h-4 text-primary flex-shrink-0" />
            </div>

            {/* 3-column stats */}
            <div className="grid grid-cols-3 divide-x divide-border bg-card/60">
              <div className="text-center py-3 px-2">
                <p className="text-xl font-black text-foreground">{referralCount}</p>
                <p className="text-[9px] text-muted-foreground font-bold mt-0.5">Waliojiunga</p>
              </div>
              <div className="text-center py-3 px-2">
                <p className="text-xl font-black text-primary">{referralPaidCount}</p>
                <p className="text-[9px] text-muted-foreground font-bold mt-0.5">Walionunua</p>
              </div>
              <div className="text-center py-3 px-2">
                <p className="text-xl font-black text-green-400">+{rewardDaysEarned}d</p>
                <p className="text-[9px] text-muted-foreground font-bold mt-0.5">Siku Bure</p>
              </div>
            </div>

            {/* URL */}
            <div className="px-4 pb-3 pt-2 bg-card/60 border-t border-border">
              <div className="flex items-center gap-2">
                <p className="text-[10px] font-mono text-muted-foreground truncate flex-1">{shareUrl}</p>
                <button
                  onClick={e => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(shareUrl);
                    toast({ title: 'Kiungo kimekopwa!', className: 'bg-green-500 text-white font-bold' });
                  }}
                  className="flex-shrink-0 p-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
                >
                  <Copy className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Edit Profile ── */}
        <div className="cyber-card rounded-2xl p-5 mb-4">
          <h3 className="text-sm font-black text-muted-foreground uppercase tracking-widest mb-4">Edit Profile</h3>
          <div className="space-y-3">
            <div>
              <Label className="text-foreground text-xs mb-1.5 block">Display Name</Label>
              <Input
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="Your name"
                className="bg-muted border-border text-foreground"
              />
            </div>
            <div>
              <Label className="text-foreground text-xs mb-1.5 block">Phone Number</Label>
              <Input
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="0712 345 678"
                className="bg-muted border-border text-foreground"
              />
            </div>
          </div>
          {msg && <p className="text-sm text-green-400 mt-2">{msg}</p>}
          <Button onClick={handleSave} disabled={saving} className="w-full mt-4 bg-primary text-primary-foreground glow-cyan">
            <Save className="w-4 h-4 mr-2" /> {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>

        {/* ── Logout ── */}
        <button
          onClick={handleLogout}
          className="w-full py-3 rounded-2xl border border-destructive/40 text-destructive font-bold text-sm hover:bg-destructive/10 transition-colors flex items-center justify-center gap-2"
        >
          <LogOut className="w-4 h-4" /> Logout
        </button>
      </div>
    </div>
  );
}
