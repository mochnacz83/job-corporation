import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, BarChart3, PieChart, Presentation, MoveLeft, Loader2 } from "lucide-react";

interface PowerBILink {
  id: string;
  titulo: string;
  descricao: string | null;
  url: string;
  icone?: string | null;
  ordem?: number;
  ativo?: boolean;
  created_at?: string;
}


const PowerBI = () => {
  const { areaPermissions, isAdmin } = useAuth();
  const [links, setLinks] = useState<PowerBILink[]>([]);
  const [selectedLink, setSelectedLink] = useState<PowerBILink | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchLinks = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("powerbi_links")
          .select("*")
          .eq("ativo", true)
          .order("ordem");

        if (error) throw error;

        let filteredLinks = (data || []) as PowerBILink[];

        // Aplicar filtragem se não for admin
        if (!isAdmin && areaPermissions && !areaPermissions.all_access) {
          filteredLinks = filteredLinks.filter(link =>
            areaPermissions.powerbi_report_ids?.includes(link.id)
          );
        }

        setLinks(filteredLinks);
      } catch (err) {
        console.error("Erro ao carregar relatórios Power BI:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchLinks();
  }, [areaPermissions, isAdmin]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (selectedLink) {
                setSelectedLink(null);
              } else {
                navigate("/dashboard");
              }
            }}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2">
            <div className="p-1 bg-transparent w-10 h-10 flex items-center justify-center overflow-hidden">
              <img src="/ability-logo.png" alt="Ability Tecnologia Logo" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-lg font-bold text-foreground">
              {selectedLink ? selectedLink.titulo : "Relatórios Power BI"}
            </h1>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col">
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : links.length === 0 ? (
          <div className="text-center py-20 px-4">
            <BarChart3 className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-1">Nenhum relatório disponível</h3>
            <p className="text-muted-foreground text-sm max-w-xs mx-auto">
              Você não tem permissão para visualizar relatórios ou não há relatórios ativos para sua área.
            </p>
          </div>
        ) : !selectedLink ? (
          <div className="container mx-auto px-4 py-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {links.map((link) => (
                <Card
                  key={link.id}
                  className="cursor-pointer hover:border-primary/50 hover:shadow-md transition-all duration-200 group"
                  onClick={() => setSelectedLink(link)}
                >
                  <CardContent className="p-6 flex flex-col items-center text-center space-y-4">
                    <div className="p-4 bg-primary/10 rounded-full group-hover:bg-primary/20 transition-colors">
                      <BarChart3 className="w-10 h-10 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg text-foreground line-clamp-1">{link.titulo}</h3>
                      {link.descricao && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{link.descricao}</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 relative">
            <iframe
              src={selectedLink.url}
              title={selectedLink.titulo}
              className="absolute inset-0 w-full h-full border-0"
              allowFullScreen
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            />
          </div>
        )}
      </main>
    </div>
  );
};

export default PowerBI;
