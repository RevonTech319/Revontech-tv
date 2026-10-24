import { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { uploadToImgBB } from '@/lib/imgbb';
import AdminLayout from '@/components/AdminLayout';
import { Plus, Trash2, Edit2, X, Upload, Megaphone } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

interface Ad {
  id: string;
  image_url: string;
  link: string;
  description: string | null;
  active: boolean;
}

const emptyForm = { image_url: '', link: '', description: '' };

export default function AdminAds() {
  const [ads, setAds] = useState<Ad[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Ad | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchAds(); }, []);

  const fetchAds = async () => {
    try {
      const q = query(collection(db, 'ads'), orderBy('created_at', 'desc'));
      const snap = await getDocs(q);
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Ad));
      setAds(data);
    } catch (error) {
      console.error("Error fetching ads:", error);
    }
  };

  const openAdd = () => { setEditing(null); setForm(emptyForm); setShowForm(true); };
  const openEdit = (ad: Ad) => {
    setEditing(ad);
    setForm({ image_url: ad.image_url, link: ad.link, description: ad.description || '' });
    setShowForm(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadToImgBB(file);
      setForm((f) => ({ ...f, image_url: url }));
    } catch (error) {
      console.error("Error uploading ad image:", error);
      alert('Imeshindwa kupakia picha. Jaribu tena au weka URL ya picha.');
    }
    setUploading(false);
  };

  const handleSave = async () => {
    const link = /^https?:\/\//i.test(form.link.trim()) ? form.link.trim() : `https://${form.link.trim()}`;
    setLoading(true);
    const payload = {
      image_url: form.image_url.trim(),
      link,
      description: form.description || null,
      updated_at: serverTimestamp()
    };

    try {
      if (editing) {
        await updateDoc(doc(db, 'ads', editing.id), payload);
      } else {
        await addDoc(collection(db, 'ads'), {
          ...payload,
          active: true,
          created_at: serverTimestamp()
        });
      }
      await fetchAds();
      setShowForm(false);
    } catch (error) {
      console.error("Error saving ad:", error);
      alert('Imeshindwa kuhifadhi tangazo. Hakikisha umeingia kama admin.');
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Futa tangazo hili?')) return;
    try {
      await deleteDoc(doc(db, 'ads', id));
      await fetchAds();
    } catch (error) {
      console.error("Error deleting ad:", error);
    }
  };

  const toggleActive = async (ad: Ad) => {
    try {
      await updateDoc(doc(db, 'ads', ad.id), { active: !ad.active });
      await fetchAds();
    } catch (error) {
      console.error("Error toggling ad status:", error);
    }
  };

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-black text-foreground">Simamia Matangazo</h1>
        <Button onClick={openAdd} className="bg-primary text-primary-foreground text-xs px-3 py-2 h-auto glow-cyan">
          <Plus className="w-3.5 h-3.5 mr-1" /> Ongeza
        </Button>
      </div>

      <div className="space-y-2">
        {ads.map((ad) => (
          <div key={ad.id} className={`cyber-card rounded-xl p-3 flex items-center gap-3 ${!ad.active ? 'opacity-50' : ''}`}>
            <div className="w-16 h-12 rounded-lg overflow-hidden bg-muted flex-shrink-0">
              {ad.image_url ? (
                <img src={ad.image_url} alt="ad" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Megaphone className="w-5 h-5 text-muted-foreground" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-primary truncate">{ad.link}</p>
              {ad.description && <p className="text-xs text-muted-foreground truncate">{ad.description}</p>}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => toggleActive(ad)} className={`w-8 h-4 rounded-full transition-colors flex items-center px-0.5 ${ad.active ? 'bg-primary' : 'bg-muted'}`}>
                <div className={`w-3 h-3 rounded-full bg-white transition-transform ${ad.active ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
              <button onClick={() => openEdit(ad)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                <Edit2 className="w-3.5 h-3.5 text-primary" />
              </button>
              <button onClick={() => handleDelete(ad.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors">
                <Trash2 className="w-3.5 h-3.5 text-destructive" />
              </button>
            </div>
          </div>
        ))}
        {ads.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Megaphone className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Hakuna matangazo bado</p>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card">
              <h2 className="font-black text-foreground">{editing ? 'Hariri Tangazo' : 'Ongeza Tangazo'}</h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex flex-col items-center gap-2">
                <div className="w-full h-36 rounded-xl bg-muted flex items-center justify-center overflow-hidden border border-border">
                  {form.image_url
                    ? <img src={form.image_url} alt="" className="w-full h-full object-cover" />
                    : <Upload className="w-8 h-8 text-muted-foreground" />}
                </div>
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading} className="border-primary text-primary text-xs">
                  {uploading ? 'Inapakia...' : 'Pakia Picha'}
                </Button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                <div className="w-full">
                  <Label className="text-xs text-muted-foreground">Au weka URL ya picha</Label>
                  <Input value={form.image_url} onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))} placeholder="https://..." className="bg-muted border-border text-xs mt-1" />
                </div>
              </div>

              <div>
                <Label className="text-xs text-foreground mb-1 block">Link ya Tangazo *</Label>
                <Input value={form.link} onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))} placeholder="https://..." className="bg-muted border-border" required />
              </div>
              <div>
                <Label className="text-xs text-foreground mb-1 block">Maelezo (si lazima)</Label>
                <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Maelezo mafupi ya tangazo" className="bg-muted border-border" />
              </div>

              <Button onClick={handleSave} disabled={loading || !form.image_url || !form.link} className="w-full bg-primary text-primary-foreground glow-cyan">
                {loading ? 'Inahifadhi...' : editing ? 'Hifadhi Mabadiliko' : 'Ongeza Tangazo'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
