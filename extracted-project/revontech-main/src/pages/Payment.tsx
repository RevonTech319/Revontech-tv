import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { collection, query, getDocs, addDoc, serverTimestamp, doc, onSnapshot, getDoc, updateDoc, where, increment } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Header from '@/components/Header';
import { Check, Zap, Crown, Calendar, Clock, Loader2, Phone, Star, Lock, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Visual presets that cycle based on index
const PLAN_STYLES = [
  { icon: Clock, colorClass: 'text-blue-400', bgClass: 'bg-blue-400/10' },
  { icon: Zap, colorClass: 'text-primary', bgClass: 'bg-primary/10' },
  { icon: Calendar, colorClass: 'text-green-400', bgClass: 'bg-green-400/10' },
  { icon: Crown, colorClass: 'text-yellow-400', bgClass: 'bg-yellow-400/10' },
  { icon: Star, colorClass: 'text-purple-400', bgClass: 'bg-purple-400/10' },
];

interface DBPlan {
  id: string;
  name: string;
  plan_key: string;
  amount: number;
  currency: string;
  duration_days: number;
  features: string[];
  popular: boolean;
  active: boolean;
  sort_order: number;
}

type Step = 'select' | 'phone' | 'waiting' | 'success' | 'failed';

/**
 * Helper: Rewards the referrer with free package days when an invited user purchases a package.
 * Inviter receives free days on every package purchase (initial + repeat purchases)!
 */
async function creditReferrerOnClientPurchase(buyerUid: string, buyerName: string, planKey: string, subId: string) {
  try {
    const buyerDoc = await getDoc(doc(db, 'profiles', buyerUid));
    if (!buyerDoc.exists()) return;
    const referredBy = buyerDoc.data()?.referred_by;
    if (!referredBy) return;

    const refQ = query(collection(db, 'profiles'), where('referral_code', '==', referredBy));
    const refSnap = await getDocs(refQ);
    if (refSnap.empty) return;

    const refDoc = refSnap.docs[0];
    const referrerId = refDoc.id;
    const refData = refDoc.data() || {};

    let rewardDays = 1;
    const pk = (planKey || '').toLowerCase();
    if (pk.includes('miezi 3') || pk.includes('3 month') || pk.includes('miezi mitatu')) rewardDays = 15;
    else if (pk.includes('month') || pk.includes('mwezi') || pk.includes('mmoja')) rewardDays = 7;
    else if (pk.includes('week2') || pk.includes('wiki mbili') || pk.includes('week 2') || pk.includes('week_2')) rewardDays = 4;
    else if (pk.includes('week') || pk.includes('wiki')) rewardDays = 2;
    else rewardDays = 1;

    const now = new Date();
    let baseDate = now;
    if (refData.expires_at) {
      const raw = refData.expires_at;
      const d = (raw && typeof raw.toDate === 'function') ? raw.toDate() : new Date(raw);
      if (!isNaN(d.getTime()) && d > now) {
        baseDate = d;
      }
    }
    const newExp = new Date(baseDate.getTime() + (rewardDays * 24 * 60 * 60 * 1000));

    const existingBuyers = refData.referred_buyers || {};
    const prev = existingBuyers[buyerUid] || { purchases_count: 0, reward_days_earned: 0 };
    const updatedBuyer = {
      purchases_count: (prev.purchases_count || 0) + 1,
      reward_days_earned: (prev.reward_days_earned || 0) + rewardDays,
      last_purchased_at: now.toISOString(),
      display_name: buyerName || 'Mteja',
      plan: planKey
    };

    await updateDoc(doc(db, 'profiles', referrerId), {
      plan: 'Referral VIP',
      is_active: true,
      expires_at: newExp.toISOString(),
      referral_reward_days: increment(rewardDays),
      referral_paid_count: increment(1),
      referred_buyers: {
        ...existingBuyers,
        [buyerUid]: updatedBuyer
      }
    });

    await addDoc(collection(db, 'subscriptions'), {
      user_id: referrerId,
      plan: 'Referral VIP',
      amount: 0,
      duration_days: rewardDays,
      gateway: 'referral',
      status: 'active',
      starts_at: now.toISOString(),
      expires_at: newExp.toISOString(),
      created_at: serverTimestamp(),
      buyer_id: buyerUid,
      buyer_subscription_id: subId,
      notes: `Zawadi ya mwaliko kutoka kwa ${buyerName || 'rafiki'}`
    });

    // Notify referrer
    await addDoc(collection(db, 'user_notifications'), {
      user_id: referrerId,
      title: 'Hongera! Umepata Kifurushi cha Bure! 🎉',
      message: `Rafiki yako ${buyerName || ''} amenunua kifurushi (${planKey}). Akaunti yako imeongezewa siku ${rewardDays} za bure za kutazama vipindi vyote!`,
      read: false,
      type: 'referral_reward',
      created_at: serverTimestamp()
    });
  } catch (err) {
    console.error("Error crediting referrer on client purchase:", err);
  }
}

export default function Payment() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, profile, refreshProfile } = useAuth();
  const activeInterval = useRef<any>(null);
  const [plans, setPlans] = useState<DBPlan[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [phone, setPhone] = useState((profile as any)?.phone || '');
  const [step, setStep] = useState<Step>('select');
  const [orderId, setOrderId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [plansLoading, setPlansLoading] = useState(true);

  const [settings, setSettings] = useState({ 
    zenoApiKey: '', 
    fastLipaToken: '',
    palmpesaToken: '',
    palmpesaUserId: '',
    sonicpesaApiKey: '',
    sonicpesaSecretKey: '',
    snippeApiKey: '',
    activeGateway: 'fastlipa'
  });

  const grantPaidSubscription = async (subId: string, plan: DBPlan) => {
    if (!user) return;
    const now = new Date();
    const expDate = new Date();
    let days = plan.duration_days;
    
    if (!days) {
      const key = (plan.plan_key || '').toLowerCase();
      if (key.includes('day') || key.includes('siku')) days = 1;
      else if (key.includes('week2') || key.includes('wiki mbili') || key.includes('week 2') || key.includes('week_2')) days = 14;
      else if (key.includes('week') || key.includes('wiki')) days = 7;
      else if (key.includes('month') || key.includes('mwezi') || key.includes('mmoja')) days = 30;
      else if (key.includes('miezi 3') || key.includes('miezi mitatu') || key.includes('3 months')) days = 90;
      else days = 30;
    }
    
    expDate.setDate(now.getDate() + days);

    try {
      await updateDoc(doc(db, 'subscriptions', subId), { 
        status: 'active',
        starts_at: now.toISOString(),
        expires_at: expDate.toISOString()
      });

      await updateDoc(doc(db, 'profiles', user.uid), {
        plan: plan.plan_key,
        is_active: true
      });

      // Reward referrer with free package days immediately
      creditReferrerOnClientPurchase(user.uid, profile?.display_name || '', plan.plan_key, subId);

      await refreshProfile();
      setStep('success');
    } catch (writeErr) {
      console.error("Error granting premium plan:", writeErr);
      refreshProfile();
      setStep('success');
    }
  };

  useEffect(() => {
    const fetchPlansAndSettings = async () => {
      try {
        const q = query(collection(db, 'plans'));
        const snap = await getDocs(q);
        const fetched: DBPlan[] = [];
        snap.forEach(doc => {
          const data = doc.data() as DBPlan;
          if (data.active !== false) {
            fetched.push({ id: doc.id, ...data });
          }
        });
        fetched.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
        setPlans(fetched);

        const targetKey = searchParams.get('plan');
        if (targetKey) {
          const match = fetched.find(p => p.plan_key === targetKey || p.name.toLowerCase().includes(targetKey.toLowerCase()));
          if (match) setSelected(match.plan_key);
          else if (fetched.length > 0) setSelected(fetched[0].plan_key);
        } else if (fetched.length > 0 && !selected) {
          const pop = fetched.find(p => p.popular) || fetched[0];
          setSelected(pop.plan_key);
        }

        // Fetch API Keys
        const docRef = doc(db, 'settings', 'general_settings');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setSettings({ 
            zenoApiKey: data.zeno_api_key || '',
            fastLipaToken: data.fastlipa_token || '',
            palmpesaToken: data.palmpesa_token || '',
            palmpesaUserId: data.palmpesa_user_id || '',
            sonicpesaApiKey: data.sonicpesa_api_key || '',
            sonicpesaSecretKey: data.sonicpesa_secret_key || '',
            snippeApiKey: data.snippe_api_key || '',
            activeGateway: data.active_gateway || 'fastlipa'
          });
        }
      } catch (err) {
        console.error("Error fetching plans/settings:", err);
      }
      setPlansLoading(false);
    };
    fetchPlansAndSettings();
  }, []);

  const selectedPlan = plans.find((p) => p.plan_key === selected);
  const formatPrice = (amount: number) => amount.toLocaleString();

  const detectNetwork = (p: string): { name: string; pinLabel: string } => {
    const cleaned = p.replace(/\D/g, '');
    const prefix = cleaned.startsWith('255') ? '0' + cleaned.slice(3, 5) : cleaned.slice(0, 3);
    if (['074', '075', '076'].some(x => prefix.startsWith(x))) return { name: 'Vodacom', pinLabel: 'M-Pesa PIN' };
    if (['068', '069', '078', '079'].some(x => prefix.startsWith(x))) return { name: 'Airtel', pinLabel: 'Airtel Money PIN' };
    if (['065', '067', '071'].some(x => prefix.startsWith(x))) return { name: 'Tigo', pinLabel: 'Tigo Pesa PIN' };
    if (['062'].some(x => prefix.startsWith(x))) return { name: 'Halotel', pinLabel: 'Halopesa PIN' };
    if (['073'].some(x => prefix.startsWith(x))) return { name: 'TTCL', pinLabel: 'TTCL PIN' };
    return { name: 'Mobile Money', pinLabel: 'PIN' };
  };

  const network = detectNetwork(phone);

  useEffect(() => {
    return () => {
      if (activeInterval.current) {
        clearInterval(activeInterval.current);
      }
    };
  }, []);

  const handleProceed = () => {
    if (!user) { navigate('/login'); return; }
    if (!selected) return;
    setStep('phone');
    setError('');
  };

  const handleCancel = () => {
    if (activeInterval.current) {
      clearInterval(activeInterval.current);
      activeInterval.current = null;
    }
    setStep('select');
  };

  const handlePay = async () => {
    if (activeInterval.current) {
      clearInterval(activeInterval.current);
      activeInterval.current = null;
    }

    if (!phone.trim()) { setError('Tafadhali weka namba ya simu'); return; }
    const cleaned = phone.trim().replace(/\D/g, '');
    if (!cleaned.match(/^0[67]\d{8}$/)) {
      setError('Namba ya simu lazima ianze na 06 au 07 na iwe na tarakimu 10.');
      return;
    }
    if (!selectedPlan || !user) return;
    setLoading(true);
    setError('');

    try {
      const orderId = `RT_${Date.now()}`;
      
      const subRef = await addDoc(collection(db, 'subscriptions'), {
        user_id: user.uid,
        plan: selectedPlan.plan_key,
        status: 'pending',
        amount: selectedPlan.amount,
        phone: cleaned,
        order_id: orderId,
        gateway: settings.activeGateway || 'fastlipa',
        created_at: serverTimestamp(),
        expires_at: null
      });
      
      setOrderId(subRef.id);
      setStep('waiting');

      // Initiate Auto Payment (PalmPesa, FastLipa, SonicPesa or Snippe)
      let tranID = '';
      let palmPesaOrderId = '';
      let sonicPesaOrderId = '';
      let snippeReference = '';

      if (settings.activeGateway === 'snippe') {
        try {
          const intlPhone = cleaned.startsWith('0') ? '255' + cleaned.substring(1) : (cleaned.startsWith('255') ? cleaned : '255' + cleaned);
          const nameParts = (profile?.display_name || user?.displayName || "RevonTech Customer").trim().split(' ');
          const firstname = nameParts[0] || 'RevonTech';
          const lastname = nameParts.slice(1).join(' ') || 'Customer';
          const email = profile?.email || user?.email || "customer@revontv.com";

          let snippeAmount = Number(selectedPlan.amount);
          if (snippeAmount < 500) {
            snippeAmount = 500; // Snippe enforces minimum 500 TZS
          }

          const snippePayload = {
            payment_type: 'mobile',
            details: {
              amount: snippeAmount,
              currency: 'TZS'
            },
            phone_number: intlPhone,
            webhook_url: 'https://us-central1-revontech-6c62d.cloudfunctions.net/snippeWebhook',
            customer: {
              firstname,
              lastname,
              email
            },
            metadata: {
              order_id: orderId,
              user_id: user.uid,
              plan_key: selectedPlan.plan_key
            }
          };

          const snippeHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          };
          if (settings.snippeApiKey) {
            snippeHeaders['Authorization'] = `Bearer ${settings.snippeApiKey.trim()}`;
          }

          let apiData: any = null;

          // 1. Try local/Cloud Function proxy first
          try {
            const proxyRes = await fetch('/api/snippe/v1/payments', {
              method: 'POST',
              headers: snippeHeaders,
              body: JSON.stringify(snippePayload)
            });
            const cType = proxyRes.headers.get('content-type') || '';
            if (cType.includes('application/json')) {
              apiData = await proxyRes.json();
            }
          } catch (proxyErr) {
            console.warn("Snippe proxy initiation failed, trying direct API:", proxyErr);
          }

          // 2. Direct fallback if proxy returned non-JSON/failed and client has API key
          if (!apiData && settings.snippeApiKey) {
            try {
              const directRes = await fetch('https://api.snippe.sh/v1/payments', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Accept': 'application/json',
                  'Authorization': `Bearer ${settings.snippeApiKey.trim()}`
                },
                body: JSON.stringify(snippePayload)
              });
              apiData = await directRes.json();
            } catch (directErr) {
              console.error("Direct Snippe call failed:", directErr);
            }
          }

          const ref = apiData?.data?.reference || apiData?.reference;
          if (ref) {
            snippeReference = ref;
            await updateDoc(doc(db, 'subscriptions', subRef.id), {
              snippe_reference: snippeReference,
              gateway: 'snippe'
            });
          } else {
            console.error("Snippe initiation error:", apiData);
            const msg = apiData?.message || apiData?.error || 'Hitilafu ya kuanzisha malipo ya Snippe. Tafadhali hakikisha namba yako ni sahihi.';
            setError(msg);
          }
        } catch (apiErr) {
          console.error("Snippe API Error:", apiErr);
        }
      } else if (settings.activeGateway === 'palmpesa' && settings.palmpesaToken) {
        try {
          const res = await fetch('/api/palmpesa/api/palmpesa/initiate', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'Authorization': `Bearer ${settings.palmpesaToken}`
            },
            body: JSON.stringify({
              name: profile?.display_name || user?.displayName || "RevonTech User",
              email: profile?.email || user?.email || "user@revontech.com",
              phone: cleaned,
              amount: selectedPlan.amount,
              transaction_id: orderId,
              address: "Dar es Salaam",
              postcode: "11111",
              callback_url: "https://revontv.com/webhook"
            })
          });
          const apiData = await res.json();
          if (apiData.order_id) {
            palmPesaOrderId = apiData.order_id;
            await updateDoc(doc(db, 'subscriptions', subRef.id), {
              palm_order_id: palmPesaOrderId,
              gateway: 'palmpesa'
            });
          } else {
            console.error("PalmPesa initiation error:", apiData);
          }
        } catch (apiErr) {
          console.error("PalmPesa API Error:", apiErr);
        }
      } else if (settings.activeGateway === 'fastlipa' && settings.fastLipaToken) {
        try {
          const zeroPhone = cleaned.startsWith('255') ? '0' + cleaned.substring(3) : cleaned;
          const res = await fetch('/api/fastlipa/api/create-transaction', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'Authorization': `Bearer ${settings.fastLipaToken}`
            },
            body: JSON.stringify({
              number: zeroPhone,
              amount: selectedPlan.amount,
              name: profile?.display_name || "RevonTech User"
            })
          });
          const apiData = await res.json();
          const extractedTranId = apiData.data?.tranID || apiData.data?.tranid || apiData.tranID;
          if ((apiData.status === true || apiData.status === 'success' || apiData.success) && extractedTranId) {
            tranID = extractedTranId;
            await updateDoc(doc(db, 'subscriptions', subRef.id), {
              fastlipa_tran_id: tranID,
              gateway: 'fastlipa'
            });
          } else {
            console.error("FastLipa Error:", apiData);
          }
        } catch (apiErr) {
          console.error("Payment API Error:", apiErr);
        }
      } else if (settings.activeGateway === 'sonicpesa' && settings.sonicpesaApiKey) {
        try {
          let intlPhone = cleaned;
          if (intlPhone.startsWith('0')) {
            intlPhone = '255' + intlPhone.substring(1);
          } else if (!intlPhone.startsWith('255')) {
            intlPhone = '255' + intlPhone;
          }

          const res = await fetch('/api/sonicpesa/payment/create_order', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'X-API-KEY': settings.sonicpesaApiKey,
              'X-SECRET-KEY': settings.sonicpesaSecretKey
            },
            body: JSON.stringify({
              buyer_email: profile?.email || user?.email || "customer@revontv.com",
              buyer_name: profile?.display_name || user?.displayName || "RevonTech Customer",
              buyer_phone: intlPhone,
              amount: selectedPlan.amount,
              currency: "TZS"
            })
          });
          const apiData = await res.json();
          
          const order_id = apiData.order_id || apiData.data?.order_id || apiData.data?.[0]?.order_id;
          if (order_id) {
            sonicPesaOrderId = order_id;
            await updateDoc(doc(db, 'subscriptions', subRef.id), {
              sonic_order_id: sonicPesaOrderId,
              gateway: 'sonicpesa'
            });
          } else {
            console.error("SonicPesa initiation error:", apiData);
          }
        } catch (apiErr) {
          console.error("SonicPesa API Error:", apiErr);
        }
      }

      // Automatically poll status from PalmPesa or FastLipa
      let pollCount = 0;
      let unsub: (() => void) | null = null;
      
      const pollInterval = setInterval(async () => {
        pollCount++;
        if (pollCount > 120) { // 10 minutes timeout (120 * 5 seconds = 600 seconds)
          clearInterval(pollInterval);
          activeInterval.current = null;
          if (unsub) unsub();
          setStep('failed');
          return;
        }

        if (settings.activeGateway === 'snippe' && (snippeReference || subRef.id)) {
          try {
            let data: any = null;

            if (snippeReference) {
              // 1. Try proxy first
              try {
                const proxyRes = await fetch(`/api/snippe/v1/payments/${encodeURIComponent(snippeReference)}`, {
                  method: 'GET',
                  headers: {
                    'Accept': 'application/json',
                    ...(settings.snippeApiKey ? { 'Authorization': `Bearer ${settings.snippeApiKey.trim()}` } : {})
                  }
                });
                const cType = proxyRes.headers.get('content-type') || '';
                if (cType.includes('application/json')) {
                  data = await proxyRes.json();
                }
              } catch { }

              // 2. Direct fallback if proxy returned non-JSON and direct API key exists
              if (!data && settings.snippeApiKey) {
                try {
                  const directRes = await fetch(`https://api.snippe.sh/v1/payments/${encodeURIComponent(snippeReference)}`, {
                    method: 'GET',
                    headers: {
                      'Accept': 'application/json',
                      'Authorization': `Bearer ${settings.snippeApiKey.trim()}`
                    }
                  });
                  data = await directRes.json();
                } catch { }
              }
            }

            const payStatus = (data?.data?.status || data?.status || '').toLowerCase();

            if (payStatus === 'completed') {
              clearInterval(pollInterval);
              activeInterval.current = null;
              if (unsub) unsub();

              await grantPaidSubscription(subRef.id, selectedPlan);
            }
            // Do not abort early on intermediate status; allow full waiting window for user PIN entry
          } catch (e) {
            console.error("Snippe Polling Error:", e);
          }
        } else if (settings.activeGateway === 'palmpesa' && settings.palmpesaToken) {
          try {
            const res = await fetch('/api/palmpesa/api/order-status', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': `Bearer ${settings.palmpesaToken}`
              },
              body: JSON.stringify({
                order_id: palmPesaOrderId,
                reference: orderId
              })
            });
            const data = await res.json();
            
            const record = data?.data?.[0] || data?.data || {};
            const payStatus = (record.payment_status || data?.payment_status || data?.status || '').toUpperCase();
            
            
            if (payStatus === 'COMPLETED' || payStatus === 'SUCCESS') {
              clearInterval(pollInterval);
              activeInterval.current = null;
              if (unsub) unsub();

              await grantPaidSubscription(subRef.id, selectedPlan);
            } else if (payStatus === 'CANCELLED' || payStatus === 'FAILED') {
              clearInterval(pollInterval);
              activeInterval.current = null;
              if (unsub) unsub();
              setStep('failed');
            }
          } catch (e) {
            console.error("PalmPesa Polling Error:", e);
          }
        } else if (settings.activeGateway === 'fastlipa' && settings.fastLipaToken && tranID) {
          try {
            const res = await fetch(`/api/fastlipa/api/status-transaction?tranid=${tranID}`, {
              method: 'GET',
              headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${settings.fastLipaToken}`
              }
            });
            const data = await res.json();
            const payStatus = (data?.data?.payment_status || data?.data?.status || data?.payment_status || '').toUpperCase();
            
            
            if (payStatus === 'COMPLETED' || payStatus === 'SUCCESS') {
              clearInterval(pollInterval);
              activeInterval.current = null;
              if (unsub) unsub();

              await grantPaidSubscription(subRef.id, selectedPlan);
            }
            // Do not abort early on intermediate status; allow full waiting window for user PIN entry
          } catch (e) {
            console.error("Polling Error:", e);
          }
        } else if (settings.activeGateway === 'sonicpesa' && settings.sonicpesaApiKey && sonicPesaOrderId) {
          try {
            const res = await fetch('/api/sonicpesa/payment/order_status', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-API-KEY': settings.sonicpesaApiKey,
                'X-SECRET-KEY': settings.sonicpesaSecretKey
              },
              body: JSON.stringify({
                order_id: sonicPesaOrderId
              })
            });
            const data = await res.json();
            
            const payStatus = (
              data?.payment_status || 
              data?.data?.payment_status || 
              data?.transaction?.payment_status || 
              data?.data?.status || 
              data?.transaction?.status || 
              ''
            ).toUpperCase();
            
            if (payStatus === 'SUCCESS') {
              clearInterval(pollInterval);
              activeInterval.current = null;
              if (unsub) unsub();

              await grantPaidSubscription(subRef.id, selectedPlan);
            }
            // Do not abort early on intermediate status; allow full waiting window for user PIN entry
          } catch (e) {
            console.error("SonicPesa Polling Error:", e);
          }
        }
      }, 5000); // Check every 5 seconds
      
      activeInterval.current = pollInterval;

      // Also listen to Firestore in case Admin approves manually or webhook hits
      unsub = onSnapshot(doc(db, 'subscriptions', subRef.id), async (docSnap) => {
        const data = docSnap.data();
        if (data?.status === 'active') {
          clearInterval(pollInterval);
          activeInterval.current = null;
          if (unsub) unsub();
          try {
            await updateDoc(doc(db, 'profiles', user.uid), {
              plan: selectedPlan.plan_key,
              is_active: true
            });
          } catch { }
          await refreshProfile();
          setStep('success');
        } else if (data?.status === 'failed') {
          clearInterval(pollInterval);
          activeInterval.current = null;
          if (unsub) unsub();
          setStep('failed');
        }
      });

    } catch (err: any) {
      setError(err.message || 'Kuna tatizo la mtandao, jaribu tena.');
    }
    setLoading(false);
  };

  if (step === 'success') return (
    <div className="min-h-screen pb-20">
      <Header />
      <div className="flex flex-col items-center justify-center px-6 py-12 max-w-md mx-auto animate-slide-up">
        <div className="w-24 h-24 rounded-full bg-success/15 border-2 border-success flex items-center justify-center mb-6 animate-breathe">
          <Check className="w-12 h-12 text-success" />
        </div>
        <h2 className="text-h1 text-foreground mb-2 text-center">Malipo Yamefanikiwa!</h2>
        <p className="text-body text-muted-foreground text-center mb-2">
          Umejiunga kwa <span className="text-primary font-bold">{selectedPlan?.name}</span> — furahia burudani bila kikwazo.
        </p>
        <button
          onClick={() => navigate('/')}
          className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-black text-lg glow-primary mt-6 press tap-safe"
        >
          ANZA KUANGALIA
        </button>
      </div>
    </div>
  );

  if (step === 'failed') return (
    <div className="min-h-screen pb-20">
      <Header />
      <div className="flex flex-col items-center justify-center px-6 py-12 max-w-md mx-auto animate-slide-up">
        <div className="w-24 h-24 rounded-full bg-destructive/15 border-2 border-destructive flex items-center justify-center mb-6">
          <AlertTriangle className="w-12 h-12 text-destructive" />
        </div>
        <h2 className="text-h1 text-foreground mb-2 text-center">Malipo Yameshindwa</h2>
        <p className="text-body text-muted-foreground text-center mb-6">
          Kuna tatizo la kupokea malipo yako. Tafadhali jaribu tena au wasiliana na support.
        </p>
        <button
          onClick={() => setStep('select')}
          className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-black text-lg glow-primary press tap-safe"
        >
          JARIBU TENA
        </button>
      </div>
    </div>
  );

  if (step === 'waiting') return (
    <div className="min-h-screen pb-20">
      <Header />
      <div className="flex flex-col items-center justify-center px-4 py-10 max-w-md mx-auto animate-slide-up">
        <div className="relative w-28 h-28 mb-6">
          <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
          <div className="relative w-28 h-28 rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center">
            <Lock className="w-12 h-12 text-primary" />
          </div>
        </div>
        <h2 className="text-h1 text-foreground mb-1 text-center">Kamilisha Malipo</h2>
        <p className="text-body text-muted-foreground text-center mb-6">
          Tafadhali angalia simu yako na uweke PIN kuthibitisha malipo.
        </p>

        <div className="w-full glass rounded-2xl p-5 mb-6 text-left">
          <div className="mb-4">
            <p className="text-xs text-muted-foreground">Kifurushi:</p>
            <p className="font-bold text-foreground">{selectedPlan?.name}</p>
          </div>
          <div className="mb-4">
            <p className="text-xs text-muted-foreground">Kiasi cha Kulipia:</p>
            <p className="font-black text-xl text-primary">TZS {formatPrice(selectedPlan?.amount || 0)}</p>
          </div>
          <div className="p-3 bg-muted rounded-xl mb-4 text-center border border-border">
            <p className="text-sm font-bold text-foreground">Weka PIN kwenye simu yako kuthibitisha malipo.</p>
            <p className="text-xs text-muted-foreground mt-1">Ombi la malipo (USSD Push) limetumwa kwenye namba <b>{phone}</b></p>
          </div>
          <div className="space-y-3 mb-4">
             <div className="flex items-center gap-2 text-xs text-green-400 font-semibold">
               <Check className="w-4 h-4" /> Mfumo unasubiri malipo yako...
             </div>
             <div className="flex items-center gap-2 text-xs text-yellow-400 font-bold">
               <Loader2 className="w-4 h-4 animate-spin" /> Inatafuta majibu (Polling)...
             </div>
          </div>

          {/* Resend button */}
          <button 
            onClick={handlePay}
            disabled={loading}
            className="w-full py-3 rounded-xl bg-primary/10 border border-primary/30 hover:bg-primary/20 text-primary font-bold text-xs uppercase tracking-wider transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Inatuma tena...
              </>
            ) : (
              <>
                🔄 Resend USSD Push (Tuma Tena)
              </>
            )}
          </button>
        </div>
        
        <button onClick={handleCancel} className="text-muted-foreground text-sm hover:underline font-semibold">Ghairi Malipo (Cancel)</button>
      </div>
    </div>
  );

  if (step === 'phone') return (
    <div className="min-h-screen pb-20">
      <Header />
      <div className="px-4 py-6 max-w-lg mx-auto animate-slide-up">
        <button
          onClick={() => setStep('select')}
          className="flex items-center gap-2 text-sm text-muted-foreground mb-6 hover:text-foreground transition-colors press tap-safe"
        >
          ← Rudi Nyuma
        </button>

        {selectedPlan && (
          <div className="glass rounded-2xl p-4 mb-4 flex items-center justify-between border border-primary/20">
            <div>
              <p className="text-caption uppercase tracking-widest">Kifurushi</p>
              <p className="text-h2 text-foreground">{selectedPlan.name}</p>
            </div>
            <div className="text-right">
              <p className="text-caption uppercase tracking-widest">Kiasi</p>
              <p className="text-h2 text-primary">
                {selectedPlan.currency} {formatPrice(selectedPlan.amount)}
              </p>
            </div>
          </div>
        )}

        <div className="glass rounded-2xl p-6">
          <h2 className="text-h2 text-foreground mb-4 flex items-center gap-2">
            <Phone className="w-5 h-5 text-primary" />
            Ingiza Namba ya Malipo
          </h2>
          <div className="mb-2">
            <Label className="text-caption mb-1 block">Namba ya Simu</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0712 345 678"
              className="bg-background/60 border-border text-lg"
              type="tel"
              maxLength={10}
            />
          </div>
          {phone && network.name !== 'Mobile Money' && (
            <p className="text-caption mb-4">
              Mtandao: <span className="text-primary font-bold">{network.name}</span>
            </p>
          )}
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-destructive/10 border border-destructive/30 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-destructive text-sm">{error}</p>
            </div>
          )}
          <button
            onClick={handlePay}
            disabled={loading}
            className="w-full py-4 bg-primary text-primary-foreground glow-primary font-black text-lg rounded-xl disabled:opacity-50 press tap-safe flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" /> Inaprocess...
              </>
            ) : (
              'LIPIA SASA'
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen pb-20">
      <Header />
      <div className="px-4 py-6 max-w-3xl mx-auto animate-fade-in">
        <div className="text-center mb-6">
          <h1 className="text-display text-foreground mb-1">
            Chagua <span className="text-primary text-glow-primary">Kifurushi</span>
          </h1>
          <p className="text-body text-muted-foreground">
            Furahia burudani bila kikwazo — chagua kifurushi kinachokufaa.
          </p>
        </div>

        {plansLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-40 rounded-2xl skeleton" style={{ animationDelay: `${i * 50}ms` }} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-6">
            {plans.map((plan, idx) => {
              const style = PLAN_STYLES[idx % PLAN_STYLES.length];
              const Icon = style.icon;
              const isSelected = selected === plan.plan_key;
              return (
                <button
                  key={plan.id}
                  onClick={() => setSelected(plan.plan_key)}
                  className={`text-left rounded-2xl p-5 relative cursor-pointer press tap-safe transition-all duration-300 glass ${
                    isSelected
                      ? 'border-primary shadow-lg shadow-primary/20 scale-[1.02]'
                      : 'hover-lift'
                  }`}
                >
                  {plan.popular && (
                    <div className="absolute -top-2 left-1/2 -translate-x-1/2">
                      <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-secondary text-secondary-foreground shadow">
                        POPULAR
                      </span>
                    </div>
                  )}
                  <div className={`w-11 h-11 rounded-xl ${style.bgClass} flex items-center justify-center mb-3`}>
                    <Icon className={`w-5 h-5 ${style.colorClass}`} />
                  </div>
                  <p className="text-h2 text-foreground">{plan.name}</p>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className={`text-2xl font-black ${style.colorClass}`}>
                      {formatPrice(plan.amount)}
                    </span>
                    <span className="text-xs text-muted-foreground font-bold">
                      {plan.currency}
                    </span>
                  </div>
                  {Array.isArray(plan.features) && plan.features.length > 0 && (
                    <ul className="mt-3 space-y-1">
                      {plan.features.slice(0, 3).map((f, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-caption">
                          <Check className="w-3 h-3 text-success shrink-0 mt-0.5" />
                          <span className="line-clamp-1">{f}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {isSelected && (
                    <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                      <Check className="w-3.5 h-3.5 text-primary-foreground" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <button
          disabled={!selected}
          onClick={handleProceed}
          className="w-full py-4 rounded-2xl font-black text-lg tracking-wider bg-primary text-primary-foreground glow-primary disabled:opacity-40 disabled:cursor-not-allowed press tap-safe"
        >
          {user ? 'ENDELEA KULIPIA' : 'JISAJILI KWANZA'}
        </button>
      </div>
    </div>
  );
}


