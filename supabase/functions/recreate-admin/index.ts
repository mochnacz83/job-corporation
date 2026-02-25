import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const client = createClient(supabaseUrl, serviceKey);

    const { action, oldUserId, matricula, nome, email, empresa, telefone, password } = await req.json();

    if (action === 'delete') {
      await client.from('user_roles').delete().eq('user_id', oldUserId);
      await client.from('user_presence').delete().eq('user_id', oldUserId);
      await client.from('access_logs').delete().eq('user_id', oldUserId);
      await client.from('profiles').delete().eq('user_id', oldUserId);
      const { error } = await client.auth.admin.deleteUser(oldUserId);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'create') {
      const fakeEmail = `${matricula}@empresa.local`;
      const { data: newUser, error: createErr } = await client.auth.admin.createUser({
        email: fakeEmail,
        password,
        email_confirm: true,
        user_metadata: { matricula, nome, email_contato: email, empresa, telefone },
      });
      if (createErr) throw createErr;

      // Insert admin role
      await client.from('user_roles').insert({ user_id: newUser.user.id, role: 'admin' });

      // Update profile with correct data
      await client.from('profiles').update({
        email, empresa, telefone, status: 'ativo', must_change_password: true,
      }).eq('user_id', newUser.user.id);

      return new Response(JSON.stringify({ success: true, userId: newUser.user.id }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
