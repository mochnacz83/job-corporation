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

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id).finally(() => {
          if (mounted) setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!mounted) return;
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

    // 1) Try the new domain first (where most users live now)
    const r1 = await supabase.auth.signInWithPassword({ email: newEmail, password });
    if (!r1.error) return;

    // 2) Fall back to legacy domain (lowercase)
    const r2 = await supabase.auth.signInWithPassword({ email: oldEmail, password });
    if (!r2.error) return;

    // 3) Fall back to legacy domain preserving original case (some old accounts)
    if (oldEmailUpper !== oldEmail) {
      const r3 = await supabase.auth.signInWithPassword({ email: oldEmailUpper, password });
      if (!r3.error) return;
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
