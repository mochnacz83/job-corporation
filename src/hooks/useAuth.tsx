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
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", userId)
        .single();
      const p = profileData as Profile | null;
      setProfile(p);

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

      // Check admin role
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle();
      setIsAdmin(!!roleData);
    } catch (err) {
      console.error("Error fetching profile:", err);
    }
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setLoading(true);
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          await fetchProfile(session.user.id);
        } else {
          setProfile(null);
          setAreaPermissions(null);
          setIsAdmin(false);
        }
        setLoading(false);
      }
    );

    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          await fetchProfile(session.user.id);
        }
      } catch (err) {
        console.error("Auth init error:", err);
      } finally {
        setLoading(false);
      }
    };

    initAuth();

    return () => subscription.unsubscribe();
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
