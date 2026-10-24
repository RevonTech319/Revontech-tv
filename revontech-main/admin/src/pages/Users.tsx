import { useState, useEffect } from 'react';
import { collection, query, orderBy, getDocs, updateDoc, doc, addDoc, deleteDoc, where, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AdminLayout from '@/components/AdminLayout';
import { Users, Calendar, CheckCircle, XCircle, Crown, Phone, Search, Plus, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Profile {
  id: string; 
  user_id: string; 
  display_name: string | null;
  avatar_url: string | null; 
  plan: string; 
  created_at: any;
  phone: string | null; 
  is_active: boolean;
}

interface Subscription {
  id: string; 
  user_id: string; 
  plan: string; 
  status: string;
  expires_at: any; 
  amount: number; 
  created_at: any;
  plan_label?: string;
}

interface PlanOpt { plan_key: string; name: string; amount: number; duration_days: number }

const planLabels: Record<string, string> = { day: 'Siku 1', week: 'Wiki 1', week2: 'Wiki 2', month: 'Mwezi 1', free: 'Bure' };
const planDays: Record<string, number> = { day: 1, week: 7, week2: 14, month: 30 };
const planAmounts: Record<string, number> = { day: 1000, week: 2500, week2: 5000, month: 10000 };

export default function AdminUsers() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Profile | null>(null);
  const [approving, setApproving] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [approvePlan, setApprovePlan] = useState('month');
  const [plans, setPlans] = useState<PlanOpt[]>([]);
  const [grantMode, setGrantMode] = useState<'plan' | 'custom'>('plan');
  const [customDays, setCustomDays] = useState('');
  const [stackOnCurrent, setStackOnCurrent] = useState(false);
  const { toast } = useToast();

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    try {
      const pSnap = await getDocs(collection(db, 'profiles'));
      const sSnap = await getDocs(collection(db, 'subscriptions'));
      try {
        const plSnap = await getDocs(collection(db, 'plans'));
        const pl = plSnap.docs
          .map((d) => d.data() as any)
          .filter((x) => x.active !== false && x.plan_key && Number(x.duration_days) > 0)
          .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
          .map((x) => ({ plan_key: x.plan_key, name: x.name || x.plan_key, amount: Number(x.amount) || 0, duration_days: Number(x.duration_days) }));
        setPlans(pl);
        if (pl.length && !pl.some((x) => x.plan_key === approvePlan)) setApprovePlan(pl[0].plan_key);
      } catch { /* fall back to built-in list */ }

      const pData = pSnap.docs.map(d => ({ id: d.id, ...d.data() } as Profile));
      const sData = sSnap.docs.map(d => ({ id: d.id, ...d.data() } as Subscription));

      // Sort in JS to prevent missing field index issues
      pData.sort((a, b) => {
        const da = a.created_at?.toDate ? a.created_at.toDate().getTime() : (new Date(a.created_at).getTime() || 0);
        const dbTime = b.created_at?.toDate ? b.created_at.toDate().getTime() : (new Date(b.created_at).getTime() || 0);
        return dbTime - da;
      });

      sData.sort((a, b) => {
        const da = a.created_at?.toDate ? a.created_at.toDate().getTime() : (new Date(a.created_at).getTime() || 0);
        const dbTime = b.created_at?.toDate ? b.created_at.toDate().getTime() : (new Date(b.created_at).getTime() || 0);
        return dbTime - da;
      });
      
      setProfiles(pData);
      setSubscriptions(sData);
    } catch (error) {
      console.error("Error fetching users:", error);
    }
    setLoading(false);
  };

  const toggleActive = async (p: Profile) => {
    try {
      await updateDoc(doc(db, 'profiles', p.id), { is_active: !p.is_active });
      setProfiles((prev) => prev.map((x) => x.id === p.id ? { ...x, is_active: !p.is_active } : x));
      if (selected?.id === p.id) setSelected({ ...selected, is_active: !p.is_active });
    } catch (error) {
      console.error("Error toggling user status:", error);
    }
  };

  const planOptions: PlanOpt[] = plans.length
    ? plans
    : Object.keys(planDays).map((k) => ({ plan_key: k, name: planLabels[k], amount: planAmounts[k], duration_days: planDays[k] }));

  const subLabel = (s: { plan: string; plan_label?: string }) =>
    s.plan_label || planLabels[s.plan] || plans.find((x) => x.plan_key === s.plan)?.name || s.plan;

  const approveSubscription = async (p: Profile) => {
    let days: number;
    let key: string;
    let label: string;
    let amount: number;

    if (grantMode === 'custom') {
      days = Math.floor(Number(customDays));
      if (!Number.isFinite(days) || days < 1 || days > 3650) {
        toast({ title: 'Idadi ya siku si sahihi', description: 'Weka siku kati ya 1 na 3650.', variant: 'destructive' });
        return;
      }
      key = 'custom';
      label = `Siku ${days}`;
      amount = 0;
    } else {
      const opt = planOptions.find((x) => x.plan_key === approvePlan);
      days = opt?.duration_days || planDays[approvePlan] || 30;
      key = approvePlan;
      label = opt?.name || planLabels[approvePlan] || approvePlan;
      amount = opt?.amount ?? planAmounts[approvePlan] ?? 0;
    }

    setApproving(p.user_id);
    const now = new Date();
    const current = getActiveSub(p.user_id);
    const start = stackOnCurrent && current?.expires_at ? new Date(current.expires_at) : now;
    const expires = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);

    try {
      await addDoc(collection(db, 'subscriptions'), {
        user_id: p.user_id,
        plan: key,
        plan_label: label,
        duration_days: days,
        status: 'active',
        amount,
        starts_at: start.toISOString(),
        expires_at: expires.toISOString(),
        phone: p.phone,
        is_manual: true,
        gateway: 'manual',
        created_at: serverTimestamp()
      });

      await updateDoc(doc(db, 'profiles', p.id), { plan: key, is_active: true });
      await fetchAll();
      setCustomDays('');
      toast({ title: '✅ Imefanikiwa', description: `${label} (${days} siku) imetolewa. Inaisha ${expires.toLocaleDateString('en-GB')}.` });
    } catch (error: any) {
      console.error("Error approving subscription:", error);
      toast({
        title: '❌ Hitilafu',
        description: error?.message || 'Haikuweza kutoa kifurushi. Angalia rules za Firestore.',
        variant: 'destructive'
      });
    }
    setApproving(null);
  };
  
  const deleteUser = async (p: Profile) => {
    const targetName = p.display_name || p.phone || 'mtumiaji huyu';
    if (!window.confirm(`FUTA MTUMIAJI: Una uhakika unataka kumfuta kabisa "${targetName}"? Data na vifurushi vyake vyote vitaondolewa Firestore.`)) {
      return;
    }
    
    setDeleting(p.user_id);
    try {
      // Delete profile
      await deleteDoc(doc(db, 'profiles', p.id));
      
      // Delete user's subscriptions (simplified, ideally delete all matches)
      const subsToDelete = subscriptions.filter(s => s.user_id === p.user_id);
      for (const s of subsToDelete) {
        await deleteDoc(doc(db, 'subscriptions', s.id));
      }
      
      toast({
        title: 'Mtumiaji Amefutwa (Firestore)',
        description: 'Data zimeondolewa. Futa pia akaunti yake kwenye Firebase Auth Console.',
        className: 'bg-green-500 text-white font-bold'
      });
      
      fetchAll();
    } catch (err: any) {
      toast({
        title: 'Hitilafu',
        description: err.message || 'Mtumiaji hakuweza kufutwa.',
        variant: 'destructive'
      });
    } finally {
      setDeleting(null);
    }
  };

  const getUserSubs = (userId: string) => subscriptions.filter((s) => s.user_id === userId);
  const getActiveSub = (userId: string) => subscriptions.find((s) => s.user_id === userId && s.status === 'active' && s.expires_at && new Date(s.expires_at) > new Date());

  const filtered = profiles.filter((p) => {
    const q = search.toLowerCase();
    return !q || (p.display_name || '').toLowerCase().includes(q) || (p.phone || '').includes(q);
  });

  const formatDate = (val: any) => {
    if (!val) return '—';
    const date = val.toDate ? val.toDate() : new Date(val);
    return date.toLocaleDateString();
  };

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-primary/10 rounded-xl">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-base font-black text-foreground">Watumiaji</h1>
            <p className="text-xs text-muted-foreground">{profiles.length} wote</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tafuta kwa jina au simu..."
          className="w-full bg-muted border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="cyber-card rounded-xl p-4 animate-pulse">
              <div className="flex gap-3">
                <div className="w-10 h-10 rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-muted rounded w-1/3" />
                  <div className="h-2 bg-muted rounded w-1/2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => {
            const activeSub = getActiveSub(p.user_id);
            const expiryDate = activeSub?.expires_at ? new Date(activeSub.expires_at) : null;
            return (
              <div key={p.id} className={`cyber-card rounded-xl p-3 ${!p.is_active ? 'opacity-60' : ''}`}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {p.avatar_url ? (
                      <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-primary font-black text-sm">{(p.display_name || 'U')[0].toUpperCase()}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-foreground truncate">{p.display_name || 'Mtumiaji'}</p>
                      {activeSub && <Crown className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />}
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Phone className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">{p.phone || '—'}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {activeSub ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">
                          {subLabel(activeSub)} · {expiryDate ? expiryDate.toLocaleDateString() : '—'}
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Bure</span>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        <Calendar className="w-3 h-3 inline mr-0.5" />
                        {formatDate(p.created_at)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col items-end gap-1.5">
                      <button
                        onClick={() => toggleActive(p)}
                        className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg transition-colors ${p.is_active ? 'bg-green-500/20 text-green-400 hover:bg-destructive/20 hover:text-destructive' : 'bg-destructive/20 text-destructive hover:bg-green-500/20 hover:text-green-400'}`}
                      >
                        {p.is_active ? <><CheckCircle className="w-3 h-3" /> Hai</> : <><XCircle className="w-3 h-3" /> Imezuiwa</>}
                      </button>
                      <button onClick={() => setSelected(selected?.user_id === p.user_id ? null : p)} className="text-[10px] text-primary hover:underline font-bold">
                        {selected?.user_id === p.user_id ? 'Ficha' : 'Maelezo'}
                      </button>
                    </div>
                    <button
                      onClick={() => deleteUser(p)}
                      disabled={deleting === p.user_id}
                      title="Futa Mtumiaji Kabisa"
                      aria-label="Futa Mtumiaji"
                      className="p-2 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive hover:text-white border border-destructive/20 transition-all flex items-center justify-center flex-shrink-0 disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {selected?.user_id === p.user_id && (
                  <div className="mt-3 pt-3 border-t border-border/50 space-y-3">
                    <div className="bg-primary/5 border border-primary/20 rounded-xl p-3">
                      <p className="text-xs font-black text-primary uppercase tracking-widest mb-2">✅ Idhini Usajili Mkononi</p>
                      <div className="grid grid-cols-2 gap-1 p-1 mb-2 rounded-lg bg-muted">
                        {([['plan', 'Chagua kifurushi'], ['custom', 'Siku maalum']] as const).map(([m, l]) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setGrantMode(m)}
                            className={`py-1.5 rounded-md text-xs font-bold transition-colors ${grantMode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
                          >
                            {l}
                          </button>
                        ))}
                      </div>

                      {grantMode === 'plan' ? (
                        <select
                          value={approvePlan}
                          onChange={(e) => setApprovePlan(e.target.value)}
                          className="w-full bg-muted border border-border rounded-lg px-2 py-2 text-xs text-foreground"
                        >
                          {planOptions.map((o) => (
                            <option key={o.plan_key} value={o.plan_key}>
                              {o.name} — {o.duration_days} siku — TZS {o.amount.toLocaleString()}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              inputMode="numeric"
                              min={1}
                              max={3650}
                              value={customDays}
                              onChange={(e) => setCustomDays(e.target.value)}
                              placeholder="Idadi ya siku (mf. 5)"
                              className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                            />
                            <span className="text-xs font-bold text-muted-foreground">siku</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {[1, 2, 3, 5, 7, 10, 14, 30, 60, 90].map((n) => (
                              <button
                                key={n}
                                type="button"
                                onClick={() => setCustomDays(String(n))}
                                className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${customDays === String(n) ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground hover:bg-primary/20'}`}
                              >
                                {n}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {activeSub && (
                        <label className="flex items-center gap-2 mt-2 text-[11px] font-bold text-foreground cursor-pointer">
                          <input type="checkbox" checked={stackOnCurrent} onChange={(e) => setStackOnCurrent(e.target.checked)} className="w-4 h-4 accent-primary" />
                          Ongeza juu ya muda uliopo (anza pale kifurushi cha sasa kinapoisha)
                        </label>
                      )}

                      <button
                        onClick={() => approveSubscription(p)}
                        disabled={approving === p.user_id || (grantMode === 'custom' && !customDays)}
                        className="mt-3 flex w-full items-center justify-center gap-1.5 bg-primary text-primary-foreground text-xs font-black px-3 py-2.5 rounded-lg disabled:opacity-50"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        {approving === p.user_id ? '...' : grantMode === 'custom' && customDays ? `Mpe siku ${customDays}` : 'Idhini'}
                      </button>
                    </div>

                    <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">Historia ya Malipo</p>
                    {getUserSubs(p.user_id).length === 0 ? (
                      <p className="text-xs text-muted-foreground">Hakuna malipo bado</p>
                    ) : (
                      <div className="space-y-1.5">
                        {getUserSubs(p.user_id).map((s) => (
                          <div key={s.id} className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
                            <div>
                              <span className="text-xs font-bold text-foreground">{subLabel(s)}</span>
                              <span className="text-[10px] text-muted-foreground ml-2">TZS {s.amount.toLocaleString()}</span>
                            </div>
                            <div className="text-right">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${s.status === 'active' ? 'bg-green-500/20 text-green-400' : s.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-muted text-muted-foreground'}`}>
                                {s.status === 'active' ? 'Hai' : s.status === 'pending' ? 'Inasubiri' : 'Imekwisha'}
                              </span>
                              {s.expires_at && (
                                <p className="text-[9px] text-muted-foreground mt-0.5">Inaisha: {formatDate(s.expires_at)}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    <div className="pt-3 border-t border-destructive/20 mt-4">
                      <p className="text-[10px] font-black text-destructive uppercase tracking-widest mb-2">Danger Zone</p>
                      <button
                        onClick={() => deleteUser(p)}
                        disabled={deleting === p.user_id}
                        className="flex items-center gap-2 w-full justify-center bg-destructive/10 text-destructive border border-destructive/20 text-xs font-black px-4 py-2.5 rounded-xl hover:bg-destructive hover:text-white transition-all disabled:opacity-50"
                      >
                        <Trash2 className="w-4 h-4" />
                        {deleting === p.user_id ? 'Inafuta...' : 'FUTA MTUMIAJI KABISA'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Hakuna watumiaji wanaolingana</p>
            </div>
          )}
        </div>
      )}
    </AdminLayout>
  );
}
