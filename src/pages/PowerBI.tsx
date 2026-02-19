import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, BarChart3, ExternalLink } from "lucide-react";

interface PowerBILink {
  id: string;
  titulo: string;
  descricao: string | null;
  url: string;
}

const PowerBI = () => {
  const [links, setLinks] = useState<PowerBILink[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.from("powerbi_links").select("*").order("ordem").then(({ data }) => {
      if (data) setLinks(data);
    });
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold text-foreground">Relatórios Power BI</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {links.length === 0 ? (
          <div className="text-center py-20">
            <BarChart3 className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-1">Nenhum relatório cadastrado</h3>
            <p className="text-muted-foreground text-sm">Os relatórios serão exibidos aqui quando forem adicionados pelo administrador.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {links.map((link) => (
              <Card key={link.id} className="glass-card hover:shadow-xl transition-all group">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-primary" />
                    {link.titulo}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {link.descricao && <p className="text-sm text-muted-foreground mb-3">{link.descricao}</p>}
                  <Button size="sm" className="w-full" onClick={() => window.open(link.url, "_blank")}>
                    <ExternalLink className="w-4 h-4 mr-1" /> Abrir Relatório
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default PowerBI;
