import { useState, useEffect } from 'react';
import { collection, query, orderBy, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AdminLayout from '@/components/AdminLayout';
import { Plus, Trash2, Edit2, X, Star, Clock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

interface Plan {
  id: string;
  name: string;
  plan_key: string;
  amount: number;
  currency: string;
  duration_days: number;
  features: string[];
  popular: boolean;
  active: boolean;
  sort_order: number;
}

const emptyForm = {
  name: '',
  plan_key: '',
  amount: 0,
  currency: 'TZS',
  duration_days: 1,
  features: '',
  popular: false,
  sort_order: 0,
};

export default function AdminPlans() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);

  useEffect(() => { fetchPlans(); }, []);

  const fetchPlans = async () => {
    try {
      const q = query(collection(db, 'plans'), orderBy('sort_order'));
      const snap = await getDocs(q);
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Plan));
      setPlans(data);
    } catch (error) {
      console.error("Error fetching plans:", error);
    }
  };

  const openAdd = () => { setEditing(null); setForm(emptyForm); setShowForm(true); };
  const openEdit = (p: Plan) => {
    setEditing(p);
    setForm({
      name: p.name,
      plan_key: p.plan_key,
      amount: p.amount,
      currency: p.currency,
      duration_days: p.duration_days,
      features: (p.features || []).join(', '),
      popular: p.popular,
      sort_order: p.sort_order,
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    setLoading(true);
    const featuresArr = form.features.split(',').map((f) => f.trim()).filter(Boolean);
    const payload = {
      name: form.name,
      plan_key: form.plan_key,
      amount: form.amount,
      currency: form.currency,
      duration_days: form.duration_days,
      features: featuresArr,
      popular: form.popular,
      sort_order: form.sort_order,
      active: editing ? editing.active : true
    };

    try {
      if (editing) {
        await updateDoc(doc(db, 'plans', editing.id), payload);
      } else {
        await addDoc(collection(db, 'plans'), payload);
      }
      await fetchPlans();
      setShowForm(false);
    } catch (error) {
      console.error("Error saving plan:", error);
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Futa mpango huu?')) return;
    try {
      await deleteDoc(doc(db, 'plans', id));
      await fetchPlans();
    } catch (error) {
      console.error("Error deleting plan:", error);
    }
  };

  const toggleActive = async (p: Plan) => {
    try {
      await updateDoc(doc(db, 'plans', p.id), { active: !p.active });
      await fetchPlans();
    } catch (error) {
      console.error("Error toggling plan status:", error);
    }
  };

  const formatPrice = (amount: number) => amount.toLocaleString();

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-black text-foreground">Simamia Mipango</h1>
        <Button onClick={openAdd} className="bg-primary text-primary-foreground text-xs px-3 py-2 h-auto glow-primary">
          <Plus className="w-3.5 h-3.5 mr-1" /> Ongeza
        </Button>
      </div>

      <div className="space-y-2">
        {plans.map((p) => (
          <div key={p.id} className={`cyber-card rounded-xl p-4 ${!p.active ? 'opacity-50' : ''}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Clock className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-bold text-foreground">{p.name}</p>
                    {p.popular && <span className="text-[9px] font-black bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded-full">POPULAR</span>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatPrice(p.amount)} {p.currency} • {p.duration_days} siku
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => toggleActive(p)} className={`w-8 h-4 rounded-full transition-colors flex items-center px-0.5 ${p.active ? 'bg-primary' : 'bg-muted'}`}>
                  <div className={`w-3 h-3 rounded-full bg-white transition-transform ${p.active ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
                <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                  <Edit2 className="w-3.5 h-3.5 text-primary" />
                </button>
                <button onClick={() => handleDelete(p.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors">
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </button>
              </div>
            </div>
            {p.features && p.features.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {p.features.map((f, i) => (
                  <span key={i} className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{f}</span>
                ))}
              </div>
            )}
          </div>
        ))}
        {plans.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Star className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Hakuna mipango bado</p>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card">
              <h2 className="font-black text-foreground">{editing ? 'Hariri Mpango' : 'Ongeza Mpango'}</h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <Label className="text-xs text-foreground mb-1 block">Jina la Mpango *</Label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. 1 Week" className="bg-muted border-border" required />
              </div>
              <div>
                <Label className="text-xs text-foreground mb-1 block">Plan Key (unique) *</Label>
                <Input value={form.plan_key} onChange={(e) => setForm((f) => ({ ...f, plan_key: e.target.value }))} placeholder="e.g. week" className="bg-muted border-border font-mono text-xs" required />
                <p className="text-[10px] text-muted-foreground mt-0.5">Unique identifier like: day, week, week2, month</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-foreground mb-1 block">Kiasi (Amount) *</Label>
                  <Input type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: Number(e.target.value) }))} placeholder="5000" className="bg-muted border-border" required />
                </div>
                <div>
                  <Label className="text-xs text-foreground mb-1 block">Fedha (Currency)</Label>
                  <Input value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))} placeholder="TZS" className="bg-muted border-border" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-foreground mb-1 block">Muda (Siku) *</Label>
                  <Input type="number" value={form.duration_days} onChange={(e) => setForm((f) => ({ ...f, duration_days: Number(e.target.value) }))} placeholder="7" className="bg-muted border-border" required />
                </div>
                <div>
                  <Label className="text-xs text-foreground mb-1 block">Mpangilio</Label>
                  <Input type="number" value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))} className="bg-muted border-border" />
                </div>
              </div>
              <div>
                <Label className="text-xs text-foreground mb-1 block">Vipengele (Features)</Label>
                <Input value={form.features} onChange={(e) => setForm((f) => ({ ...f, features: e.target.value }))} placeholder="All Channels, HD Quality, 2 Devices" className="bg-muted border-border text-xs" />
                <p className="text-[10px] text-muted-foreground mt-0.5">Tenganisha kwa koma (comma separated)</p>
              </div>
              <div className="flex items-center justify-between bg-muted rounded-xl px-4 py-3 border border-border">
                <div>
                  <p className="text-sm font-bold text-foreground">Maarufu (Popular)</p>
                  <p className="text-xs text-muted-foreground">Onyesha badge ya "POPULAR"</p>
                </div>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, popular: !f.popular }))}
                  className={`w-12 h-6 rounded-full transition-colors flex items-center px-0.5 ${form.popular ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                >
                  <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${form.popular ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
              </div>
              <Button onClick={handleSave} disabled={loading || !form.name || !form.plan_key || !form.amount || !form.duration_days} className="w-full bg-primary text-primary-foreground glow-primary">
                {loading ? 'Inahifadhi...' : editing ? 'Hifadhi Mabadiliko' : 'Ongeza Mpango'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
