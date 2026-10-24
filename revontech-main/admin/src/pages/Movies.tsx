import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  collection, query, getDocs, addDoc, updateDoc, deleteDoc,
  doc, getDoc, setDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AdminLayout from '@/components/AdminLayout';
import {
  Film, Plus, Search, Edit2, Trash2, X, Save, RefreshCw, Lock, Unlock,
  Eye, EyeOff, AlertCircle, CheckCircle, Download, EyeOff as Hide, ExternalLink, Loader2,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

/* ─────────────── upstream config ─────────────── */
const UPSTREAM = 'https://netswahili.com';
const CF_PROXY = 'https://us-central1-revontech-6c62d.cloudfunctions.net/movieProxy';
const FALLBACK_PROXY = 'https://api.allorigins.win/raw?url=';
const PAGE_SIZE = 10;
const INITIAL_UPSTREAM_PAGES = 5;

async function fetchAdminProxied(targetUrl: string, isPost = false, postBody = ''): Promise<string> {
  // 1. Cloud Function proxy
  try {
    const cfUrl = isPost ? CF_PROXY : `${CF_PROXY}?url=${encodeURIComponent(targetUrl)}`;
    const init: RequestInit = isPost
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `url=${encodeURIComponent(targetUrl)}&${postBody}`,
        }
      : {};
    const res = await fetch(cfUrl, init);
    if (res.ok) {
      const text = await res.text();
      if (text && text.length > 50) return text;
    }
  } catch (e) {
    console.warn('CF proxy error:', e);
  }

  // 2. Fallback AllOrigins for GET
  if (!isPost) {
    try {
      const res = await fetch(`${FALLBACK_PROXY}${encodeURIComponent(targetUrl)}`);
      if (res.ok) {
        const text = await res.text();
        if (text && text.length > 50) return text;
      }
    } catch (e) {
      console.warn('AllOrigins error:', e);
    }
  }

  throw new Error('Failed to fetch from upstream');
}

/* ─────────────── types ─────────────── */
interface Movie {
  id?: string;
  title: string;
  slug: string;
  poster: string;
  description: string;
  drive_id: string;
  category: string;
  year: string;
  is_free: boolean;
  active: boolean;
  sort_order: number;
  imported_from?: string;
  episodes?: Array<{ title: string; driveId: string }>;
  created_at?: any;
  updated_at?: any;
}

interface UpstreamMovie {
  slug: string;
  title: string;
  poster: string;
  type: string;
}

const emptyMovie: Movie = {
  title: '', slug: '', poster: '', description: '', drive_id: '',
  category: 'General', year: String(new Date().getFullYear()),
  is_free: false, active: true, sort_order: 0,
};

/* ─────────────── helpers ─────────────── */
function extractDriveId(input: string): string {
  if (!input) return '';
  const v = input.trim();
  const m = v.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || v.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return m ? m[1] : v.replace(/^https?:\/\/.*\//, '');
}

function slugify(text: string): string {
  return (text || '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 80);
}

async function fetchUpstreamPage(offset: number): Promise<string> {
  const targetUrl = offset === 0
    ? `${UPSTREAM}/all/latest`
    : `${UPSTREAM}/data/fetch_post.php`;
  return fetchAdminProxied(targetUrl, offset !== 0, `starting=${offset}&type=latest`);
}

function parseUpstreamCards(html: string, seen: Set<string>): UpstreamMovie[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const cards: UpstreamMovie[] = [];
  doc.querySelectorAll('.post-card').forEach((card) => {
    const ancestorAnchor = card.closest('a') as HTMLAnchorElement | null;
    const childAnchor = card.querySelector('a[href*="/post/"]') as HTMLAnchorElement | null;
    const linkEl = ancestorAnchor || childAnchor;
    const href = linkEl?.getAttribute('href') || '';
    const slugMatch = href.match(/\/post\/([^/?#]+)/);
    const slug = slugMatch?.[1];
    if (!slug || seen.has(slug)) return;
    seen.add(slug);
    cards.push({
      slug,
      title: card.querySelector('.post-title')?.textContent?.trim() || slug.replace(/-/g, ' '),
      poster: card.querySelector('img')?.getAttribute('src') || '',
      type: card.querySelector('.type')?.textContent?.trim() || 'Movie',
    });
  });
  return cards;
}

interface UpstreamDetail {
  title: string;
  poster: string;
  description: string;
  episodes: Array<{ title: string; driveId: string }>;
}

const EPISODE_PAGE = 5;

function parseEpisodes(root: ParentNode): Array<{ title: string; driveId: string }> {
  const out: Array<{ title: string; driveId: string }> = [];
  root.querySelectorAll('.list-epsode').forEach((el) => {
    const onclick = el.getAttribute('onclick') || '';
    const m = onclick.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
    const t = onclick.match(/,\s*['"]([^'"]+)['"]/);
    if (m) {
      out.push({
        title:
          t?.[1] ||
          el.querySelector('.epsodes-number')?.textContent?.trim() ||
          `Episode ${out.length + 1}`,
        driveId: m[1],
      });
    }
  });
  return out;
}

async function fetchMoreEpisodes(slug: string, startOffset: number): Promise<Array<{ title: string; driveId: string }>> {
  const all: Array<{ title: string; driveId: string }> = [];
  let offset = startOffset;
  for (let i = 0; i < 40; i++) {
    try {
      const html = await fetchAdminProxied(
        `${UPSTREAM}/data/fetch_episode.php`,
        true,
        `starting=${offset}&slug=${encodeURIComponent(slug)}`
      );
      if (!html || !html.trim()) break;
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      const batch = parseEpisodes(tmp);
      if (batch.length === 0) break;
      all.push(...batch);
      offset += EPISODE_PAGE;
    } catch {
      break;
    }
  }
  return all;
}

async function fetchUpstreamDetail(slug: string): Promise<UpstreamDetail | null> {
  try {
    const html = await fetchAdminProxied(`${UPSTREAM}/post/${slug}`);
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const title =
      doc.querySelector('.movie-details h1')?.textContent?.trim() ||
      doc.querySelector('h1')?.textContent?.trim() ||
      '';
    const poster = doc.querySelector('.details-image img')?.getAttribute('src') || '';
    const description = doc.querySelector('.details-description')?.textContent?.trim() || '';

    let episodes = parseEpisodes(doc);
    const hasMore = !!doc.querySelector('#episode-load');
    if (hasMore && episodes.length > 0) {
      const more = await fetchMoreEpisodes(slug, episodes.length);
      episodes = [...episodes, ...more];
    }

    return { title, poster, description, episodes };
  } catch {
    return null;
  }
}

/* ─────────────── component ─────────────── */
type Tab = 'manual' | 'upstream';

export default function AdminMovies() {
  const [tab, setTab] = useState<Tab>('manual');

  /* Manual movies state */
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loadingManual, setLoadingManual] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Movie | null>(null);
  const [form, setForm] = useState<Movie>(emptyMovie);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  /* Upstream movies state */
  const [upstream, setUpstream] = useState<UpstreamMovie[]>([]);
  const [loadingUpstream, setLoadingUpstream] = useState(false);
  const [upstreamOffset, setUpstreamOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [upstreamEnd, setUpstreamEnd] = useState(false);
  const [importingSlug, setImportingSlug] = useState<string | null>(null);
  const [hidingSlug, setHidingSlug] = useState<string | null>(null);
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const [expandedEpisodes, setExpandedEpisodes] = useState<Array<{ title: string; driveId: string }>>([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const upstreamSeenRef = useRef<Set<string>>(new Set());
  const upstreamLoadedRef = useRef(false);

  /* Hidden slugs (soft-deleted upstream) */
  const [hiddenSlugs, setHiddenSlugs] = useState<string[]>([]);

  /* UI feedback */
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const flash = (kind: 'ok' | 'err', text: string) => {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 4000);
  };

  /* Movies Global Visibility State (Requirement #5) */
  const [moviesEnabled, setMoviesEnabled] = useState(true);
  const [savingSetting, setSavingSetting] = useState(false);

  useEffect(() => {
    const loadGeneralSettings = async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', 'general_settings'));
        if (snap.exists()) {
          const d = snap.data();
          if (d.movies_enabled !== undefined) {
            setMoviesEnabled(!!d.movies_enabled);
          }
        }
      } catch (e) {
        console.warn('Error loading general settings:', e);
      }
    };
    loadGeneralSettings();
  }, []);

  const toggleMoviesEnabled = async () => {
    setSavingSetting(true);
    const newVal = !moviesEnabled;
    try {
      await setDoc(doc(db, 'settings', 'general_settings'), {
        movies_enabled: newVal,
        updated_at: serverTimestamp()
      }, { merge: true });
      setMoviesEnabled(newVal);
      flash('ok', newVal ? 'Filamu zimewashwa kwa watumiaji (Zinaonekana)!' : 'Filamu zimezimwa kabisa kwa watumiaji (Hazionekani)!');
    } catch (e: any) {
      flash('err', 'Hitilafu: ' + (e.message || 'Haikuweza kubadilisha'));
    }
    setSavingSetting(false);
  };

  /* Imported slugs index for fast lookup */
  const importedSlugs = useMemo(() => {
    const set = new Set<string>();
    movies.forEach((m) => {
      if (m.imported_from) set.add(m.imported_from);
    });
    return set;
  }, [movies]);

  /* ─────── data loading ─────── */
  const loadMovies = useCallback(async () => {
    setLoadingManual(true);
    try {
      const snap = await getDocs(collection(db, 'movies'));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Movie));
      list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      setMovies(list);
    } catch (e) {
      console.error(e);
      flash('err', 'Imeshindwa kupakua movies.');
    }
    setLoadingManual(false);
  }, []);

  const loadHiddenSlugs = useCallback(async () => {
    try {
      const snap = await getDoc(doc(db, 'settings', 'movies_config'));
      if (snap.exists()) {
        const data = snap.data() as any;
        setHiddenSlugs(Array.isArray(data.hidden_slugs) ? data.hidden_slugs : []);
      }
    } catch (e) {
      console.error('Failed to load hidden_slugs', e);
    }
  }, []);

  const loadUpstream = useCallback(async (force = false) => {
    if (upstreamLoadedRef.current && !force) return;
    upstreamLoadedRef.current = true;
    setLoadingUpstream(true);
    setUpstream([]);
    upstreamSeenRef.current = new Set();

    try {
      const firstHtml = await fetchUpstreamPage(0);
      const first = parseUpstreamCards(firstHtml, upstreamSeenRef.current);
      setUpstream(first);
      setUpstreamOffset(PAGE_SIZE);

      const more = await Promise.allSettled(
        Array.from({ length: INITIAL_UPSTREAM_PAGES - 1 }, (_, i) =>
          fetchUpstreamPage((i + 1) * PAGE_SIZE).then((h) =>
            parseUpstreamCards(h, upstreamSeenRef.current),
          ),
        ),
      );
      const combined: UpstreamMovie[] = [];
      more.forEach((r) => {
        if (r.status === 'fulfilled') combined.push(...r.value);
      });
      if (combined.length > 0) {
        setUpstream((prev) => [...prev, ...combined]);
        setUpstreamOffset(INITIAL_UPSTREAM_PAGES * PAGE_SIZE);
      }
    } catch (e: any) {
      console.error(e);
      flash('err', e?.message || 'Imeshindwa kupakua netswahili.');
    }
    setLoadingUpstream(false);
  }, []);

  const loadMoreUpstream = useCallback(async () => {
    if (loadingMore || upstreamEnd) return;
    setLoadingMore(true);
    try {
      const html = await fetchUpstreamPage(upstreamOffset);
      const batch = parseUpstreamCards(html, upstreamSeenRef.current);
      if (batch.length === 0) {
        setUpstreamEnd(true);
      } else {
        setUpstream((p) => [...p, ...batch]);
        setUpstreamOffset(upstreamOffset + PAGE_SIZE);
      }
    } catch (e) {
      console.error(e);
    }
    setLoadingMore(false);
  }, [upstreamOffset, loadingMore, upstreamEnd]);

  useEffect(() => {
    loadMovies();
    loadHiddenSlugs();
  }, [loadMovies, loadHiddenSlugs]);

  // Lazy-load upstream when first switching to that tab
  useEffect(() => {
    if (tab === 'upstream') loadUpstream();
  }, [tab, loadUpstream]);

  /* ─────── manual movie CRUD ─────── */
  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyMovie, sort_order: movies.length + 1 });
    setShowForm(true);
  };
  const openEdit = (m: Movie) => {
    setEditing(m);
    setForm({ ...m });
    setShowForm(true);
  };
  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setForm(emptyMovie);
  };
  const handleTitleBlur = () => {
    if (!form.slug && form.title) setForm((f) => ({ ...f, slug: slugify(f.title) }));
  };
  const validate = (): string | null => {
    if (!form.title.trim()) return 'Title inahitajika';
    if (!form.drive_id.trim()) return 'Google Drive ID/URL inahitajika';
    return null;
  };
  const handleSave = async () => {
    const err = validate();
    if (err) return flash('err', err);
    setSaving(true);
    try {
      const payload: any = {
        ...form,
        slug: form.slug || slugify(form.title),
        drive_id: extractDriveId(form.drive_id),
        updated_at: serverTimestamp(),
      };
      if (editing?.id) {
        await updateDoc(doc(db, 'movies', editing.id), payload);
        flash('ok', 'Movie imehifadhiwa.');
      } else {
        payload.created_at = serverTimestamp();
        await addDoc(collection(db, 'movies'), payload);
        flash('ok', 'Movie mpya imeongezwa!');
      }
      closeForm();
      await loadMovies();
    } catch (e: any) {
      flash('err', e?.message || 'Imeshindwa kuhifadhi.');
    }
    setSaving(false);
  };
  const handleDelete = async (m: Movie) => {
    if (!m.id) return;
    if (!confirm(`Futa "${m.title}"? Hatua hii haiwezi kurudishwa.`)) return;
    setDeletingId(m.id);
    try {
      await deleteDoc(doc(db, 'movies', m.id));
      setMovies((p) => p.filter((x) => x.id !== m.id));
      flash('ok', 'Imefutwa.');
    } catch {
      flash('err', 'Imeshindwa kufuta.');
    }
    setDeletingId(null);
  };
  const toggleActive = async (m: Movie) => {
    if (!m.id) return;
    try {
      await updateDoc(doc(db, 'movies', m.id), { active: !m.active });
      setMovies((p) => p.map((x) => (x.id === m.id ? { ...x, active: !m.active } : x)));
    } catch (e) {
      console.error(e);
    }
  };
  const toggleFree = async (m: Movie) => {
    if (!m.id) return;
    try {
      await updateDoc(doc(db, 'movies', m.id), { is_free: !m.is_free });
      setMovies((p) => p.map((x) => (x.id === m.id ? { ...x, is_free: !m.is_free } : x)));
    } catch (e) {
      console.error(e);
    }
  };

  /* ─────── upstream actions ─────── */
  const saveHiddenSlugs = async (next: string[]) => {
    await setDoc(
      doc(db, 'settings', 'movies_config'),
      { hidden_slugs: next, updated_at: serverTimestamp() },
      { merge: true },
    );
  };

  const hideUpstream = async (m: UpstreamMovie) => {
    setHidingSlug(m.slug);
    try {
      const next = [...new Set([...hiddenSlugs, m.slug])];
      await saveHiddenSlugs(next);
      setHiddenSlugs(next);
      flash('ok', `"${m.title}" imefichwa kwa watumiaji.`);
    } catch (e: any) {
      flash('err', 'Imeshindwa kuficha.');
    }
    setHidingSlug(null);
  };

  const unhideUpstream = async (slug: string) => {
    setHidingSlug(slug);
    try {
      const next = hiddenSlugs.filter((s) => s !== slug);
      await saveHiddenSlugs(next);
      setHiddenSlugs(next);
      flash('ok', 'Imerejeshwa kwa watumiaji.');
    } catch {
      flash('err', 'Imeshindwa.');
    }
    setHidingSlug(null);
  };

  /** Re-fetch the upstream movie and update the Firestore record with the
   *  latest episode list (useful for movies imported before pagination
   *  support, or to pick up new episodes the upstream may have added). */
  const refreshImportedEpisodes = async (m: Movie) => {
    if (!m.id || !m.imported_from) return;
    setDeletingId(m.id); // reuse spinner
    try {
      const detail = await fetchUpstreamDetail(m.imported_from);
      if (!detail || detail.episodes.length === 0) {
        flash('err', 'Hakuna episodes mpya zilizopatikana.');
        setDeletingId(null);
        return;
      }
      await updateDoc(doc(db, 'movies', m.id), {
        episodes: detail.episodes,
        drive_id: detail.episodes[0].driveId,
        description: detail.description || m.description,
        poster: detail.poster || m.poster,
        category: detail.episodes.length > 1 ? 'Series' : m.category,
        updated_at: serverTimestamp(),
      });
      await loadMovies();
      flash(
        'ok',
        `"${m.title}" imerefresh: episodes ${detail.episodes.length}.`,
      );
    } catch (e: any) {
      flash('err', e?.message || 'Refresh imeshindwa.');
    }
    setDeletingId(null);
  };

  const toggleExpand = async (m: UpstreamMovie) => {    if (expandedSlug === m.slug) {
      setExpandedSlug(null);
      setExpandedEpisodes([]);
      return;
    }
    setExpandedSlug(m.slug);
    setExpandedEpisodes([]);
    setLoadingEpisodes(true);
    try {
      const detail = await fetchUpstreamDetail(m.slug);
      if (detail) setExpandedEpisodes(detail.episodes);
    } catch (e) {
      console.error(e);
    }
    setLoadingEpisodes(false);
  };

  const importUpstream = async (m: UpstreamMovie, openAfter = true) => {    setImportingSlug(m.slug);
    try {
      const detail = await fetchUpstreamDetail(m.slug);
      if (!detail || detail.episodes.length === 0) {
        flash('err', 'Imeshindwa kupata episodes kutoka netswahili.');
        setImportingSlug(null);
        return;
      }
      const isSeries = detail.episodes.length > 1;
      const payload: Movie = {
        title: detail.title || m.title,
        slug: slugify(m.title),
        poster: detail.poster || m.poster,
        description: detail.description || '',
        // Primary drive_id = first episode (backward compat)
        drive_id: detail.episodes[0].driveId,
        // Full episode list (used by player when present)
        episodes: detail.episodes,
        category: isSeries ? 'Series' : m.type || 'Movie',
        year: String(new Date().getFullYear()),
        is_free: false,
        active: true,
        sort_order: movies.length + 1,
        imported_from: m.slug,
        created_at: serverTimestamp() as any,
        updated_at: serverTimestamp() as any,
      };
      const docRef = await addDoc(collection(db, 'movies'), payload);
      // Hide upstream after successful import so user sees only the imported one
      const next = [...new Set([...hiddenSlugs, m.slug])];
      await saveHiddenSlugs(next);
      setHiddenSlugs(next);

      await loadMovies();
      flash(
        'ok',
        `"${m.title}" imeingizwa${
          isSeries ? ` (episodes ${detail.episodes.length})` : ''
        }.`,
      );

      if (openAfter) {
        setTab('manual');
        setTimeout(() => {
          const newMovie = { ...payload, id: docRef.id };
          openEdit(newMovie);
        }, 100);
      }
    } catch (e: any) {
      console.error(e);
      flash('err', e?.message || 'Import imeshindwa.');
    }
    setImportingSlug(null);
  };

  /** Bulk import all visible upstream movies */
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0, imported: 0, failed: 0 });
  
  const bulkImportAll = async () => {
    if (bulkImporting) return;
    if (!confirm(`Import ALL ${filteredUpstream.length} movies from NetSwahili? This may take several minutes.`)) return;
    
    setBulkImporting(true);
    setBulkProgress({ current: 0, total: filteredUpstream.length, imported: 0, failed: 0 });
    
    let imported = 0;
    let failed = 0;
    
    for (let i = 0; i < filteredUpstream.length; i++) {
      const movie = filteredUpstream[i];
      setBulkProgress({ current: i + 1, total: filteredUpstream.length, imported, failed });
      
      try {
        const detail = await fetchUpstreamDetail(movie.slug);
        if (!detail || detail.episodes.length === 0) {
          failed++;
          continue;
        }
        
        const isSeries = detail.episodes.length > 1;
        const payload: Movie = {
          title: detail.title || movie.title,
          slug: slugify(movie.title),
          poster: detail.poster || movie.poster,
          description: detail.description || '',
          drive_id: detail.episodes[0].driveId,
          episodes: detail.episodes,
          category: isSeries ? 'Series' : movie.type || 'Movie',
          year: String(new Date().getFullYear()),
          is_free: false,
          active: true,
          sort_order: movies.length + imported + 1,
          imported_from: movie.slug,
          created_at: serverTimestamp() as any,
          updated_at: serverTimestamp() as any,
        };
        
        await addDoc(collection(db, 'movies'), payload);
        imported++;
        
        // Hide after import
        const next = [...new Set([...hiddenSlugs, movie.slug])];
        await saveHiddenSlugs(next);
        setHiddenSlugs(next);
        
        // Delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (e) {
        console.error(`Failed to import ${movie.title}:`, e);
        failed++;
      }
    }
    
    await loadMovies();
    await loadUpstream(true);
    flash('ok', `Bulk import complete: ${imported} imported, ${failed} failed`);
    setBulkImporting(false);
    setBulkProgress({ current: 0, total: 0, imported: 0, failed: 0 });
  };
  /* ─────── derived ─────── */
  const filteredManual = movies.filter(
    (m) =>
      !search ||
      m.title.toLowerCase().includes(search.toLowerCase()) ||
      m.category.toLowerCase().includes(search.toLowerCase()) ||
      m.slug.toLowerCase().includes(search.toLowerCase()),
  );

  const filteredUpstream = upstream.filter(
    (m) => !search || m.title.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <AdminLayout>
      <div className="max-w-5xl">
        {/* Page header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-primary/10 rounded-2xl">
            <Film className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-black text-foreground">Movies</h1>
            <p className="text-xs text-muted-foreground">
              Simamia movies za mwenyewe na zile za netswahili
            </p>
          </div>
          {tab === 'manual' && (
            <Button
              onClick={openCreate}
              className="bg-primary text-primary-foreground glow-cyan font-black tracking-wider"
            >
              <Plus className="w-4 h-4 mr-2" /> ONGEZA
            </Button>
          )}
        </div>

        {/* Toast */}
        {msg && (
          <div
            className={`mb-4 p-3 rounded-xl text-xs flex items-center gap-2 ${
              msg.kind === 'ok'
                ? 'bg-green-500/10 border border-green-500/30 text-green-400'
                : 'bg-destructive/10 border border-destructive/30 text-destructive'
            }`}
          >
            {msg.kind === 'ok' ? (
              <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            )}
            <span>{msg.text}</span>
          </div>
        )}

        {/* Master Movies Visibility Switch (Requirement #5) */}
        <div className={`p-4 rounded-2xl mb-5 border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          moviesEnabled
            ? 'bg-primary/10 border-primary/30'
            : 'bg-destructive/10 border-destructive/30'
        }`}>
          <div className="flex items-start sm:items-center gap-3">
            <div className={`p-2.5 rounded-xl ${moviesEnabled ? 'bg-primary/20 text-primary' : 'bg-destructive/20 text-destructive'}`}>
              <Film className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-sm text-foreground">
                  Hali ya Sehemu ya Filamu (Movies)
                </h3>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                  moviesEnabled ? 'bg-green-500/20 text-green-400' : 'bg-destructive/20 text-destructive'
                }`}>
                  {moviesEnabled ? 'IMEWASHWA (ZINAONEKANA)' : 'IMEZIMWA (HAZIONEKANI)'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {moviesEnabled
                  ? 'Filamu ziko hewani kwa watumiaji wote kwenye app na website.'
                  : 'Filamu zimezimwa kabisa — haziwezi kuonekana kwenye menu wala homepage kwa mtumiaji yeyote.'}
              </p>
            </div>
          </div>

          <Button
            onClick={toggleMoviesEnabled}
            disabled={savingSetting}
            className={`font-black text-xs px-4 h-9 flex-shrink-0 ${
              moviesEnabled
                ? 'bg-destructive text-white hover:bg-destructive/90'
                : 'bg-primary text-primary-foreground glow-cyan'
            }`}
          >
            {savingSetting ? '...' : moviesEnabled ? 'ZIMA FILAMU ZISIONEKANE' : 'WASHA FILAMU ZIDISPLAY'}
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-card p-1 rounded-xl border border-border w-fit">
          <button
            onClick={() => setTab('manual')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
              tab === 'manual'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Manual ({movies.length})
          </button>
          <button
            onClick={() => setTab('upstream')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
              tab === 'upstream'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Netswahili ({upstream.length || '…'})
          </button>
        </div>

        {/* Search + Refresh */}
        <div className="flex items-center gap-2 mb-4">
          <div className="flex-1 flex items-center gap-2 bg-card rounded-xl px-3 py-2 border border-border">
            <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tafuta movie..."
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
          </div>
          {tab === 'upstream' && filteredUpstream.length > 0 && (
            <Button
              onClick={bulkImportAll}
              disabled={bulkImporting}
              className="bg-primary text-primary-foreground font-bold text-xs px-3 py-2"
              title="Import all visible movies to Firestore"
            >
              {bulkImporting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {bulkProgress.current}/{bulkProgress.total}
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Import All
                </>
              )}
            </Button>
          )}
          <button
            onClick={() => (tab === 'manual' ? loadMovies() : loadUpstream(true))}
            className="p-2.5 bg-card rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Refresh"
          >
            <RefreshCw
              className={`w-4 h-4 ${
                (tab === 'manual' && loadingManual) || (tab === 'upstream' && loadingUpstream)
                  ? 'animate-spin'
                  : ''
              }`}
            />
          </button>
        </div>

        {/* ─── MANUAL TAB ─── */}
        {tab === 'manual' &&
          (loadingManual ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 bg-muted rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : filteredManual.length === 0 ? (
            <div className="bg-card border border-border rounded-2xl p-12 text-center">
              <Film className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="font-bold text-muted-foreground mb-1">
                {search ? 'Hakuna movie inayolingana' : 'Hakuna movies bado'}
              </p>
              {!search && (
                <Button
                  onClick={openCreate}
                  className="mt-3 bg-primary text-primary-foreground font-bold"
                >
                  <Plus className="w-4 h-4 mr-2" /> Ongeza Movie ya Kwanza
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredManual.map((m) => (
                <div
                  key={m.id}
                  className="bg-card border border-border rounded-2xl p-3 flex items-center gap-3 hover:border-primary/30 transition-colors"
                >
                  <div className="w-14 h-20 sm:w-16 sm:h-24 rounded-lg bg-muted overflow-hidden flex-shrink-0">
                    {m.poster ? (
                      <img
                        src={m.poster}
                        alt={m.title}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Film className="w-6 h-6 text-muted-foreground/30" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-sm text-foreground truncate">{m.title}</p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      {m.category && (
                        <span className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded">
                          {m.category}
                        </span>
                      )}
                      {m.imported_from && (
                        <span className="text-[10px] font-black bg-blue-500/10 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded">
                          IMPORTED
                        </span>
                      )}
                      {m.episodes && m.episodes.length > 1 && (
                        <span className="text-[10px] font-black bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 px-2 py-0.5 rounded">
                          SERIES · {m.episodes.length}EP
                        </span>
                      )}
                      <span
                        className={`text-[10px] font-black px-2 py-0.5 rounded flex items-center gap-1 ${
                          m.is_free
                            ? 'bg-green-500/10 text-green-400 border border-green-500/30'
                            : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30'
                        }`}
                      >
                        {m.is_free ? <Unlock className="w-2.5 h-2.5" /> : <Lock className="w-2.5 h-2.5" />}
                        {m.is_free ? 'FREE' : 'PREMIUM'}
                      </span>
                      {!m.active && (
                        <span className="text-[10px] font-black bg-destructive/10 text-destructive border border-destructive/30 px-2 py-0.5 rounded">
                          INACTIVE
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1 truncate font-mono">
                      {m.drive_id ? `Drive: ${m.drive_id.slice(0, 18)}...` : '⚠ Hakuna Drive ID'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => toggleFree(m)}
                      className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      title={m.is_free ? 'Geuza Premium' : 'Geuza Free'}
                    >
                      {m.is_free ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => toggleActive(m)}
                      className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      title={m.active ? 'Zima' : 'Wezesha'}
                    >
                      {m.active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    </button>
                    {m.imported_from && (
                      <button
                        onClick={() => refreshImportedEpisodes(m)}
                        disabled={deletingId === m.id}
                        className="p-2 rounded-lg hover:bg-cyan-500/10 text-cyan-400 transition-colors disabled:opacity-50"
                        title="Refresh episodes kutoka netswahili"
                      >
                        {deletingId === m.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                    <button
                      onClick={() => openEdit(m)}
                      className="p-2 rounded-lg hover:bg-primary/10 text-primary transition-colors"
                      title="Hariri"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(m)}
                      disabled={deletingId === m.id}
                      className="p-2 rounded-lg hover:bg-destructive/10 text-destructive transition-colors disabled:opacity-50"
                      title="Futa"
                    >
                      {deletingId === m.id ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}

        {/* ─── UPSTREAM TAB ─── */}
        {tab === 'upstream' && (
          <>
            {loadingUpstream ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-20 bg-muted rounded-2xl animate-pulse" />
                ))}
              </div>
            ) : filteredUpstream.length === 0 ? (
              <div className="bg-card border border-border rounded-2xl p-12 text-center">
                <Film className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="font-bold text-muted-foreground">Hakuna upstream movies</p>
              </div>
            ) : (
              <>
                <p className="text-[11px] text-muted-foreground mb-2 px-1">
                  {filteredUpstream.length} movies kutoka netswahili.com · IMPORT inakopi kwenye Firestore na kuficha asili
                </p>
                <div className="space-y-2">
                  {filteredUpstream.map((m) => {
                    const isHidden = hiddenSlugs.includes(m.slug);
                    const isImported = importedSlugs.has(m.slug);
                    const isExpanded = expandedSlug === m.slug;
                    return (
                      <div key={m.slug}>
                        <div
                          className={`bg-card border ${isExpanded ? 'rounded-t-2xl border-b-transparent' : 'rounded-2xl'} p-3 flex items-center gap-3 transition-colors ${
                            isHidden ? 'border-destructive/30 opacity-60' : 'border-border hover:border-primary/30'
                          }`}
                        >
                          <button
                            onClick={() => toggleExpand(m)}
                            className="w-14 h-20 sm:w-16 sm:h-24 rounded-lg bg-muted overflow-hidden flex-shrink-0 relative group cursor-pointer"
                            title="Onyesha episodes"
                          >
                            {m.poster ? (
                              <img
                                src={m.poster}
                                alt={m.title}
                                loading="lazy"
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Film className="w-6 h-6 text-muted-foreground/30" />
                              </div>
                            )}
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                              <Eye className="w-5 h-5 text-white opacity-0 group-hover:opacity-100" />
                            </div>
                          </button>
                          <div className="flex-1 min-w-0">
                            <button
                              onClick={() => toggleExpand(m)}
                              className="text-left w-full"
                            >
                              <p
                                className={`font-black text-sm truncate ${
                                  isHidden ? 'text-muted-foreground line-through' : 'text-foreground'
                                }`}
                              >
                                {m.title}
                              </p>
                            </button>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              <span className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded">
                                {m.type || 'Movie'}
                              </span>
                              <span className="text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/30 px-2 py-0.5 rounded">
                                NETSWAHILI
                              </span>
                              {isImported && (
                                <span className="text-[10px] font-black bg-blue-500/10 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded">
                                  IMPORTED
                                </span>
                              )}
                              {isHidden && (
                                <span className="text-[10px] font-black bg-destructive/10 text-destructive border border-destructive/30 px-2 py-0.5 rounded">
                                  HIDDEN
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-1 truncate font-mono">
                              {m.slug}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              onClick={() => toggleExpand(m)}
                              className={`p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors ${isExpanded ? 'bg-primary/10 text-primary' : ''}`}
                              title={isExpanded ? 'Funga' : 'Onyesha episodes'}
                            >
                              {isExpanded ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                            <a
                              href={`${UPSTREAM}/post/${m.slug}`}
                              target="_blank"
                              rel="noreferrer"
                              className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                              title="Tazama asili"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                            {isHidden ? (
                              <button
                                onClick={() => unhideUpstream(m.slug)}
                                disabled={hidingSlug === m.slug}
                                className="p-2 rounded-lg hover:bg-green-500/10 text-green-400 transition-colors disabled:opacity-50"
                                title="Rejesha kwa watumiaji"
                              >
                                {hidingSlug === m.slug ? (
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Eye className="w-3.5 h-3.5" />
                                )}
                              </button>
                            ) : (
                              <button
                                onClick={() => hideUpstream(m)}
                                disabled={hidingSlug === m.slug || isImported}
                                className="p-2 rounded-lg hover:bg-destructive/10 text-destructive transition-colors disabled:opacity-30"
                                title={isImported ? 'Tayari ina record ya kuhariri' : 'Ficha kwa watumiaji'}
                              >
                                {hidingSlug === m.slug ? (
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="w-3.5 h-3.5" />
                                )}
                              </button>
                            )}
                            <button
                              onClick={() => importUpstream(m, true)}
                              disabled={importingSlug === m.slug || isImported}
                              className="p-2 rounded-lg hover:bg-primary/10 text-primary transition-colors disabled:opacity-30"
                              title={isImported ? 'Tayari ime-import' : 'Import + Hariri'}
                            >
                              {importingSlug === m.slug ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : isImported ? (
                                <CheckCircle className="w-3.5 h-3.5" />
                              ) : (
                                <Download className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Expanded episode preview */}
                        {isExpanded && (
                          <div
                            className={`bg-card/60 border ${
                              isHidden ? 'border-destructive/30 opacity-60' : 'border-border'
                            } border-t-0 rounded-b-2xl px-4 py-3`}
                          >
                            {loadingEpisodes ? (
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                Inapakua episodes...
                              </div>
                            ) : expandedEpisodes.length === 0 ? (
                              <p className="text-xs text-muted-foreground italic">
                                Hakuna episodes zilizopatikana.
                              </p>
                            ) : (
                              <>
                                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2 flex items-center gap-2">
                                  Episodes ({expandedEpisodes.length})
                                  {expandedEpisodes.length > 1 && (
                                    <span className="text-[9px] bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                                      SERIES
                                    </span>
                                  )}
                                </p>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5 max-h-64 overflow-y-auto">
                                  {expandedEpisodes.map((ep, idx) => (
                                    <a
                                      key={ep.driveId + idx}
                                      href={`https://drive.google.com/file/d/${ep.driveId}/view`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-muted hover:bg-muted/70 text-xs text-foreground transition-colors truncate"
                                      title={`Drive: ${ep.driveId}`}
                                    >
                                      <span className="text-primary text-[10px] font-mono w-5 flex-shrink-0">
                                        {(idx + 1).toString().padStart(2, '0')}
                                      </span>
                                      <span className="truncate flex-1 text-[11px] font-bold">
                                        {ep.title}
                                      </span>
                                      <ExternalLink className="w-2.5 h-2.5 text-muted-foreground flex-shrink-0" />
                                    </a>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Load more */}
                <div className="flex justify-center pt-4">
                  {upstreamEnd ? (
                    <p className="text-xs text-muted-foreground font-bold">Mwisho wa orodha</p>
                  ) : (
                    <button
                      onClick={loadMoreUpstream}
                      disabled={loadingMore}
                      className="px-5 py-2.5 rounded-xl bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary font-black text-sm transition-colors disabled:opacity-60 flex items-center gap-2"
                    >
                      {loadingMore ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" /> Inapakua...
                        </>
                      ) : (
                        <>Pakua Zaidi</>
                      )}
                    </button>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {/* Add/Edit modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="bg-background border border-border rounded-t-3xl sm:rounded-2xl w-full sm:max-w-lg max-h-[92vh] overflow-y-auto">
              <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3 flex items-center justify-between">
                <h2 className="font-black text-foreground">
                  {editing ? 'Hariri Movie' : 'Ongeza Movie'}
                </h2>
                <button
                  onClick={closeForm}
                  className="p-1 rounded-lg hover:bg-muted text-muted-foreground"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 space-y-4">
                <div>
                  <Label className="text-foreground text-xs mb-1.5 block">Title *</Label>
                  <Input
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    onBlur={handleTitleBlur}
                    placeholder="Mfano: Forgive Us All (2025)"
                    className="bg-muted border-border"
                  />
                </div>
                <div>
                  <Label className="text-foreground text-xs mb-1.5 block">Slug (URL)</Label>
                  <Input
                    value={form.slug}
                    onChange={(e) => setForm((f) => ({ ...f, slug: slugify(e.target.value) }))}
                    placeholder="forgive-us-all-2025"
                    className="bg-muted border-border font-mono text-xs"
                  />
                </div>
                <div>
                  <Label className="text-foreground text-xs mb-1.5 block">
                    Google Drive URL au ID *
                  </Label>
                  <Input
                    value={form.drive_id}
                    onChange={(e) => setForm((f) => ({ ...f, drive_id: e.target.value }))}
                    placeholder="https://drive.google.com/file/d/XXX/view au XXX"
                    className="bg-muted border-border font-mono text-xs"
                  />
                </div>
                <div>
                  <Label className="text-foreground text-xs mb-1.5 block">Poster URL</Label>
                  <Input
                    value={form.poster}
                    onChange={(e) => setForm((f) => ({ ...f, poster: e.target.value }))}
                    placeholder="https://example.com/poster.jpg"
                    className="bg-muted border-border text-xs"
                  />
                  {form.poster && (
                    <img
                      src={form.poster}
                      alt="poster preview"
                      referrerPolicy="no-referrer"
                      className="mt-2 w-24 h-36 rounded-lg object-cover border border-border"
                    />
                  )}
                </div>
                <div>
                  <Label className="text-foreground text-xs mb-1.5 block">Description</Label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Maelezo mafupi..."
                    rows={3}
                    className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none focus:border-primary resize-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-foreground text-xs mb-1.5 block">Category</Label>
                    <Input
                      value={form.category}
                      onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                      className="bg-muted border-border"
                    />
                  </div>
                  <div>
                    <Label className="text-foreground text-xs mb-1.5 block">Year</Label>
                    <Input
                      value={form.year}
                      onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
                      className="bg-muted border-border"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-4 pt-2 border-t border-border">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.is_free}
                      onChange={(e) => setForm((f) => ({ ...f, is_free: e.target.checked }))}
                      className="w-4 h-4"
                    />
                    <span className="text-xs font-bold text-foreground">Free</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer ml-auto">
                    <input
                      type="checkbox"
                      checked={form.active}
                      onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                      className="w-4 h-4"
                    />
                    <span className="text-xs font-bold text-foreground">Active</span>
                  </label>
                </div>
              </div>

              <div className="sticky bottom-0 bg-background border-t border-border px-4 py-3 flex items-center gap-2">
                <Button
                  onClick={closeForm}
                  variant="outline"
                  className="flex-1 border-border text-muted-foreground hover:text-foreground"
                >
                  Ghairi
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 bg-primary text-primary-foreground font-black tracking-wider glow-cyan"
                >
                  {saving ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> INAHIFADHI...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" /> HIFADHI
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
