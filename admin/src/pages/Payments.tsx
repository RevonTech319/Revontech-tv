import { useEffect, useState, useMemo } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AdminLayout from '@/components/AdminLayout';
import { 
  RefreshCw, CheckCircle, XCircle, Clock, TrendingUp, DollarSign, 
  Layers, Copy, Check, Search, CreditCard, Zap, Smartphone, ShieldAlert, Gift
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface GatewayMeta {
  id: string;
  name: string;
  badgeClass: string;
  icon: any;
}

export default function AdminPayments() {
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedGatewayFilter, setSelectedGatewayFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [stats, setStats] = useState({
    revenue: 0,
    active: 0,
    pending: 0,
    failed: 0,
    total: 0,
    byGateway: {} as Record<string, { count: number; revenue: number }>
  });

  const getGatewayMeta = (item: any): GatewayMeta => {
    const g = (item.gateway || '').toLowerCase();
    const m = (item.method || '').toLowerCase();

    if (g === 'snippe' || item.snippe_reference || item.snippe_order_id || m.includes('snippe')) {
      return {
        id: 'snippe',
        name: 'Snippe',
        badgeClass: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
        icon: Zap
      };
    }
    if (g === 'sonicpesa' || item.sonic_order_id || item.sonicOrderId || m.includes('sonic')) {
      return {
        id: 'sonicpesa',
        name: 'SonicPesa',
        badgeClass: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
        icon: Smartphone
      };
    }
    if (g === 'palmpesa' || item.palm_order_id || item.palmOrderId || m.includes('palm')) {
      return {
        id: 'palmpesa',
        name: 'PalmPesa',
        badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
        icon: CreditCard
      };
    }
    if (g === 'fastlipa' || item.fastlipa_tran_id || item.tranID || item.tran_id || m.includes('fastlipa')) {
      return {
        id: 'fastlipa',
        name: 'FastLipa',
        badgeClass: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
        icon: Clock
      };
    }
    if (g === 'referral' || m.includes('referral')) {
      return {
        id: 'referral',
        name: 'Referral Bonus',
        badgeClass: 'bg-pink-500/10 text-pink-400 border-pink-500/30',
        icon: Gift
      };
    }
    if (item.is_manual || item.isManual || g === 'manual' || m.includes('manual')) {
      return {
        id: 'manual',
        name: 'Manual Grant',
        badgeClass: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30',
        icon: ShieldAlert
      };
    }

    return {
      id: 'other',
      name: item.gateway ? item.gateway.toUpperCase() : 'Nyinginezo',
      badgeClass: 'bg-muted/40 text-muted-foreground border-border',
      icon: Layers
    };
  };

  const getGatewayReference = (item: any): string | null => {
    return (
      item.snippe_reference ||
      item.sonic_order_id ||
      item.palm_order_id ||
      item.fastlipa_tran_id ||
      item.tranID ||
      item.tran_id ||
      item.reference ||
      null
    );
  };

  useEffect(() => {
    const q = query(collection(db, 'subscriptions'), orderBy('created_at', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let revenue = 0;
      let active = 0;
      let pending = 0;
      let failed = 0;
      let total = 0;
      const byGateway: Record<string, { count: number; revenue: number }> = {
        snippe: { count: 0, revenue: 0 },
        sonicpesa: { count: 0, revenue: 0 },
        palmpesa: { count: 0, revenue: 0 },
        fastlipa: { count: 0, revenue: 0 },
        manual: { count: 0, revenue: 0 },
        other: { count: 0, revenue: 0 }
      };

      const data = snapshot.docs.map(doc => {
        const item = doc.data();
        total++;

        const isManual = item.is_manual === true || item.gateway === 'manual' || (
          !item.gateway && !item.tran_id && !item.tranID && !item.order_id && !item.palm_order_id && !item.sonic_order_id && !item.snippe_reference && !item.snippe_order_id && !item.reference
        );

        const rawAmount = item.amount !== undefined ? Number(item.amount) : (Number(String(item.price || 0).replace(/[^0-9]/g, '')) || 0);
        const gw = getGatewayMeta({ ...item, isManual });

        if (!byGateway[gw.id]) {
          byGateway[gw.id] = { count: 0, revenue: 0 };
        }
        byGateway[gw.id].count++;

        if (item.status === 'active') {
          active++;
          if (!isManual && gw.id !== 'referral') {
            revenue += rawAmount;
            byGateway[gw.id].revenue += rawAmount;
          }
        } else if (item.status === 'pending') {
          pending++;
        } else if (item.status === 'failed') {
          failed++;
        }

        return { 
          id: doc.id, 
          ...item, 
          amount: rawAmount,
          isManual,
          gatewayMeta: gw,
          gatewayRef: getGatewayReference(item)
        };
      });

      setStats({ revenue, active, pending, failed, total, byGateway });
      setPayments(data);
      setLoading(false);
    }, (err) => {
      console.error(err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const formatPrice = (price: number) => {
    return price?.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getStatusBadge = (status: string) => {
    if (status === 'active') return <span className="bg-green-500/10 text-green-500 border border-green-500/20 px-2.5 py-0.5 rounded-full text-xs font-bold flex items-center gap-1"><CheckCircle className="w-3 h-3"/> Active</span>;
    if (status === 'pending') return <span className="bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 px-2.5 py-0.5 rounded-full text-xs font-bold flex items-center gap-1"><Clock className="w-3 h-3"/> Pending</span>;
    if (status === 'failed') return <span className="bg-red-500/10 text-red-500 border border-red-500/20 px-2.5 py-0.5 rounded-full text-xs font-bold flex items-center gap-1"><XCircle className="w-3 h-3"/> Failed</span>;
    return <span className="bg-muted text-muted-foreground px-2.5 py-0.5 rounded-full text-xs font-bold">{status}</span>;
  };

  // Filtered payments list
  const filteredPayments = useMemo(() => {
    return payments.filter(p => {
      // Gateway filter
      if (selectedGatewayFilter !== 'all' && p.gatewayMeta.id !== selectedGatewayFilter) {
        return false;
      }
      // Search query filter (phone, order_id, gatewayRef, id)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const phone = (p.phone || '').toLowerCase();
        const id = (p.id || '').toLowerCase();
        const ref = (p.gatewayRef || '').toLowerCase();
        const plan = (p.plan || '').toLowerCase();
        const orderId = (p.order_id || p.transaction_id || '').toLowerCase();
        return phone.includes(q) || id.includes(q) || ref.includes(q) || plan.includes(q) || orderId.includes(q);
      }
      return true;
    });
  }, [payments, selectedGatewayFilter, searchQuery]);

  if (loading) {
    return (
      <AdminLayout>
        <div className="p-8 flex items-center justify-center text-muted-foreground">
          <RefreshCw className="w-6 h-6 animate-spin mr-2" /> Inapakia miamala...
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-xl font-black tracking-wide text-foreground">Ripoti ya Malipo</h1>
        <p className="text-sm text-muted-foreground">Uchambuzi kamili wa miamala, malango (gateways), na mapato.</p>
      </div>

      {/* Analytics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="cyber-card rounded-2xl p-4 flex flex-col gap-3 bg-gradient-to-br from-green-500/10 to-transparent border-green-500/30">
          <div className="flex items-center justify-between">
            <div className="p-2 bg-green-500/20 rounded-xl">
              <DollarSign className="w-5 h-5 text-green-500" />
            </div>
            <TrendingUp className="w-4 h-4 text-green-500" />
          </div>
          <div>
            <p className="text-2xl font-black text-foreground">TZS {formatPrice(stats.revenue)}</p>
            <p className="text-xs text-muted-foreground">Jumla ya Mapato</p>
          </div>
        </div>

        <div className="cyber-card rounded-2xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="p-2 bg-primary/10 rounded-xl">
              <CheckCircle className="w-5 h-5 text-primary" />
            </div>
          </div>
          <div>
            <p className="text-2xl font-black text-foreground">{stats.active}</p>
            <p className="text-xs text-muted-foreground">Malipo Yaliyokamilika</p>
          </div>
        </div>

        <div className="cyber-card rounded-2xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="p-2 bg-yellow-500/10 rounded-xl">
              <Clock className="w-5 h-5 text-yellow-500" />
            </div>
          </div>
          <div>
            <p className="text-2xl font-black text-foreground">{stats.pending}</p>
            <p className="text-xs text-muted-foreground">Miamala Inayosubiri (Pending)</p>
          </div>
        </div>

        <div className="cyber-card rounded-2xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="p-2 bg-red-500/10 rounded-xl">
              <XCircle className="w-5 h-5 text-red-500" />
            </div>
          </div>
          <div>
            <p className="text-2xl font-black text-foreground">{stats.failed}</p>
            <p className="text-xs text-muted-foreground">Miamala Iliyofeli</p>
          </div>
        </div>
      </div>

      {/* Gateway Revenue Breakdown Chips */}
      <div className="mb-6 p-4 cyber-card rounded-2xl border border-border/60">
        <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary" /> Mapato kwa Kila Lango (Gateways)
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="p-2.5 rounded-xl bg-purple-500/5 border border-purple-500/20">
            <div className="flex items-center gap-1.5 text-xs font-bold text-purple-400">
              <Zap className="w-3.5 h-3.5" /> Snippe
            </div>
            <p className="text-base font-black text-foreground mt-1">TZS {formatPrice(stats.byGateway.snippe?.revenue || 0)}</p>
            <p className="text-[10px] text-muted-foreground">{stats.byGateway.snippe?.count || 0} miamala</p>
          </div>

          <div className="p-2.5 rounded-xl bg-blue-500/5 border border-blue-500/20">
            <div className="flex items-center gap-1.5 text-xs font-bold text-blue-400">
              <Smartphone className="w-3.5 h-3.5" /> SonicPesa
            </div>
            <p className="text-base font-black text-foreground mt-1">TZS {formatPrice(stats.byGateway.sonicpesa?.revenue || 0)}</p>
            <p className="text-[10px] text-muted-foreground">{stats.byGateway.sonicpesa?.count || 0} miamala</p>
          </div>

          <div className="p-2.5 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
              <CreditCard className="w-3.5 h-3.5" /> PalmPesa
            </div>
            <p className="text-base font-black text-foreground mt-1">TZS {formatPrice(stats.byGateway.palmpesa?.revenue || 0)}</p>
            <p className="text-[10px] text-muted-foreground">{stats.byGateway.palmpesa?.count || 0} miamala</p>
          </div>

          <div className="p-2.5 rounded-xl bg-orange-500/5 border border-orange-500/20">
            <div className="flex items-center gap-1.5 text-xs font-bold text-orange-400">
              <Clock className="w-3.5 h-3.5" /> FastLipa
            </div>
            <p className="text-base font-black text-foreground mt-1">TZS {formatPrice(stats.byGateway.fastlipa?.revenue || 0)}</p>
            <p className="text-[10px] text-muted-foreground">{stats.byGateway.fastlipa?.count || 0} miamala</p>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between mb-4">
        {/* Gateway Filter Buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {[
            { id: 'all', label: 'Zote' },
            { id: 'snippe', label: 'Snippe' },
            { id: 'sonicpesa', label: 'SonicPesa' },
            { id: 'palmpesa', label: 'PalmPesa' },
            { id: 'fastlipa', label: 'FastLipa' },
            { id: 'manual', label: 'Manual' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setSelectedGatewayFilter(f.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 border ${
                selectedGatewayFilter === f.id
                  ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                  : 'bg-card text-muted-foreground border-border hover:text-foreground'
              }`}
            >
              {f.label}
              {f.id !== 'all' && stats.byGateway[f.id] ? ` (${stats.byGateway[f.id].count})` : ''}
            </button>
          ))}
        </div>

        {/* Search input */}
        <div className="relative min-w-[220px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Tafuta kwa namba, ID au Ref..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-card border border-border rounded-xl pl-9 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-all"
          />
        </div>
      </div>

      {/* Transactions List */}
      <div className="space-y-3">
        {filteredPayments.map(payment => {
          const GwIcon = payment.gatewayMeta.icon;
          return (
            <div key={payment.id} className="cyber-card p-4 rounded-2xl flex flex-col gap-3 transition-all hover:border-primary/40">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-sm text-foreground">{payment.phone || 'Namba Haijulikani'}</p>
                    
                    {/* Gateway Signed Badge */}
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border flex items-center gap-1 ${payment.gatewayMeta.badgeClass}`}>
                      <GwIcon className="w-3 h-3" />
                      {payment.gatewayMeta.name}
                    </span>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Kifurushi: <span className="font-bold text-primary">{payment.plan || 'N/A'}</span>
                    {payment.plan_name && payment.plan_name !== payment.plan && (
                      <span className="text-muted-foreground ml-1">({payment.plan_name})</span>
                    )}
                  </p>

                  {/* Gateway Reference / Order ID if available */}
                  {payment.gatewayRef && (
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className="font-mono bg-muted/40 px-1.5 py-0.5 rounded text-[10px]">
                        Ref: {payment.gatewayRef}
                      </span>
                      <button
                        onClick={() => copyToClipboard(payment.gatewayRef, `ref-${payment.id}`)}
                        className="text-muted-foreground hover:text-primary transition-colors"
                        title="Nakili Reference"
                      >
                        {copiedId === `ref-${payment.id}` ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </div>
                  )}
                </div>

                <div className="text-right">
                  <p className="font-black text-foreground">TZS {formatPrice(payment.amount || 0)}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {payment.created_at ? formatDistanceToNow(payment.created_at.toDate(), { addSuffix: true }) : 'Sasa hivi'}
                  </p>
                </div>
              </div>

              <div className="flex justify-between items-center pt-3 border-t border-border/60 text-xs">
                <div className="flex items-center gap-2 text-muted-foreground text-[11px] truncate max-w-[200px]">
                  <span className="font-mono truncate">ID: {payment.id}</span>
                  <button
                    onClick={() => copyToClipboard(payment.id, `id-${payment.id}`)}
                    className="hover:text-primary transition-colors shrink-0"
                    title="Nakili ID"
                  >
                    {copiedId === `id-${payment.id}` ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
                <div>{getStatusBadge(payment.status)}</div>
              </div>
            </div>
          );
        })}

        {filteredPayments.length === 0 && (
          <div className="p-8 text-center text-muted-foreground cyber-card rounded-2xl border border-dashed">
            Hakuna miamala iliyopatikana{selectedGatewayFilter !== 'all' ? ` kwa lango la ${selectedGatewayFilter}` : ''}.
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
