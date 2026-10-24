import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Fallback to the hardcoded Fast Lipa token for immediate testing if the env isn't set
const API_TOKEN = Deno.env.get('FASTLIPA_API_TOKEN') || 'FastLipa_UvmFjyUMlDwGaoQjuZSPYF7l';
const BASE_URL = 'https://api.fastlipa.com/api';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Get authenticated user (optional for status/create depending on logic)
  const authHeader = req.headers.get('Authorization') || '';
  let userId: string | null = null;
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '');
    try {
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id ?? null;
      console.log('Extracted userId from token:', userId);
    } catch {
      console.log('Could not get user from token');
    }
  }

  const url = new URL(req.url);
  const action = url.searchParams.get('action');

  try {
    // ─── CREATE ORDER ───────────────────────────────────────────────
    if (action === 'create') {
      const body = await req.json();
      const { phone, amount, plan, buyer_name, duration_days } = body;

      if (!phone || !amount || !plan) {
        return new Response(JSON.stringify({ success: false, message: 'Tafadhali jaza namba ya simu na mpango' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400
        });
      }

      // Format phone → 255XXXXXXXXX
      let ph = phone.trim().replace(/\D/g, '');
      if (ph.startsWith('0')) ph = '255' + ph.slice(1);
      else if (!ph.startsWith('255')) ph = '255' + ph;

      const payload = {
        number: ph,
        amount: parseInt(amount),
        name: buyer_name || 'Customer'
      };

      console.log('Sending Fast Lipa order:', JSON.stringify(payload));
      const res = await fetch(`${BASE_URL}/create-transaction`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_TOKEN}`,
        },
        body: JSON.stringify(payload),
      });

      const responseText = await res.text();
      console.log('FastLipa create response:', res.status, responseText);

      let data: any = {};
      try { data = JSON.parse(responseText); } catch { /* ignore */ }

      const tranId = data.data?.tranID || data.data?.tranid || data.data?.id || data.data?.transaction_id 
        || data.tranID || data.tranid || data.id || data.transaction_id;
      
      const isSuccess = res.ok && (
        data.status === true || 
        data.status === 'true' || 
        data.status === 1 || 
        data.status === 'success' ||
        (data.message && (data.message.toLowerCase().includes('created') || data.message.toLowerCase().includes('success')))
      );

      if (isSuccess) {
        const orderId = tranId || `fl_${Date.now()}`;
        const now = new Date();
        const expiresAt = new Date(now);
        const days = parseInt(duration_days) || 1;
        expiresAt.setDate(now.getDate() + days);

        if (userId) {
          const { error: subErr } = await supabase.from('subscriptions').insert({
            user_id: userId,
            plan,
            amount: parseInt(amount),
            status: 'pending',
            order_id: orderId,
            phone: ph,
            starts_at: now.toISOString(),
            expires_at: expiresAt.toISOString(),
          });
          if (subErr) console.error('Subscription insert error:', subErr);
        }

        return new Response(JSON.stringify({ success: true, order_id: orderId, message: 'Ombi la malipo limetumwa kwa simu yako' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } else {
        return new Response(JSON.stringify({ success: false, message: data.message || `Hitilafu ya malipo` }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400
        });
      }

    // ─── CHECK STATUS ────────────────────────────────────────────────
    } else if (action === 'status') {
      const orderId = url.searchParams.get('order_id');
      if (!orderId) return new Response(JSON.stringify({ success: false, message: 'Missing order_id' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400
      });

      console.log('Checking status for orderId:', orderId);
      const res = await fetch(`${BASE_URL}/status-transaction?tranid=${orderId}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${API_TOKEN}` }
      });

      const responseText = await res.text();
      console.log('FastLipa raw status response:', responseText);

      let data: any = {};
      try { data = JSON.parse(responseText); } catch { console.error('JSON Parse failed'); }

      // We handle any HTTP response as long as we can parse some form of status
      const rawStatus = String(
        data.data?.payment_status || 
        data.data?.status || 
        data.payment_status || 
        data.status || 
        'PENDING'
      ).toUpperCase();
      
      let frontendStatus = 'PENDING';
      if (['COMPLETED', 'SUCCESS', 'SUCCESSFUL', 'PAID', 'DONE'].includes(rawStatus)) {
        frontendStatus = 'COMPLETED';
      } else if (['CANCELLED', 'FAILED', 'ERROR', 'REJECTED'].includes(rawStatus)) {
        frontendStatus = 'FAILED';
      }

      console.log('Status Mapping:', rawStatus, '->', frontendStatus);

      // Activate if completed
      if (frontendStatus === 'COMPLETED') {
        const { data: sub, error: fetchErr } = await supabase.from('subscriptions')
          .select('*').eq('order_id', orderId).single();
        
        if (sub && sub.status !== 'active') {
          console.log('Activating plan for user:', sub.user_id);
          await supabase.from('subscriptions').update({ status: 'active' }).eq('order_id', orderId);
          await supabase.from('profiles').update({ plan: sub.plan }).eq('user_id', sub.user_id);
          console.log('Plan activated!');
        }
      }

      return new Response(JSON.stringify({ 
        success: true, 
        payment_status: frontendStatus, 
        raw_status: rawStatus 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: false, message: 'Action not found' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404
    });

  } catch (err: any) {
    console.error('Edge function crash:', err);
    return new Response(JSON.stringify({ success: false, message: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500
    });
  }
});
