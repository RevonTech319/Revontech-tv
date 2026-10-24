import { useEffect, useState, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { db } from '@/lib/firebase';
import { useTranslation } from '@/lib/i18n';
import Header from '@/components/Header';

interface LegalDoc {
  title?: string;
  content?: string;
  updated_at?: string;
}

/** Tiny renderer: "# H1", "## H2", "- bullet", blank line = paragraph break. */
function renderContent(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      out.push(
        <ul key={`ul-${out.length}`} className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
          {list.map((li, i) => <li key={i}>{li}</li>)}
        </ul>
      );
      list = [];
    }
  };
  text.split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (/^[-*]\s+/.test(line)) { list.push(line.replace(/^[-*]\s+/, '')); return; }
    flush();
    if (!line) return;
    if (line.startsWith('## ')) out.push(<h2 key={i} className="text-base font-black text-foreground pt-2">{line.slice(3)}</h2>);
    else if (line.startsWith('# ')) out.push(<h1 key={i} className="text-lg font-black text-foreground pt-2">{line.slice(2)}</h1>);
    else out.push(<p key={i} className="text-sm leading-relaxed text-muted-foreground">{line}</p>);
  });
  flush();
  return out;
}

export default function Legal({ kind }: { kind: 'terms' | 'privacy' }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [data, setData] = useState<LegalDoc | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getDoc(doc(db, 'settings', 'legal'))
      .then((snap) => setData(snap.exists() ? (snap.data()[kind] as LegalDoc) || null : null))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [kind]);

  const title = data?.title || (kind === 'terms' ? t('terms') : t('privacy'));

  return (
    <div className="min-h-screen">
      <Header />
      <div className="mx-auto max-w-2xl px-4 py-5">
        <button
          onClick={() => navigate(-1)}
          className="mb-4 inline-flex items-center gap-2 rounded-xl glass px-3 py-2 text-sm font-bold text-foreground press tap-safe"
        >
          <ArrowLeft className="h-4 w-4" /> {t('back')}
        </button>
        <h1 className="mb-1 text-2xl font-black text-foreground">{title}</h1>
        {data?.updated_at && (
          <p className="mb-5 text-xs text-muted-foreground">
            {t('legal_updated')}: {new Date(data.updated_at).toLocaleDateString()}
          </p>
        )}
        {loading ? (
          <Loader2 className="mx-auto mt-10 h-6 w-6 animate-spin text-primary" />
        ) : data?.content?.trim() ? (
          <div className="space-y-3">{renderContent(data.content)}</div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('legal_empty')}</p>
        )}
      </div>
    </div>
  );
}
