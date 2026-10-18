import { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { uploadToImgBB } from '@/lib/imgbb';
import AdminLayout from '@/components/AdminLayout';
import { Plus, Trash2, Upload, X, Edit2, Tv } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

interface SliderImage {
  id: string;
  img_url: string;
  caption: string | null;
  title?: string | null;
  channel_id?: string | null;
  cta_target?: string | null; // legacy field (older slides)
  sort_order: number;
  active: boolean;
}

interface ChannelOption {
  id: string;
  name: string;
  category?: string;
}

const emptyForm = {
  img_url: '',
  caption: '',
  title: '',
  channel_id: '',
  sort_order: 0,
};

// Older slides stored a plain channel ID in cta_target
const getChannelId = (s: SliderImage): string =>
  s.channel_id ||
  (s.cta_target && !/^https?:\/\//i.test(s.cta_target) && !s.cta_target.startsWith('/') ? s.cta_target : '');

export default function AdminSlider() {
  const [slides, setSlides] = useState<SliderImage[]>([]);
  const [channels, setChannels] = useState<ChannelOption[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SliderImage | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchSlides();
    fetchChannels();
  }, []);

  const fetchSlides = async () => {
    try {
      const q = query(collection(db, 'slider_images'), orderBy('sort_order'));
      const snap = await getDocs(q);
      setSlides(snap.docs.map((d) => ({ id: d.id, ...d.data() } as SliderImage)));
    } catch (error) {
      console.error('Error fetching slides:', error);
    }
  };

  const fetchChannels = async () => {
    try {
      const snap = await getDocs(collection(db, 'channels'));
      const list = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) } as ChannelOption))
        .filter((c) => c.name)
        .sort((a, b) => a.name.localeCompare(b.name));
      setChannels(list);
    } catch (error) {
      console.error('Error fetching channels:', error);
    }
  };

  const channelName = (id: string) => channels.find((c) => c.id === id)?.name;

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (s: SliderImage) => {
    setEditing(s);
    setForm({
      img_url: s.img_url,
      caption: s.caption || '',
      title: s.title || '',
      channel_id: getChannelId(s),
      sort_order: s.sort_order || 0,
    });
    setShowForm(true);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadToImgBB(file);
      setForm((f) => ({ ...f, img_url: url }));
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('Imeshindwa kupakia picha. Jaribu tena au weka URL ya picha.');
    }
    setUploading(false);
  };

  const handleSave = async () => {
    if (!form.img_url) return;
    setSaving(true);
    const payload = {
      img_url: form.img_url.trim(),
      caption: form.caption || null,
      title: form.title || null,
      // Channel is optional: empty = plain picture, no Watch Now button
      channel_id: form.channel_id || null,
      // Clear old-format button fields so they cannot conflict
      cta_target: null,
      cta_label: null,
      sort_order: form.sort_order,
    };
    try {
      if (editing) {
        await updateDoc(doc(db, 'slider_images', editing.id), payload);
      } else {
        await addDoc(collection(db, 'slider_images'), { ...payload, active: true });
      }
      await fetchSlides();
      setShowForm(false);
      setEditing(null);
      setForm(emptyForm);
    } catch (error) {
      console.error('Error saving slide:', error);
      alert('Imeshindwa kuhifadhi. Hakikisha umeingia kama admin.');
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Futa picha hii?')) return;
    try {
      await deleteDoc(doc(db, 'slider_images', id));
      await fetchSlides();
    } catch (error) {
      console.error('Error deleting slide:', error);
    }
  };

  const toggleActive = async (s: SliderImage) => {
    try {
      await updateDoc(doc(db, 'slider_images', s.id), { active: !s.active });
      await fetchSlides();
    } catch (error) {
      console.error('Error toggling slide status:', error);
    }
  };

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-black text-foreground">Picha za Slider</h1>
        <Button onClick={openAdd} className="bg-primary text-primary-foreground text-xs px-3 py-2 h-auto glow-cyan">
          <Plus className="w-3.5 h-3.5 mr-1" /> Ongeza
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {slides.map((s) => {
          const cid = getChannelId(s);
          return (
            <div key={s.id} className={`cyber-card rounded-xl overflow-hidden ${!s.active ? 'opacity-50' : ''}`}>
              <div className="h-32 overflow-hidden">
                <img src={s.img_url} alt={s.caption || ''} className="w-full h-full object-cover" />
              </div>
              <div className="p-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">{s.title || s.caption || '(Picha tu)'}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                    {cid ? (
                      <>
                        <Tv className="w-3 h-3 text-primary flex-shrink-0" />
                        Kituo: {channelName(cid) || 'Kituo hakipatikani'}
                      </>
                    ) : (
                      'Hakuna kituo (hakuna button)'
                    )}
                    {' · '}Mpangilio: {s.sort_order}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => toggleActive(s)} className={`w-8 h-4 rounded-full transition-colors flex items-center px-0.5 ${s.active ? 'bg-primary' : 'bg-muted'}`}>
                    <div className={`w-3 h-3 rounded-full bg-white transition-transform ${s.active ? 'translate-x-4' : 'translate-x-0'}`} />
                  </button>
                  <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg hover:bg-muted">
                    <Edit2 className="w-3.5 h-3.5 text-primary" />
                  </button>
                  <button onClick={() => handleDelete(s.id)} className="p-1.5 rounded-lg hover:bg-destructive/10">
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {slides.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-sm">Hakuna picha bado</p>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card">
              <h2 className="font-black text-foreground">{editing ? 'Hariri Picha ya Slider' : 'Ongeza Picha ya Slider'}</h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-muted">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex flex-col items-center gap-2">
                <div className="w-full h-32 rounded-xl bg-muted flex items-center justify-center overflow-hidden border border-border">
                  {form.img_url ? (
                    <img src={form.img_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Upload className="w-6 h-6 text-muted-foreground" />
                  )}
                </div>
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading} className="border-primary text-primary text-xs">
                  {uploading ? 'Inapakia...' : 'Pakia Picha'}
                </Button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
                <div className="w-full">
                  <Label className="text-xs text-muted-foreground">Au URL ya picha</Label>
                  <Input
                    value={form.img_url}
                    onChange={(e) => setForm((f) => ({ ...f, img_url: e.target.value }))}
                    placeholder="https://..."
                    className="bg-muted border-border mt-1"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs mb-1 block">Kichwa (hiari)</Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Mfano: Simba vs Yanga"
                  className="bg-muted border-border"
                />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Maelezo (hiari)</Label>
                <Input
                  value={form.caption}
                  onChange={(e) => setForm((f) => ({ ...f, caption: e.target.value }))}
                  placeholder="Maelezo mafupi..."
                  className="bg-muted border-border"
                />
              </div>

              <div>
                <Label className="text-xs mb-1 block">Kituo cha kufungua (hiari)</Label>
                <select
                  value={form.channel_id}
                  onChange={(e) => setForm((f) => ({ ...f, channel_id: e.target.value }))}
                  className="w-full bg-muted border border-border rounded-md px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                >
                  <option value="">— Hakuna (picha tu, bila button) —</option>
                  {channels.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.category ? ` (${c.category})` : ''}
                    </option>
                  ))}
                  {form.channel_id && !channels.some((c) => c.id === form.channel_id) && (
                    <option value={form.channel_id}>Kituo hakipatikani ({form.channel_id})</option>
                  )}
                </select>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Ukichagua kituo, mtumiaji ataona button ya “Tazama Sasa” (English: “Watch Now”) inayofungua kituo hicho. Usipochagua, button haitaonekana.
                </p>
              </div>

              <div>
                <Label className="text-xs mb-1 block">Mpangilio</Label>
                <Input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))}
                  className="bg-muted border-border"
                />
              </div>
              <Button onClick={handleSave} disabled={saving || !form.img_url} className="w-full bg-primary text-primary-foreground glow-cyan">
                {saving ? 'Inahifadhi...' : editing ? 'Hifadhi Mabadiliko' : 'Ongeza'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
