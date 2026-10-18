import { useState, useEffect, useRef } from 'react';
import {
  collection, query, orderBy, limit, getDocs, addDoc, updateDoc, doc, getDoc, setDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AdminLayout from '@/components/AdminLayout';
import { Key, Save, Eye, EyeOff, RefreshCw, Zap, ZapOff, Globe, Check, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const TOKEN_API_URL = 'https://www.tweve.online/api/cdn-token';
const AUTO_INTERVAL_MS = 2.5 * 60 * 1000; // 2.5 minutes
const AUTO_STORAGE_KEY = 'rt_admin_token_auto';

export default function AdminToken() {
  const [token, setToken] = useState('');
  const [tokenId, setTokenId] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null);
  const [updatedAt, setUpdatedAt] = useState<any>(null);
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [nextRunAt, setNextRunAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Restore auto-update preference
  useEffect(() => {
    const saved = localStorage.getItem(AUTO_STORAGE_KEY);
    if (saved === 'true') {
      setAutoEnabled(true);
    }
  }, []);

  // Persist auto-update preference + start/stop the timer
  useEffect(() => {
    localStorage.setItem(AUTO_STORAGE_KEY, autoEnabled ? 'true' : 'false');
    if (autoEnabled) {
      // Run immediately, then every 2.5 minutes
      fetchAndSave(true);
      intervalRef.current = setInterval(() => fetchAndSave(true), AUTO_INTERVAL_MS);
      setNextRunAt(Date.now() + AUTO_INTERVAL_MS);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setNextRunAt(null);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoEnabled]);

  // Update countdown every second
  useEffect(() => {
    if (!autoEnabled || !nextRunAt) return;
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [autoEnabled, nextRunAt]);

  useEffect(() => {
    fetchTokenFromFirestore();
  }, []);

  const fetchTokenFromFirestore = async () => {
    try {
      const globalSnap = await getDoc(doc(db, 'tokens', 'global'));
      if (globalSnap.exists()) {
        const data = globalSnap.data();
        if (data.value) {
          setToken(data.value);
          setTokenId('global');
          setUpdatedAt(data.updated_at);
          return;
        }
      }

      const q = query(collection(db, 'tokens'), orderBy('updated_at', 'desc'), limit(1));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const data = snap.docs[0].data();
        setToken(data.value || '');
        setTokenId(snap.docs[0].id);
        setUpdatedAt(data.updated_at);
      }
    } catch (error) {
      console.error('Error fetching token:', error);
    }
  };

  /** Pulls the latest CDN token from the tweve.online API or Cloud Function. */
  const fetchFromApi = async (): Promise<string> => {
    const CF_HTTP_URL = 'https://us-central1-revontech-6c62d.cloudfunctions.net/refreshCdnTokenHttp';
    const PROXY_PREFIX = 'https://api.allorigins.win/raw?url=';

    const parse = (raw: string): string => {
      let value = '';
      try {
        const json = JSON.parse(raw);
        value = json.token || json.value || json.cdntoken || json.data || '';
      } catch {
        value = raw;
      }
      return (value || '').trim().replace(/^"|"$/g, '');
    };

    const attempt = async (url: string): Promise<string> => {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const value = parse(text);
      if (!value || value.length < 10) throw new Error('empty token');
      return value;
    };

    // 1. Try Cloud Function HTTP trigger first (it writes directly to Firestore server-side)
    try {
      const cfRes = await fetch(CF_HTTP_URL, { cache: 'no-store' });
      if (cfRes.ok) {
        const cfData = await cfRes.json();
        if (cfData.ok) {
          // Re-read tokens/global from firestore
          const gSnap = await getDoc(doc(db, 'tokens', 'global'));
          if (gSnap.exists() && gSnap.data()?.value) {
            return gSnap.data().value;
          }
        }
      }
    } catch (cfErr) {
      console.warn('CF fetch fallback:', cfErr);
    }

    // 2. Direct upstream API
    try {
      return await attempt(TOKEN_API_URL);
    } catch (e) {
      // 3. Fallback via public proxy
      return await attempt(PROXY_PREFIX + encodeURIComponent(TOKEN_API_URL));
    }
  };

  /** Save (or update) the token in Firestore. */
  const persistToken = async (value: string) => {
    // 1. Always update doc `tokens/global` (listened to by web player in real-time)
    await setDoc(doc(db, 'tokens', 'global'), {
      value,
      source: 'admin',
      updated_at: serverTimestamp(),
    }, { merge: true });

    // 2. Also update or create in `tokens` collection for Android compatibility
    try {
      if (tokenId && tokenId !== 'global') {
        await updateDoc(doc(db, 'tokens', tokenId), {
          value,
          updated_at: serverTimestamp(),
        });
      } else {
        const docRef = await addDoc(collection(db, 'tokens'), {
          value,
          source: 'admin',
          updated_at: serverTimestamp(),
        });
        setTokenId(docRef.id);
      }
    } catch (colErr) {
      console.warn('Error syncing tokens collection doc:', colErr);
    }
  };

  /** Fetch from API + save to Firestore. */
  const fetchAndSave = async (isAuto = false) => {
    if (fetching) return;
    setFetching(true);
    try {
      const value = await fetchFromApi();
      const same = value === token;
      setToken(value);
      await persistToken(value);
      setUpdatedAt(new Date());
      setMsg({
        kind: 'ok',
        text: same
          ? `Token bado ile ile (${isAuto ? 'auto' : 'manual'}).`
          : `Token mpya imepatikana ${isAuto ? '(auto)' : 'na kuhifadhiwa'}!`,
      });
      if (isAuto) setNextRunAt(Date.now() + AUTO_INTERVAL_MS);
    } catch (e: any) {
      setMsg({ kind: 'err', text: `Imeshindwa: ${e.message || 'kuna tatizo'}` });
    } finally {
      setFetching(false);
      setTimeout(() => setMsg(null), 4000);
    }
  };

  /** Save manually-edited token (no API call). */
  const handleManualSave = async () => {
    setSaving(true);
    try {
      await persistToken(token);
      setUpdatedAt(new Date());
      setMsg({ kind: 'ok', text: 'Token imehifadhiwa!' });
      setTimeout(() => setMsg(null), 4000);
    } catch (error) {
      setMsg({ kind: 'err', text: 'Imeshindwa kuhifadhi.' });
    }
    setSaving(false);
  };

  const formatCountdown = () => {
    if (!nextRunAt) return '';
    const remainMs = Math.max(0, nextRunAt - nowTick);
    const m = Math.floor(remainMs / 60000);
    const s = Math.floor((remainMs % 60000) / 1000);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <AdminLayout>
      <div className="max-w-lg">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-primary/10 rounded-2xl">
            <Key className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-black text-foreground">Token ya CDN</h1>
            <p className="text-xs text-muted-foreground">Inatumika kwenye vituo vyote vya DASH</p>
          </div>
        </div>

        {/* Auto-update card */}
        <div className="cyber-card rounded-2xl p-5 mb-4 border border-primary/20">
          <div className="flex items-start gap-3 mb-3">
            <div className={`p-2 rounded-xl ${autoEnabled ? 'bg-green-500/10 text-green-400' : 'bg-muted text-muted-foreground'}`}>
              {autoEnabled ? <Zap className="w-5 h-5" /> : <ZapOff className="w-5 h-5" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-black text-sm text-foreground">Auto-update kila dakika 2.5</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Itavuta token mpya kutoka <span className="font-mono">tweve.online/api/cdn-token</span> na kuhifadhi kiotomatiki.
              </p>
            </div>
            <button
              onClick={() => setAutoEnabled(v => !v)}
              role="switch"
              aria-checked={autoEnabled}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
                autoEnabled ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                  autoEnabled ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {autoEnabled && (
            <div className="flex items-center justify-between bg-muted/50 rounded-xl px-3 py-2">
              <span className="text-[11px] text-muted-foreground">Auto-refresh ijayo:</span>
              <span className="text-xs font-mono font-black text-primary">
                {formatCountdown()}
              </span>
            </div>
          )}

          <div className="mt-3 flex items-start gap-2 text-[10px] text-muted-foreground bg-yellow-500/5 border border-yellow-500/20 rounded-lg px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0 mt-0.5" />
            <span>Auto-update inafanya kazi pekee wakati ukurasa huu uko wazi. Players binafsi pia hupata token mpya kila dakika 2.5 moja kwa moja.</span>
          </div>
        </div>

        {/* Main token card */}
        <div className="cyber-card rounded-2xl p-5">
          {updatedAt && (
            <div className="mb-4 p-3 bg-muted rounded-xl">
              <p className="text-xs text-muted-foreground">Ilisasishwa mara ya mwisho:</p>
              <p className="text-xs font-mono text-foreground mt-0.5">
                {updatedAt?.toDate
                  ? updatedAt.toDate().toLocaleString()
                  : new Date(updatedAt).toLocaleString()}
              </p>
            </div>
          )}

          <div className="space-y-2 mb-4">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Token ya Sasa
            </label>
            <div className="relative">
              <Input
                type={show ? 'text' : 'password'}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Weka token hapa au tumia 'Fetch'..."
                className="bg-muted border-border text-foreground font-mono text-xs pr-10"
              />
              <button
                type="button"
                onClick={() => setShow(!show)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {msg && (
            <div
              className={`mb-4 p-3 rounded-xl text-xs flex items-center gap-2 ${
                msg.kind === 'ok'
                  ? 'bg-green-500/10 border border-green-500/30 text-green-400'
                  : msg.kind === 'err'
                  ? 'bg-destructive/10 border border-destructive/30 text-destructive'
                  : 'bg-primary/10 border border-primary/30 text-primary'
              }`}
            >
              {msg.kind === 'ok' && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
              {msg.kind === 'err' && <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />}
              <span>{msg.text}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={() => fetchAndSave(false)}
              disabled={fetching || saving}
              className="bg-card border border-primary/40 text-primary hover:bg-primary/10 font-black tracking-wider"
            >
              {fetching ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> FETCHING...
                </>
              ) : (
                <>
                  <Globe className="w-4 h-4 mr-2" /> FETCH FROM API
                </>
              )}
            </Button>
            <Button
              onClick={handleManualSave}
              disabled={saving || fetching}
              className="bg-primary text-primary-foreground glow-cyan font-black tracking-wider"
            >
              <Save className="w-4 h-4 mr-2" />
              {saving ? 'INAHIFADHI...' : 'HIFADHI'}
            </Button>
          </div>
        </div>

        <div className="mt-4 p-4 bg-muted/50 rounded-2xl">
          <p className="text-xs font-bold text-muted-foreground mb-2">ℹ️ Jinsi inavyofanya kazi:</p>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>• <strong>Auto-update:</strong> Inavuta token kila dakika 2.5 kutoka tweve.online</li>
            <li>• <strong>Players (user app):</strong> Wenyewe hujivutia token kila dakika 2.5 — hata kama admin imefungwa</li>
            <li>• <strong>Fetch From API:</strong> Vuta sasa hivi na hifadhi Firestore</li>
            <li>• <strong>Hifadhi:</strong> Hifadhi token uliyoiweka mwenyewe (override)</li>
          </ul>
        </div>
      </div>
    </AdminLayout>
  );
}
