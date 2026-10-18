import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AdminLayout from '@/components/AdminLayout';
import { Gift, Users, Trophy, Search, RefreshCw, ChevronRight, DollarSign, CheckCircle2, XCircle } from 'lucide-react';

interface ReferrerProfile {
  id: string;
  display_name: string | null;
  phone: string | null;
  referral_code: string;
  referral_count: number;
  reward_claimed: number;
  pending_commissions?: number;
}

interface ReferralEntry {
  id: string;
  display_name: string | null;
  phone: string | null;
  referred_by: string;
  created_at: any;
  has_purchased?: boolean;
  total_spent?: number;
}

export default function AdminReferrals() {
  const [referrers, setReferrers] = useState<ReferrerProfile[]>([]);
  const [referralMap, setReferralMap] = useState<Record<string, ReferralEntry[]>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'profiles'));
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));

      // Fetch all subscriptions to determine purchase status
      const subsSnap = await getDocs(collection(db, 'subscriptions'));
      const subscriptions = subsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

      // Build a map of user purchases: userId => { has_purchased, total_spent }
      const purchaseMap: Record<string, { has_purchased: boolean; total_spent: number }> = {};
      subscriptions.forEach((sub: any) => {
        // Only count paid subscriptions (not referral rewards)
        if (sub.gateway !== 'referral' && sub.amount > 0 && sub.status === 'active') {
          const userId = sub.user_id;
          if (!purchaseMap[userId]) {
            purchaseMap[userId] = { has_purchased: true, total_spent: 0 };
          }
          purchaseMap[userId].total_spent += sub.amount;
        }
      });

      // Referrers = profiles with a referral_code and at least 0 referral_count
      const referrerList: ReferrerProfile[] = all
        .filter((p: any) => p.referral_code)
        .map((p: any) => ({
          id: p.id,
          display_name: p.display_name || null,
          phone: p.phone || null,
          referral_code: p.referral_code,
          referral_count: p.referral_count || 0,
          reward_claimed: p.reward_claimed || 0,
          pending_commissions: p.pending_commissions || 0,
        }))
        .sort((a: ReferrerProfile, b: ReferrerProfile) => b.referral_count - a.referral_count);

      // Build a map: referral_code ΓåÆ list of referred users
      const map: Record<string, ReferralEntry[]> = {};
      all
        .filter((p: any) => p.referred_by)
        .forEach((p: any) => {
          const code = p.referred_by;
          if (!map[code]) map[code] = [];
          const userPurchaseInfo = purchaseMap[p.id] || { has_purchased: false, total_spent: 0 };
          map[code].push({
            id: p.id,
            display_name: p.display_name || null,
            phone: p.phone || null,
            referred_by: code,
            created_at: p.created_at,
            has_purchased: userPurchaseInfo.has_purchased,
            total_spent: userPurchaseInfo.total_spent,
          });
        });

      setReferrers(referrerList);
      setReferralMap(map);
    } catch (e) {
      console.error('Error fetching referrals:', e);
    }
    setLoading(false);
  };

  const filtered = referrers.filter(r =>
    !search ||
    (r.display_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (r.phone || '').includes(search) ||
    r.referral_code.toLowerCase().includes(search.toLowerCase())
  );

  const totalReferrals = referrers.reduce((s, r) => s + r.referral_count, 0);
  const totalRewards = referrers.reduce((s, r) => s + r.reward_claimed, 0);
  const totalCommissions = referrers.reduce((s, r) => s + (r.pending_commissions || 0), 0);
  const activeReferrers = referrers.filter(r => r.referral_count > 0).length;

  return (
    <AdminLayout>
      <div className="max-w-4xl">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-foreground mb-1">Referral System</h1>
          <p className="text-muted-foreground text-sm">Monitor all referrals and earned rewards.</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          <div className="bg-card border border-border rounded-2xl p-4 text-center">
            <Users className="w-5 h-5 text-primary mx-auto mb-1" />
            <p className="text-2xl font-black text-foreground">{activeReferrers}</p>
            <p className="text-xs text-muted-foreground">Active Referrers</p>
          </div>
          <div className="bg-card border border-border rounded-2xl p-4 text-center">
            <Gift className="w-5 h-5 text-green-400 mx-auto mb-1" />
            <p className="text-2xl font-black text-foreground">{totalReferrals}</p>
            <p className="text-xs text-muted-foreground">Total Referrals</p>
          </div>
          <div className="bg-card border border-border rounded-2xl p-4 text-center">
            <DollarSign className="w-5 h-5 text-blue-400 mx-auto mb-1" />
            <p className="text-2xl font-black text-foreground">{totalCommissions.toLocaleString()} TZS</p>
            <p className="text-xs text-muted-foreground">Pending Commissions</p>
          </div>
          <div className="bg-card border border-border rounded-2xl p-4 text-center">
            <Trophy className="w-5 h-5 text-yellow-400 mx-auto mb-1" />
            <p className="text-2xl font-black text-foreground">{totalRewards}</p>
            <p className="text-xs text-muted-foreground">Rewards Given</p>
          </div>
        </div>

        {/* Search + Refresh */}
        <div className="flex gap-2 mb-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tafuta kwa jina, simu au code..."
              className="w-full bg-card border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm text-foreground focus:border-primary outline-none"
            />
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="p-2.5 bg-card border border-border rounded-xl hover:bg-muted transition-colors text-muted-foreground"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-16 text-muted-foreground">
            <RefreshCw className="w-6 h-6 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Gift className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Hakuna referrers bado.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(r => {
              const refs = referralMap[r.referral_code] || [];
              const isOpen = expanded === r.id;
              return (
                <div key={r.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                  <button
                    onClick={() => setExpanded(isOpen ? null : r.id)}
                    className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/40 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-xs font-black text-primary flex-shrink-0">
                      {(r.display_name || 'U')[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-foreground truncate">{r.display_name || 'Unknown'}</p>
                      <p className="text-xs text-muted-foreground">{r.phone || '—'} · Code: <span className="font-mono text-primary">{r.referral_code}</span></p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className="text-center">
                        <p className="font-black text-sm text-foreground">{r.referral_count}</p>
                        <p className="text-[10px] text-muted-foreground">Referrals</p>
                      </div>
                      {(r.pending_commissions || 0) > 0 && (
                        <div className="flex items-center gap-1 bg-blue-400/10 border border-blue-400/20 rounded-full px-2 py-0.5">
                          <DollarSign className="w-3 h-3 text-blue-400" />
                          <span className="text-[10px] font-black text-blue-400">{(r.pending_commissions || 0).toLocaleString()}</span>
                        </div>
                      )}
                      {r.reward_claimed > 0 && (
                        <div className="flex items-center gap-1 bg-yellow-400/10 border border-yellow-400/20 rounded-full px-2 py-0.5">
                          <Trophy className="w-3 h-3 text-yellow-400" />
                          <span className="text-[10px] font-black text-yellow-400">{r.reward_claimed}x</span>
                        </div>
                      )}
                      <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-border px-4 pb-4 pt-3">
                      {refs.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">Hakuna marafiki waliojisajili bado kwa code hii.</p>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-2">Marafiki Waliojisajili ({refs.length})</p>
                          {refs.map((entry, i) => (
                            <div key={entry.id} className="flex items-center gap-2 text-xs bg-muted/40 rounded-lg px-3 py-2">
                              <span className="w-4 text-muted-foreground font-bold">{i + 1}.</span>
                              <span className="font-bold text-foreground truncate flex-1">{entry.display_name || 'User'}</span>
                              <span className="text-muted-foreground">{entry.phone || '—'}</span>
                              {entry.has_purchased ? (
                                <div className="flex items-center gap-1 bg-green-400/10 border border-green-400/20 rounded-full px-2 py-0.5" title={`Total spent: ${entry.total_spent?.toLocaleString()} TZS`}>
                                  <CheckCircle2 className="w-3 h-3 text-green-400" />
                                  <span className="text-[10px] font-black text-green-400">{entry.total_spent?.toLocaleString()}</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1 bg-red-400/10 border border-red-400/20 rounded-full px-2 py-0.5" title="No purchase yet">
                                  <XCircle className="w-3 h-3 text-red-400" />
                                  <span className="text-[10px] font-black text-red-400">No Purchase</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
