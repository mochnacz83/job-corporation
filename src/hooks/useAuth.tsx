import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

interface Profile {
  id: string;
  user_id: string;
  matricula: string;
  nome: string;
  area: string | null;
  cargo: string | null;
  email: string | null;
  empresa: string | null;
  telefone: string | null;
  must_change_password: boolean;
  status: string;
}

interface AreaPermissions {
  area: string;
  modules: string[];
  powerbi_report_ids: string[];
  all_access: boolean;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  areaPermissions: AreaPermissions | null;
  isAdmin: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Detecta erros de refresh token inválido / ausente vindos do Supabase
const isInvalidRefreshError = (err: any): boolean => {
  if (!err) return false;
  const msg = (err.message || err.error_description || "").toString().toLowerCase();
  const code = (err.code || err.error || "").toString().toLowerCase();
  return (
    code === "refresh_token_not_found" ||
    code === "invalid_grant" ||
    code === "bad_jwt" ||
    msg.includes("refresh token not found") ||
    msg.includes("invalid refresh token") ||
    msg.includes("missing sub claim")
  );
};

// Limpa qualquer resíduo de sessão Supabase no storage local sem chamar a API
const clearLocalSupabaseSession = () => {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith("sb-") || k.includes("supabase.auth"))) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore
  }
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [areaPermissions, setAreaPermissions] = useState<AreaPermissions | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    try {
      const [profileRes, roleRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", userId).single(),
        supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle()
      ]);
      
      const p = profileRes.data as Profile | null;
      setProfile(p);
      setIsAdmin(!!roleRes.data);

      // Cargo-based profiles override area permissions entirely
      const cargoProfiles = ["Tecnico de Dados", "Tecnico De Home"];
      const useCargoOnly = p?.cargo && cargoProfiles.includes(p.cargo);

      if (useCargoOnly) {
        const { data: permData } = await supabase
          .from("area_permissions" as any)
          .select("*")
          .eq("area", p!.cargo)
          .maybeSingle();
        setAreaPermissions(permData as unknown as AreaPermissions | null);
      } else if (p?.area) {
        const { data: permData } = await supabase
          .from("area_permissions" as any)
          .select("*")
          .eq("area", p.area)
          .maybeSingle();
        setAreaPermissions(permData as unknown as AreaPermissions | null);
      } else {
        setAreaPermissions(null);
      }
    } catch (err) {
      console.error("Error fetching profile:", err);
    }
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  useEffect(() => {
    let mounted = true;

    supabase.auth
      .getSession()
      .then(async ({ data: { session }, error }) => {
        if (!mounted) return;
        if (error && isInvalidRefreshError(error)) {
          // Sessão antiga inválida: limpa local sem chamar a API (evita 400 em loop)
          clearLocalSupabaseSession();
          try { await supabase.auth.signOut({ scope: "local" } as any); } catch {}
          setSession(null);
          setUser(null);
          setLoading(false);
          return;
        }
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          fetchProfile(session.user.id).finally(() => {
            if (mounted) setLoading(false);
          });
        } else {
          setLoading(false);
        }
      })
      .catch(async (err) => {
        if (!mounted) return;
        if (isInvalidRefreshError(err)) {
          clearLocalSupabaseSession();
          try { await supabase.auth.signOut({ scope: "local" } as any); } catch {}
        }
        setSession(null);
        setUser(null);
        setLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!mounted) return;
        // Renovação falhou: limpa storage e leva para /auth de forma silenciosa
        if (_event === "TOKEN_REFRESHED" && !session) {
          clearLocalSupabaseSession();
          setSession(null);
          setUser(null);
          setProfile(null);
          setAreaPermissions(null);
          setIsAdmin(false);
          if (typeof window !== "undefined" && !window.location.pathname.startsWith("/auth")) {
            window.location.replace("/auth");
          }
          return;
        }
        if (_event === "SIGNED_OUT") {
          clearLocalSupabaseSession();
        }
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          fetchProfile(session.user.id);
        } else {
          setProfile(null);
          setAreaPermissions(null);
          setIsAdmin(false);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (matricula: string, password: string) => {
    // Try domains SEQUENTIALLY to avoid race conditions where a failing
    // parallel attempt clears the session of the successful one.
    const newEmail = `${matricula.toLowerCase()}@corporativo.local`;
    const oldEmail = `${matricula.toLowerCase()}@empresa.local`;
    const oldEmailUpper = `${matricula}@empresa.local`;

    // Helpers para distinguir falha de rede (proxy/firewall/offline) de credencial errada.
    const isNetworkErr = (e: any) => {
      if (!e) return false;
      const msg = (e.message || e.error_description || "").toString().toLowerCase();
      return (
        e.name === "TypeError" ||
        e.name === "AuthRetryableFetchError" ||
        msg.includes("failed to fetch") ||
        msg.includes("networkerror") ||
        msg.includes("network request failed") ||
        msg.includes("load failed") ||
        msg.includes("timeout") ||
        msg.includes("fetch")
      );
    };

    const isInvalidCreds = (e: any) => {
      const code = (e?.code || "").toString().toLowerCase();
      const msg = (e?.message || "").toString().toLowerCase();
      return (
        code === "invalid_credentials" ||
        msg.includes("invalid login credentials") ||
        msg.includes("invalid_credentials")
      );
    };

    const isPendingErr = (e: any) =>
      e?.code === "email_not_confirmed" ||
      /email.*not.*confirmed/i.test(e?.message || "");

    // Tenta com 1 retry curto em caso de erro transiente de rede.
    const tryLogin = async (email: string) => {
      try {
        const r = await supabase.auth.signInWithPassword({ email, password });
        if (r.error && isNetworkErr(r.error)) {
          await new Promise((res) => setTimeout(res, 800));
          return await supabase.auth.signInWithPassword({ email, password });
        }
        return r;
      } catch (err: any) {
        if (isNetworkErr(err)) {
          await new Promise((res) => setTimeout(res, 800));
          try {
            return await supabase.auth.signInWithPassword({ email, password });
          } catch (err2: any) {
            return { data: null as any, error: err2 };
          }
        }
        return { data: null as any, error: err };
      }
    };

    // 1) Domínio novo
    const r1 = await tryLogin(newEmail);
    if (!r1.error) return;
    if (isPendingErr(r1.error)) {
      const err: any = new Error("PENDING_APPROVAL");
      err.code = "email_not_confirmed";
      throw err;
    }
    // Se foi falha de rede, NÃO tenta os domínios legados (para não consumir tentativas
    // e disparar rate-limit em IPs corporativos compartilhados). Reporta rede direto.
    if (isNetworkErr(r1.error)) {
      const err: any = new Error("NETWORK_ERROR");
      err.code = "network_error";
      throw err;
    }

    // 2) Só tenta legados se o erro foi de credencial inválida (usuário pode estar no domínio antigo)
    if (isInvalidCreds(r1.error)) {
      const r2 = await tryLogin(oldEmail);
      if (!r2.error) return;
      if (isPendingErr(r2.error)) {
        const err: any = new Error("PENDING_APPROVAL");
        err.code = "email_not_confirmed";
        throw err;
      }
      if (isNetworkErr(r2.error)) {
        const err: any = new Error("NETWORK_ERROR");
        err.code = "network_error";
        throw err;
      }

      if (oldEmailUpper !== oldEmail && isInvalidCreds(r2.error)) {
        const r3 = await tryLogin(oldEmailUpper);
        if (!r3.error) return;
        if (isPendingErr(r3.error)) {
          const err: any = new Error("PENDING_APPROVAL");
          err.code = "email_not_confirmed";
          throw err;
        }
        if (isNetworkErr(r3.error)) {
          const err: any = new Error("NETWORK_ERROR");
          err.code = "network_error";
          throw err;
        }
      }
    }

    throw new Error(r1.error?.message || "Matrícula ou senha incorretos.");
  };

  const signOut = async () => {
    if (user) {
      try {
        await supabase.from("user_presence").upsert({
           user_id: user.id,
           last_seen_at: new Date().toISOString(),
           current_page: "Desconectado"
        });
      } catch (err) {
        console.warn("Could not update presence on signout", err);
      }
    }
    await supabase.auth.signOut();
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ session, user, profile, areaPermissions, isAdmin, loading, signIn, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
