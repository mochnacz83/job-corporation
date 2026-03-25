import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAccessTracking } from "@/hooks/useAccessTracking";
import { BarChart3, LogOut, User, Shield, Activity, KeyRound, CalendarDays, ClipboardList, ClipboardCheck } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from
  "@/components/ui/tooltip";

interface PowerBILink {
  id: string;
  titulo: string;
  descricao: string | null;
  url: string;
  icone: string | null;
}

const Dashboard = () => {
  const { user, profile, areaPermissions, isAdmin, signOut, loading } = useAuth();
  const navigate = useNavigate();
  const [links, setLinks] = useState<PowerBILink[]>([]);

  useEffect(() => {
    if (!loading && profile?.must_change_password) {
      navigate("/alterar-senha");
    }
  }, [profile, loading, navigate]);

  useEffect(() => {
    supabase.from("powerbi_links").select("*").order("ordem").then(({ data }) => {
      const dbLinks = (data || []) as PowerBILink[];

      setLinks(() => {
        const combined = [...dbLinks];
        // Ensure "Filas de Serviços" fallback
        if (!combined.some((link) => link.titulo === "Filas de Serviços - Instalação, Reparo e Mudança")) {
           combined.push({ 
             id: "bi-servicos", 
             titulo: "Filas de Serviços - Instalação, Reparo e Mudança", 
             url: "https://app.powerbi.com/view?r=eyJrIjoiYmMzZDIyNGYtMDRmMy00NDExLTlhNTctMjNkYzIxNzU5M2RmIiwidCI6ImExMjEzYzlhLTAzZTAtNGI0OC05YTVlLTFkZmYzZmVjNTRlMCJ9", 
             descricao: "Monitoramento de filas de serviços para instalação, reparo e mudança",
             icone: ""
           });
        }
        // Ensure "SEF São Jose" fallback
        if (!combined.some((link) => link.titulo === "DashBoard SEF São Jose")) {
          combined.push({ 
            id: "bi-sef-sj", 
            titulo: "DashBoard SEF São Jose", 
            url: "https://app.powerbi.com/view?r=eyJrIjoiM2NjZjRkNmMtOWY3Yy00ZmJmLTk2NjgtNTM2YWU0MGRmYmZjIiwidCI6ImExMjEzYzlhLTAzZTAtNGI0OC05YTVlLTFkZmYzZmVjNTRlMCJ9&disablecdnExpiration=1770063969", 
            descricao: "Monitoramento de indicadores SEF São Jose",
            icone: ""
          });
        }
        return combined;
      });
    });
  }, []);

  useAccessTracking("/dashboard");

const handleSignOut = async () => {
  await signOut();
  navigate("/");
};

return (
  <div className="min-h-screen bg-background">
    <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="w-full max-w-[1600px] mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-1 bg-transparent w-12 h-12 flex items-center justify-center overflow-hidden">
            <img src="/ability-logo.png" alt="Ability Tecnologia Logo" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-lg font-bold text-foreground">Portal Corporativo</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
            <User className="w-4 h-4" />
            <span>{profile?.nome}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-primary-foreground">{profile?.matricula}</span>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => navigate("/alterar-senha")}>
                  <KeyRound className="w-4 h-4 text-muted-foreground hover:text-foreground transition-colors" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Alterar Senha</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-muted-foreground hover:text-foreground">
            <LogOut className="w-4 h-4 mr-1" /> Sair
          </Button>
        </div>
      </div>
    </header>

    <main className="w-full max-w-[1600px] mx-auto px-4 py-8 space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-foreground">
          Olá, {profile?.nome?.split(" ")[0]}! 👋
        </h2>
        <p className="text-muted-foreground mt-1">Selecione uma área para começar</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Power BI Section */}
        {(isAdmin || areaPermissions?.all_access || areaPermissions?.modules?.includes("powerbi")) &&
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
              {links.length > 0 &&
                <p className="text-xs text-primary mt-2 font-medium">{links.length} relatório(s) disponível(is)</p>
              }
            </CardContent>
          </Card>
        }

        {/* Reagenda Section */}
        {(isAdmin || areaPermissions?.all_access || areaPermissions?.modules?.includes("reagenda")) &&
          <Card className="glass-card hover:shadow-xl transition-shadow group cursor-pointer" onClick={() => navigate("/reagenda")}>
            <CardHeader className="pb-3">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-2 group-hover:bg-primary/20 transition-colors">
                <CalendarDays className="w-6 h-6 text-primary" />
              </div>
              <CardTitle className="text-lg">Sistema de Reagendamento / Antecipar Agenda</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                Carregue planilhas para antecipar atendimentos e contatar clientes.
              </p>
            </CardContent>
          </Card>
        }

        {/* Material Coleta Section */}
        {(isAdmin || areaPermissions?.all_access || areaPermissions?.modules?.includes("material_coleta")) &&
          <Card className="glass-card hover:shadow-xl transition-shadow group cursor-pointer" onClick={() => navigate("/material-coleta")}>
            <CardHeader className="pb-3">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-2 group-hover:bg-primary/20 transition-colors">
                <ClipboardList className="w-6 h-6 text-primary" />
              </div>
              <CardTitle className="text-lg">Controle Materiais Dados</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                Registre materiais aplicados, consulte por BA/Circuito e exporte dados.
              </p>
            </CardContent>
          </Card>
        }

        {/* Vistoria de Campo Section */}
        {(isAdmin || areaPermissions?.all_access || areaPermissions?.modules?.includes("vistoria_campo")) &&
          <Card className="glass-card hover:shadow-xl transition-shadow group cursor-pointer" onClick={() => navigate("/vistoria-campo")}>
            <CardHeader className="pb-3">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-2 group-hover:bg-primary/20 transition-colors">
                <ClipboardCheck className="w-6 h-6 text-primary" />
              </div>
              <CardTitle className="text-lg">Vistoria de Campo</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                Realize acompanhamentos técnicos, verifique indicadores e garanta a qualidade.
              </p>
            </CardContent>
          </Card>
        }

        {/* Admin Section */}
        {isAdmin &&
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
        }
      </div>
    </main>
  </div >);

};

export default Dashboard;