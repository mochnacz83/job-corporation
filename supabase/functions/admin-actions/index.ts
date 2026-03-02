import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Centralized email sender with full error reporting
async function sendEmail(to: string, subject: string, html: string): Promise<{ ok: boolean; error?: string; details?: any }> {
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') || 'Portal Corporativo <onboarding@resend.dev>';

  if (!RESEND_API_KEY) {
    console.error('[EMAIL] RESEND_API_KEY not configured in Supabase secrets!');
    return { ok: false, error: 'RESEND_API_KEY não configurado. Configure nas variáveis de ambiente do Supabase.' };
  }

  console.log(`[EMAIL] Sending to: ${to} | From: ${FROM_EMAIL} | Subject: ${subject}`);

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html }),
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error(`[EMAIL] Resend API Error ${response.status}:`, JSON.stringify(responseData));

      // Specific error messages for common Resend issues
      let friendlyError = `Falha no envio (código ${response.status})`;
      if (response.status === 403) {
        friendlyError = 'Domínio remetente não verificado no Resend. Verifique o domínio em resend.com/domains ou configure RESEND_FROM_EMAIL com um domínio verificado.';
      } else if (response.status === 401) {
        friendlyError = 'RESEND_API_KEY inválida ou expirada';
      } else if (responseData?.message) {
        friendlyError = responseData.message;
      }

      return { ok: false, error: friendlyError, details: responseData };
    }

    console.log(`[EMAIL] Sent successfully to ${to}. ID: ${responseData?.id}`);
    return { ok: true };
  } catch (e: any) {
    console.error('[EMAIL] Network error calling Resend:', e);
    return { ok: false, error: `Erro de rede: ${e.message}` };
  }
}

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

    const { action, userId, newStatus, newPassword, profileData } = await req.json();

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
        const emailResult = await sendEmail(
          profile.email,
          '🔐 Sua senha foi redefinida - Portal Corporativo',
          `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
            <h2 style="color: #1a1a2e; border-bottom: 2px solid #4361ee; padding-bottom: 10px;">Redefinição de Senha</h2>
            <p>Olá, <strong>${profile.nome}</strong>,</p>
            <p>Um administrador redefiniu sua senha no Portal Corporativo.</p>
            <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0; border: 1px solid #e9ecef;">
              <p style="margin: 0; font-size: 16px;">Sua nova senha temporária é:</p>
              <p style="margin: 10px 0 0 0; font-size: 24px; font-weight: bold; color: #4361ee; font-family: monospace;">${passwordToUse}</p>
            </div>
            <p style="color: #666; font-size: 14px;"><strong>IMPORTANTE:</strong> Por segurança, você será solicitado a alterar esta senha no seu próximo login.</p>
            <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
            <p style="font-size: 12px; color: #999;">Este é um e-mail automático do Portal Corporativo da Ability Tecnologia.</p>
          </div>`
        );
        emailSent = emailResult.ok;
        if (!emailResult.ok) {
          console.error('[reset-password] Email failed:', emailResult.error);
        }
      }

      return new Response(JSON.stringify({
        success: true,
        passwordUsed: passwordToUse,
        emailSent,
        emailError: emailSent ? null : 'E-mail não pôde ser enviado. Verifique a configuração do Resend.',
        targetEmail: profile?.email
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'resend-password') {
      if (!userId) {
        return new Response(JSON.stringify({ error: 'userId required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: profile, error: profileError } = await serviceClient
        .from('profiles')
        .select('nome, email')
        .eq('user_id', userId)
        .maybeSingle();

      if (profileError) {
        return new Response(JSON.stringify({ error: `Profile fetch failed: ${profileError.message}` }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!profile?.email) {
        return new Response(JSON.stringify({ error: 'User has no registered email' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`Resending password for user ${userId}, email: ${profile.email}`);

      const defaultPassword = '12345@Ab';
      const { error: authError } = await serviceClient.auth.admin.updateUserById(userId, {
        password: defaultPassword,
      });

      if (authError) {
        console.error('Auth update error:', authError);
        return new Response(JSON.stringify({ error: `Auth update failed: ${authError.message}` }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      await serviceClient
        .from('profiles')
        .update({ must_change_password: true })
        .eq('user_id', userId);

      const emailResult = await sendEmail(
        profile.email,
        '🔐 Sua senha de acesso - Portal Corporativo',
        `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
          <h2 style="color: #1a1a2e; border-bottom: 2px solid #4361ee; padding-bottom: 10px;">Acesso ao Portal Corporativo</h2>
          <p>Olá, <strong>${profile.nome}</strong>,</p>
          <p>Conforme solicitado, estamos encaminhando sua senha inicial de acesso.</p>
          <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0; border: 1px solid #e9ecef;">
            <p style="margin: 0; font-size: 16px;">Sua senha é:</p>
            <p style="margin: 10px 0 0 0; font-size: 24px; font-weight: bold; color: #4361ee; font-family: monospace;">12345@Ab</p>
          </div>
          <p style="color: #666; font-size: 14px;"><strong>DICA:</strong> Por segurança, você deverá alterar essa senha ao realizar o primeiro acesso.</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="font-size: 12px; color: #999;">Este é um e-mail automático da Ability Tecnologia.</p>
        </div>`
      );

      if (!emailResult.ok) {
        // Password was reset but email failed — return informative error to admin
        return new Response(JSON.stringify({
          success: false,
          emailSent: false,
          error: `Senha redefinida, mas o e-mail não foi enviado: ${emailResult.error}`,
        }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true, emailSent: true }), {
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

    if (action === 'update-status') {
      if (!userId || !newStatus) {
        return new Response(JSON.stringify({ error: 'userId and newStatus required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: profile, error: profileError } = await serviceClient
        .from('profiles')
        .select('nome, email')
        .eq('user_id', userId)
        .maybeSingle();

      if (profileError) throw new Error(`Failed to fetch profile: ${profileError.message}`);

      const updateData: any = { status: newStatus };
      let emailSent = false;

      // If activating: mark must_change_password and notify via email
      if (newStatus === 'ativo') {
        updateData.must_change_password = true;

        if (profile?.email) {
          const activationEmail = await sendEmail(
            profile.email,
            '🎉 Sua conta foi aprovada! - Portal Corporativo',
            `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
              <h2 style="color: #1a1a2e; border-bottom: 2px solid #4361ee; padding-bottom: 10px;">✅ Acesso Liberado!</h2>
              <p>Olá, <strong>${profile.nome}</strong>!</p>
              <p>Boa notícia! Sua conta no <strong>Portal Corporativo da Ability Tecnologia</strong> foi aprovada e já está ativa.</p>
              <div style="background: #f0f7ff; border-radius: 8px; padding: 20px; margin: 20px 0; border: 1px solid #bfdbfe;">
                <p style="margin: 0; font-size: 15px; font-weight: bold; color: #1a1a2e;">Como acessar:</p>
                <p style="margin: 8px 0 0 0; color: #374151;">Use a senha que você cadastrou no momento do seu registro.</p>
                <p style="margin: 8px 0 0 0; color: #374151; font-size: 13px;">⚠️ No primeiro acesso, você será solicitado a criar uma nova senha permanente.</p>
              </div>
              <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
              <p style="font-size: 12px; color: #999;">Em caso de dúvidas, entre em contato:<br/>
                📱 Juniomar Alex Mochnacz — (48) 99143-1983<br/>
                📧 juniomar.mochnacz@abilitytecnologia.com.br
              </p>
              <p style="font-size: 12px; color: #999;">Este é um e-mail automático da Ability Tecnologia.</p>
            </div>`
          );
          emailSent = activationEmail.ok;
          if (!activationEmail.ok) {
            console.error('[update-status] Activation email failed:', activationEmail.error);
          }
        }
      }

      const { error: dbError } = await serviceClient
        .from('profiles')
        .update(updateData)
        .eq('user_id', userId);

      if (dbError) throw new Error(`Database update failed: ${dbError.message}`);

      return new Response(JSON.stringify({
        success: true,
        emailSent,
      }), {
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
      const allowed = ['nome', 'cargo', 'email', 'empresa', 'telefone', 'area'];
      const safeData: Record<string, any> = {};
      for (const key of allowed) {
        if (profileData[key] !== undefined) safeData[key] = profileData[key];
      }

      console.log(`Updating profile for user ${userId}:`, JSON.stringify(safeData));

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
