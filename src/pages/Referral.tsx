import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Header from '@/components/Header';
import {
  Gift, Copy, Check, Users, Share2, Trophy, ChevronLeft,
  Star, Zap, Calendar, Clock, CheckCircle2,
  Crown, Sparkles, ShieldCheck
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';

interface ReferralEntry {
  id: string;
  display_name: string | null;
  phone: string | null;
  created_at: any;
  has_purchased: boolean;
  purchases_count: number;
  reward_days_earned: number;
  plan?: string;
}

const SITE_URL = 'https://revontechtv.online';

// Reward milestone tiers based on friend purchases
const PURCHASE_TIERS = [
  { purchases: 1,  reward: '+1 - 15 Siku', label: 'Ununuzi wa 1', desc: 'Siku za bure papo hapo kwa kila kifurushi', icon: Zap,      color: 'text-primary',    bg: 'bg-primary/10',    border: 'border-primary/30' },
  { purchases: 3,  reward: 'Bonasi VIP',   label: 'Ununuzi 3',    desc: 'Ufikiaji wa vipindi vyote vya VIP', icon: Star,     color: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-400/30' },
  { purchases: 5,  reward: '+Wiki 1 Bure', label: 'Ununuzi 5',    desc: 'Wiki nzima ya ziada bila malipo',  icon: Trophy,   color: 'text-purple-400', bg: 'bg-purple-400/10', border: 'border-purple-400/30' },
  { purchases: 10, reward: '+Mwezi 1 Bure',label: 'Ununuzi 10',   desc: 'Mwezi mzima bila kikomo',           icon: Crown,    color: 'text-green-400',  bg: 'bg-green-400/10',  border: 'border-green-400/30' },
];

export default function Referral() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [referrals, setReferrals] = useState<ReferralEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [codeCopied, setCodeCopied] = useState(false);
  const [activating, setActivating] = useState(false);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    if (profile?.referral_code) fetchReferrals();
    else setLoading(false);
  }, [profile, user]);

  const fetchReferrals = async () => {
    if (!profile?.referral_code) return;
    setLoading(true);
    try {
      // 1. Fetch profiles of users who signed up with this referral code
      const q = query(collection(db, 'profiles'), where('referred_by', '==', profile.referral_code));
      const snap = await getDocs(q);

      // 2. Read buyers tracking from profile and referrer's referral subscriptions
      const buyersMap: Record<string, any> = (profile as any)?.referred_buyers || {};

      // Also check referrer's own referral-reward subscriptions to tally all granted rewards
      let subRewardMap: Record<string, { count: number; days: number }> = {};
      try {
        const subsQ = query(
          collection(db, 'subscriptions'),
          where('user_id', '==', user!.uid),
          where('gateway', '==', 'referral')
        );
        const subsSnap = await getDocs(subsQ);
        subsSnap.forEach(sDoc => {
          const sData = sDoc.data() as any;
          const buyerId = sData.buyer_id;
          if (buyerId) {
            if (!subRewardMap[buyerId]) subRewardMap[buyerId] = { count: 0, days: 0 };
            subRewardMap[buyerId].count += 1;
            subRewardMap[buyerId].days += (sData.duration_days || 1);
          }
        });
      } catch (subErr) {
        console.warn('Could not load referral subscriptions:', subErr);
      }

      const list: ReferralEntry[] = snap.docs.map(d => {
        const pData = d.data() as any;
        const buyerInfo = buyersMap[d.id];
        const subInfo = subRewardMap[d.id];

        const purchasesCount = Math.max(buyerInfo?.purchases_count || 0, subInfo?.count || 0);
        const rewardDays = Math.max(buyerInfo?.reward_days_earned || 0, subInfo?.days || 0);
        const hasPurchased = purchasesCount > 0 || rewardDays > 0;

        return {
          id: d.id,
          display_name: pData.display_name || null,
          phone: pData.phone || null,
          created_at: pData.created_at,
          has_purchased: hasPurchased,
          purchases_count: purchasesCount,
          reward_days_earned: rewardDays,
          plan: buyerInfo?.plan || undefined
        };
      });

      // Sort: purchasing friends first, then newest registered
      list.sort((a, b) => {
        if (a.has_purchased && !b.has_purchased) return -1;
        if (!a.has_purchased && b.has_purchased) return 1;
        const getMs = (v: any) => {
          if (!v) return 0;
          if (typeof v.toMillis === 'function') return v.toMillis();
          if (typeof v.toDate === 'function') return v.toDate().getTime();
          return new Date(v).getTime() || 0;
        };
        return getMs(b.created_at) - getMs(a.created_at);
      });

      setReferrals(list);
    } catch (e) {
      console.error('Error fetching referrals:', e);
    }
    setLoading(false);
  };

  const shareUrl = profile?.referral_code ? `${SITE_URL}/login?ref=${profile.referral_code}` : '';
  const waText = encodeURIComponent(
    `🎬 Jiunge na *Revontech TV* — tazama Mpira LIVE, Vipindi na Filamu zote!\n\nJisajili kupitia kiungo hiki:\n${shareUrl}`
  );

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCodeCopied(true);
      toast({ title: 'Kiungo kimekopwa!', description: shareUrl, className: 'bg-green-500 text-white font-bold' });
      setTimeout(() => setCodeCopied(false), 2500);
    });
  };

  const handleShare = () => {
    const text = `🎬 Jiunge na Revontech TV — tazama Mpira LIVE, Vipindi na Filamu zote!\n\nJisajili kupitia kiungo changu:\n${shareUrl}`;
    if (navigator.share) {
      navigator.share({ title: 'Jiunge Revontech TV', text, url: shareUrl }).catch(() => {});
    } else {
      navigator.clipboard.writeText(text);
      toast({ title: 'Ujumbe umekopwa', description: 'Weka kwenye WhatsApp au SMS.', className: 'bg-green-500 text-white font-bold' });
    }
  };

  // Stats calculations
  const totalRegistered = referrals.length;
  const payingFriendsCount = referrals.filter(r => r.has_purchased).length;
  const totalPurchasesMade = referrals.reduce((acc, r) => acc + (r.purchases_count || 0), 0);
  const totalRewardDaysEarned = (profile as any)?.referral_reward_days || referrals.reduce((acc, r) => acc + (r.reward_days_earned || 0), 0);

  // Expiry & active subscription calculation
  const rawExpiresAt = (profile as any)?.expires_at;
  const expiryDate = rawExpiresAt
    ? (typeof rawExpiresAt.toDate === 'function' ? rawExpiresAt.toDate() : new Date(rawExpiresAt))
    : null;
  const isSubActive = !!profile?.is_active && expiryDate && expiryDate > new Date();
  const daysRemaining = expiryDate && isSubActive ? Math.ceil((expiryDate.getTime() - Date.now()) / 86400000) : 0;

  // Next tier calculation
  const nextTier = PURCHASE_TIERS.find(t => t.purchases > totalPurchasesMade);
  const progressPct = nextTier 
    ? Math.min(100, (totalPurchasesMade / nextTier.purchases) * 100) 
    : 100;

  const formatDate = (v: any) => {
    if (!v) return '—';
    const d = typeof v.toDate === 'function' ? v.toDate() : new Date(v);
    return d.toLocaleDateString('sw-TZ', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  // Manual activate button if user has earned reward days but profile is not currently marked active
  const handleActivateReward = async () => {
    if (!user || totalRewardDaysEarned <= 0) return;
    setActivating(true);
    try {
      const now = new Date();
      let baseDate = now;
      if (expiryDate && expiryDate > now) {
        baseDate = expiryDate;
      }
      const newExp = new Date(baseDate.getTime() + (totalRewardDaysEarned * 24 * 60 * 60 * 1000));

      await updateDoc(doc(db, 'profiles', user.uid), {
        is_active: true,
        plan: 'Referral VIP',
        expires_at: newExp.toISOString()
      });

      await refreshProfile();
      toast({
        title: 'Kifurushi Kimewashwa!',
        description: `Umepata siku ${totalRewardDaysEarned} za bure za kutazama vipindi vyote.`,
        className: 'bg-green-500 text-white font-bold'
      });
    } catch (e: any) {
      toast({ title: 'Hitilafu', description: e.message || 'Haikuweza kuwezesha kifurushi.', variant: 'destructive' });
    }
    setActivating(false);
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background pb-24">
      <Header />

      {/* Sticky Top Bar */}
      <div className="sticky top-[61px] z-30 bg-background/95 backdrop-blur-sm border-b border-border px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate('/profile')} className="p-1.5 rounded-full hover:bg-muted transition-colors text-muted-foreground">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-base font-black text-foreground leading-none">Referral & Earn</h1>
          <p className="text-[11px] text-muted-foreground mt-0.5">Zawadi za bure marafiki wanaponunua vifurushi</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5 bg-primary/10 border border-primary/30 rounded-full px-3 py-1">
          <Gift className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-black text-primary">+{totalRewardDaysEarned}d Bure</span>
        </div>
      </div>

      <div className="px-4 py-5 max-w-lg mx-auto space-y-4">

        {/* ── RULE HIGHLIGHT BANNER ── */}
        <div className="relative overflow-hidden bg-gradient-to-br from-primary/20 via-card to-background border border-primary/40 rounded-3xl p-5 shadow-lg">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center text-primary-foreground flex-shrink-0 shadow-lg shadow-primary/30">
              <Gift className="w-5 h-5" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-sm font-black text-foreground tracking-tight">
                Pata Kifurushi cha Bure Rafiki Anaponunua!
              </h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Hupati kifurushi cha bure kwa akaunti za kujiunga bure tu. Unazawadiwa mara tu rafiki yako <strong className="text-primary font-bold">anaponunua kifurushi</strong> chochote. Na kila anaponunua zaidi na zaidi, unaendelea kuongezewa siku za bure!
              </p>
            </div>
          </div>
        </div>

        {/* ── ACTIVE SUBSCRIPTION / REWARD STATUS ── */}
        <div className="bg-card border border-border rounded-2xl p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
              isSubActive ? 'bg-green-500/10 text-green-400 border border-green-500/30' : 'bg-muted text-muted-foreground'
            }`}>
              {isSubActive ? <ShieldCheck className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-black text-foreground">
                {isSubActive ? 'Kifurushi Chako Kinafanya Kazi' : 'Kifurushi Hakijawashwa'}
              </p>
              <p className="text-[11px] text-muted-foreground truncate">
                {isSubActive 
                  ? `Zimebaki siku ${daysRemaining} (inaisha ${formatDate(expiryDate)})` 
                  : totalRewardDaysEarned > 0 
                    ? `Una siku ${totalRewardDaysEarned} za zawadi tayari kutumika!`
                    : 'Alika marafiki wanunue vifurushi ili upate siku za bure.'}
              </p>
            </div>
          </div>
          {!isSubActive && totalRewardDaysEarned > 0 && (
            <Button
              onClick={handleActivateReward}
              disabled={activating}
              size="sm"
              className="bg-primary text-primary-foreground font-black text-xs h-8 px-3 rounded-xl glow-primary"
            >
              {activating ? 'Inawasha...' : 'Washa Sasa'}
            </Button>
          )}
        </div>

        {/* ── STATS ROW ── */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-card border border-border rounded-2xl p-3.5 text-center">
            <p className="text-2xl font-black text-foreground">{totalRegistered}</p>
            <p className="text-[10px] text-muted-foreground font-bold mt-0.5 leading-tight">Waliojiunga</p>
            <span className="inline-block mt-1 text-[9px] text-muted-foreground/80 font-medium">Bure</span>
          </div>
          <div className="bg-card border border-primary/30 rounded-2xl p-3.5 text-center bg-primary/5">
            <p className="text-2xl font-black text-primary">{totalPurchasesMade}</p>
            <p className="text-[10px] text-primary font-bold mt-0.5 leading-tight">Vifurushi Vilivyonunuliwa</p>
            <span className="inline-block mt-1 text-[9px] text-primary font-bold">{payingFriendsCount} Wateja</span>
          </div>
          <div className="bg-card border border-green-500/30 rounded-2xl p-3.5 text-center bg-green-500/5">
            <p className="text-2xl font-black text-green-400">+{totalRewardDaysEarned}d</p>
            <p className="text-[10px] text-green-400 font-bold mt-0.5 leading-tight">Siku Zilizopatikana</p>
            <span className="inline-block mt-1 text-[9px] text-green-500/80 font-medium">Za Bure</span>
          </div>
        </div>

        {/* ── PROGRESS TO NEXT MILESTONE ── */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <p className="text-xs font-black text-foreground uppercase tracking-wider">Maendeleo ya Manunuzi</p>
            </div>
            {nextTier && (
              <p className="text-[10px] text-muted-foreground">
                Bado ununuzi <span className="text-primary font-black">{nextTier.purchases - totalPurchasesMade}</span> → {nextTier.reward}
              </p>
            )}
          </div>
          <div className="w-full bg-muted rounded-full h-3 overflow-hidden mb-2">
            <div
              className="h-full bg-primary rounded-full transition-all duration-700 relative overflow-hidden"
              style={{ width: `${progressPct}%` }}
            >
              <div className="absolute inset-0 bg-white/20 animate-pulse rounded-full" />
            </div>
          </div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>{totalPurchasesMade} ununuzi umefanyika</span>
            <span className="text-primary font-black">
              {nextTier ? `Lengo: ${nextTier.purchases} ununuzi` : '✓ Umetimiza ngazi zote za juu!'}
            </span>
          </div>
        </div>

        {/* ── MILESTONE TIERS ── */}
        <div>
          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider mb-2 px-1">Ngazi za Zawadi kwa Manunuzi</p>
          <div className="grid grid-cols-4 gap-1.5">
            {PURCHASE_TIERS.map(tier => {
              const Icon = tier.icon;
              const earned = totalPurchasesMade >= tier.purchases;
              return (
                <div
                  key={tier.purchases}
                  className={`rounded-2xl p-2.5 text-center border transition-all ${
                    earned
                      ? `${tier.bg} ${tier.border} shadow-sm`
                      : 'bg-muted/40 border-border opacity-60'
                  }`}
                >
                  <Icon className={`w-4 h-4 mx-auto mb-1 ${earned ? tier.color : 'text-muted-foreground'}`} />
                  <p className={`text-[10px] font-black leading-none ${earned ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {tier.label}
                  </p>
                  <p className={`text-[9px] font-bold mt-1 ${earned ? tier.color : 'text-muted-foreground'}`}>
                    {tier.reward}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── REFERRAL LINK BOX ── */}
        <div className="bg-card border border-primary/30 rounded-2xl overflow-hidden">
          <div className="bg-primary/10 px-4 py-3 flex items-center gap-2 border-b border-border">
            <Gift className="w-4 h-4 text-primary" />
            <p className="text-xs font-black text-foreground">Kiungo Chako cha Mwaliko</p>
          </div>
          <div className="p-4 space-y-3">
            {/* URL display */}
            <div className="bg-muted rounded-xl border border-border overflow-hidden">
              <div className="px-3 py-1.5 border-b border-border">
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-bold">Kiungo cha Kushiriki</p>
              </div>
              <div className="flex items-center">
                <p className="flex-1 px-3 py-2.5 text-xs font-mono text-primary break-all leading-relaxed">
                  {shareUrl}
                </p>
                <button
                  onClick={handleCopy}
                  className="flex-shrink-0 flex flex-col items-center justify-center gap-0.5 w-14 py-2.5 bg-primary/10 hover:bg-primary/20 transition-colors text-primary border-l border-border self-stretch"
                >
                  {codeCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span className="text-[9px] font-black">{codeCopied ? 'Kopwa' : 'Nakili'}</span>
                </button>
              </div>
            </div>

            {/* Code badge */}
            <div className="flex items-center justify-between bg-muted/50 rounded-xl px-3 py-2">
              <span className="text-[10px] text-muted-foreground font-bold">Code yako:</span>
              <span className="font-mono font-black text-sm text-primary tracking-[0.2em] bg-primary/10 px-3 py-1 rounded-lg">
                {profile?.referral_code}
              </span>
            </div>

            {/* Share buttons */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <a
                href={`https://wa.me/?text=${waText}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 py-3 rounded-xl bg-green-500/10 hover:bg-green-500/20 text-green-500 font-bold text-sm border border-green-500/20 transition-colors"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4 flex-shrink-0" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
                </svg>
                WhatsApp
              </a>
              <button
                onClick={handleShare}
                className="flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm transition-colors glow-primary"
              >
                <Share2 className="w-4 h-4" /> Shiriki Sasa
              </button>
            </div>
          </div>
        </div>

        {/* ── HOW IT WORKS ── */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="text-xs font-black text-foreground uppercase tracking-wider mb-3">Jinsi Inavyofanya Kazi</p>
          <div className="space-y-3.5">
            {[
              { 
                num: '1', 
                title: 'Shiriki Kiungo Chako', 
                text: 'Tuma kiungo chako cha mwaliko kwa marafiki kupitia WhatsApp, SMS au mitandao ya kijamii.' 
              },
              { 
                num: '2', 
                title: 'Rafiki Anajisajili', 
                text: 'Rafiki yako anafungua akaunti ya RevonTV kupitia kiungo chako.' 
              },
              { 
                num: '3', 
                title: 'Rafiki Anaponunua Kifurushi', 
                text: 'Kujiunga bure hakukupi kifurushi cha bure. Mara tu rafiki anaponunua kifurushi chochote, wewe unapata siku za bure mara moja!' 
              },
              { 
                num: '4', 
                title: 'Zawadi Kila Anaponunua Tena', 
                text: 'Kila wakati rafiki yako anaponunua tena vifurushi zaidi, wewe unaendelea kupewa siku za ziada za bure bila kikomo!' 
              },
            ].map(step => (
              <div key={step.num} className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-[10px] font-black text-primary-foreground flex-shrink-0 mt-0.5">
                  {step.num}
                </div>
                <div className="space-y-0.5">
                  <p className="text-xs font-black text-foreground">{step.title}</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{step.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── REFERRED FRIENDS LIST ── */}
        <div>
          <div className="flex items-center justify-between mb-2.5 px-1">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">
                Marafiki Waliojiunga ({referrals.length})
              </p>
            </div>
            <span className="text-[10px] font-black text-primary bg-primary/10 px-2.5 py-0.5 rounded-full">
              {payingFriendsCount} Walionunua
            </span>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-14 bg-muted rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : referrals.length === 0 ? (
            <div className="bg-card border border-border rounded-2xl p-8 text-center">
              <Users className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm font-bold text-muted-foreground">Bado hakuna marafiki waliojiunga</p>
              <p className="text-xs text-muted-foreground mt-1">Shiriki kiungo chako ili marafiki wanunue vifurushi na upate siku za bure!</p>
              <button
                onClick={handleShare}
                className="mt-4 flex items-center gap-2 mx-auto py-2 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-black glow-primary"
              >
                <Share2 className="w-3.5 h-3.5" /> Shiriki Sasa
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {referrals.map((r, i) => (
                <div
                  key={r.id}
                  className={`flex items-center gap-3 bg-card border rounded-2xl px-4 py-3 transition-colors ${
                    r.has_purchased ? 'border-green-500/30 bg-green-500/5' : 'border-border'
                  }`}
                >
                  {/* Number / Status Icon */}
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black flex-shrink-0 ${
                    r.has_purchased
                      ? 'bg-green-500 text-white shadow-sm'
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    {r.has_purchased ? '✓' : i + 1}
                  </div>

                  {/* Name & Date */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">
                      {r.display_name || 'Mteja'}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Alijiunga: {formatDate(r.created_at)}
                    </p>
                  </div>

                  {/* Purchase Status Badge */}
                  {r.has_purchased ? (
                    <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                      <div className="flex items-center gap-1 bg-green-500/20 border border-green-500/30 rounded-full px-2.5 py-0.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                        <span className="text-[10px] font-black text-green-400">
                          Amenunua ({r.purchases_count}x)
                        </span>
                      </div>
                      <span className="text-[9px] font-bold text-primary">
                        +{r.reward_days_earned} siku bure kwako
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 bg-amber-500/10 border border-amber-500/30 rounded-full px-2.5 py-0.5 flex-shrink-0">
                      <Clock className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-[9px] font-bold text-amber-400">
                        Bado hajanunua
                      </span>
                    </div>
                  )}
                </div>
              ))}

              {/* Summary message footer */}
              {referrals.length > 0 && (
                <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 text-xs text-muted-foreground space-y-1">
                  <div className="flex items-center justify-between font-bold text-foreground">
                    <span>Jumla ya Manunuzi: {totalPurchasesMade}</span>
                    <span className="text-primary font-black">+{totalRewardDaysEarned} Siku Zimepatikana</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Kila rafiki aliyesajiliwa anaponunua au kuongeza kifurushi, mfumo unaongeza siku zako za bure kiotomatiki.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
