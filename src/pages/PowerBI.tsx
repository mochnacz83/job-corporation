import { useEffect, useState, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAccessTracking } from "@/hooks/useAccessTracking";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, BarChart3, Loader2, GripVertical } from "lucide-react";
import { 
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  rectSortingStrategy,
  useSortable
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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

const SortableItem = ({ link, onSelect }: { link: PowerBILink, onSelect: (link: PowerBILink) => void }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: link.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 2 : 1,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <Card
        className="cursor-pointer hover:border-primary/50 hover:shadow-md transition-all duration-200 group h-full relative"
        onClick={() => onSelect(link)}
      >
        <div 
          {...attributes} 
          {...listeners}
          className="absolute top-2 right-2 p-1 text-muted-foreground/30 hover:text-primary transition-colors cursor-grab active:cursor-grabbing z-20"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="w-4 h-4" />
        </div>
        <CardContent className="p-6 flex flex-col items-center text-center space-y-4">
          <div className="p-4 bg-primary/10 rounded-full group-hover:bg-primary/20 transition-colors">
            <BarChart3 className="w-10 h-10 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-lg text-foreground line-clamp-2">{link.titulo}</h3>
            {link.descricao && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{link.descricao}</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

const PowerBI = () => {
  const { user, areaPermissions, isAdmin } = useAuth();
  const [links, setLinks] = useState<PowerBILink[]>([]);
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mountedIframes, setMountedIframes] = useState<Set<string>>(new Set());
  const navigate = useNavigate();

  const hasFetched = useRef(false);

  const { trackAction } = useAccessTracking("/powerbi");

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    if (hasFetched.current || !user) return;
    const fetchLinks = async () => {
      setLoading(true);
      try {
        // Fetch reports
        const { data: reportData, error: reportError } = await supabase
          .from("powerbi_links")
          .select("*")
          .eq("ativo", true)
          .order("ordem");

        if (reportError) throw reportError;
        
        const dbLinks = (reportData || []) as PowerBILink[];
        
        // Add hardcoded fallback
        if (!dbLinks.some((link) => link.titulo === "Filas de Serviços - Instalação, Reparo e Mudança")) {
           dbLinks.push({ 
             id: "bi-servicos", 
             titulo: "Filas de Serviços - Instalação, Reparo e Mudança", 
             url: "https://app.powerbi.com/view?r=eyJrIjoiYmMzZDIyNGYtMDRmMy00NDExLTlhNTctMjNkYzIxNzU5M2RmIiwidCI6ImExMjEzYzlhLTAzZTAtNGI0OC05YTVlLTFkZmYzZmVjNTRlMCJ9", 
             descricao: "Monitoramento de filas de serviços para instalação, reparo e mudança" 
           });
        }
        setLinks(dbLinks);

        // Fetch user preferences
        const { data: prefData } = await supabase
          .from("user_preferences")
          .select("powerbi_report_order")
          .eq("user_id", user.id)
          .maybeSingle();

        if (prefData?.powerbi_report_order) {
          setOrderedIds(prefData.powerbi_report_order);
        } else {
          // Default order based on database 'ordem'
          setOrderedIds(dbLinks.map(l => l.id));
        }

        hasFetched.current = true;
      } catch (err) {
        console.error("Erro ao carregar relatórios Power BI:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchLinks();
  }, [user]);

  // Filter and Sort links
  const sortedLinks = useMemo(() => {
    const baseLinks = (!isAdmin && areaPermissions && !areaPermissions.all_access)
      ? links.filter(link => link.id === "bi-servicos" || areaPermissions.powerbi_report_ids?.includes(link.id))
      : links;

    if (orderedIds.length === 0) return baseLinks;

    const linkMap = new Map(baseLinks.map(l => [l.id, l]));
    const result: PowerBILink[] = [];
    
    // First, add links in stored order
    orderedIds.forEach(id => {
      const link = linkMap.get(id);
      if (link) {
        result.push(link);
        linkMap.delete(id);
      }
    });
    
    // Add any remaining links (e.g. newly added reports)
    linkMap.forEach(link => result.push(link));
    
    return result;
  }, [links, orderedIds, areaPermissions, isAdmin]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      const oldIndex = orderedIds.indexOf(active.id as string);
      const newIndex = orderedIds.indexOf(over.id as string);
      
      const newOrderIds = arrayMove(orderedIds, oldIndex, newIndex);
      setOrderedIds(newOrderIds);

      // Persist to database
      if (user) {
        await supabase
          .from("user_preferences")
          .upsert({ 
            user_id: user.id, 
            powerbi_report_order: newOrderIds 
          }, { onConflict: "user_id" });
      }
    }
  };

  const selectLink = (link: PowerBILink) => {
    setSelectedLinkId(link.id);
    trackAction(`Acessou o BI: ${link.titulo}`);
    // Mount iframe if not yet mounted
    setMountedIframes(prev => {
      const next = new Set(prev);
      next.add(link.id);
      return next;
    });
  };

  const selectedLink = sortedLinks.find(l => l.id === selectedLinkId) || null;

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
        ) : sortedLinks.length === 0 ? (
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
              <DndContext 
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext 
                  items={orderedIds}
                  strategy={rectSortingStrategy}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {sortedLinks.map((link) => (
                      <SortableItem key={link.id} link={link} onSelect={selectLink} />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>

            {/* All mounted iframes - persist once opened, show/hide via CSS */}
            {sortedLinks.filter(link => mountedIframes.has(link.id)).map(link => (
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
