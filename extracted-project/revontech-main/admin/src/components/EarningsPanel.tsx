import { useEffect, useMemo, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { startOfDay, startOfWeek, startOfMonth, startOfYear, formatDistanceToNow } from 'date-fns';
import { db } from '@/lib/firebase';
import { TrendingUp, CalendarDays, CalendarRange, Calendar, CalendarCheck } from 'lucide-react';

/**
 * Live earnings from SUCCESSFUL, real payments only.
 *
 * A subscription counts as earnings when:
 *   - status is "active" (payment was confirmed), AND
 *   - it was NOT granted manually by an admin (is_manual / gateway "manual"), AND
 *   - it is NOT a referral reward, AND
 *   - its amount is greater than 0.
 *
 * Pending and failed payments never count. The payment date is the time the
 * subscription was activated (`starts_at`), falling back to `created_at`.
 * Updates in real time through a Firestore snapshot listener.
 */

interface Earning {
  id: string;
  amount: number;
  paidAt: Date;
  plan: string;
  phone: string;
  gateway: string;
}

const formatTZS = (n: number) => `TZS ${Math.round(n).toLocaleString('en-US')}`;

const toDate = (item: any): Date | null => {
  if (item.starts_at) {
    const d = new Date(item.starts_at);
    if (!isNaN(d.getTime())) return d;
  }
  const c = item.created_at;
  if (c?.toDate) return c.toDate();
  if (c) {
    const d = new Date(c);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
};

const toAmount = (item: any): number =>
  item.amount !== undefined
    ? Number(item.amount) || 0
    : Number(String(item.price || 0).replace(/[^0-9]/g, '')) || 0;

const isRealPayment = (item: any): boolean => {
  if (item.status !== 'active') return false;
  if (item.is_manual === true || item.isManual === true) return false;
  const gw = String(item.gateway || '').toLowerCase();
  if (gw === 'manual' || gw === 'referral') return false;
  const method = String(item.method || '').toLowerCase();
  if (method.includes('manual') || method.includes('referral')) return false;
  // Records with no gateway and no gateway reference are manual grants
  const hasGatewayInfo =
    gw ||
    item.tran_id || item.tranID || item.order_id || item.palm_order_id ||
    item.sonic_order_id || item.snippe_reference || item.snippe_order_id || item.reference;
  if (!hasGatewayInfo) return false;
  return toAmount(item) > 0;
};

export default function EarningsPanel() {
  const [earnings, setEarnings] = useState<Earning[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  // Tick every minute so "today" rolls over at midnight and times stay current
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let first = true;
    const q = query(collection(db, 'subscriptions'), where('status', '==', 'active'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: Earning[] = [];
        snap.docs.forEach((d) => {
          const item = d.data();
          if (!isRealPayment(item)) return;
          const paidAt = toDate(item);
          if (!paidAt) return;
          list.push({
            id: d.id,
            amount: toAmount(item),
            paidAt,
            plan: item.plan || '',
            phone: item.phone || '',
            gateway: String(item.gateway || 'other'),
          });
        });
        setEarnings(list);
        setLoading(false);

        // Highlight payments that arrive while the page is open
        if (!first) {
          const added = snap.docChanges().filter((c) => c.type === 'added' && isRealPayment(c.doc.data())).map((c) => c.doc.id);
          if (added.length) {
            setFresh((prev) => new Set([...prev, ...added]));
            setTimeout(() => {
              setFresh((prev) => {
                const next = new Set(prev);
                added.forEach((id) => next.delete(id));
                return next;
              });
            }, 8000);
          }
        }
        first = false;
      },
      (err) => {
        console.error('Earnings listener error:', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const totals = useMemo(() => {
    const ranges = {
      day: startOfDay(now),
      week: startOfWeek(now, { weekStartsOn: 1 }), // week starts Monday
      month: startOfMonth(now),
      year: startOfYear(now),
    };
    const out = {
      day: { sum: 0, count: 0 },
      week: { sum: 0, count: 0 },
      month: { sum: 0, count: 0 },
      year: { sum: 0, count: 0 },
    };
    earnings.forEach((e) => {
      (Object.keys(ranges) as Array<keyof typeof ranges>).forEach((k) => {
        if (e.paidAt >= ranges[k] && e.paidAt <= now) {
          out[k].sum += e.amount;
          out[k].count += 1;
        }
      });
    });
    return out;
  }, [earnings, now]);

  const recent = useMemo(
    () => [...earnings].sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime()).slice(0, 8),
    [earnings]
  );

  const cards = [
    { key: 'day', label: 'Leo', icon: CalendarCheck },
    { key: 'week', label: 'Wiki Hii', icon: CalendarDays },
    { key: 'month', label: 'Mwezi Huu', icon: CalendarRange },
    { key: 'year', label: 'Mwaka Huu', icon: Calendar },
  ] as const;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-black text-muted-foreground uppercase tracking-widest">Mapato</h2>
        <span className="flex items-center gap-1.5 text-[10px] font-black text-green-500 bg-green-500/10 border border-green-500/30 px-2 py-0.5 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          LIVE
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {cards.map(({ key, label, icon: Icon }) => (
          <div key={key} className="cyber-card rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="p-1.5 bg-primary/10 rounded-lg">
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <span className="text-[10px] text-muted-foreground font-bold">
                {totals[key].count} {totals[key].count === 1 ? 'muamala' : 'miamala'}
              </span>
            </div>
            <p className="text-lg font-black text-foreground leading-tight break-words">
              {loading ? '...' : formatTZS(totals[key].sum)}
            </p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-muted-foreground mt-2">
        Zinahesabiwa tu malipo yaliyofanikiwa. Vifurushi vilivyotolewa manually na zawadi za referral havijumuishwi.
      </p>

      <div className="cyber-card rounded-2xl p-4 mt-3">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h3 className="text-xs font-black text-muted-foreground uppercase tracking-widest">Malipo ya Karibuni</h3>
        </div>
        {recent.length === 0 ? (
          <p className="text-xs text-muted-foreground py-3 text-center">
            {loading ? 'Inapakia...' : 'Hakuna malipo yaliyofanikiwa bado'}
          </p>
        ) : (
          <div className="space-y-2">
            {recent.map((e) => (
              <div
                key={e.id}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 transition-colors ${
                  fresh.has(e.id) ? 'bg-green-500/15 border border-green-500/40' : 'bg-muted/30 border border-transparent'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-foreground truncate">
                    {e.phone || 'Mteja'}{e.plan ? ` · ${e.plan}` : ''}
                  </p>
                  <p className="text-[10px] text-muted-foreground uppercase truncate">
                    {e.gateway} · {formatDistanceToNow(e.paidAt, { addSuffix: true })}
                  </p>
                </div>
                <p className="text-sm font-black text-green-500 flex-shrink-0">+{formatTZS(e.amount)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
