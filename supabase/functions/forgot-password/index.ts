// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const matricula = typeof body?.matricula === 'string' ? body.matricula.trim().slice(0, 20) : '';
    
    if (!matricula) {
      return new Response(JSON.stringify({ error: 'Matrícula é obrigatória' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const serviceClient = createClient(supabaseUrl, serviceKey);

    // Always return the same generic message to prevent account enumeration
    const genericResponse = {
      success: true,
      message: 'Se esta matrícula estiver vinculada a uma conta ativa, o administrador será notificado. Aguarde o contato para receber sua nova senha.'
    };

    // Find user by matricula
    const { data: profile, error: profileError } = await serviceClient
      .from('profiles')
      .select('user_id, nome, email, matricula')
      .eq('matricula', matricula)
      .maybeSingle();

    if (profileError || !profile) {
      // Return same generic message - don't reveal whether matricula exists
      return new Response(JSON.stringify(genericResponse), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Mark as pending reset
    await serviceClient
      .from('profiles')
      .update({ reset_password_pending: true, requested_password: null })
      .eq('user_id', profile.user_id);

    // Notify Admin
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') || 'Portal Corporativo <onboarding@resend.dev>';
    const ADMIN_EMAIL = 'juniomar.mochnacz@abilitytecnologia.com.br';

    if (RESEND_API_KEY) {
      try {
        // Sanitize values for HTML
        const safeName = (profile.nome || '').replace(/[<>&"']/g, '');
        const safeMatricula = (profile.matricula || '').replace(/[<>&"']/g, '');
        const safeEmail = (profile.email || 'Não informado').replace(/[<>&"']/g, '');

        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: [ADMIN_EMAIL],
            subject: '⚠️ Solicitação de Reset de Senha - Portal Corporativo',
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px;">
                <h2 style="color: #d9480f;">Solicitação de Reset de Senha</h2>
                <p>O seguinte usuário solicitou a recuperação de acesso:</p>
                <div style="background: #fff4e6; padding: 15px; border-radius: 8px;">
                  <p><strong>Nome:</strong> ${safeName}</p>
                  <p><strong>Matrícula:</strong> ${safeMatricula}</p>
                  <p><strong>E-mail:</strong> ${safeEmail}</p>
                </div>
                <p>Acesse o painel administrativo para definir uma nova senha e encaminhar ao usuário.</p>
                <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
                <p style="font-size: 12px; color: #999;">Este é um alerta automático do sistema.</p>
              </div>
            `,
          }),
        });
      } catch (e) {
        console.error('Falha ao notificar admin:', e);
      }
    }

    return new Response(JSON.stringify(genericResponse), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    return new Response(JSON.stringify({ error: 'Erro ao processar solicitação' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});