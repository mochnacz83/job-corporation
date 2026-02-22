import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart3, LogOut, User, Shield, Activity } from "lucide-react";

interface PowerBILink {
  id: string;
  titulo: string;
  descricao: string | null;
  url: string;
  icone: string | null;
}

const Dashboard = () => {
  const { user, profile, isAdmin, signOut, loading } = useAuth();
  const navigate = useNavigate();
  const [links, setLinks] = useState<PowerBILink[]>([]);

  useEffect(() => {
    if (!loading && profile?.must_change_password) {
      navigate("/alterar-senha");
    }
  }, [profile, loading, navigate]);

  useEffect(() => {
    supabase.from("powerbi_links").select("*").order("ordem").then(({ data }) => {
      if (data) setLinks(data);
    });
  }, []);

  // Log access and update presence
  useEffect(() => {
    if (!user) return;

    // Log page access
    supabase.from("access_logs").insert({
      user_id: user.id,
      action: "page_view",
      page: "/dashboard",
    }).then(() => {});

    // Update presence
    supabase.from("user_presence").upsert({
      user_id: user.id,
      last_seen_at: new Date().toISOString(),
      current_page: "/dashboard",
    }).then(() => {});

    // Heartbeat every 30s
    const interval = setInterval(() => {
      supabase.from("user_presence").upsert({
        user_id: user.id,
        last_seen_at: new Date().toISOString(),
        current_page: window.location.pathname,
      }).then(() => {});
    }, 30000);

    return () => clearInterval(interval);
  }, [user]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-primary-foreground" />
            </div>
            <h1 className="text-lg font-bold text-foreground">Portal Corporativo</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
              <User className="w-4 h-4" />
              <span>{profile?.nome}</span>
              <span className="text-xs bg-secondary px-2 py-0.5 rounded-full">{profile?.matricula}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="w-4 h-4 mr-1" /> Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-8">
        <div>
          <h2 className="text-2xl font-bold text-foreground">
            Olá, {profile?.nome?.split(" ")[0]}! 👋
          </h2>
          <p className="text-muted-foreground mt-1">Selecione uma área para começar</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Power BI Section */}
          <Card className="glass-card hover:shadow-xl transition-shadow group cursor-pointer" onClick={() => navigate("/powerbi")}>
            <CardHeader className="pb-3">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-2 group-hover:bg-primary/20 transition-colors">
                <BarChart3 className="w-6 h-6 text-primary" />
              </div>
              <CardTitle className="text-lg">Relatórios Power BI</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                Acesse os dashboards e relatórios de análise de dados.
              </p>
              {links.length > 0 && (
                <p className="text-xs text-primary mt-2 font-medium">{links.length} relatório(s) disponível(is)</p>
              )}
            </CardContent>
          </Card>

          {/* Admin Section */}
          {isAdmin && (
            <>
              <Card className="glass-card hover:shadow-xl transition-shadow group cursor-pointer border-primary/20" onClick={() => navigate("/admin/usuarios")}>
                <CardHeader className="pb-3">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-2 group-hover:bg-primary/20 transition-colors">
                    <Shield className="w-6 h-6 text-primary" />
                  </div>
                  <CardTitle className="text-lg">Gerenciar Usuários</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground text-sm">
                    Ative, bloqueie ou gerencie o acesso dos usuários ao sistema.
                  </p>
                </CardContent>
              </Card>

              <Card className="glass-card hover:shadow-xl transition-shadow group cursor-pointer border-primary/20" onClick={() => navigate("/admin/analytics")}>
                <CardHeader className="pb-3">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-2 group-hover:bg-primary/20 transition-colors">
                    <Activity className="w-6 h-6 text-primary" />
                  </div>
                  <CardTitle className="text-lg">Monitoramento de Acessos</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground text-sm">
                    Veja quem acessou, quem está online e gráficos de uso.
                  </p>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
