import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, doc, getDoc, setDoc, updateDoc, deleteField, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AdminLayout from '@/components/AdminLayout';
import { useToast } from '@/hooks/use-toast';
import { describeLink, isHttpUrl, applyBackupToken, usesCdnToken, extractToken, isTokenLike, jwtExpMs, type BackupType } from '@/lib/streamBackup';
import { ShieldAlert, Search, Save, Trash2, RefreshCw, ChevronDown, Radio, AlertTriangle, CheckCircle2, Info, KeyRound } from 'lucide-react';

interface Draft {
  backup_url: string;
  backup_type: BackupType;
  backup_kid: string;
  backup_key: string;
  backup_enabled: boolean;
}
interface Ch extends Draft {
  id: string;
  name: string;
  type: string;
  active: boolean;
  sort_order: number;
}
type Filter = 'all' | 'has' | 'none' | 'on';

const toDraft = (c: any): Draft => ({
  backup_url: c.backup_url || '',
  backup_type: (c.backup_type as BackupType) || '',
  backup_kid: c.backup_kid || '',
  backup_key: c.backup_key || '',
  backup_enabled: c.backup_enabled === true,
});
const same = (a: Draft, b: Draft) =>
  a.backup_url.trim() === b.backup_url.trim() && a.backup_type === b.backup_type &&
  a.backup_kid.trim() === b.backup_kid.trim() && a.backup_key.trim() === b.backup_key.trim() &&
  a.backup_enabled === b.backup_enabled;

export default function BackupLinks() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [channels, setChannels] = useState<Ch[]>([]);
  const [saved, setSaved] = useState<Record<string, Draft>>({});
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [forceAll, setForceAll] = useState(false);
  const [autoFailover, setAutoFailover] = useState(true);
  const [tokenSync, setTokenSync] = useState(false);
  const [manualToken, setManualToken] = useState('');   // saved
  const [manualTokenAt, setManualTokenAt] = useState('');
  const [tokenDraft, setTokenDraft] = useState('');     // text box
  const [dashToken, setDashToken] = useState('');       // tokens/global (Token dashboard)
  const [savingToken, setSavingToken] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [cSnap, sSnap, tSnap] = await Promise.all([
        getDocs(collection(db, 'channels')),
        getDoc(doc(db, 'settings', 'stream')),
        getDoc(doc(db, 'tokens', 'global')),
      ]);
      const list: Ch[] = cSnap.docs
        .map((d) => {
          const c: any = d.data();
          return { id: d.id, name: c.name || d.id, type: c.type || '', active: c.active !== false, sort_order: c.sort_order || 0, ...toDraft(c) };
        })
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
      setChannels(list);
      const base: Record<string, Draft> = {};
      list.forEach((c) => (base[c.id] = toDraft(c)));
      setSaved(base);
      setDrafts(base);
      const cfg: any = sSnap.exists() ? sSnap.data() : {};
      setForceAll(cfg.force_backup_all === true);
      setAutoFailover(cfg.auto_failover !== false);
      setTokenSync(cfg.backup_token_sync === true);
      setManualToken(String(cfg.backup_manual_token || ''));
      setManualTokenAt(String(cfg.backup_manual_token_at || ''));
      const dt: any = tSnap.exists() ? tSnap.data() : {};
      setDashToken(String(dt.value || dt.token || '').trim());
    } catch (e: any) {
      toast({ title: 'Hitilafu', description: e?.message || 'Imeshindwa kupakia', variant: 'destructive' });
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const saveCfg = async (patch: { force_backup_all?: boolean; auto_failover?: boolean }) => {
    try {
      await setDoc(doc(db, 'settings', 'stream'), { ...patch, updated_at: new Date().toISOString() }, { merge: true });
      toast({ title: 'Imehifadhiwa', description: 'Inaanza kutumika kwa watazamaji mara moja.' });
    } catch (e: any) {
      toast({ title: 'Hitilafu', description: e?.message, variant: 'destructive' });
      load();
    }
  };

  const setField = (id: string, patch: Partial<Draft>) =>
    setDrafts((p) => ({ ...p, [id]: { ...p[id], ...patch } }));

  const saveRow = async (c: Ch) => {
    const d = drafts[c.id];
    const url = d.backup_url.trim();
    if (url && !isHttpUrl(url)) {
      return toast({ title: 'Link si sahihi', description: 'Link lazima ianze na https://', variant: 'destructive' });
    }
    if (d.backup_enabled && !url) {
      return toast({ title: 'Weka link kwanza', description: 'Huwezi kuwasha backup bila link.', variant: 'destructive' });
    }
    setBusy(c.id);
    try {
      // NOTE: the link is stored exactly as pasted (token included) – never sanitised.
      await updateDoc(doc(db, 'channels', c.id), url
        ? {
            backup_url: url,
            backup_type: d.backup_type,
            backup_kid: d.backup_kid.trim(),
            backup_key: d.backup_key.trim(),
            backup_enabled: d.backup_enabled,
            backup_updated_at: serverTimestamp(),
          }
        : {
            backup_url: deleteField(), backup_type: deleteField(), backup_kid: deleteField(),
            backup_key: deleteField(), backup_enabled: deleteField(), backup_updated_at: deleteField(),
          });
      const clean: Draft = url ? { ...d, backup_url: url } : toDraft({});
      setSaved((p) => ({ ...p, [c.id]: clean }));
      setDrafts((p) => ({ ...p, [c.id]: clean }));
      toast({ title: 'Imehifadhiwa', description: `${c.name}: backup ${url ? (d.backup_enabled ? 'IMEWASHWA' : 'imehifadhiwa') : 'imefutwa'}.` });
    } catch (e: any) {
      toast({ title: 'Hitilafu', description: e?.message, variant: 'destructive' });
    }
    setBusy(null);
  };

  const toggleSync = (v: boolean) => {
    setTokenSync(v);
    saveCfg({ backup_token_sync: v } as any);
  };

  const saveManualToken = async () => {
    const t = extractToken(tokenDraft);
    if (!isTokenLike(t)) {
      return toast({ title: 'Token si sahihi', description: 'Bandika token kamili (sehemu tatu zilizotenganishwa na nukta).', variant: 'destructive' });
    }
    const exp = jwtExpMs(t);
    if (exp && exp < Date.now() && !window.confirm('Token hii IMESHAISHA muda. Endelea kuihifadhi?')) return;
    setSavingToken(true);
    try {
      const at = new Date().toISOString();
      await setDoc(doc(db, 'settings', 'stream'), { backup_manual_token: t, backup_manual_token_at: at, updated_at: at }, { merge: true });
      setManualToken(t);
      setManualTokenAt(at);
      setTokenDraft('');
      toast({ title: 'Token imewekwa', description: `Inatumika kwenye backup links ${azamCount} za Azam. Watazamaji wanapata mara moja.` });
    } catch (e: any) {
      toast({ title: 'Hitilafu', description: e?.message, variant: 'destructive' });
    }
    setSavingToken(false);
  };

  const clearManualToken = async () => {
    if (!window.confirm('Futa token ya mkono? Backup links zitatumia token iliyomo ndani ya kila link.')) return;
    try {
      await setDoc(doc(db, 'settings', 'stream'), { backup_manual_token: '', backup_manual_token_at: '', updated_at: new Date().toISOString() }, { merge: true });
      setManualToken('');
      setManualTokenAt('');
      toast({ title: 'Imefutwa' });
    } catch (e: any) {
      toast({ title: 'Hitilafu', description: e?.message, variant: 'destructive' });
    }
  };

  const removeBackup = async (c: Ch) => {
    if (!window.confirm(`Futa backup ya ${c.name}?`)) return;
    setBusy(c.id);
    try {
      await updateDoc(doc(db, 'channels', c.id), {
        backup_url: deleteField(), backup_type: deleteField(), backup_kid: deleteField(),
        backup_key: deleteField(), backup_enabled: deleteField(), backup_updated_at: deleteField(),
      });
      setSaved((p) => ({ ...p, [c.id]: toDraft({}) }));
      setDrafts((p) => ({ ...p, [c.id]: toDraft({}) }));
      toast({ title: 'Imefutwa', description: `Backup ya ${c.name} imefutwa.` });
    } catch (e: any) {
      toast({ title: 'Hitilafu', description: e?.message, variant: 'destructive' });
    }
    setBusy(null);
  };

  const counts = useMemo(() => ({
    all: channels.length,
    has: channels.filter((c) => saved[c.id]?.backup_url).length,
    none: channels.filter((c) => !saved[c.id]?.backup_url).length,
    on: channels.filter((c) => saved[c.id]?.backup_url && saved[c.id]?.backup_enabled).length,
  }), [channels, saved]);

  // Token applied to Azam backup links right now
  const effToken = tokenSync ? dashToken : manualToken;
  const effSource = tokenSync ? 'dashboard' : 'mkono';
  const azamCount = channels.filter((c) => saved[c.id]?.backup_url && usesCdnToken(saved[c.id].backup_url)).length;
  const tokenExp = effToken ? jwtExpMs(effToken) : null;

  const shown = channels.filter((c) => {
    const s = saved[c.id];
    if (filter === 'has' && !s?.backup_url) return false;
    if (filter === 'none' && s?.backup_url) return false;
    if (filter === 'on' && !(s?.backup_url && s.backup_enabled)) return false;
    return !search.trim() || c.name.toLowerCase().includes(search.trim().toLowerCase());
  });

  const fmt = (ms: number) => new Date(ms).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <AdminLayout>
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-black text-foreground"><ShieldAlert className="h-6 w-6 text-primary" /> Backup Links</h1>
            <p className="text-xs text-muted-foreground">Link ya mkono (MPD / M3U8) ya kutumia pale token API au link kuu ikishindwa.</p>
          </div>
          <button onClick={load} className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-foreground hover:bg-muted">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Global controls */}
        <div className={`space-y-3 rounded-2xl border p-4 ${forceAll ? 'border-amber-500/50 bg-amber-500/10' : 'border-border bg-card'}`}>
          <label className="flex cursor-pointer items-start justify-between gap-3">
            <span>
              <span className="block text-sm font-black text-foreground">Tumia Backup kwa vituo vyote (Manual mode)</span>
              <span className="block text-xs text-muted-foreground">Kila kituo chenye backup link kitacheza backup moja kwa moja, bila kutumia token API. Vituo visivyo na backup vinaendelea na link kuu.</span>
            </span>
            <input type="checkbox" checked={forceAll} onChange={(e) => { setForceAll(e.target.checked); saveCfg({ force_backup_all: e.target.checked }); }} className="mt-1 h-5 w-5 shrink-0 accent-primary" />
          </label>
          {forceAll && (
            <p className="flex items-center gap-1.5 text-xs font-bold text-amber-500"><AlertTriangle className="h-4 w-4" /> MANUAL MODE IMEWASHWA — watazamaji wanatumia backup links.</p>
          )}
          <label className="flex cursor-pointer items-start justify-between gap-3 border-t border-border/60 pt-3">
            <span>
              <span className="block text-sm font-black text-foreground">Auto-failover</span>
              <span className="block text-xs text-muted-foreground">Link kuu ikishindwa mara 2 mfululizo, mtazamaji anahamishiwa backup moja kwa moja (kama ipo) na anaona "SERVER 2".</span>
            </span>
            <input type="checkbox" checked={autoFailover} onChange={(e) => { setAutoFailover(e.target.checked); saveCfg({ auto_failover: e.target.checked }); }} className="mt-1 h-5 w-5 shrink-0 accent-primary" />
          </label>
        </div>

        {/* Token for Azam backup links */}
        <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary/15 p-2.5 text-primary"><KeyRound className="h-5 w-5" /></div>
            <div className="min-w-0">
              <h2 className="text-sm font-black text-foreground">Token ya Backup Links (Azam)</h2>
              <p className="text-xs text-muted-foreground">Inatumika kwenye backup links {azamCount} zenye token. Links za seva nyingine hazibadilishwi.</p>
            </div>
          </div>

          <label className="flex cursor-pointer items-start justify-between gap-3 rounded-xl bg-background p-3">
            <span>
              <span className="block text-sm font-black text-foreground">Sasisha token otomatiki</span>
              <span className="block text-xs text-muted-foreground">{tokenSync ? 'Backup links zinatumia token ya Token dashboard (inayojisasisha yenyewe). Hakuna cha kubandika.' : 'Zima = unabandika token mwenyewe hapa chini.'}</span>
            </span>
            <input type="checkbox" checked={tokenSync} onChange={(e) => toggleSync(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-primary" />
          </label>

          {tokenSync ? (
            <div className="space-y-1 text-xs">
              {dashToken ? (
                <p className={`flex items-center gap-1.5 font-bold ${tokenExp && tokenExp < Date.now() ? 'text-red-500' : 'text-green-500'}`}>
                  {tokenExp && tokenExp < Date.now() ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                  Token ya dashboard {tokenExp ? (tokenExp < Date.now() ? `IMEISHA (${fmt(tokenExp)})` : `inaisha ${fmt(tokenExp)}`) : 'imepatikana'}
                </p>
              ) : (
                <p className="flex items-center gap-1.5 font-bold text-red-500"><AlertTriangle className="h-4 w-4" /> Hakuna token kwenye Token dashboard — fungua ukurasa wa Token.</p>
              )}
              <p className="text-muted-foreground">Token dashboard ikiacha kusasisha, zima kitufe hiki na uweke token mwenyewe.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Bandika token tu</label>
              <textarea
                value={tokenDraft}
                onChange={(e) => setTokenDraft(e.target.value)}
                rows={3}
                placeholder="eyJhbGciOiJIUzUxMiIs…  (unaweza pia kubandika link nzima, token itachukuliwa)"
                className="w-full resize-none break-all rounded-xl border border-border bg-background px-3 py-2 font-mono text-xs text-foreground outline-none focus:border-primary"
              />
              {tokenDraft.trim() && (() => {
                const t = extractToken(tokenDraft);
                const e = isTokenLike(t) ? jwtExpMs(t) : null;
                return !isTokenLike(t)
                  ? <p className="text-xs font-bold text-red-500">Hii haionekani kama token kamili.</p>
                  : <p className={`text-xs font-bold ${e && e < Date.now() ? 'text-red-500' : 'text-green-500'}`}>{e ? (e < Date.now() ? `Token IMEISHA (${fmt(e)})` : `Token sahihi — inaisha ${fmt(e)}`) : 'Token sahihi'}</p>;
              })()}
              <button onClick={saveManualToken} disabled={savingToken || !tokenDraft.trim()} className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-xs font-black text-primary-foreground disabled:opacity-40">
                <Save className="h-4 w-4" /> {savingToken ? 'Inahifadhi…' : `Weka kwenye backup zote za Azam (${azamCount})`}
              </button>

              {manualToken ? (
                <div className="flex items-center justify-between gap-2 rounded-xl bg-background p-2.5 text-xs">
                  <span className={`font-bold ${tokenExp && tokenExp < Date.now() ? 'text-red-500' : 'text-green-500'}`}>
                    Token ya mkono {tokenExp ? (tokenExp < Date.now() ? `IMEISHA (${fmt(tokenExp)})` : `inaisha ${fmt(tokenExp)}`) : 'imewekwa'}
                    {manualTokenAt && <span className="block font-normal text-muted-foreground">Imewekwa {fmt(new Date(manualTokenAt).getTime())}</span>}
                  </span>
                  <button onClick={clearManualToken} className="shrink-0 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 font-bold text-red-500">Futa</button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Hakuna token ya mkono — kila link inatumia token iliyomo ndani yake.</p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-blue-500/20 bg-blue-500/10 p-3 text-xs text-blue-400">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Bandika link kamili kama ilivyo (mfano <code>…/tok_&lt;token&gt;/live/eds/…/DASH/….mpd</code> au <code>https://…/index.m3u8?token=…</code>). Link ya Azam ikiwa na token, token hiyo hubadilishwa na ile ya kadi ya "Token ya Backup Links" hapo juu (ukiiwasha). Links za seva nyingine hazibadilishwi kamwe.</p>
        </div>

        {/* Filters */}
        <div className="space-y-3 rounded-2xl border border-border bg-card p-3">
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {([['all', 'Vyote'], ['has', 'Vina backup'], ['on', 'Backup IMEWASHWA'], ['none', 'Havina']] as [Filter, string][]).map(([id, l]) => (
              <button key={id} onClick={() => setFilter(id)} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold ${filter === id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                {l} <span className="opacity-70">({counts[id]})</span>
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tafuta kituo…" className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-sm text-foreground outline-none focus:border-primary" />
          </div>
        </div>

        {/* Channel list */}
        {loading ? (
          <div className="flex items-center justify-center p-10 text-muted-foreground"><RefreshCw className="mr-2 h-5 w-5 animate-spin" /> Inapakia…</div>
        ) : shown.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">Hakuna vituo vinavyolingana.</p>
        ) : (
          <ul className="space-y-2">
            {shown.map((c) => {
              const d = drafts[c.id] || toDraft({});
              const s = saved[c.id] || toDraft({});
              const dirty = !same(d, s);
              const rawUrl = d.backup_url.trim();
              const effUrl = rawUrl ? applyBackupToken(rawUrl, effToken) : '';
              const tokenApplied = !!effToken && effUrl !== rawUrl;
              const info = rawUrl && isHttpUrl(rawUrl) ? describeLink(effUrl, d.backup_type) : null;
              const expired = info?.tokenExpiresMs ? info.tokenExpiresMs < Date.now() : false;
              const expiringSoon = info?.tokenExpiresMs ? !expired && info.tokenExpiresMs - Date.now() < 3_600_000 : false;
              const isOpen = open === c.id;
              const live = s.backup_url && s.backup_enabled;
              return (
                <li key={c.id} className={`overflow-hidden rounded-2xl border bg-card ${live ? 'border-amber-500/50' : 'border-border'}`}>
                  <button onClick={() => setOpen(isOpen ? null : c.id)} className="flex w-full items-center gap-3 p-3 text-left">
                    <Radio className={`h-4 w-4 shrink-0 ${c.active ? 'text-green-500' : 'text-muted-foreground'}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-black text-foreground">{c.name}</span>
                      <span className="block text-[11px] text-muted-foreground uppercase">{c.type || 'hls'} · {s.backup_url ? `backup ${detectLabel(s)}` : 'hakuna backup'}</span>
                    </span>
                    {live && <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-black text-amber-500">BACKUP ON</span>}
                    {!live && s.backup_url && <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-bold text-green-500">tayari</span>}
                    {dirty && <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">haijahifadhiwa</span>}
                    <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isOpen && (
                    <div className="space-y-3 border-t border-border p-3">
                      <div>
                        <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Backup link (MPD au M3U8)</label>
                        <textarea
                          value={d.backup_url}
                          onChange={(e) => setField(c.id, { backup_url: e.target.value })}
                          rows={3}
                          placeholder="https://…/index.m3u8  au  https://…/manifest.mpd"
                          className="w-full resize-none break-all rounded-xl border border-border bg-background px-3 py-2 font-mono text-xs text-foreground outline-none focus:border-primary"
                        />
                        {d.backup_url.trim() && !isHttpUrl(d.backup_url) && <p className="mt-1 text-xs font-bold text-red-500">Link lazima ianze na https://</p>}
                        {info && (
                          <div className="mt-2 space-y-1 text-xs">
                            <p className="font-bold text-foreground">Aina: <span className="text-primary">{info.type === 'dash' ? 'MPD (DASH)' : 'M3U8 (HLS)'}</span></p>
                            {tokenApplied && <p className="font-bold text-primary">Token ya {effSource} itawekwa kwenye link hii kiotomatiki.</p>}
                            {info.insecure && <p className="flex items-center gap-1 font-bold text-amber-500"><AlertTriangle className="h-3.5 w-3.5" /> http:// inazuiwa kwenye website ya https — tumia https:// kama inapatikana.</p>}
                            {info.tokenExpiresMs && (
                              expired
                                ? <p className="flex items-center gap-1 font-bold text-red-500"><AlertTriangle className="h-3.5 w-3.5" /> Token {tokenApplied ? `(${effSource})` : 'iliyomo kwenye link'} IMEISHA ({fmt(info.tokenExpiresMs)})</p>
                                : <p className={`flex items-center gap-1 font-bold ${expiringSoon ? 'text-amber-500' : 'text-green-500'}`}>{expiringSoon ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Token {tokenApplied ? `(${effSource})` : ''} inaisha {fmt(info.tokenExpiresMs)}</p>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Aina</label>
                          <select value={d.backup_type} onChange={(e) => setField(c.id, { backup_type: e.target.value as BackupType })} className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs font-bold text-foreground outline-none focus:border-primary">
                            <option value="">Auto-detect</option>
                            <option value="dash">MPD (DASH)</option>
                            <option value="hls">M3U8 (HLS)</option>
                          </select>
                        </div>
                        <label className="flex cursor-pointer items-end gap-2 pb-2 text-xs font-bold text-foreground">
                          <input type="checkbox" checked={d.backup_enabled} onChange={(e) => setField(c.id, { backup_enabled: e.target.checked })} className="h-5 w-5 accent-primary" />
                          Tumia backup SASA
                        </label>
                      </div>

                      <details className="rounded-xl border border-border bg-background/50 p-2">
                        <summary className="cursor-pointer text-xs font-bold text-muted-foreground">ClearKey ya backup (hiari — kama ni DRM tofauti na link kuu)</summary>
                        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <input value={d.backup_kid} onChange={(e) => setField(c.id, { backup_kid: e.target.value })} placeholder="KID (hex)" className="rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-foreground outline-none focus:border-primary" />
                          <input value={d.backup_key} onChange={(e) => setField(c.id, { backup_key: e.target.value })} placeholder="KEY (hex)" className="rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-foreground outline-none focus:border-primary" />
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">Ukiacha wazi, funguo za kituo kuu zinatumika.</p>
                      </details>

                      <div className="flex gap-2">
                        <button onClick={() => saveRow(c)} disabled={!dirty || busy === c.id} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-xs font-black text-primary-foreground disabled:opacity-40">
                          <Save className="h-4 w-4" /> {busy === c.id ? 'Inahifadhi…' : 'Hifadhi'}
                        </button>
                        {s.backup_url && (
                          <button
                            onClick={() => removeBackup(c)}
                            disabled={busy === c.id}
                            className="flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3 text-xs font-bold text-red-500 disabled:opacity-40"
                          >
                            <Trash2 className="h-4 w-4" /> Futa
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AdminLayout>
  );
}

function detectLabel(d: Draft) {
  return describeLink(d.backup_url, d.backup_type).type === 'dash' ? 'MPD' : 'M3U8';
}
