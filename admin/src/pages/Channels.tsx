import { useState, useEffect, useMemo, useRef } from 'react';
import {
  collection, query, orderBy, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, writeBatch
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { uploadToImgBB } from '@/lib/imgbb';
import AdminLayout from '@/components/AdminLayout';
import {
  Plus, Trash2, Edit2, X, Upload, Tv, Globe, LayoutGrid, Check, Info,
  Lock, Unlock, Zap, Search, ArrowUp, ArrowDown, Heart, HeartOff,
  Eye, EyeOff, SlidersHorizontal, ArrowUpDown, Filter, Calendar
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

interface Channel {
  id: string;
  name: string;
  url: string;
  img_url: string | null;
  category: string;
  type: string; // hls or dash
  kid: string | null;
  key: string | null;
  is_free: boolean;
  sort_order: number;
  active: boolean;
  show_reactions?: boolean;
}

function cleanChannelUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  return rawUrl
    .replace(/\/tok_[^/]+/, '')
    .replace(/([?&])cdntoken=[^&#]*/g, '$1')
    .replace(/\?&/, '?')
    .replace(/[?&]$/, '')
    .trim();
}

const emptyForm = {
  name: '', url: '', img_url: '', category: 'General',
  type: 'hls', kid: '', key: '', is_free: false, sort_order: 0,
  active: true, show_reactions: true,
  description: '', schedule: '', hero_img_url: ''
};

export default function AdminChannels() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [editing, setEditing] = useState<Channel | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Search & Filter & Sort States
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState<'All' | 'active' | 'inactive'>('All');
  const [accessFilter, setAccessFilter] = useState<'All' | 'free' | 'paid'>('All');
  const [sortBy, setSortBy] = useState<'order' | 'name-asc' | 'name-desc' | 'category'>('order');
  const [reorderMode, setReorderMode] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Bulk Add States
  const [bulkInput, setBulkInput] = useState('');
  const [apiUrl, setApiUrl] = useState('');
  const [bulkPreview, setBulkPreview] = useState<Partial<Channel>[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [syncingEpg, setSyncingEpg] = useState(false);

  const handleSyncEpg = async () => {
    setSyncingEpg(true);
    try {
      const res = await fetch('https://us-central1-revontech-6c62d.cloudfunctions.net/syncEpgProgramsHttp');
      if (res.ok) {
        const j = await res.json();
        alert(`Hongera! Ratiba ya vipindi (EPG) imesasishwa kikamilifu! Vipindi: ${j.count || 0}`);
      } else {
        alert("Imeshindwa kusasisha ratiba kupitia seva. Hakikisha mtandao uko sawa.");
      }
    } catch (e: any) {
      alert("Hitilafu: " + (e.message || "Unknown error"));
    } finally {
      setSyncingEpg(false);
    }
  };

  useEffect(() => { fetchChannels(); }, []);

  const fetchChannels = async () => {
    try {
      const q = query(collection(db, 'channels'), orderBy('sort_order'));
      const snap = await getDocs(q);
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Channel));
      setChannels(data);
    } catch (error) {
      console.error("Error fetching channels:", error);
    }
  };

  // Distinct Categories for Filtering
  const categories = useMemo(() => {
    const set = new Set<string>();
    channels.forEach((c) => {
      if (c.category) set.add(c.category);
    });
    return ['All', ...Array.from(set).sort()];
  }, [channels]);

  // Filtered Channels
  const filteredChannels = useMemo(() => {
    return channels.filter((ch) => {
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchName = (ch.name || '').toLowerCase().includes(q);
        const matchCat = (ch.category || '').toLowerCase().includes(q);
        const matchUrl = (ch.url || '').toLowerCase().includes(q);
        if (!matchName && !matchCat && !matchUrl) return false;
      }
      if (categoryFilter !== 'All' && ch.category !== categoryFilter) return false;
      if (typeFilter !== 'All' && ch.type !== typeFilter) return false;
      if (statusFilter === 'active' && ch.active === false) return false;
      if (statusFilter === 'inactive' && ch.active !== false) return false;
      if (accessFilter === 'free' && !ch.is_free) return false;
      if (accessFilter === 'paid' && ch.is_free) return false;
      return true;
    });
  }, [channels, search, categoryFilter, typeFilter, statusFilter, accessFilter]);

  // Sorted Channels
  const sortedChannels = useMemo(() => {
    const list = [...filteredChannels];
    if (sortBy === 'order') {
      return list.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    }
    if (sortBy === 'name-asc') {
      return list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }
    if (sortBy === 'name-desc') {
      return list.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
    }
    if (sortBy === 'category') {
      return list.sort((a, b) => (a.category || '').localeCompare(b.category || ''));
    }
    return list;
  }, [filteredChannels, sortBy]);

  const handleFetchFromApi = async () => {
    if (!apiUrl.trim()) return;
    setFetching(true);
    try {
      const res = await fetch(apiUrl);
      const data = await res.text();
      setBulkInput(data);
      alert("Data fetched successfully! Review it below.");
    } catch (err) {
      alert("Failed to fetch. Ensure the URL is valid and CORS is enabled.");
    }
    setFetching(false);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadToImgBB(file);
      setForm((f) => ({ ...f, img_url: url }));
    } catch (error) {
      console.error("Error uploading logo:", error);
    }
    setUploading(false);
  };

  const handleSave = async () => {
    setLoading(true);
    const sanitizedUrl = cleanChannelUrl(form.url);
    const payload = {
      ...form,
      url: sanitizedUrl,
      active: form.active !== false,
      show_reactions: form.show_reactions !== false,
      updated_at: serverTimestamp()
    };
    try {
      if (editing) {
        await updateDoc(doc(db, 'channels', editing.id), payload);
      } else {
        await addDoc(collection(db, 'channels'), {
          ...payload,
          created_at: serverTimestamp()
        });
      }
      await fetchChannels();
      setShowForm(false);
      setForm(emptyForm);
      setEditing(null);
    } catch (error) {
      console.error("Error saving channel:", error);
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Futa kituo hiki?')) return;
    try {
      await deleteDoc(doc(db, 'channels', id));
      await fetchChannels();
    } catch (error) {
      console.error("Error deleting channel:", error);
    }
  };

  const openEdit = (ch: Channel) => {
    setEditing(ch);
    const anyCh = ch as any;
    setForm({
      name: ch.name,
      url: ch.url,
      img_url: ch.img_url || '',
      category: ch.category || 'General',
      type: ch.type || 'hls',
      kid: ch.kid || '',
      key: ch.key || '',
      is_free: ch.is_free || false,
      sort_order: ch.sort_order ?? 0,
      active: ch.active !== false,
      show_reactions: (ch as any).show_reactions !== false,
      description: anyCh.description || '',
      schedule: anyCh.schedule || '',
      hero_img_url: anyCh.hero_img_url || ''
    });
    setShowForm(true);
  };

  // Quick Toggle Active / Inactive
  const toggleChannelActive = async (ch: Channel, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setTogglingId(ch.id);
    const newActive = ch.active === false ? true : false;
    try {
      await updateDoc(doc(db, 'channels', ch.id), {
        active: newActive,
        updated_at: serverTimestamp(),
      });
      setChannels((prev) =>
        prev.map((c) => (c.id === ch.id ? { ...c, active: newActive } : c))
      );
    } catch (error) {
      console.error('Error toggling channel active:', error);
    } finally {
      setTogglingId(null);
    }
  };

  // Quick Toggle Reactions ON / OFF
  const toggleChannelReactions = async (ch: Channel, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setTogglingId(ch.id);
    const currentVal = (ch as any).show_reactions !== false;
    const newVal = !currentVal;
    try {
      await updateDoc(doc(db, 'channels', ch.id), {
        show_reactions: newVal,
        updated_at: serverTimestamp(),
      });
      setChannels((prev) =>
        prev.map((c) => (c.id === ch.id ? { ...c, show_reactions: newVal } : c))
      );
    } catch (error) {
      console.error('Error toggling reactions:', error);
    } finally {
      setTogglingId(null);
    }
  };

  // Move channel Up or Down in sort order
  const moveChannelOrder = async (channelId: string, direction: 'up' | 'down') => {
    const currentIndex = sortedChannels.findIndex((c) => c.id === channelId);
    if (currentIndex === -1) return;
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= sortedChannels.length) return;

    const currentChannel = sortedChannels[currentIndex];
    const targetChannel = sortedChannels[targetIndex];

    const currentOrder = currentChannel.sort_order ?? currentIndex;
    const targetOrder = targetChannel.sort_order ?? targetIndex;

    const newCurrentOrder = currentOrder === targetOrder
      ? (direction === 'up' ? targetOrder - 1 : targetOrder + 1)
      : targetOrder;
    const newTargetOrder = currentOrder;

    try {
      await Promise.all([
        updateDoc(doc(db, 'channels', currentChannel.id), { sort_order: newCurrentOrder }),
        updateDoc(doc(db, 'channels', targetChannel.id), { sort_order: newTargetOrder }),
      ]);
      await fetchChannels();
    } catch (err) {
      console.error('Error reordering channels:', err);
    }
  };

  // Update specific numeric sort_order
  const updateChannelSortOrder = async (ch: Channel, newOrder: number) => {
    try {
      await updateDoc(doc(db, 'channels', ch.id), { sort_order: newOrder });
      setChannels((prev) =>
        prev.map((c) => (c.id === ch.id ? { ...c, sort_order: newOrder } : c))
      );
    } catch (err) {
      console.error('Error setting sort_order:', err);
    }
  };

  // SMART PARSER FOR BULK
  const handleParseBulk = () => {
    try {
      const raw = bulkInput.trim();
      let items: any[] = [];

      if (raw.startsWith('[') || raw.startsWith('{')) {
        const parsed = JSON.parse(raw);
        const findArray = (obj: any): any[] => {
          if (Array.isArray(obj)) return obj;
          if (typeof obj === 'object' && obj !== null) {
            for (const key in obj) {
              const res = findArray(obj[key]);
              if (res.length > 0) return res;
            }
          }
          return [];
        };
        items = findArray(parsed);
      } else if (raw.includes('#EXTM3U')) {
        const lines = raw.split('\n');
        let currentItem: any = {};
        lines.forEach(line => {
          if (line.startsWith('#EXTINF')) {
            const name = line.split(',').pop()?.trim() || 'Unknown';
            const logoMatch = line.match(/tvg-logo="([^"]+)"/);
            const groupMatch = line.match(/group-title="([^"]+)"/);
            currentItem = { name, img_url: logoMatch?.[1] || '', category: groupMatch?.[1] || 'General' };
          } else if (line.startsWith('http')) {
            currentItem.url = line.trim();
            items.push({ ...currentItem });
            currentItem = {};
          }
        });
      } else {
        const lines = raw.split('\n').filter(l => l.trim());
        items = lines.map(line => {
          const parts = line.split(',').map(p => p.trim());
          return { name: parts[0], url: parts[1], img_url: parts[2], category: parts[3] };
        });
      }

      const clean = items.map((item, i) => {
        const urlValue = item.url || item.link || item.stream || item.streamUrl || item.stream_url || '';
        return {
          name: item.name || item.title || item.label || 'Kituo ' + (i + 1),
          url: cleanChannelUrl(urlValue),
          img_url: item.img_url || item.logo || item.image || item.thumbnail || '',
          category: item.category || item.group || 'General',
          type: item.type || (urlValue.includes('.mpd') ? 'dash' : 'hls'),
          kid: item.kid || '',
          key: item.key || '',
          is_free: item.isFree !== undefined ? item.isFree : (item.is_free !== undefined ? item.is_free : false),
          sort_order: channels.length + i,
          active: true,
          show_reactions: true
        };
      }).filter(i => i.url && i.url.startsWith('http'));

      if (clean.length === 0) alert("Hakuna vituo vilivyopatikana. Hakikisha format ni sahihi.");
      setBulkPreview(clean);
    } catch (err) {
      alert("Error parsing data. Please check format.");
    }
  };

  const toggleBulkFree = (index: number) => {
    setBulkPreview(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], is_free: !copy[index].is_free };
      return copy;
    });
  };

  const handleSaveBulk = async () => {
    if (bulkPreview.length === 0) return;
    setBulkLoading(true);
    try {
      const items = [...bulkPreview];
      const chunkSize = 400;
      let count = 0;
      for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        chunk.forEach((ch) => {
          const ref = doc(collection(db, 'channels'));
          batch.set(ref, {
            ...ch,
            active: true,
            show_reactions: true,
            created_at: serverTimestamp(),
            updated_at: serverTimestamp()
          });
          count++;
        });
        await batch.commit();
      }
      await fetchChannels();
      setShowBulk(false);
      setBulkPreview([]);
      setBulkInput('');
      alert(`Hongera! Vituo ${count} vimeongezwa kikamilifu!`);
    } catch (error: any) {
      alert("Imeshindwa: " + (error.message || "Unknown error"));
    }
    setBulkLoading(false);
  };

  return (
    <AdminLayout>
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-black text-foreground flex items-center gap-2">
            <Tv className="w-6 h-6 text-primary" />
            Simamia Vituo vya TV
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Jumla ya vituo {channels.length} · Vinaonekana {sortedChannels.length}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => setReorderMode(!reorderMode)}
            variant={reorderMode ? "default" : "outline"}
            className={`text-xs h-9 px-3 ${reorderMode ? 'bg-primary text-primary-foreground font-black' : 'border-border text-foreground'}`}
          >
            <ArrowUpDown className="w-3.5 h-3.5 mr-1.5" />
            {reorderMode ? 'Funga Upangaji' : 'Panga Vituo'}
          </Button>
          <Button
            onClick={handleSyncEpg}
            disabled={syncingEpg}
            variant="outline"
            className="text-xs border-purple-500/50 text-purple-400 hover:bg-purple-500/10 h-9 px-3"
          >
            <Calendar className={`w-3.5 h-3.5 mr-1.5 ${syncingEpg ? 'animate-spin' : ''}`} />
            {syncingEpg ? 'Inasasisha EPG...' : 'Sawazisha Ratiba (EPG)'}
          </Button>
          <Button
            onClick={() => setShowBulk(true)}
            variant="outline"
            className="text-xs border-primary text-primary h-9 px-3 hover:bg-primary/10"
          >
            <LayoutGrid className="w-3.5 h-3.5 mr-1.5" /> Bulk Add
          </Button>
          <Button
            onClick={() => { setEditing(null); setForm(emptyForm); setShowForm(true); }}
            className="bg-primary text-primary-foreground text-xs px-3 h-9 glow-cyan font-black"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Ongeza Kituo
          </Button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="cyber-card rounded-2xl p-4 mb-4 space-y-3 border border-border/60">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tafuta kituo kwa jina, kundi (category), au link..."
              className="w-full bg-muted border border-border rounded-xl pl-9 pr-8 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-[11px] font-bold text-muted-foreground uppercase flex items-center gap-1">
              <SlidersHorizontal className="w-3.5 h-3.5 text-primary" /> Panga:
            </span>
            <select
              value={sortBy}
              onChange={(e: any) => setSortBy(e.target.value)}
              className="bg-muted border border-border rounded-xl px-2.5 py-2 text-xs font-bold text-foreground focus:outline-none focus:border-primary"
            >
              <option value="order">Mpangilio (Sort Order)</option>
              <option value="name-asc">Jina (A - Z)</option>
              <option value="name-desc">Jina (Z - A)</option>
              <option value="category">Kwa Kundi (Category)</option>
            </select>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/40 text-xs">
          {/* Category Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-1 max-w-full">
            <span className="text-[10px] font-black uppercase text-muted-foreground mr-1 flex items-center gap-1">
              <Filter className="w-3 h-3 text-primary" /> Kundi:
            </span>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition-colors ${
                  categoryFilter === cat
                    ? 'bg-primary text-primary-foreground glow-cyan'
                    : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80'
                }`}
              >
                {cat === 'All' ? 'Yote' : cat}
              </button>
            ))}
          </div>
        </div>

        {/* Sub-Filters: Type, Status, Access */}
        <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px]">
          {/* Status Filter */}
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground font-bold">Hali:</span>
            {(['All', 'active', 'inactive'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-2 py-0.5 rounded-md font-bold transition-colors ${
                  statusFilter === st
                    ? 'bg-primary/20 text-primary border border-primary/40'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {st === 'All' ? 'Zote' : st === 'active' ? 'Hai (Active)' : 'Zimezimwa'}
              </button>
            ))}
          </div>

          <span className="text-border">|</span>

          {/* Type Filter */}
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground font-bold">Aina:</span>
            {['All', 'hls', 'dash'].map((tp) => (
              <button
                key={tp}
                onClick={() => setTypeFilter(tp)}
                className={`px-2 py-0.5 rounded-md font-bold transition-colors uppercase ${
                  typeFilter === tp
                    ? 'bg-primary/20 text-primary border border-primary/40'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tp === 'All' ? 'Zote' : tp}
              </button>
            ))}
          </div>

          <span className="text-border">|</span>

          {/* Access Filter */}
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground font-bold">Malipo:</span>
            {(['All', 'free', 'paid'] as const).map((ac) => (
              <button
                key={ac}
                onClick={() => setAccessFilter(ac)}
                className={`px-2 py-0.5 rounded-md font-bold transition-colors ${
                  accessFilter === ac
                    ? 'bg-primary/20 text-primary border border-primary/40'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {ac === 'All' ? 'Zote' : ac === 'free' ? 'Bure (Free)' : 'VIP (Pay)'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Channels List */}
      <div className="space-y-2.5">
        {sortedChannels.length === 0 ? (
          <div className="cyber-card rounded-2xl p-12 text-center text-muted-foreground">
            <Tv className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-bold text-sm">Hakuna kituo kilichopatikana</p>
            <p className="text-xs text-muted-foreground mt-1">
              Jaribu kubadili filter au search yako hapo juu.
            </p>
          </div>
        ) : (
          sortedChannels.map((ch, idx) => {
            const isActive = ch.active !== false;
            const hasReactions = (ch as any).show_reactions !== false;
            return (
              <div
                key={ch.id}
                className={`cyber-card rounded-2xl p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3 transition-all ${
                  !isActive ? 'opacity-60 bg-muted/20 border-dashed' : 'border-border'
                }`}
              >
                {/* Left: Reorder buttons if in reorderMode */}
                {reorderMode && (
                  <div className="flex sm:flex-col items-center gap-1 flex-shrink-0 bg-muted/60 p-1.5 rounded-xl border border-border">
                    <button
                      onClick={() => moveChannelOrder(ch.id, 'up')}
                      disabled={idx === 0}
                      title="Sogeza Juu"
                      className="p-1 rounded hover:bg-background text-foreground disabled:opacity-30"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="number"
                      value={ch.sort_order ?? idx}
                      onChange={(e) => updateChannelSortOrder(ch, parseInt(e.target.value) || 0)}
                      className="w-10 text-center bg-background border border-border rounded text-[11px] font-mono font-black py-0.5"
                    />
                    <button
                      onClick={() => moveChannelOrder(ch.id, 'down')}
                      disabled={idx === sortedChannels.length - 1}
                      title="Sogeza Chini"
                      className="p-1 rounded hover:bg-background text-foreground disabled:opacity-30"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Logo */}
                <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center overflow-hidden flex-shrink-0 border border-border/80">
                  {ch.img_url ? (
                    <img src={ch.img_url} alt="" className="w-full h-full object-contain" />
                  ) : (
                    <Tv className="w-6 h-6 text-muted-foreground" />
                  )}
                </div>

                {/* Channel Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-black text-foreground truncate">{ch.name}</p>
                    {ch.is_free ? (
                      <span className="text-[10px] bg-green-500/20 text-green-400 border border-green-500/30 px-1.5 py-0.5 rounded-md font-black">
                        FREE
                      </span>
                    ) : (
                      <span className="text-[10px] bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-1.5 py-0.5 rounded-md font-black">
                        VIP
                      </span>
                    )}
                    <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded-md font-mono font-black">
                      {ch.type?.toUpperCase()}
                    </span>
                    <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-md font-bold">
                      {ch.category || 'General'}
                    </span>
                  </div>
                  <p className="text-[11px] font-mono text-muted-foreground truncate mt-1 max-w-md">
                    {ch.url}
                  </p>
                </div>

                {/* Right: Quick Toggles & Edit/Delete Actions */}
                <div className="flex flex-wrap sm:flex-nowrap items-center justify-between sm:justify-end gap-2 border-t sm:border-t-0 pt-2 sm:pt-0 border-border/40">
                  {/* Quick Active / Inactive Toggle */}
                  <button
                    onClick={(e) => toggleChannelActive(ch, e)}
                    disabled={togglingId === ch.id}
                    title={isActive ? "Kituo kiko hewani. Bofya kuzima." : "Kituo kimezimwa. Bofya kuwasha."}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      isActive
                        ? 'bg-green-500/15 border border-green-500/30 text-green-400 hover:bg-destructive/20 hover:text-destructive'
                        : 'bg-muted/80 border border-border text-muted-foreground hover:bg-green-500/20 hover:text-green-400'
                    }`}
                  >
                    {isActive ? (
                      <>
                        <Eye className="w-3.5 h-3.5 text-green-400" />
                        <span>HAI</span>
                      </>
                    ) : (
                      <>
                        <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>IMEZIMWA</span>
                      </>
                    )}
                  </button>

                  {/* Quick Live Reactions Toggle */}
                  <button
                    onClick={(e) => toggleChannelReactions(ch, e)}
                    disabled={togglingId === ch.id}
                    title={hasReactions ? "Reactions zinaruhusiwa. Bofya kuzima." : "Reactions zimezimwa. Bofya kuwasha."}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      hasReactions
                        ? 'bg-pink-500/15 border border-pink-500/30 text-pink-400 hover:bg-pink-500/25'
                        : 'bg-muted/80 border border-border text-muted-foreground hover:bg-pink-500/20 hover:text-pink-400'
                    }`}
                  >
                    {hasReactions ? (
                      <>
                        <Heart className="w-3.5 h-3.5 fill-pink-500 text-pink-500 animate-pulse" />
                        <span>REACTIONS ON</span>
                      </>
                    ) : (
                      <>
                        <HeartOff className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>REACTIONS OFF</span>
                      </>
                    )}
                  </button>

                  {/* Edit and Delete Buttons */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEdit(ch)}
                      title="Hariri Kituo"
                      className="p-2 rounded-xl bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(ch.id)}
                      title="Futa Kituo"
                      className="p-2 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive hover:text-white transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add / Edit Channel Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card z-10">
              <h2 className="font-black text-foreground text-base">
                {editing ? 'Hariri Kituo' : 'Ongeza Kituo Kipya'}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Logo Upload */}
              <div className="flex flex-col items-center gap-2">
                <div className="w-24 h-24 rounded-2xl bg-muted border-2 border-dashed border-border flex items-center justify-center overflow-hidden">
                  {form.img_url ? (
                    <img src={form.img_url} alt="" className="w-full h-full object-contain" />
                  ) : (
                    <Upload className="w-8 h-8 text-muted-foreground" />
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="text-xs h-8"
                >
                  {uploading ? 'Inapakia...' : 'Pakia Logo'}
                </Button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
              </div>

              {/* Form Fields */}
              <div className="space-y-3">
                <div>
                  <Label className="text-xs mb-1 block font-bold">Jina la Kituo</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="mf. Azam Sports 1 HD"
                    className="bg-muted text-xs font-bold"
                  />
                </div>

                <div>
                  <Label className="text-xs mb-1 block font-bold">M3U8 / MPD Stream URL</Label>
                  <Input
                    value={form.url}
                    onChange={(e) => setForm({ ...form, url: e.target.value })}
                    placeholder="https://.../index.m3u8 au manifest.mpd"
                    className="bg-muted font-mono text-xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs mb-1 block font-bold">Kundi (Category)</Label>
                    <Input
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                      placeholder="Sports, News, Entertainment..."
                      className="bg-muted text-xs font-bold"
                    />
                  </div>
                  <div>
                    <Label className="text-xs mb-1 block font-bold">Aina ya Mtiririko (Type)</Label>
                    <select
                      value={form.type}
                      onChange={(e) => setForm({ ...form, type: e.target.value })}
                      className="w-full bg-muted border border-border rounded-md px-3 py-2 text-xs font-bold text-foreground"
                    >
                      <option value="hls">HLS (M3U8)</option>
                      <option value="dash">DASH (MPD)</option>
                    </select>
                  </div>
                </div>

                {form.type === 'dash' && (
                  <div className="p-3 bg-muted/60 border border-primary/20 rounded-xl space-y-2">
                    <p className="text-[10px] font-black uppercase text-primary">DRM ClearKey (DASH)</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[11px] mb-1 block">KID (Key ID)</Label>
                        <Input
                          value={form.kid}
                          onChange={(e) => setForm({ ...form, kid: e.target.value })}
                          placeholder="32 hex chars"
                          className="bg-background font-mono text-[11px]"
                        />
                      </div>
                      <div>
                        <Label className="text-[11px] mb-1 block">KEY</Label>
                        <Input
                          value={form.key}
                          onChange={(e) => setForm({ ...form, key: e.target.value })}
                          placeholder="32 hex chars"
                          className="bg-background font-mono text-[11px]"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Free vs Paid Toggle */}
                <div className="flex items-center justify-between p-3 bg-muted rounded-xl">
                  <div>
                    <span className="text-xs font-black block text-foreground">Kituo cha Bure (Free)</span>
                    <span className="text-[10px] text-muted-foreground">Ruhusu kila mtu atazame bila kulipia kifurushi</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={form.is_free}
                    onChange={(e) => setForm({ ...form, is_free: e.target.checked })}
                    className="w-5 h-5 accent-primary cursor-pointer"
                  />
                </div>

                {/* Active / Inactive Toggle (Requirement #4) */}
                <div className="flex items-center justify-between p-3 bg-muted rounded-xl border border-primary/20">
                  <div>
                    <span className="text-xs font-black block text-foreground">
                      Kituo Kiko Hewani (Active)
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {form.active
                        ? 'Kituo kitaonekana kwa watumiaji kwenye app/website'
                        : 'Kituo kimefichwa, watumiaji hawawezi kukiona'}
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setForm({ ...form, active: e.target.checked })}
                    className="w-5 h-5 accent-primary cursor-pointer"
                  />
                </div>

                {/* Live Reactions Toggle (Requirement #4) */}
                <div className="flex items-center justify-between p-3 bg-pink-500/10 border border-pink-500/30 rounded-xl">
                  <div>
                    <span className="text-xs font-black block text-foreground flex items-center gap-1.5">
                      <Heart className="w-3.5 h-3.5 text-pink-500 fill-pink-500" />
                      Ruhusu Live Reactions
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {form.show_reactions
                        ? 'Watazamaji wataona na kubonyeza reactions (Mioyo ❤️, Moto 🔥, n.k.)'
                        : 'Reactions zimezimwa kwa kituo hiki — mtumiaji hataona chochote'}
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={form.show_reactions}
                    onChange={(e) => setForm({ ...form, show_reactions: e.target.checked })}
                    className="w-5 h-5 accent-pink-500 cursor-pointer"
                  />
                </div>

                {/* Mpangilio wa Sort Order */}
                <div>
                  <Label className="text-xs mb-1 block font-bold">Namba ya Mpangilio (Sort Order)</Label>
                  <Input
                    type="number"
                    value={form.sort_order}
                    onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })}
                    placeholder="0"
                    className="bg-muted text-xs font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Namba ndogo huonekana mwanzo kabisa kwenye orodha ya channels.
                  </p>
                </div>

                {/* Optional fields */}
                <div className="pt-2 border-t border-border">
                  <p className="text-[10px] font-black uppercase tracking-wider text-primary mb-2">
                    Maelezo ya Ziada (Optional)
                  </p>
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs mb-1 block">Maelezo ya Kituo (Description)</Label>
                      <textarea
                        value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                        placeholder="Kituo hiki kinakuletea vipindi mbalimbali..."
                        rows={2}
                        className="w-full bg-muted border border-border rounded-md px-3 py-2 text-xs resize-none"
                      />
                    </div>
                    <div>
                      <Label className="text-xs mb-1 block">Ratiba (Schedule)</Label>
                      <textarea
                        value={form.schedule}
                        onChange={(e) => setForm({ ...form, schedule: e.target.value })}
                        placeholder="09:00 - Habari&#10;14:00 - Michezo Live..."
                        rows={2}
                        className="w-full bg-muted border border-border rounded-md px-3 py-2 text-xs resize-none font-mono"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <Button
                onClick={handleSave}
                disabled={loading || !form.name || !form.url}
                className="w-full bg-primary text-primary-foreground glow-cyan h-11 font-black text-xs"
              >
                {loading ? 'INAHIFADHI...' : editing ? 'HIFADHI MABADILIKO' : 'ONGEZA KITUO'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Add Modal */}
      {showBulk && (
        <div className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-border bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-xl">
                  <LayoutGrid className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="font-black text-foreground uppercase tracking-widest text-sm leading-none mb-1">
                    Bulk Add Channels
                  </h2>
                  <p className="text-[10px] text-muted-foreground font-bold italic">
                    M3U / IPTV / JSON / CSV SUPPORT
                  </p>
                </div>
              </div>
              <button onClick={() => setShowBulk(false)} className="p-2 rounded-lg hover:bg-muted">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-5 space-y-4">
                <div className="bg-muted/50 rounded-2xl p-4 border border-border">
                  <div className="flex items-center gap-2 mb-3">
                    <Globe className="w-4 h-4 text-primary" />
                    <span className="text-[10px] font-black uppercase">Paste API Link</span>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={apiUrl}
                      onChange={(e) => setApiUrl(e.target.value)}
                      placeholder="https://..."
                      className="bg-background h-10 text-xs"
                    />
                    <Button
                      onClick={handleFetchFromApi}
                      disabled={fetching}
                      className="bg-primary h-10 px-4 font-black text-xs"
                    >
                      {fetching ? '...' : 'LOAD'}
                    </Button>
                  </div>
                </div>

                <div className="bg-muted/50 rounded-2xl p-4 border border-border flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-primary" />
                    <span className="text-[10px] font-black uppercase tracking-wider">Raw Content</span>
                  </div>
                  <textarea
                    value={bulkInput}
                    onChange={(e) => setBulkInput(e.target.value)}
                    placeholder="Paste M3U content or CSV here..."
                    className="w-full h-64 bg-background border border-border rounded-xl p-3 text-xs font-mono outline-none"
                  />
                  <Button
                    onClick={handleParseBulk}
                    className="w-full mt-3 bg-secondary text-secondary-foreground font-black h-11 text-xs"
                  >
                    <Zap className="w-4 h-4 mr-2" /> GENERATE PREVIEW
                  </Button>
                </div>
              </div>

              <div className="lg:col-span-7 flex flex-col min-h-[400px]">
                <div className="flex items-center justify-between mb-3 px-1">
                  <span className="text-xs font-black uppercase tracking-wider text-primary">
                    Preview ({bulkPreview.length} channels)
                  </span>
                  <div className="flex items-center gap-3 text-[10px] font-bold text-muted-foreground">
                    <span className="flex items-center gap-1"><Unlock className="w-3 h-3 text-green-500" /> FREE</span>
                    <span className="flex items-center gap-1"><Lock className="w-3 h-3 text-yellow-500" /> PAY</span>
                  </div>
                </div>

                <div className="flex-1 bg-background border border-border rounded-2xl overflow-y-auto max-h-[480px] p-2">
                  {bulkPreview.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-10 text-center opacity-50">
                      <Tv className="w-12 h-12 mb-3" />
                      <p className="text-xs font-bold">Hakuna vituo vilivyopatikana bado.</p>
                      <p className="text-[11px] mt-1">Weka playlist au link kisha bonyeza GENERATE PREVIEW.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {bulkPreview.map((p, i) => (
                        <div key={i} className="bg-muted/40 border border-border rounded-xl p-2.5 flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-lg bg-background flex items-center justify-center overflow-hidden border border-border flex-shrink-0">
                            {p.img_url ? (
                              <img src={p.img_url} alt="" className="w-full h-full object-contain" />
                            ) : (
                              <Tv className="w-4 h-4 opacity-30" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-black truncate uppercase">{p.name}</p>
                            <p className="text-[9px] text-muted-foreground font-bold truncate uppercase">{p.category}</p>
                          </div>
                          <div className="flex flex-col items-center gap-0.5">
                            <span className={`text-[8px] font-black ${p.is_free ? 'text-green-500' : 'text-yellow-500'}`}>
                              {p.is_free ? 'FREE' : 'PAY'}
                            </span>
                            <Checkbox
                              checked={p.is_free}
                              onCheckedChange={() => toggleBulkFree(i)}
                              className="w-4 h-4 border-border"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Button
                  onClick={handleSaveBulk}
                  disabled={bulkPreview.length === 0 || bulkLoading}
                  className="w-full mt-4 bg-primary text-primary-foreground glow-primary h-12 font-black text-sm"
                >
                  {bulkLoading ? 'PUBLISHING...' : `PUBLISH ${bulkPreview.length} CHANNELS`}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
