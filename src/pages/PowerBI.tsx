import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, BarChart3 } from "lucide-react";

interface PowerBILink {
  id: string;
  titulo: string;
  descricao: string | null;
  url: string;
}

const PowerBI = () => {
  const [links, setLinks] = useState<PowerBILink[]>([]);
  const [selectedLink, setSelectedLink] = useState<PowerBILink | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.from("powerbi_links").select("*").order("ordem").then(({ data }) => {
      if (data) {
        setLinks(data);
        if (data.length > 0) setSelectedLink(data[0]);
      }
    });
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
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

      <main className="flex-1 flex flex-col">
        {links.length === 0 ? (
          <div className="text-center py-20">
            <BarChart3 className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-1">Nenhum relatório cadastrado</h3>
            <p className="text-muted-foreground text-sm">Os relatórios serão exibidos aqui quando forem adicionados pelo administrador.</p>
          </div>
        ) : (
          <>
            {/* Tab bar for reports */}
            {links.length > 1 && (
              <div className="border-b bg-card/50">
                <div className="container mx-auto px-4 flex gap-1 overflow-x-auto py-2">
                  {links.map((link) => (
                    <Button
                      key={link.id}
                      variant={selectedLink?.id === link.id ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setSelectedLink(link)}
                      className="whitespace-nowrap"
                    >
                      <BarChart3 className="w-4 h-4 mr-1" />
                      {link.titulo}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Embedded iframe */}
            {selectedLink && (
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
          </>
        )}
      </main>
    </div>
  );
};

export default PowerBI;
