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

      if (p?.area) {
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
    // Try new domain first, fallback to old domain for existing users
    const newEmail = `${matricula.toLowerCase()}@corporativo.local`;
    const oldEmail = `${matricula}@empresa.local`;

    const { error: newError } = await supabase.auth.signInWithPassword({ email: newEmail, password });
    if (!newError) return; // Success with new domain

    // Try old domain for users registered before the migration
    const { error: oldError } = await supabase.auth.signInWithPassword({ email: oldEmail, password });
    if (oldError) throw oldError; // Both failed — throw the final error
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
