import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify the caller is an admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller }, error: userError } = await anonClient.auth.getUser();
    if (userError || !caller) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: roleData } = await serviceClient
      .from('user_roles')
      .select('role')
      .eq('user_id', caller.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Forbidden: admin role required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { action, userId, newPassword, profileData } = await req.json();

    if (action === 'reset-password') {
      if (!userId) {
        return new Response(JSON.stringify({ error: 'userId required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Fetch user profile to get email and name
      const { data: profile, error: profileError } = await serviceClient
        .from('profiles')
        .select('nome, email')
        .eq('user_id', userId)
        .maybeSingle();

      if (profileError) throw new Error(`Failed to fetch profile: ${profileError.message}`);

      let passwordToUse = newPassword;
      let emailSent = false;

      // Rule: if no email, use 12345@Ab
      if (!profile?.email) {
        passwordToUse = '12345@Ab';
      }

      const { error: updateError } = await serviceClient.auth.admin.updateUserById(userId, {
        password: passwordToUse,
      });

      if (updateError) {
        throw new Error(`Failed to reset password: ${updateError.message}`);
      }

      await serviceClient
        .from('profiles')
        .update({ must_change_password: true })
        .eq('user_id', userId);

      // Send email if registered
      if (profile?.email) {
        const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
        if (RESEND_API_KEY) {
          try {
            const emailResponse = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                from: 'Portal Corporativo <onboarding@resend.dev>',
                to: [profile.email],
                subject: '🔐 Sua senha foi redefinida - Portal Corporativo',
                html: `
                  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
                    <h2 style="color: #1a1a2e; border-bottom: 2px solid #4361ee; padding-bottom: 10px;">
                      Redefinição de Senha
                    </h2>
                    <p>Olá, <strong>${profile.nome}</strong>,</p>
                    <p>Um administrador redefiniu sua senha no Portal Corporativo.</p>
                    <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0; border: 1px solid #e9ecef;">
                      <p style="margin: 0; font-size: 16px;">Sua nova senha temporária é:</p>
                      <p style="margin: 10px 0 0 0; font-size: 24px; font-weight: bold; color: #4361ee; font-family: monospace;">
                        ${passwordToUse}
                      </p>
                    </div>
                    <p style="color: #666; font-size: 14px;">
                      <strong>IMPORTANTE:</strong> Por segurança, você será solicitado a alterar esta senha no seu próximo login.
                    </p>
                    <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
                    <p style="font-size: 12px; color: #999;">
                      Este é um e-mail automático do Portal Corporativo da Ability Tecnologia.
                    </p>
                  </div>
                `,
              }),
            });
            if (emailResponse.ok) emailSent = true;
          } catch (e) {
            console.error('Failed to send reset email:', e);
          }
        }
      }

      return new Response(JSON.stringify({
        success: true,
        passwordUsed: passwordToUse,
        emailSent,
        targetEmail: profile?.email
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'delete-user') {
      if (!userId) {
        return new Response(JSON.stringify({ error: 'userId required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      await serviceClient.from('profiles').delete().eq('user_id', userId);
      await serviceClient.from('user_roles').delete().eq('user_id', userId);

      const { error: deleteError } = await serviceClient.auth.admin.deleteUser(userId);
      if (deleteError) {
        throw new Error(`Failed to delete user: ${deleteError.message}`);
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'update-profile') {
      if (!userId || !profileData) {
        return new Response(JSON.stringify({ error: 'userId and profileData required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Only allow safe fields
      const allowed = ['nome', 'cargo', 'email', 'empresa', 'telefone'];
      const safeData: Record<string, string> = {};
      for (const key of allowed) {
        if (profileData[key] !== undefined) safeData[key] = profileData[key];
      }

      const { error: updateError } = await serviceClient
        .from('profiles')
        .update(safeData)
        .eq('user_id', userId);

      if (updateError) throw new Error(`Failed to update profile: ${updateError.message}`);

      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Admin action error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
