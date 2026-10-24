import { useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AdminLayout from '@/components/AdminLayout';
import { useToast } from '@/hooks/use-toast';
import { FileText, ShieldCheck, Save, RefreshCw, Wand2 } from 'lucide-react';

type Kind = 'terms' | 'privacy';
interface LegalDoc { title: string; content: string; updated_at?: string }

const TEMPLATES: Record<Kind, LegalDoc> = {
  terms: {
    title: 'Masharti na Vigezo',
    content: `# Masharti na Vigezo ya RevonTech TV

## 1. Kukubali masharti
Kwa kutumia RevonTech TV unakubali masharti haya. Ukitokubaliana nayo, tafadhali acha kutumia huduma.

## 2. Huduma
RevonTech TV inatoa vipindi vya TV, mechi live na filamu kupitia intaneti. Upatikanaji wa baadhi ya maudhui unategemea kifurushi ulicholipia.

## 3. Akaunti
- Wewe ndiye mwenye jukumu la kulinda akaunti yako.
- Usishiriki akaunti yako na watu wengine.
- Tunaweza kusimamisha akaunti inayokiuka masharti.

## 4. Malipo
- Malipo yanafanywa kwa mitandao ya simu (USSD Push).
- Kifurushi kinaanza kutumika baada ya malipo kuthibitishwa.
- Malipo yaliyokamilika hayarudishwi isipokuwa kosa ni la upande wetu.

## 5. Matumizi yasiyoruhusiwa
- Kunakili, kuuza au kusambaza upya maudhui.
- Kutumia programu za kuvunja ulinzi wa huduma.

## 6. Mabadiliko
Tunaweza kubadilisha masharti haya wakati wowote. Kuendelea kutumia huduma kunamaanisha unakubali mabadiliko.

## 7. Mawasiliano
Una swali? Wasiliana nasi kupitia WhatsApp Support kwenye menu ya app.`,
  },
  privacy: {
    title: 'Sera ya Faragha',
    content: `# Sera ya Faragha ya RevonTech TV

## 1. Taarifa tunazokusanya
- Jina na namba ya simu unapojisajili.
- Namba ya simu iliyotumika kulipia na historia ya vifurushi.
- Taarifa za kifaa na matumizi ili kuboresha huduma.

## 2. Tunazitumia kwa nini
- Kukupa na kusimamia huduma na kifurushi chako.
- Kuthibitisha malipo na kukusaidia unapohitaji msaada.
- Kukutumia arifa na ujumbe kuhusu huduma, ikiwemo kifurushi kinapokaribia kuisha.

## 3. Kushiriki taarifa
Hatuuzi taarifa zako. Tunazishiriki tu na watoa huduma wa malipo na miundombinu wanaotuwezesha kuendesha huduma.

## 4. Usalama
Tunatumia hatua za kiusalama kulinda taarifa zako, ingawa hakuna mfumo wa mtandaoni ulio salama kwa 100%.

## 5. Haki zako
Unaweza kuomba kurekebisha au kufuta taarifa zako kwa kuwasiliana nasi.

## 6. Mabadiliko
Tutasasisha ukurasa huu sera ikibadilika.`,
  },
};

export default function LegalPages() {
  const { toast } = useToast();
  const [kind, setKind] = useState<Kind>('terms');
  const [docs, setDocs] = useState<Record<Kind, LegalDoc>>({
    terms: { title: '', content: '' },
    privacy: { title: '', content: '' },
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getDoc(doc(db, 'settings', 'legal'))
      .then((snap) => {
        const d: any = snap.exists() ? snap.data() : {};
        setDocs({
          terms: { title: d.terms?.title || '', content: d.terms?.content || '', updated_at: d.terms?.updated_at },
          privacy: { title: d.privacy?.title || '', content: d.privacy?.content || '', updated_at: d.privacy?.updated_at },
        });
      })
      .catch((e) => toast({ title: 'Hitilafu', description: e.message, variant: 'destructive' }))
      .finally(() => setLoading(false));
  }, []);

  const cur = docs[kind];
  const set = (patch: Partial<LegalDoc>) => setDocs((p) => ({ ...p, [kind]: { ...p[kind], ...patch } }));

  const applyTemplate = () => {
    if (cur.content.trim() && !window.confirm('Hii itabadilisha maandishi yaliyopo. Endelea?')) return;
    set({ title: TEMPLATES[kind].title, content: TEMPLATES[kind].content });
  };

  const save = async () => {
    setSaving(true);
    try {
      const now = new Date().toISOString();
      await setDoc(
        doc(db, 'settings', 'legal'),
        {
          terms: { title: docs.terms.title.trim(), content: docs.terms.content, updated_at: docs.terms.content ? now : docs.terms.updated_at || null },
          privacy: { title: docs.privacy.title.trim(), content: docs.privacy.content, updated_at: docs.privacy.content ? now : docs.privacy.updated_at || null },
        },
        { merge: true }
      );
      setDocs((p) => ({
        terms: { ...p.terms, updated_at: p.terms.content ? now : p.terms.updated_at },
        privacy: { ...p.privacy, updated_at: p.privacy.content ? now : p.privacy.updated_at },
      }));
      toast({ title: 'Imehifadhiwa', description: 'Terms na Privacy zimesasishwa kwenye app.' });
    } catch (e: any) {
      toast({ title: 'Hitilafu', description: e.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  const tabs: { id: Kind; label: string; Icon: typeof FileText }[] = [
    { id: 'terms', label: 'Terms & Conditions', Icon: FileText },
    { id: 'privacy', label: 'Privacy Policy', Icon: ShieldCheck },
  ];

  return (
    <AdminLayout>
      <div className="mx-auto max-w-3xl space-y-4">
        <div>
          <h1 className="text-2xl font-black text-foreground">Sheria (Terms & Privacy)</h1>
          <p className="text-xs text-muted-foreground">Unachoandika hapa kinaonekana kwenye menu ya app chini ya "Sheria".</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center p-10 text-muted-foreground"><RefreshCw className="mr-2 h-5 w-5 animate-spin" /> Inapakia…</div>
        ) : (
          <>
            <div className="flex gap-2">
              {tabs.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  onClick={() => setKind(id)}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-black sm:flex-none ${
                    kind === id ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon className="h-4 w-4" /> {label}
                  {docs[id].content.trim() ? '' : ' •'}
                </button>
              ))}
            </div>

            <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground">Kichwa (hiari)</label>
                <input
                  value={cur.title}
                  onChange={(e) => set({ title: e.target.value })}
                  placeholder={TEMPLATES[kind].title}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none focus:border-primary"
                />
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Maudhui</label>
                  <button onClick={applyTemplate} type="button" className="flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary hover:bg-primary/20">
                    <Wand2 className="h-3 w-3" /> Weka template
                  </button>
                </div>
                <textarea
                  value={cur.content}
                  onChange={(e) => set({ content: e.target.value })}
                  rows={18}
                  placeholder="# Kichwa kikuu&#10;## Kichwa kidogo&#10;- orodha&#10;&#10;Aya ya kawaida…"
                  className="w-full resize-y rounded-xl border border-border bg-background px-4 py-3 font-mono text-sm leading-relaxed text-foreground outline-none focus:border-primary"
                />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Muundo: <code># Kichwa</code>, <code>## Kichwa kidogo</code>, <code>- orodha</code>, na mstari mtupu kati ya aya. Maudhui yakiwa wazi, kiungo hakitaonyesha chochote kwa mtumiaji.
                </p>
                {cur.updated_at && (
                  <p className="mt-1 text-xs text-muted-foreground">Mara ya mwisho kusasishwa: {new Date(cur.updated_at).toLocaleString('en-GB')}</p>
                )}
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">Template ni mwanzo tu — isome na uibadilishe ilingane na biashara yako; si ushauri wa kisheria.</p>

            <button
              onClick={save}
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-black text-primary-foreground disabled:opacity-50"
            >
              {saving ? <><RefreshCw className="h-4 w-4 animate-spin" /> Inahifadhi…</> : <><Save className="h-4 w-4" /> Hifadhi Terms & Privacy</>}
            </button>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
