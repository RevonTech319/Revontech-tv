import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AdminLayout from '@/components/AdminLayout';
import { useToast } from '@/hooks/use-toast';
import {
  Users, CheckCircle, XCircle, Clock, Search, Download, Send, Copy, Phone, RefreshCw, ChevronDown,
} from 'lucide-react';
import {
  normalizePhone, exportCSV, exportExcel, exportJSON, exportNumbersTxt, exportVCF, type Row,
} from '@/lib/exportUtils';
import { sendBulkSms, smsSegments, SMS_PROVIDER_CONFIGURED } from '@/lib/sms';

type Status = 'active' | 'inactive' | 'none';
type Filter = 'all' | 'active' | 'inactive' | 'expiring' | 'none';

interface Subscriber {
  key: string;
  name: string;
  accountPhone: string; // normalized
  paymentPhones: string[]; // normalized, numbers actually used to pay
  smsPhone: string; // best number to message
  status: Status;
  plan: string;
  expiresMs: number | null;
  daysLeft: number | null;
  totalPaid: number;
  paidCount: number;
  joinedMs: number | null;
}

const planLabels: Record<string, string> = {
  day: 'Siku 1', week: 'Wiki 1', week2: 'Wiki 2', month: 'Mwezi 1', free: 'Bure',
};
const DAY = 86_400_000;
const PAGE = 40;

const toMs = (v: any): number | null => {
  if (!v) return null;
  if (typeof v?.toDate === 'function') return v.toDate().getTime();
  if (typeof v?.seconds === 'number') return v.seconds * 1000;
  const t = typeof v === 'number' ? v : new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
};
const fmtDate = (ms: number | null) => (ms ? new Date(ms).toLocaleDateString('en-GB') : '—');
const money = (n: number) => `TZS ${Math.round(n).toLocaleString('en-US')}`;

export default function Subscribers() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Subscriber[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(PAGE);
  const [exportOpen, setExportOpen] = useState(false);
  const [smsOpen, setSmsOpen] = useState(false);
  const [message, setMessage] = useState('Habari {name}, kifurushi chako cha RevonTech TV kinaisha tarehe {expires}. Lipia sasa uendelee kutazama mechi live!');
  const [sending, setSending] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [pSnap, sSnap] = await Promise.all([
        getDocs(collection(db, 'profiles')),
        getDocs(collection(db, 'subscriptions')),
      ]);
      const profiles = pSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      const subs = sSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      const now = Date.now();

      const byUser = new Map<string, any[]>();
      subs.forEach((s) => {
        if (!s.user_id) return;
        byUser.set(s.user_id, [...(byUser.get(s.user_id) || []), s]);
      });
      const profileByUser = new Map<string, any>();
      profiles.forEach((p) => profileByUser.set(p.user_id || p.id, p));

      const ids = new Set<string>([...profileByUser.keys(), ...byUser.keys()]);
      const out: Subscriber[] = [];

      ids.forEach((uid) => {
        const p = profileByUser.get(uid);
        const us = byUser.get(uid) || [];
        const paid = us.filter((s) => s.status === 'active');
        const live = paid
          .filter((s) => (toMs(s.expires_at) ?? 0) > now)
          .sort((a, b) => (toMs(b.expires_at) ?? 0) - (toMs(a.expires_at) ?? 0))[0];
        const lastPaid = [...paid].sort((a, b) => (toMs(b.expires_at) ?? 0) - (toMs(a.expires_at) ?? 0))[0];
        const ref = live || lastPaid;

        const status: Status = live ? 'active' : paid.length ? 'inactive' : 'none';
        const accountPhone = normalizePhone(p?.phone);
        const paymentPhones = Array.from(
          new Set(paid.map((s) => normalizePhone(s.phone)).filter(Boolean))
        );
        const expiresMs = ref ? toMs(ref.expires_at) : null;

        out.push({
          key: uid,
          name: p?.display_name || '—',
          accountPhone,
          paymentPhones,
          smsPhone: paymentPhones[0] || accountPhone,
          status,
          plan: ref?.plan_label || ref?.plan || p?.plan || '',
          expiresMs,
          daysLeft: expiresMs ? Math.ceil((expiresMs - now) / DAY) : null,
          totalPaid: paid.filter((s) => !s.is_manual).reduce((a, s) => a + (Number(s.amount) || 0), 0),
          paidCount: paid.length,
          joinedMs: toMs(p?.created_at),
        });
      });

      out.sort((a, b) => (b.expiresMs ?? 0) - (a.expiresMs ?? 0));
      setRows(out);
      setSelected(new Set());
    } catch (e: any) {
      console.error(e);
      toast({ title: 'Hitilafu', description: e?.message || 'Imeshindwa kupakia wasajili', variant: 'destructive' });
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const counts = useMemo(() => ({
    all: rows.length,
    active: rows.filter((r) => r.status === 'active').length,
    inactive: rows.filter((r) => r.status === 'inactive').length,
    expiring: rows.filter((r) => r.status === 'active' && (r.daysLeft ?? 99) <= 3).length,
    none: rows.filter((r) => r.status === 'none').length,
  }), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === 'active' && r.status !== 'active') return false;
      if (filter === 'inactive' && r.status !== 'inactive') return false;
      if (filter === 'none' && r.status !== 'none') return false;
      if (filter === 'expiring' && !(r.status === 'active' && (r.daysLeft ?? 99) <= 3)) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.accountPhone.includes(q.replace(/\D/g, '') || '§') ||
        r.paymentPhones.some((p) => p.includes(q.replace(/\D/g, '') || '§'))
      );
    });
  }, [rows, filter, search]);

  // Export / SMS scope: ticked rows if any, otherwise everything in the current filter
  const scope = useMemo(
    () => (selected.size ? filtered.filter((r) => selected.has(r.key)) : filtered),
    [filtered, selected]
  );
  const scopeLabel = selected.size ? `${selected.size} waliochaguliwa` : `${filtered.length} walio kwenye kichujio`;

  const statusText = (s: Status) => (s === 'active' ? 'Active' : s === 'inactive' ? 'Inactive' : 'Hajalipa');

  const exportRows = (): Row[] =>
    scope.map((r) => ({
      Name: r.name,
      Account_Phone: r.accountPhone,
      Payment_Phones: r.paymentPhones.join(' | '),
      SMS_Phone: r.smsPhone,
      Status: statusText(r.status),
      Plan: planLabels[r.plan] || r.plan || '',
      Expires: fmtDate(r.expiresMs),
      Days_Left: r.daysLeft ?? '',
      Payments_Count: r.paidCount,
      Total_Paid_TZS: r.totalPaid,
      Joined: fmtDate(r.joinedMs),
    }));

  const uniqueNumbers = (list: Subscriber[]) =>
    Array.from(new Set(list.map((r) => r.smsPhone).filter(Boolean)));

  const run = (fn: () => void, empty = scope.length === 0) => {
    if (empty) {
      toast({ title: 'Hakuna data', description: 'Hakuna wasajili wa ku-export kwenye kichujio hiki.', variant: 'destructive' });
      return;
    }
    fn();
    setExportOpen(false);
  };

  const copyNumbers = async () => {
    const nums = uniqueNumbers(scope);
    if (!nums.length) return toast({ title: 'Hakuna namba', variant: 'destructive' });
    await navigator.clipboard.writeText(nums.join('\n'));
    toast({ title: 'Imenakiliwa', description: `Namba ${nums.length} zimenakiliwa.` });
  };

  // SMS
  const recipients = useMemo(
    () => Array.from(new Map(scope.filter((r) => r.smsPhone).map((r) => [r.smsPhone, r])).values()),
    [scope]
  );
  const personalize = (tpl: string, r: Subscriber) =>
    tpl
      .replace(/\{name\}/gi, r.name !== '—' ? r.name.split(' ')[0] : 'mteja')
      .replace(/\{plan\}/gi, planLabels[r.plan] || r.plan || '')
      .replace(/\{expires\}/gi, fmtDate(r.expiresMs))
      .replace(/\{days_left\}/gi, String(r.daysLeft ?? ''));
  const preview = recipients[0] ? personalize(message, recipients[0]) : message;
  const seg = smsSegments(preview);

  const onSend = async () => {
    if (!recipients.length) return toast({ title: 'Hakuna wapokeaji', variant: 'destructive' });
    if (!message.trim()) return toast({ title: 'Andika ujumbe', variant: 'destructive' });
    setSending(true);
    const res = await sendBulkSms(recipients.map((r) => ({ phone: r.smsPhone, message: personalize(message, r) })));
    setSending(false);
    toast(
      res.ok
        ? { title: 'Imetumwa', description: `SMS ${res.sent} zimetumwa.` }
        : { title: 'SMS bado haijaunganishwa', description: `${recipients.length} wapokeaji na ujumbe viko tayari. ${res.error || ''}`, variant: 'destructive' }
    );
  };

  const toggle = (k: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });
  const allTicked = filtered.length > 0 && filtered.every((r) => selected.has(r.key));
  const toggleAll = () => setSelected(allTicked ? new Set() : new Set(filtered.map((r) => r.key)));

  const badge = (s: Status) =>
    s === 'active' ? (
      <span className="inline-flex items-center gap-1 rounded-full border border-green-500/20 bg-green-500/10 px-2 py-0.5 text-[11px] font-bold text-green-500"><CheckCircle className="h-3 w-3" /> Active</span>
    ) : s === 'inactive' ? (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[11px] font-bold text-red-500"><XCircle className="h-3 w-3" /> Inactive</span>
    ) : (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground"><Clock className="h-3 w-3" /> Hajalipa</span>
    );

  const tabs: { id: Filter; label: string }[] = [
    { id: 'all', label: 'Wote' },
    { id: 'active', label: 'Active' },
    { id: 'inactive', label: 'Inactive' },
    { id: 'expiring', label: 'Wanaisha ≤3d' },
    { id: 'none', label: 'Hawajalipa' },
  ];

  return (
    <AdminLayout>
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-black text-foreground"><Users className="h-6 w-6 text-primary" /> Wasajili</h1>
            <p className="text-xs text-muted-foreground">Active / Inactive, namba za malipo, export na SMS ya wingi.</p>
          </div>
          <button onClick={load} className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-foreground hover:bg-muted">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Onyesha upya
          </button>
        </div>

        {/* Count cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { l: 'Wote', v: counts.all, c: 'text-foreground' },
            { l: 'Active', v: counts.active, c: 'text-green-500' },
            { l: 'Inactive', v: counts.inactive, c: 'text-red-500' },
            { l: 'Hawajalipa', v: counts.none, c: 'text-muted-foreground' },
          ].map((x) => (
            <div key={x.l} className="rounded-2xl border border-border bg-card p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{x.l}</p>
              <p className={`text-3xl font-black ${x.c}`}>{x.v}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="space-y-3 rounded-2xl border border-border bg-card p-3">
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => { setFilter(t.id); setLimit(PAGE); }}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                  filter === t.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                {t.label} <span className="opacity-70">({counts[t.id]})</span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setLimit(PAGE); }}
                placeholder="Tafuta jina au namba…"
                className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-sm text-foreground outline-none focus:border-primary"
              />
            </div>

            <div className="relative">
              <button
                onClick={() => setExportOpen((v) => !v)}
                className="flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2.5 text-xs font-black text-primary-foreground"
              >
                <Download className="h-4 w-4" /> Export <ChevronDown className="h-3.5 w-3.5" />
              </button>
              {exportOpen && (
                <div className="absolute right-0 z-30 mt-2 w-64 overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
                  <p className="border-b border-border px-3 py-2 text-[11px] font-bold text-muted-foreground">{scopeLabel}</p>
                  {[
                    { l: 'Excel (.xls)', f: () => exportExcel(exportRows()) },
                    { l: 'CSV (.csv)', f: () => exportCSV(exportRows()) },
                    { l: 'JSON (.json)', f: () => exportJSON(exportRows()) },
                    { l: 'Namba tu (.txt) — kwa SMS', f: () => exportNumbersTxt(uniqueNumbers(scope)), e: uniqueNumbers(scope).length === 0 },
                    { l: 'Contacts (.vcf) — simu/WhatsApp', f: () => exportVCF(scope.filter((r) => r.smsPhone).map((r) => ({ name: r.name === '—' ? '' : `RT ${r.name}`, phone: r.smsPhone }))), e: uniqueNumbers(scope).length === 0 },
                  ].map((o) => (
                    <button key={o.l} onClick={() => run(o.f, o.e ?? scope.length === 0)} className="block w-full px-3 py-2.5 text-left text-sm font-bold text-foreground hover:bg-muted">
                      {o.l}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button onClick={copyNumbers} className="flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2.5 text-xs font-bold text-foreground hover:bg-muted">
              <Copy className="h-4 w-4" /> Nakili namba
            </button>
            <button onClick={() => setSmsOpen((v) => !v)} className={`flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-bold ${smsOpen ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-foreground hover:bg-muted'}`}>
              <Send className="h-4 w-4" /> SMS ya wingi
            </button>
          </div>
        </div>

        {/* Bulk SMS */}
        {smsOpen && (
          <div className="space-y-3 rounded-2xl border border-primary/30 bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-black text-foreground">SMS ya wingi · wapokeaji {recipients.length}</h2>
              {!SMS_PROVIDER_CONFIGURED && (
                <span className="rounded-full bg-yellow-500/15 px-2.5 py-1 text-[11px] font-bold text-yellow-500">Provider itaunganishwa baadaye</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Wapokeaji: {scopeLabel}. Namba inayotumika ni ile iliyotumika kulipia (au namba ya akaunti kama haipo).</p>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
            />
            <div className="flex flex-wrap gap-1.5">
              {['{name}', '{plan}', '{expires}', '{days_left}'].map((v) => (
                <button key={v} onClick={() => setMessage((m) => m + v)} className="rounded-lg bg-muted px-2 py-1 font-mono text-[11px] font-bold text-foreground hover:bg-primary/20">{v}</button>
              ))}
            </div>
            <div className="rounded-xl bg-background p-3 text-xs text-muted-foreground">
              <p className="mb-1 font-bold text-foreground">Mfano (mpokeaji wa kwanza):</p>
              <p className="whitespace-pre-wrap">{preview}</p>
              <p className="mt-2">{seg.len} herufi · SMS {seg.segments}{seg.unicode ? ' (unicode)' : ''}</p>
            </div>
            <button
              onClick={onSend}
              disabled={sending || !recipients.length}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-black text-primary-foreground disabled:opacity-50"
            >
              <Send className="h-4 w-4" /> {sending ? 'Inatuma…' : `Tuma kwa ${recipients.length}`}
            </button>
          </div>
        )}

        {/* List */}
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <label className="flex cursor-pointer items-center gap-3 border-b border-border px-4 py-2.5 text-xs font-bold text-muted-foreground">
            <input type="checkbox" checked={allTicked} onChange={toggleAll} className="h-4 w-4 accent-primary" />
            Chagua wote kwenye kichujio ({filtered.length})
            {selected.size > 0 && <span className="ml-auto text-primary">{selected.size} wamechaguliwa</span>}
          </label>

          {loading ? (
            <div className="flex items-center justify-center p-10 text-muted-foreground"><RefreshCw className="mr-2 h-5 w-5 animate-spin" /> Inapakia…</div>
          ) : filtered.length === 0 ? (
            <p className="p-10 text-center text-sm text-muted-foreground">Hakuna wasajili kwenye kichujio hiki.</p>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.slice(0, limit).map((r) => (
                <li key={r.key} className="flex items-start gap-3 px-4 py-3">
                  <input type="checkbox" checked={selected.has(r.key)} onChange={() => toggle(r.key)} className="mt-1 h-4 w-4 shrink-0 accent-primary" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-black text-foreground">{r.name}</span>
                      {badge(r.status)}
                      {r.status === 'active' && (r.daysLeft ?? 99) <= 3 && (
                        <span className="rounded-full bg-yellow-500/15 px-2 py-0.5 text-[11px] font-bold text-yellow-500">inaisha siku {r.daysLeft}</span>
                      )}
                    </div>
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> Akaunti: <b className="text-foreground">{r.accountPhone || '—'}</b></span>
                      <span>Malipo: <b className="text-foreground">{r.paymentPhones.length ? r.paymentPhones.join(', ') : '—'}</b></span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {planLabels[r.plan] || r.plan || '—'} · inaisha {fmtDate(r.expiresMs)} · imelipa {r.paidCount}× · {money(r.totalPaid)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {filtered.length > limit && (
            <button onClick={() => setLimit((l) => l + PAGE)} className="w-full border-t border-border py-3 text-xs font-black text-primary hover:bg-muted">
              Onyesha zaidi ({filtered.length - limit} waliobaki)
            </button>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
