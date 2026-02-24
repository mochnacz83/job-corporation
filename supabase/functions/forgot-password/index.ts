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

    // Find user by email in profiles
    const { data: profile, error: profileError } = await serviceClient
      .from('profiles')
      .select('user_id, nome, email')
      .eq('email', email)
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: 'E-mail não encontrado no sistema' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const newPassword = generatePassword();

    // Update password
    const { error: updateError } = await serviceClient.auth.admin.updateUserById(profile.user_id, {
      password: newPassword,
    });
    if (updateError) throw updateError;

    // Set must_change_password
    await serviceClient.from('profiles').update({ must_change_password: true }).eq('user_id', profile.user_id);

    // Send email with new password
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured');

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Portal Corporativo <onboarding@resend.dev>',
        to: [email],
        subject: '🔑 Nova senha - Portal Corporativo',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #1a1a2e; border-bottom: 2px solid #4361ee; padding-bottom: 10px;">
              Recuperação de Senha
            </h2>
            <p>Olá, <strong>${profile.nome}</strong>!</p>
            <p>Sua nova senha temporária é:</p>
            <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
              <code style="font-size: 24px; font-weight: bold; color: #4361ee; letter-spacing: 2px;">${newPassword}</code>
            </div>
            <p style="color: #666;">Ao fazer login com esta senha, você será solicitado a criar uma nova senha.</p>
            <p style="color: #999; font-size: 12px;">Se você não solicitou esta alteração, entre em contato com o administrador.</p>
          </div>
        `,
      }),
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
