import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, BarChart3, Loader2 } from "lucide-react";

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
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mountedIframes, setMountedIframes] = useState<Set<string>>(new Set());
  const navigate = useNavigate();

  const hasFetched = useRef(false);

  useEffect(() => {
    if (hasFetched.current) return;
    const fetchLinks = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("powerbi_links")
          .select("*")
          .eq("ativo", true)
          .order("ordem");

        if (error) throw error;
        setLinks((data || []) as PowerBILink[]);
        hasFetched.current = true;
      } catch (err) {
        console.error("Erro ao carregar relatórios Power BI:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchLinks();
  }, []);

  // Filter links based on permissions (runs reactively but doesn't trigger loading)
  const filteredLinks = (!isAdmin && areaPermissions && !areaPermissions.all_access)
    ? links.filter(link => areaPermissions.powerbi_report_ids?.includes(link.id))
    : links;

  const selectLink = (link: PowerBILink) => {
    setSelectedLinkId(link.id);
    // Mount iframe if not yet mounted
    setMountedIframes(prev => {
      const next = new Set(prev);
      next.add(link.id);
      return next;
    });
  };

  const selectedLink = filteredLinks.find(l => l.id === selectedLinkId) || null;

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50 shrink-0">
        <div className="px-4 h-14 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (selectedLinkId) {
                setSelectedLinkId(null);
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

      <main className="flex-1 flex flex-col relative overflow-hidden">
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : filteredLinks.length === 0 ? (
          <div className="text-center py-20 px-4">
            <BarChart3 className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-1">Nenhum relatório disponível</h3>
            <p className="text-muted-foreground text-sm max-w-xs mx-auto">
              Você não tem permissão para visualizar relatórios ou não há relatórios ativos para sua área.
            </p>
          </div>
        ) : (
          <>
            {/* Card grid - visible when no link selected */}
            <div
              className="px-4 py-8 overflow-y-auto"
              style={{ display: selectedLinkId ? "none" : "block" }}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {links.map((link) => (
                  <Card
                    key={link.id}
                    className="cursor-pointer hover:border-primary/50 hover:shadow-md transition-all duration-200 group"
                    onClick={() => selectLink(link)}
                  >
                    <CardContent className="p-6 flex flex-col items-center text-center space-y-4">
                      <div className="p-4 bg-primary/10 rounded-full group-hover:bg-primary/20 transition-colors">
                        <BarChart3 className="w-10 h-10 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg text-foreground">{link.titulo}</h3>
                        {link.descricao && (
                          <p className="text-sm text-muted-foreground mt-1">{link.descricao}</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {/* All mounted iframes - persist once opened, show/hide via CSS */}
            {links.filter(link => mountedIframes.has(link.id)).map(link => (
              <div
                key={link.id}
                className="absolute inset-0"
                style={{ display: selectedLinkId === link.id ? "block" : "none" }}
              >
                <iframe
                  src={link.url}
                  title={link.titulo}
                  className="w-full h-full border-0"
                  allowFullScreen
                  sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                />
              </div>
            ))}
          </>
        )}
      </main>
    </div>
  );
};

export default PowerBI;
