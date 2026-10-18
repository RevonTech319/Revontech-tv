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
}

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
  const { toast } = useToast();

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    try {
      const pSnap = await getDocs(collection(db, 'profiles'));
      const sSnap = await getDocs(collection(db, 'subscriptions'));
      
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

  const approveSubscription = async (p: Profile) => {
    setApproving(p.user_id);
    const days = planDays[approvePlan] || 30;
    const now = new Date();
    const expires = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    
    try {
      await addDoc(collection(db, 'subscriptions'), {
        user_id: p.user_id,
        plan: approvePlan,
        status: 'active',
        amount: planAmounts[approvePlan] || 0,
        starts_at: now.toISOString(),
        expires_at: expires.toISOString(),
        phone: p.phone,
        is_manual: true,
        gateway: 'manual',
        created_at: serverTimestamp()
      });
      
      await updateDoc(doc(db, 'profiles', p.id), { plan: approvePlan, is_active: true });
      await fetchAll();
      toast({ title: '✅ Imefanikiwa', description: `Kifurushi cha ${planLabels[approvePlan] || approvePlan} kimetolewa!` });
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
                          {planLabels[activeSub.plan] || activeSub.plan} · {expiryDate ? expiryDate.toLocaleDateString() : '—'}
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
                      <div className="flex gap-2">
                        <select
                          value={approvePlan}
                          onChange={(e) => setApprovePlan(e.target.value)}
                          className="flex-1 bg-muted border border-border rounded-lg px-2 py-1.5 text-xs text-foreground"
                        >
                          <option value="day">Siku 1 — TZS 1,000</option>
                          <option value="week">Wiki 1 — TZS 2,500</option>
                          <option value="week2">Wiki 2 — TZS 5,000</option>
                          <option value="month">Mwezi 1 — TZS 10,000</option>
                        </select>
                        <button
                          onClick={() => approveSubscription(p)}
                          disabled={approving === p.user_id}
                          className="flex items-center gap-1 bg-primary text-primary-foreground text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-50"
                        >
                          <Plus className="w-3 h-3" />
                          {approving === p.user_id ? '...' : 'Idhini'}
                        </button>
                      </div>
                    </div>

                    <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">Historia ya Malipo</p>
                    {getUserSubs(p.user_id).length === 0 ? (
                      <p className="text-xs text-muted-foreground">Hakuna malipo bado</p>
                    ) : (
                      <div className="space-y-1.5">
                        {getUserSubs(p.user_id).map((s) => (
                          <div key={s.id} className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
                            <div>
                              <span className="text-xs font-bold text-foreground">{planLabels[s.plan] || s.plan}</span>
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
