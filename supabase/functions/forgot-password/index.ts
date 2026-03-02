import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function generatePassword(): string {
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const special = '!@#$%&*';

  let pw = '';
  pw += upper[Math.floor(Math.random() * upper.length)];
  pw += lower[Math.floor(Math.random() * lower.length)];
  pw += digits[Math.floor(Math.random() * digits.length)];
  pw += special[Math.floor(Math.random() * special.length)];

  const all = upper + lower + digits + special;
  for (let i = 0; i < 4; i++) {
    pw += all[Math.floor(Math.random() * all.length)];
  }

  return pw.split('').sort(() => Math.random() - 0.5).join('');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email } = await req.json();
    if (!email) {
      return new Response(JSON.stringify({ error: 'E-mail é obrigatório' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const serviceClient = createClient(supabaseUrl, serviceKey);

    // 1. Find user by email in profiles
    const { data: profile, error: profileError } = await serviceClient
      .from('profiles')
      .select('user_id, nome, email, matricula')
      .eq('email', email)
      .maybeSingle();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: 'Este e-mail não está vinculado a nenhuma conta ativa.' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Mark as pending reset in the database
    const { error: dbError } = await serviceClient
      .from('profiles')
      .update({ reset_password_pending: true })
      .eq('user_id', profile.user_id);

    if (dbError) throw new Error(`Erro ao registrar solicitação: ${dbError.message}`);

    // 3. Notify Admin (Juniomar Alex)
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') || 'Portal Corporativo <onboarding@resend.dev>';
    const ADMIN_EMAIL = 'juniomar.mochnacz@abilitytecnologia.com.br'; // O admin principal

    if (RESEND_API_KEY) {
      try {
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
                <h2 style="color: #d9480f;">Solicitação de Nova Senha</h2>
                <p>O seguinte usuário solicitou a recuperação de acesso:</p>
                <div style="background: #fff4e6; padding: 15px; border-radius: 8px;">
                  <p><strong>Nome:</strong> ${profile.nome}</p>
                  <p><strong>Matrícula:</strong> ${profile.matricula}</p>
                  <p><strong>E-mail:</strong> ${profile.email}</p>
                </div>
                <p>Acesse o painel administrativo para validar e enviar a nova senha temporária.</p>
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

    return new Response(JSON.stringify({
      success: true,
      message: 'Sua solicitação foi enviada ao administrador. Você receberá um e-mail com a nova senha assim que for aprovada.'
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    const msg = error instanceof Error ? error.message : 'Erro interno';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
