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

// Generates a strong, unique password unlikely to appear in HIBP leaks
function generateStrongPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const special = '!@#$%&*?';
  const all = upper + lower + digits + special;
  const rand = (chars: string) => chars[Math.floor(Math.random() * chars.length)];
  const base = [rand(upper), rand(lower), rand(digits), rand(special)];
  for (let i = 0; i < 8; i++) base.push(rand(all));
  for (let i = base.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [base[i], base[j]] = [base[j], base[i]];
  }
  return base.join('');
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
    const { action, userId, newStatus, newPassword, profileData } = await req.json();

    const adminActions = ['reset-password', 'resend-password', 'delete-user', 'update-status', 'cleanup-ghosts', 'kick-user'];
    const publicActions = ['get-user-status', 'reset-my-ghost', 'finalize-signup'];

    const authHeader = req.headers.get('Authorization');
    let caller: { id: string } | null = null;
    let isAdmin = false;

    if (authHeader) {
      const anonClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });

      const { data: { user }, error: userError } = await anonClient.auth.getUser();
      if (!userError && user) {
        caller = { id: user.id };

        const { data: roleData } = await serviceClient
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('role', 'admin')
          .maybeSingle();

        isAdmin = !!roleData;
      }
    }

    if (!authHeader && !publicActions.includes(action)) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[AUTH] Action: ${action} | Caller: ${caller?.id ?? 'anonymous'} | Target: ${userId} | isAdmin: ${isAdmin}`);

    // Authorization logic
    let authorized = false;

    if (publicActions.includes(action)) {
      // These actions are safe to be called without a strictly valid 'caller'
      // but we still want to log who is calling if possible
      authorized = true;
    } else if (action === 'complete-signup') {
      // Allow user to complete their own signup
      authorized = caller?.id === userId;
    } else if (action === 'update-profile') {
      // Allow user to update their own profile OR admin to update any
      authorized = isAdmin || caller?.id === userId;
    } else if (adminActions.includes(action)) {
      // Require admin for these actions
      authorized = isAdmin;
    } else {
      // Default: require admin for unknown actions
      authorized = isAdmin;
    }

    if (!authorized) {
      console.warn(`[AUTH] Unauthorized ${action} attempt by ${caller?.id ?? 'anonymous'} for ${userId}`);
      const errorMsg = isAdmin ? 'Permission denied' : 'Forbidden: admin role required';
      return new Response(JSON.stringify({ error: errorMsg }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'reset-password') {
      if (!userId) {
        return new Response(JSON.stringify({ error: 'userId required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Fetch user profile to get email, name and requested password
      const { data: profile, error: profileError } = await serviceClient
        .from('profiles')
        .select('nome, email, requested_password')
        .eq('user_id', userId)
        .maybeSingle();

      if (profileError) throw new Error(`Failed to fetch profile: ${profileError.message}`);

      let passwordToUse = newPassword;
      let emailSent = false;
      let autoGenerated = false;

      // Rule: if user requested a password, prioritize it
      if (profile?.requested_password) {
        passwordToUse = profile.requested_password;
      } else if (!newPassword) {
        // No password provided -> generate a strong unique one
        passwordToUse = generateStrongPassword();
        autoGenerated = true;
      }

      const tryUpdate = async (pwd: string) =>
        await serviceClient.auth.admin.updateUserById(userId, {
          password: pwd,
          email_confirm: true,
        });

      let { error: updateError } = await tryUpdate(passwordToUse);

      // Fallback: if HIBP/weak password, auto-generate a strong unique one and retry up to 3 times
      if (updateError) {
        const rawMsg = (updateError.message || '').toLowerCase();
        const isWeakOrLeaked =
          rawMsg.includes('pwned') || rawMsg.includes('compromis') ||
          rawMsg.includes('leaked') || rawMsg.includes('hibp') ||
          rawMsg.includes('weak') || rawMsg.includes('known to be');

        if (isWeakOrLeaked) {
          for (let i = 0; i < 3; i++) {
            const fallbackPwd = generateStrongPassword();
            const retry = await tryUpdate(fallbackPwd);
            if (!retry.error) {
              passwordToUse = fallbackPwd;
              autoGenerated = true;
              updateError = null as any;
              break;
            }
            updateError = retry.error;
          }
        }
      }

      if (updateError) {
        const rawMsg = (updateError.message || '').toLowerCase();
        let friendly = updateError.message;
        if (rawMsg.includes('pwned') || rawMsg.includes('compromis') || rawMsg.includes('leaked') || rawMsg.includes('hibp') || rawMsg.includes('known to be')) {
          friendly = 'Esta senha foi identificada em vazamentos públicos e foi rejeitada pelo sistema de segurança. Escolha uma senha diferente (evite sequências comuns como 123456, abc123, qwerty etc.).';
        } else if (rawMsg.includes('weak') || rawMsg.includes('short') || rawMsg.includes('at least')) {
          friendly = 'A senha não atende aos requisitos mínimos de segurança. Use no mínimo 6 caracteres com letras maiúsculas, minúsculas, número e caractere especial.';
        }
        return new Response(JSON.stringify({ error: friendly, rawError: updateError.message }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      await serviceClient
        .from('profiles')
        .update({
          must_change_password: true,
          reset_password_pending: false,
          requested_password: null
        })
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
        autoGenerated,
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

      const defaultPassword = '12346@Ab';
      const { error: authError } = await serviceClient.auth.admin.updateUserById(userId, {
        password: defaultPassword,
        email_confirm: true,
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
            <p style="margin: 10px 0 0 0; font-size: 24px; font-weight: bold; color: #4361ee; font-family: monospace;">12346@Ab</p>
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

      // Reliance on ON DELETE CASCADE in the database to clean up profiles, user_roles, logs, etc.
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

      const updateData: any = {
        status: newStatus,
        reset_password_pending: false,
      };
      let emailSent = false;

      // If activating: keep the original signup password and just release access
      if (newStatus === 'ativo') {
        updateData.must_change_password = false;
        updateData.requested_password = null;

        const { error: authActivationError } = await serviceClient.auth.admin.updateUserById(userId, {
          email_confirm: true,
        });

        if (authActivationError) {
          throw new Error(`Auth activation failed: ${authActivationError.message}`);
        }

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
                <p style="margin: 8px 0 0 0; color: #374151;">Use a <strong>mesma senha cadastrada no seu registro inicial</strong> para entrar no portal.</p>
                <p style="margin: 8px 0 0 0; color: #374151; font-size: 13px;">Se precisar de uma nova senha futuramente, solicite a recuperação para que o administrador gere uma senha temporária.</p>
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

      // Only allow safe fields - 'area' is admin-only to prevent privilege escalation
      const allowed = isAdmin
        ? ['nome', 'cargo', 'email', 'empresa', 'telefone', 'area']
        : ['nome', 'cargo', 'email', 'empresa', 'telefone'];
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

    if (action === 'cleanup-ghosts') {
      console.log(`[CLEANUP] Starting global ghost cleanup initiated by ${caller?.id ?? 'unknown'}`);
      
      // 1. Get all users from auth.users
      const { data: { users }, error: listError } = await serviceClient.auth.admin.listUsers();
      if (listError) throw listError;

      // 2. Get all user_ids from public.profiles
      const { data: profiles, error: profilesError } = await serviceClient
        .from('profiles')
        .select('user_id');
      if (profilesError) throw profilesError;

      const profileIds = new Set(profiles.map(p => p.user_id));
      const ghosts = users.filter(u => !profileIds.has(u.id));

      console.log(`[CLEANUP] Found ${ghosts.length} ghost users out of ${users.length} total users.`);

      let deletedCount = 0;
      for (const ghost of ghosts) {
        const { error: delError } = await serviceClient.auth.admin.deleteUser(ghost.id);
        if (!delError) deletedCount++;
        else console.error(`[CLEANUP] Failed to delete ghost ${ghost.id}:`, delError.message);
      }

      return new Response(JSON.stringify({ success: true, deletedCount, totalFound: ghosts.length }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'kick-user') {
      if (!userId) {
        return new Response(JSON.stringify({ error: 'userId required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Supabase JS v2 does not support `admin.signOut(userId)` directly (it expects a JWT).
      // We rely on updating user_presence and having the client forcibly logout.
      const { error: presenceError } = await serviceClient
        .from('user_presence')
        .update({ current_page: 'FORCED_DISCONNECT' })
        .eq('user_id', userId);

      if (presenceError) throw new Error(`Falha ao atualizar presença para kick: ${presenceError.message}`);

      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'get-user-status') {
      const { email } = await req.json();
      if (!email) throw new Error('Email is required');

      // Check auth metadata first
      const { data: { users }, error: findError } = await serviceClient.auth.admin.listUsers();
      if (findError) throw findError;

      const user = users.find(u => u.email === email);
      if (!user) {
        return new Response(JSON.stringify({ exists: false }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check if profile exists
      const { data: profile } = await serviceClient
        .from('profiles')
        .select('id, status, matricula')
        .eq('user_id', user.id)
        .maybeSingle();

      return new Response(JSON.stringify({
        exists: true,
        hasProfile: !!profile,
        status: profile?.status || null,
        matricula: profile?.matricula || null,
        userId: user.id
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'reset-my-ghost') {
      const { email } = await req.json();
      if (!email) throw new Error('Email is required');

      const { data: { users } } = await serviceClient.auth.admin.listUsers();
      const user = users.find(u => u.email === email);

      if (!user) {
        return new Response(JSON.stringify({ success: true, message: 'User not found, nothing to reset.' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // CRITICAL: Only delete if NO profile exists
      const { data: profile } = await serviceClient
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (profile) {
        return new Response(JSON.stringify({ error: 'Cannot reset active account. Use password recovery instead.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { error: delError } = await serviceClient.auth.admin.deleteUser(user.id);
      if (delError) throw delError;

      console.log(`[RESET] Ghost user ${user.id} (${email}) deleted successfully.`);

      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'finalize-signup') {
      if (!userId) {
        return new Response(JSON.stringify({ error: 'userId required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: existingProfile, error: existingProfileError } = await serviceClient
        .from('profiles')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

      if (existingProfileError) {
        throw new Error(`Failed to check existing profile: ${existingProfileError.message}`);
      }

      if (existingProfile) {
        return new Response(JSON.stringify({ success: true, alreadyCompleted: true }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: authUserData, error: authUserError } = await serviceClient.auth.admin.getUserById(userId);
      if (authUserError || !authUserData?.user) {
        throw new Error(`Failed to fetch auth user: ${authUserError?.message || 'User not found'}`);
      }

      const authUser = authUserData.user;
      const metadata = authUser.user_metadata || {};

      const mappedData = {
        user_id: userId,
        nome: metadata.nome || '',
        matricula: metadata.matricula || '',
        email: metadata.email_contato || authUser.email || '',
        empresa: metadata.empresa || '',
        telefone: metadata.telefone || '',
        cargo: metadata.reg_cargo || metadata.cargo || '',
        area: metadata.reg_area || metadata.area || '',
        status: 'pendente',
        must_change_password: false,
      };

      const { error: upsertError } = await serviceClient
        .from('profiles')
        .upsert(mappedData, { onConflict: 'user_id' });

      if (upsertError) {
        throw new Error(`Failed to finalize signup: ${upsertError.message}`);
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'complete-signup') {
      if (!userId || !profileData) {
        return new Response(JSON.stringify({ error: 'userId and profileData required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`[complete-signup] Completing profile for user ${userId}:`, JSON.stringify(profileData));

      // Map keys to match the profiles table precisely
      const mappedData = {
        user_id: userId,
        nome: profileData.nome || '',
        matricula: profileData.matricula || '',
        email: profileData.email_contato || profileData.email || '',
        empresa: profileData.empresa || '',
        telefone: profileData.telefone || '',
        cargo: profileData.reg_cargo || profileData.cargo || '',
        area: profileData.reg_area || profileData.area || '',
        status: 'pendente',
        must_change_password: false
      };

      // Use upsert to handle cases where the trigger might have already created a partial profile
      const { error: upsertError } = await serviceClient
        .from('profiles')
        .upsert(mappedData, { onConflict: 'user_id' });

      if (upsertError) {
        console.error('[complete-signup] Error:', upsertError);
        throw new Error(`Failed to complete signup: ${upsertError.message}`);
      }

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
