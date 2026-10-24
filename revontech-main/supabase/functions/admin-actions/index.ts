import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-admin-secret',
};

const ADMIN_SECRET = Deno.env.get('ADMIN_SECRET') || 'Revon2026';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(req.url);
  const action = url.searchParams.get('action');

  try {
    // 1. Verify Admin Secret
    const requestSecret = req.headers.get('x-admin-secret');
    if (requestSecret !== ADMIN_SECRET) {
      console.error('Unauthorized admin action attempt.');
      return new Response(JSON.stringify({ success: false, message: 'Unauthorized' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401
      });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ─── DELETE USER ───────────────────────────────────────────────
    if (action === 'delete-user') {
      const { userId } = await req.json();
      if (!userId) {
        return new Response(JSON.stringify({ success: false, message: 'Missing userId' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400
        });
      }

      console.log('Admin Action: Deleting user', userId);

      // This deletes the user from auth.users
      // profiles and subscriptions will be cleaned up by ON DELETE CASCADE
      const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
      
      if (error) {
        console.error('Delete User Error:', error);
        throw error;
      }

      console.log('User deleted successfully.');
      return new Response(JSON.stringify({ success: true, message: 'Mtumiaji amefutwa kabisa.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: false, message: 'Kitendo hakijulikani' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404
    });

  } catch (err: any) {
    console.error('Admin actions crash:', err);
    return new Response(JSON.stringify({ success: false, message: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500
    });
  }
});
