import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AdminLayout from '@/components/AdminLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  Terminal, Plus, Copy, Check, Trash2, RefreshCw, KeyRound, BookOpen, Play, AlertTriangle, ChevronDown, Download, ShieldCheck, Search, ExternalLink,
} from 'lucide-react';
import {
  BASES, API_TYPES, apiBase, SCOPES, LANGS, endpointsFor, errorsFor, limitsFor, securityFor, guidesFor, sample, buildMarkdown,
  type ApiType, type LangId, type Endpoint,
} from '@/lib/apiDocs';

type ShareMode = 'all' | 'categories' | 'selected';

interface ShareValue {
  share_mode: ShareMode;
  categories: string[];
  channel_ids: string[];
  include_premium: boolean;
  include_drm: boolean;
}

interface ChanInfo { id: string; name: string; category: string; is_free: boolean }

interface ApiKey extends ShareValue {
  id: string; // sha256 of the key
  type: ApiType;
  name: string;
  key_prefix: string;
  scopes: string[];
  allowed_origins: string[];
  rate_limit_per_min: number;
  active: boolean;
  request_count: number;
  last_used_ms: number | null;
  created_ms: number | null;
  created_by?: string;
}

type Tab = 'keys' | 'docs' | 'test';

// ── helpers ────────────────────────────────────────────────────────────────
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function generateKey(): string {
  let out = '';
  while (out.length < 40) {
    const bytes = new Uint8Array(64);
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (b >= 248) continue; // avoid modulo bias (248 = 62 * 4)
      out += ALPHABET[b % 62];
      if (out.length === 40) break;
    }
  }
  return 'rtk_' + out;
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** One origin per line / comma. Adds https:// when missing, drops paths and trailing slashes. */
function parseOrigins(raw: string): { list: string[]; bad: string[] } {
  const list: string[] = [];
  const bad: string[] = [];
  raw.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean).forEach((s) => {
    let o = /^https?:\/\//i.test(s) || s === '*' ? s : 'https://' + s;
    o = o.replace(/\/+$/, '').toLowerCase();
    if (o === '*' || /^https?:\/\/[a-z0-9*.\-]+(:\d+)?$/.test(o)) { if (!list.includes(o)) list.push(o); }
    else bad.push(s);
  });
  return { list, bad };
}

const EXAMPLE_URL = 'https://cdnedgch2.azamtvltd.co.tz/live/eds/AzamSport1/DASH/AzamSport1.mpd';

const DEFAULT_SHARE: ShareValue = { share_mode: 'all', categories: [], channel_ids: [], include_premium: true, include_drm: true };

/** Same selection rules as the server (functions/tokenApi.js › selectShared). */
function sharedCount(v: ShareValue, chans: ChanInfo[]): number {
  let out = chans;
  if (v.share_mode === 'categories') { const c = v.categories.map((x) => x.toLowerCase()); out = out.filter((x) => c.includes((x.category || '').toLowerCase())); }
  else if (v.share_mode === 'selected') { const ids = new Set(v.channel_ids); out = out.filter((x) => ids.has(x.id)); }
  if (!v.include_premium) out = out.filter((x) => x.is_free);
  return out.length;
}

const shareSummary = (k: ShareValue) =>
  k.share_mode === 'all' ? 'Channels zote' : k.share_mode === 'categories' ? `Categories: ${k.categories.join(', ') || '—'}` : `${k.channel_ids.length} channels zilizochaguliwa`;

const toMs = (v: any): number | null => (v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : null);
const fmt = (ms: number | null) => (ms ? new Date(ms).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

function CopyBtn({ text, label }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); }}
      className="flex items-center gap-1 rounded-lg bg-muted px-2.5 py-1.5 text-[11px] font-bold text-foreground hover:bg-primary/20"
    >
      {done ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />} {label ?? (done ? 'Imenakiliwa' : 'Nakili')}
    </button>
  );
}

function Code({ text }: { text: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-background">
      <div className="absolute right-2 top-2"><CopyBtn text={text} /></div>
      <pre className="overflow-x-auto p-3 pr-24 text-[11.5px] leading-relaxed text-foreground"><code>{text}</code></pre>
    </div>
  );
}

// ── page ───────────────────────────────────────────────────────────────────
export default function ApiAccess() {
  const { toast } = useToast();
  const { user } = useAuth() as any;
  const [tab, setTab] = useState<Tab>('keys');
  const [baseId, setBaseId] = useState<string>(BASES[0].id);
  const [docType, setDocType] = useState<ApiType>('token');   // which API the Docs / Test tabs show
  const root = BASES.find((b) => b.id === baseId)!.url;
  const base = apiBase(root, docType);

  // keys
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createType, setCreateType] = useState<ApiType | null>(null);
  const emptyForm = { name: '', scopes: ['token', 'resolve'] as string[], origins: '', rate: '60', ...DEFAULT_SHARE };
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [newKey, setNewKey] = useState<{ name: string; key: string; type: ApiType } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ name: string; scopes: string[]; origins: string; rate: string } & ShareValue>({ name: '', scopes: [], origins: '', rate: '60', ...DEFAULT_SHARE });
  const [chans, setChans] = useState<ChanInfo[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const [snap, cSnap] = await Promise.all([getDocs(collection(db, 'api_keys')), getDocs(collection(db, 'channels'))]);
      setChans(
        cSnap.docs
          .map((d) => { const c: any = d.data(); return { id: d.id, name: c.name || d.id, category: c.category || '', is_free: c.is_free === true || c.is_free === 'true', active: c.active !== false }; })
          .filter((c) => c.active)
          .map(({ active: _a, ...c }) => c)
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      const list: ApiKey[] = snap.docs.map((d) => {
        const x: any = d.data();
        return {
          id: d.id, type: (x.type === 'channels' ? 'channels' : 'token') as ApiType,
          share_mode: (['all', 'categories', 'selected'].includes(x.share_mode) ? x.share_mode : 'selected') as ShareMode,
          categories: x.categories || [], channel_ids: x.channel_ids || [],
          include_premium: x.include_premium === true, include_drm: x.include_drm === true,
          name: x.name || '(bila jina)', key_prefix: x.key_prefix || '', scopes: x.scopes || [],
          allowed_origins: x.allowed_origins || [], rate_limit_per_min: Number(x.rate_limit_per_min) || 60,
          active: x.active !== false, request_count: Number(x.request_count) || 0,
          last_used_ms: toMs(x.last_used_at), created_ms: toMs(x.created_at), created_by: x.created_by,
        };
      }).sort((a, b) => (b.created_ms || 0) - (a.created_ms || 0));
      setKeys(list);
    } catch (e: any) {
      toast({ title: 'Hitilafu', description: e?.message || 'Imeshindwa kupakia keys', variant: 'destructive' });
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggleScope = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const createKey = async () => {
    const type = createType;
    if (!type) return;
    const name = form.name.trim();
    if (!name) return toast({ title: 'Weka jina', description: 'Mfano: "Website ya Habari".', variant: 'destructive' });
    const { list, bad } = parseOrigins(form.origins);
    if (bad.length) return toast({ title: 'Origin si sahihi', description: bad.join(', '), variant: 'destructive' });
    const rate = Math.max(1, Math.min(10000, Math.floor(Number(form.rate) || (type === 'channels' ? 120 : 60))));

    let extra: Record<string, unknown>;
    if (type === 'token') {
      if (!form.scopes.length) return toast({ title: 'Chagua angalau ruhusa moja', variant: 'destructive' });
      if (form.scopes.some((s) => ['premium', 'drm'].includes(s)) && !window.confirm('Ruhusa za "premium" / "drm" zinampa mwenye key channels za malipo au funguo za DRM. Una uhakika?')) return;
      extra = { type: 'token', scopes: form.scopes };
    } else {
      if (form.share_mode === 'categories' && !form.categories.length) return toast({ title: 'Chagua angalau category moja', variant: 'destructive' });
      if (form.share_mode === 'selected' && !form.channel_ids.length) return toast({ title: 'Chagua angalau channel moja', variant: 'destructive' });
      const n = sharedCount(form, chans);
      if (n === 0 && !window.confirm('Mipangilio hii haishirikishi channel yoyote kwa sasa. Endelea?')) return;
      if (form.include_premium && !window.confirm('Channels za MALIPO zimewashwa: website hii itaweza kuzicheza bila kulipia kwako. Una uhakika?')) return;
      extra = {
        type: 'channels',
        scopes: [],
        share_mode: form.share_mode,
        categories: form.share_mode === 'categories' ? form.categories : [],
        channel_ids: form.share_mode === 'selected' ? form.channel_ids : [],
        include_premium: form.include_premium,
        include_drm: form.include_drm,
      };
    }

    setSaving(true);
    try {
      const key = generateKey();
      const hash = await sha256Hex(key);
      await setDoc(doc(db, 'api_keys', hash), {
        name,
        key_prefix: `${key.slice(0, 8)}…${key.slice(-4)}`,
        ...extra,
        allowed_origins: list,
        rate_limit_per_min: rate,
        active: true,
        request_count: 0,
        last_used_at: null,
        created_at: serverTimestamp(),
        created_by: user?.email || null,
      });
      setNewKey({ name, key, type });
      setCreating(false);
      setCreateType(null);
      setForm(emptyForm);
      await load();
    } catch (e: any) {
      toast({ title: 'Hitilafu', description: e?.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  const setActive = async (k: ApiKey, active: boolean) => {
    try {
      await updateDoc(doc(db, 'api_keys', k.id), { active });
      setKeys((p) => p.map((x) => (x.id === k.id ? { ...x, active } : x)));
      toast({ title: active ? 'Key imewashwa' : 'Key imezimwa', description: 'Athari huonekana ndani ya takriban sekunde 30.' });
    } catch (e: any) { toast({ title: 'Hitilafu', description: e?.message, variant: 'destructive' }); }
  };

  const removeKey = async (k: ApiKey) => {
    if (!window.confirm(`Futa key "${k.name}"? Website inayoitumia itaacha kufanya kazi mara moja (ndani ya ~30s).`)) return;
    try {
      await deleteDoc(doc(db, 'api_keys', k.id));
      setKeys((p) => p.filter((x) => x.id !== k.id));
      toast({ title: 'Imefutwa' });
    } catch (e: any) { toast({ title: 'Hitilafu', description: e?.message, variant: 'destructive' }); }
  };

  const openEdit = (k: ApiKey) => {
    if (openId === k.id) return setOpenId(null);
    setOpenId(k.id);
    setEdit({
      name: k.name, scopes: k.scopes, origins: k.allowed_origins.join('\n'), rate: String(k.rate_limit_per_min),
      share_mode: k.share_mode, categories: k.categories, channel_ids: k.channel_ids, include_premium: k.include_premium, include_drm: k.include_drm,
    });
  };

  const saveEdit = async (k: ApiKey) => {
    const name = edit.name.trim();
    if (!name) return toast({ title: 'Jina linahitajika', variant: 'destructive' });
    if (k.type === 'token' && !edit.scopes.length) return toast({ title: 'Chagua angalau ruhusa moja', variant: 'destructive' });
    if (k.type === 'channels' && edit.share_mode === 'categories' && !edit.categories.length) return toast({ title: 'Chagua angalau category moja', variant: 'destructive' });
    if (k.type === 'channels' && edit.share_mode === 'selected' && !edit.channel_ids.length) return toast({ title: 'Chagua angalau channel moja', variant: 'destructive' });
    const { list, bad } = parseOrigins(edit.origins);
    if (bad.length) return toast({ title: 'Origin si sahihi', description: bad.join(', '), variant: 'destructive' });
    const rate = Math.max(1, Math.min(10000, Math.floor(Number(edit.rate) || 60)));
    const patch: Record<string, unknown> = { name, allowed_origins: list, rate_limit_per_min: rate };
    if (k.type === 'token') patch.scopes = edit.scopes;
    else Object.assign(patch, {
      share_mode: edit.share_mode,
      categories: edit.share_mode === 'categories' ? edit.categories : [],
      channel_ids: edit.share_mode === 'selected' ? edit.channel_ids : [],
      include_premium: edit.include_premium,
      include_drm: edit.include_drm,
    });
    try {
      await updateDoc(doc(db, 'api_keys', k.id), patch);
      await load();
      setOpenId(null);
      toast({ title: 'Imehifadhiwa', description: 'Mabadiliko yanaanza ndani ya takriban sekunde 30.' });
    } catch (e: any) { toast({ title: 'Hitilafu', description: e?.message, variant: 'destructive' }); }
  };

  // docs
  const [lang, setLang] = useState<LangId>('curl');
  const [openEp, setOpenEp] = useState<string | null>(null);
  const eps = endpointsFor(docType);
  const downloadMd = () => {
    const blob = new Blob([buildMarkdown(docType, root)], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = docType === 'token' ? 'TOKEN_API.md' : 'CHANNELS_API.md';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  // test console
  const [tKey, setTKey] = useState('');
  const [tEp, setTEp] = useState<string>('token');
  const [tVal, setTVal] = useState('');
  const [tRun, setTRun] = useState(false);
  const [tOut, setTOut] = useState<{ status: number; ms: number; body: string } | null>(null);
  const [tLink, setTLink] = useState('');
  useEffect(() => { setTEp(docType === 'token' ? 'token' : 'channels'); setTOut(null); setTLink(''); setTVal(''); setOpenEp(docType === 'token' ? 'token' : 'channels'); }, [docType]);

  const tEndpoint = eps.find((e) => e.id === tEp) || eps[0];
  const tInput =
    tEndpoint.id === 'resolve' || tEndpoint.id === 'resolve-bulk' ? { label: 'Link ya kuweka token', ph: EXAMPLE_URL, need: false }
    : tEndpoint.id === 'channel' || tEndpoint.id === 'play' ? { label: 'ID ya channel', ph: 'abc123 (kutoka kwenye /channels)', need: true }
    : tEndpoint.id === 'channels' || tEndpoint.id === 'playlist' ? { label: 'Tafuta kwa jina (hiari)', ph: 'azam', need: false }
    : null;

  const runTest = async () => {
    const ep = tEndpoint;
    const key = tKey.trim();
    const val = tVal.trim();
    if (ep.scope !== null && !key) return toast({ title: 'Weka API key', variant: 'destructive' });
    if (tInput?.need && !val) return toast({ title: 'Weka id ya channel', variant: 'destructive' });

    const params = new URLSearchParams();
    if (ep.id === 'resolve') params.set('url', val || EXAMPLE_URL);
    if ((ep.id === 'channels' || ep.id === 'playlist') && val) params.set('q', val);
    if (ep.keyInQuery) params.set('api_key', key);
    const qs = params.toString();
    const url = base + ep.path.replace('CHANNEL_ID', encodeURIComponent(val)) + (qs ? `?${qs}` : '');

    setTOut(null);
    setTLink(ep.keyInQuery ? url : '');
    if (ep.responseType === 'redirect') return; // players follow the redirect – the link above is the result

    setTRun(true);
    const t0 = performance.now();
    try {
      const init: RequestInit = { method: ep.method, headers: {} };
      if (ep.scope !== null && !ep.keyInQuery) (init.headers as Record<string, string>)['X-API-Key'] = key;
      if (ep.id === 'resolve-bulk') {
        (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
        init.body = JSON.stringify({ urls: [val || EXAMPLE_URL] });
      }
      const res = await fetch(url, init);
      const text = await res.text();
      let pretty = text;
      try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch { pretty = text.length > 4000 ? text.slice(0, 4000) + '\n…' : text; }
      setTOut({ status: res.status, ms: Math.round(performance.now() - t0), body: pretty });
    } catch (e: any) {
      setTOut({ status: 0, ms: Math.round(performance.now() - t0), body: `Ombi limeshindwa: ${e?.message}\n\nKama key ina "Allowed origins", ongeza website ya admin hii kwenye orodha, au jaribu kwa cURL.\nPia hakikisha function ya tokenApi imedeploy.` });
    }
    setTRun(false);
  };

  const counts = useMemo(() => ({
    active: keys.filter((k) => k.active).length,
    total: keys.length,
    reqs: keys.reduce((a, k) => a + k.request_count, 0),
  }), [keys]);

  const BaseSelect = (
    <select value={baseId} onChange={(e) => setBaseId(e.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-bold text-foreground outline-none focus:border-primary">
      {BASES.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
    </select>
  );

  const TypeSwitch = (
    <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
      {(['token', 'channels'] as ApiType[]).map((t) => (
        <button key={t} onClick={() => setDocType(t)} className={`rounded-lg py-2 text-xs font-black transition-colors ${docType === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
          {API_TYPES[t].label}
        </button>
      ))}
    </div>
  );

  return (
    <AdminLayout>
      <div className="mx-auto max-w-3xl space-y-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-foreground"><Terminal className="h-6 w-6 text-primary" /> API Access</h1>
          <p className="text-xs text-muted-foreground">Shiriki token au channels zako na website na app nyingine kwa usalama, kwa key unazozidhibiti.</p>
        </div>

        <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
          {([['keys', 'Keys', KeyRound], ['docs', 'Documentation', BookOpen], ['test', 'Jaribu', Play]] as const).map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id as Tab)} className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-black transition-colors ${tab === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {/* ───────────── KEYS ───────────── */}
        {tab === 'keys' && (
          <div className="space-y-4">
            {newKey && (
              <div className="space-y-3 rounded-2xl border border-green-500/40 bg-green-500/10 p-4">
                <p className="flex items-center gap-2 text-sm font-black text-green-500"><ShieldCheck className="h-5 w-5" /> Key ya "{newKey.name}" ({API_TYPES[newKey.type].short}) imetengenezwa</p>
                <div className="break-all rounded-xl bg-background p-3 font-mono text-sm font-bold text-foreground">{newKey.key}</div>
                <div className="flex flex-wrap items-center gap-2">
                  <CopyBtn text={newKey.key} label="Nakili key" />
                  {newKey.type === 'channels' && (
                    <CopyBtn text={`${apiBase(BASES[0].url, 'channels')}/playlist.m3u?api_key=${newKey.key}`} label="Nakili URL ya playlist (IPTV)" />
                  )}
                  <button onClick={() => { setDocType(newKey.type); setNewKey(null); setTab('docs'); }} className="rounded-lg bg-muted px-2.5 py-1.5 text-[11px] font-bold text-foreground hover:bg-primary/20">Fungua docs</button>
                </div>
                <p className="flex items-start gap-1.5 text-xs font-bold text-amber-500"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Nakili SASA. Haitaonyeshwa tena — tunahifadhi alama (hash) yake tu. Ukipoteza, tengeneza mpya na ufute hii.</p>
                <button onClick={() => setNewKey(null)} className="w-full rounded-xl bg-green-600 py-2.5 text-xs font-black text-white">Nimeinakili</button>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              {[['Keys', counts.total], ['Zinazofanya kazi', counts.active], ['Maombi (jumla)', counts.reqs.toLocaleString()]].map(([l, v]) => (
                <div key={String(l)} className="rounded-2xl border border-border bg-card p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{l}</p>
                  <p className="text-2xl font-black text-foreground">{v}</p>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <button onClick={() => { setCreating((v) => !v); setCreateType(null); }} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary py-3 text-sm font-black text-primary-foreground">
                <Plus className="h-4 w-4" /> Tengeneza key mpya
              </button>
              <button onClick={load} className="rounded-xl border border-border bg-card px-3 text-foreground hover:bg-muted"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
            </div>

            {creating && !createType && (
              <div className="space-y-2 rounded-2xl border border-primary/30 bg-card p-4">
                <p className="text-sm font-black text-foreground">Chagua aina ya API</p>
                {(['token', 'channels'] as ApiType[]).map((t) => (
                  <button key={t} onClick={() => { setCreateType(t); setForm({ ...emptyForm, rate: t === 'channels' ? '120' : '60' }); }} className="block w-full rounded-xl border border-border bg-background p-3 text-left hover:border-primary">
                    <span className="block text-sm font-black text-primary">{API_TYPES[t].label}</span>
                    <span className="block text-xs text-muted-foreground">{API_TYPES[t].summary}</span>
                  </button>
                ))}
              </div>
            )}

            {creating && createType && (
              <div className="space-y-3 rounded-2xl border border-primary/30 bg-card p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-black text-primary">{API_TYPES[createType].label}</p>
                  <button onClick={() => setCreateType(null)} className="text-[11px] font-bold text-muted-foreground underline">Badilisha aina</button>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Jina (nani anaitumia)</label>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Mfano: Website ya Habari" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary" />
                </div>

                {createType === 'token'
                  ? <ScopePicker value={form.scopes} onToggle={(id) => setForm({ ...form, scopes: toggleScope(form.scopes, id) })} />
                  : <ShareEditor value={form} onChange={(patch) => setForm({ ...form, ...patch })} chans={chans} />}

                <div>
                  <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Allowed origins (hiari)</label>
                  <textarea value={form.origins} onChange={(e) => setForm({ ...form, origins: e.target.value })} rows={3} placeholder={'https://mysite.com\nhttps://*.mysite.com'} className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 font-mono text-xs text-foreground outline-none focus:border-primary" />
                  <p className="mt-1 text-[11px] text-muted-foreground">Moja kwa mstari. Ikiwa wazi, key inakubalika kutoka website yoyote. Ukiitumia kwenye browser, WEKA website yako hapa. Server-to-server na apps za IPTV hazihusiki.</p>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Kikomo cha maombi kwa dakika</label>
                  <input type="number" min={1} max={10000} value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} className="w-32 rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary" />
                </div>
                <button onClick={createKey} disabled={saving} className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary py-3 text-sm font-black text-primary-foreground disabled:opacity-50">
                  <KeyRound className="h-4 w-4" /> {saving ? 'Inatengeneza…' : 'Tengeneza key'}
                </button>
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center p-10 text-muted-foreground"><RefreshCw className="mr-2 h-5 w-5 animate-spin" /> Inapakia…</div>
            ) : keys.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">Bado hakuna key. Bonyeza "Tengeneza key mpya" ili kuanza.</p>
            ) : (
              <ul className="space-y-2">
                {keys.map((k) => (
                  <li key={k.id} className={`overflow-hidden rounded-2xl border bg-card ${k.active ? 'border-border' : 'border-border/50 opacity-70'}`}>
                    <div className="space-y-2 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-foreground">{k.name}</p>
                          <p className="font-mono text-[11px] text-muted-foreground">{k.key_prefix}</p>
                        </div>
                        <label className="flex shrink-0 cursor-pointer items-center gap-2 text-[11px] font-bold text-foreground">
                          <span className={k.active ? 'text-green-500' : 'text-red-500'}>{k.active ? 'Inafanya kazi' : 'Imezimwa'}</span>
                          <input type="checkbox" checked={k.active} onChange={(e) => setActive(k, e.target.checked)} className="h-5 w-5 accent-primary" />
                        </label>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${k.type === 'channels' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/15 text-green-500'}`}>{API_TYPES[k.type].label}</span>
                        {k.type === 'token'
                          ? k.scopes.map((s) => (
                              <span key={s} className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${['premium', 'drm'].includes(s) ? 'bg-amber-500/20 text-amber-500' : 'bg-primary/15 text-primary'}`}>{s}</span>
                            ))
                          : (
                            <>
                              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">{shareSummary(k)}</span>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${k.include_premium ? 'bg-amber-500/20 text-amber-500' : 'bg-muted text-muted-foreground'}`}>{k.include_premium ? 'malipo: ndiyo' : 'bure tu'}</span>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${k.include_drm ? 'bg-amber-500/20 text-amber-500' : 'bg-muted text-muted-foreground'}`}>{k.include_drm ? 'DRM: ndiyo' : 'DRM: hapana'}</span>
                            </>
                          )}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {k.type === 'channels' && <>{sharedCount(k, chans)} channels · </>}
                        {k.request_count.toLocaleString()} maombi · mwisho {fmt(k.last_used_ms)} · {k.rate_limit_per_min}/dk · {k.allowed_origins.length ? `${k.allowed_origins.length} origin` : 'origins zote'}
                      </p>
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(k)} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-muted py-2 text-xs font-bold text-foreground hover:bg-primary/20">
                          Hariri <ChevronDown className={`h-3.5 w-3.5 transition-transform ${openId === k.id ? 'rotate-180' : ''}`} />
                        </button>
                        <button onClick={() => removeKey(k)} className="flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-500"><Trash2 className="h-3.5 w-3.5" /> Futa</button>
                      </div>
                    </div>
                    {openId === k.id && (
                      <div className="space-y-3 border-t border-border p-3">
                        <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary" />
                        {k.type === 'token'
                          ? <ScopePicker value={edit.scopes} onToggle={(id) => setEdit({ ...edit, scopes: toggleScope(edit.scopes, id) })} />
                          : <ShareEditor value={edit} onChange={(patch) => setEdit({ ...edit, ...patch })} chans={chans} />}
                        <textarea value={edit.origins} onChange={(e) => setEdit({ ...edit, origins: e.target.value })} rows={3} placeholder="Allowed origins (moja kwa mstari, wazi = zote)" className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 font-mono text-xs text-foreground outline-none focus:border-primary" />
                        <div className="flex items-center gap-2">
                          <input type="number" min={1} max={10000} value={edit.rate} onChange={(e) => setEdit({ ...edit, rate: e.target.value })} className="w-28 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary" />
                          <span className="text-xs text-muted-foreground">maombi / dakika</span>
                        </div>
                        <button onClick={() => saveEdit(k)} className="w-full rounded-xl bg-primary py-2.5 text-xs font-black text-primary-foreground">Hifadhi mabadiliko</button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* ───────────── DOCS ───────────── */}
        {tab === 'docs' && (
          <div className="space-y-4">
            {TypeSwitch}
            <p className="rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground"><b className="text-foreground">{API_TYPES[docType].label}:</b> {API_TYPES[docType].summary} Key ya aina moja haifanyi kazi kwenye aina nyingine.</p>

            <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-black text-foreground">Base URL</h2>
                <button onClick={downloadMd} className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-black text-primary-foreground"><Download className="h-3.5 w-3.5" /> Pakua .md</button>
              </div>
              {BaseSelect}
              <div className="flex items-center gap-2 rounded-xl bg-background p-2.5">
                <code className="min-w-0 flex-1 break-all text-xs font-bold text-foreground">{base}</code>
                <CopyBtn text={base} />
              </div>
              <p className="text-[11px] text-muted-foreground">"Direct" inafanya kazi mara tu <code>firebase deploy --only functions</code> ikimalizika. URL ya domain inahitaji pia <code>firebase deploy --only hosting:user</code>.</p>
            </div>

            <div className="space-y-2 rounded-2xl border border-border bg-card p-4 text-xs text-foreground">
              <h2 className="text-sm font-black">Haraka (dakika 2)</h2>
              <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                <li>Kwenye tab ya <b className="text-foreground">Keys</b>, tengeneza key ya <b className="text-foreground">{API_TYPES[docType].label}</b> na uinakili.</li>
                <li>Tuma header <code className="text-foreground">X-API-Key: &lt;key&gt;</code> kwa kila ombi.</li>
                <li>Piga <code className="text-foreground">GET {base}{docType === 'token' ? '/token' : '/channels'}</code>. Majibu ni JSON: <code className="text-foreground">{'{ "success": true, "data": … }'}</code> au <code className="text-foreground">{'{ "success": false, "error": { "code", "message" } }'}</code>.</li>
              </ol>
            </div>

            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {LANGS.map((l) => (
                <button key={l.id} onClick={() => setLang(l.id)} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold ${lang === l.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>{l.label}</button>
              ))}
            </div>

            <ul className="space-y-2">
              {eps.map((ep) => (
                <EndpointCard key={ep.id} ep={ep} base={base} lang={lang} open={openEp === ep.id} onToggle={() => setOpenEp(openEp === ep.id ? null : ep.id)} />
              ))}
            </ul>

            <h2 className="pt-2 text-lg font-black text-foreground">Mwongozo wa kuunganisha</h2>
            {guidesFor(docType).map((g) => (
              <div key={g.id} className="space-y-2 rounded-2xl border border-border bg-card p-4">
                <h3 className="text-sm font-black text-foreground">{g.title}</h3>
                <p className="text-xs text-muted-foreground">{g.text}</p>
                <Code text={g.code(base)} />
              </div>
            ))}

            {docType === 'token' ? (
              <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
                <h2 className="text-sm font-black text-foreground">Ruhusa (scopes)</h2>
                {SCOPES.map((s) => (
                  <p key={s.id} className="text-xs text-muted-foreground"><code className={`font-bold ${s.sensitive ? 'text-amber-500' : 'text-primary'}`}>{s.id}</code> — {s.desc}</p>
                ))}
              </div>
            ) : (
              <div className="space-y-2 rounded-2xl border border-border bg-card p-4 text-xs text-muted-foreground">
                <h2 className="text-sm font-black text-foreground">Unachoshiriki</h2>
                <p>Kila key ya Channels API ina mipangilio yake kwenye tab ya Keys:</p>
                <ul className="list-disc space-y-1 pl-5">
                  <li><b className="text-foreground">Channels zote</b>, <b className="text-foreground">categories maalum</b>, au <b className="text-foreground">channels ulizochagua</b>.</li>
                  <li><b className="text-foreground">Channels za malipo</b> zikizimwa, key inaona channels BURE tu.</li>
                  <li><b className="text-foreground">Funguo za DRM</b> zikizimwa, <code>play.drm</code> ni <code>null</code> na channels zilizosimbwa hazitacheza.</li>
                </ul>
              </div>
            )}

            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <h2 className="border-b border-border p-3 text-sm font-black text-foreground">Makosa (errors)</h2>
              <table className="w-full text-left text-xs">
                <tbody className="divide-y divide-border">
                  {errorsFor(docType).map((e) => (
                    <tr key={e.code}>
                      <td className="whitespace-nowrap p-2.5 font-bold text-foreground">{e.status}</td>
                      <td className="whitespace-nowrap p-2.5 font-mono text-primary">{e.code}</td>
                      <td className="p-2.5 text-muted-foreground">{e.meaning}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
              <h2 className="text-sm font-black text-foreground">Vikomo na tabia</h2>
              <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">{limitsFor(docType).map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
            <div className="space-y-2 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
              <h2 className="flex items-center gap-2 text-sm font-black text-amber-500"><ShieldCheck className="h-4 w-4" /> Usalama</h2>
              <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">{securityFor(docType).map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
          </div>
        )}

        {/* ───────────── TEST ───────────── */}
        {tab === 'test' && (
          <div className="space-y-3">
            {TypeSwitch}
            <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
              <h2 className="text-sm font-black text-foreground">Jaribu API moja kwa moja</h2>
              {BaseSelect}
              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">API key ({API_TYPES[docType].short})</label>
                <input type="password" value={tKey} onChange={(e) => setTKey(e.target.value)} placeholder="rtk_…" autoComplete="off" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 font-mono text-sm text-foreground outline-none focus:border-primary" />
              </div>
              <select value={tEp} onChange={(e) => { setTEp(e.target.value); setTOut(null); setTLink(''); }} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-xs font-bold text-foreground outline-none focus:border-primary">
                {eps.map((e) => <option key={e.id} value={e.id}>{e.method} {e.path.replace('CHANNEL_ID', '{id}')} — {e.title}</option>)}
              </select>
              {tInput && (
                <div>
                  <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{tInput.label}</label>
                  <input value={tVal} onChange={(e) => setTVal(e.target.value)} placeholder={tInput.ph} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 font-mono text-xs text-foreground outline-none focus:border-primary" />
                </div>
              )}
              <button onClick={runTest} disabled={tRun} className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary py-3 text-sm font-black text-primary-foreground disabled:opacity-40">
                <Play className="h-4 w-4" /> {tRun ? 'Inatuma…' : tEndpoint.responseType === 'redirect' ? 'Tengeneza kiungo' : 'Tuma ombi'}
              </button>

              {tLink && (
                <div className="space-y-2 rounded-xl bg-background p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{tEndpoint.responseType === 'redirect' ? 'Kiungo (weka kwenye player yako)' : 'URL ya kuweka kwenye app ya IPTV'}</p>
                  <code className="block break-all text-[11px] text-foreground">{tLink}</code>
                  <div className="flex flex-wrap gap-2">
                    <CopyBtn text={tLink} />
                    <a href={tLink} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-lg bg-muted px-2.5 py-1.5 text-[11px] font-bold text-foreground hover:bg-primary/20"><ExternalLink className="h-3.5 w-3.5" /> Fungua</a>
                  </div>
                </div>
              )}
              {tOut && (
                <div className="space-y-2">
                  <p className="text-xs font-bold">
                    <span className={tOut.status >= 200 && tOut.status < 300 ? 'text-green-500' : 'text-red-500'}>{tOut.status || 'ERROR'}</span>
                    <span className="text-muted-foreground"> · {tOut.ms} ms</span>
                  </p>
                  <Code text={tOut.body} />
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">Jaribio linaenda kutoka browser yako. Key yenye "Allowed origins" itakataa isipokuwa website ya admin ipo kwenye orodha — tumia cURL kwa jaribio la server.</p>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

function ScopePicker({ value, onToggle }: { value: string[]; onToggle: (id: string) => void }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Ruhusa (scopes)</label>
      <div className="space-y-1.5">
        {SCOPES.map((s) => (
          <label key={s.id} className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-2.5 ${value.includes(s.id) ? (s.sensitive ? 'border-amber-500/50 bg-amber-500/5' : 'border-primary/40 bg-primary/5') : 'border-border bg-background'}`}>
            <input type="checkbox" checked={value.includes(s.id)} onChange={() => onToggle(s.id)} className="mt-0.5 h-4 w-4 shrink-0 accent-primary" />
            <span className="text-xs">
              <b className={s.sensitive ? 'text-amber-500' : 'text-foreground'}>{s.label}</b>
              <span className="block text-muted-foreground">{s.desc}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

/** Which channels a Channels-API key shares, plus premium / DRM switches. */
function ShareEditor({ value, onChange, chans }: { value: ShareValue; onChange: (patch: Partial<ShareValue>) => void; chans: ChanInfo[] }) {
  const [filter, setFilter] = useState('');
  const cats = useMemo(() => {
    const m = new Map<string, number>();
    chans.forEach((c) => { const n = c.category || 'Other'; m.set(n, (m.get(n) || 0) + 1); });
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [chans]);
  const visible = chans.filter((c) => !filter.trim() || c.name.toLowerCase().includes(filter.trim().toLowerCase()));
  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const n = sharedCount(value, chans);

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Channels zinazoshirikiwa</label>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
          {([['all', 'Zote'], ['categories', 'Categories'], ['selected', 'Nitachagua']] as [ShareMode, string][]).map(([m, l]) => (
            <button key={m} type="button" onClick={() => onChange({ share_mode: m })} className={`rounded-lg py-2 text-xs font-black ${value.share_mode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{l}</button>
          ))}
        </div>
      </div>

      {value.share_mode === 'categories' && (
        <div className="flex flex-wrap gap-1.5">
          {cats.length === 0 && <p className="text-xs text-muted-foreground">Hakuna categories bado.</p>}
          {cats.map(([name, count]) => (
            <button key={name} type="button" onClick={() => onChange({ categories: toggle(value.categories, name) })} className={`rounded-full px-3 py-1.5 text-xs font-bold ${value.categories.includes(name) ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
              {name} <span className="opacity-70">({count})</span>
            </button>
          ))}
        </div>
      )}

      {value.share_mode === 'selected' && (
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Tafuta channel…" className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-xs text-foreground outline-none focus:border-primary" />
          </div>
          <div className="flex gap-2 text-[11px] font-bold">
            <button type="button" onClick={() => onChange({ channel_ids: Array.from(new Set([...value.channel_ids, ...visible.map((c) => c.id)])) })} className="rounded-lg bg-muted px-2.5 py-1.5 text-foreground hover:bg-primary/20">Chagua zinazoonekana ({visible.length})</button>
            <button type="button" onClick={() => onChange({ channel_ids: [] })} className="rounded-lg bg-muted px-2.5 py-1.5 text-foreground hover:bg-primary/20">Futa uchaguzi</button>
          </div>
          <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-border bg-background p-1.5">
            {visible.length === 0 && <p className="p-2 text-xs text-muted-foreground">Hakuna channel.</p>}
            {visible.map((c) => (
              <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-muted">
                <input type="checkbox" checked={value.channel_ids.includes(c.id)} onChange={() => onChange({ channel_ids: toggle(value.channel_ids, c.id) })} className="h-4 w-4 shrink-0 accent-primary" />
                <span className="min-w-0 flex-1 truncate font-bold text-foreground">{c.name}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">{c.category || '—'}</span>
                {!c.is_free && <span className="shrink-0 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-black text-amber-500">MALIPO</span>}
              </label>
            ))}
          </div>
        </div>
      )}

      <label className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-2.5 ${value.include_premium ? 'border-amber-500/50 bg-amber-500/5' : 'border-border bg-background'}`}>
        <input type="checkbox" checked={value.include_premium} onChange={(e) => onChange({ include_premium: e.target.checked })} className="mt-0.5 h-4 w-4 shrink-0 accent-primary" />
        <span className="text-xs"><b className="text-foreground">Pamoja na channels za malipo</b><span className="block text-muted-foreground">Zikizimwa, website hii inapata channels BURE tu.</span></span>
      </label>
      <label className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-2.5 ${value.include_drm ? 'border-amber-500/50 bg-amber-500/5' : 'border-border bg-background'}`}>
        <input type="checkbox" checked={value.include_drm} onChange={(e) => onChange({ include_drm: e.target.checked })} className="mt-0.5 h-4 w-4 shrink-0 accent-primary" />
        <span className="text-xs"><b className="text-foreground">Funguo za DRM (ClearKey)</b><span className="block text-muted-foreground">Zinahitajika ili channels zilizosimbwa (nyingi za Azam) zicheze. Zikizimwa, channels hizo hazitacheza.</span></span>
      </label>

      <p className={`text-xs font-bold ${n === 0 ? 'text-red-500' : 'text-green-500'}`}>Itashiriki channels {n} (kati ya {chans.length} zinazotumika).</p>
    </div>
  );
}

function EndpointCard({ ep, base, lang, open, onToggle }: { ep: Endpoint; base: string; lang: LangId; open: boolean; onToggle: () => void }) {
  return (
    <li className="overflow-hidden rounded-2xl border border-border bg-card">
      <button onClick={onToggle} className="flex w-full items-center gap-2.5 p-3 text-left">
        <span className={`rounded-md px-2 py-0.5 text-[10px] font-black ${ep.method === 'GET' ? 'bg-green-500/15 text-green-500' : 'bg-blue-500/15 text-blue-400'}`}>{ep.method}</span>
        <span className="min-w-0 flex-1">
          <code className="block truncate text-xs font-bold text-foreground">{ep.path}</code>
          <span className="block truncate text-[11px] text-muted-foreground">{ep.title}</span>
        </span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${ep.scope ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>{ep.scope || 'public'}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-border p-3">
          <p className="text-xs text-muted-foreground">{ep.summary}</p>
          {ep.params.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-border">
              <table className="w-full text-left text-[11px]">
                <tbody className="divide-y divide-border">
                  {ep.params.map((p) => (
                    <tr key={p.name}>
                      <td className="whitespace-nowrap p-2 font-mono font-bold text-foreground">{p.name}{p.required && <span className="text-red-500"> *</span>}</td>
                      <td className="whitespace-nowrap p-2 text-muted-foreground">{p.in}</td>
                      <td className="p-2 text-muted-foreground">{p.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Ombi</p>
          <Code text={sample(lang, base, ep)} />
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Jibu</p>
          <Code text={typeof ep.response === 'string' ? ep.response : JSON.stringify(ep.response, null, 2)} />
          {ep.notes?.map((n) => <p key={n} className="text-[11px] text-muted-foreground">• {n}</p>)}
        </div>
      )}
    </li>
  );
}
