import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAccessTracking } from "@/hooks/useAccessTracking";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, BarChart3, Loader2, GripVertical, RotateCcw } from "lucide-react";
import { 
  DndContext, 
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  rectSortingStrategy,
  useSortable
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQuery, useQueryClient } from "@tanstack/react-query";

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

const HARDCODED_LINKS: PowerBILink[] = [
  {
    id: "bi-servicos",
    titulo: "Fila de Atividades SC",
    url: "https://app.powerbi.com/view?r=eyJrIjoiYmMzZDIyNGYtMDRmMy00NDExLTlhNTctMjNkYzIxNzU5M2RmIiwidCI6ImExMjEzYzlhLTAzZTAtNGI0OC05YTVlLTFkZmYzZmVjNTRlMCJ9",
    descricao: "Monitoramento da fila de atividades SC",
  },
  {
    id: "bi-sef-sj",
    titulo: "DashBoard SEF São Jose",
    url: "https://app.powerbi.com/view?r=eyJrIjoiM2NjZjRkNmMtOWY3Yy00ZmJmLTk2NjgtNTM2YWU0MGRmYmZjIiwidCI6ImExMjEzYzlhLTAzZTAtNGI0OC05YTVlLTFkZmYzZmVjNTRlMCJ9&disablecdnExpiration=1770063969",
    descricao: "Monitoramento de indicadores SEF São Jose",
  },
];

const SortableItem = ({ link, onSelect }: { link: PowerBILink; onSelect: (link: PowerBILink) => void }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: link.id });

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
  const queryClient = useQueryClient();
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const [searchParams] = useSearchParams();
  const idParam = searchParams.get("id");
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(idParam);
  const [mountedIframes, setMountedIframes] = useState<Set<string>>(new Set());
  const navigate = useNavigate();
  const { trackAction } = useAccessTracking("/powerbi");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  useEffect(() => {
    if (idParam) {
      setSelectedLinkId(idParam);
      setMountedIframes((prev) => {
        if (prev.has(idParam)) return prev;
        const next = new Set(prev);
        next.add(idParam);
        return next;
      });
      return;
    }

    setSelectedLinkId(null);
  }, [idParam]);

  const { 
    data: links = [], 
    isLoading: loading,
    refetch
  } = useQuery({
    queryKey: ["powerbi_links"],
    queryFn: async () => {
      const { data } = await supabase.from("powerbi_links").select("*").eq("ativo", true).order("ordem");
      const dbLinks = (data || []) as PowerBILink[];
      
      for (const hl of HARDCODED_LINKS) {
        if (!dbLinks.some((l) => l.titulo === hl.titulo)) {
          dbLinks.push(hl);
        }
      }
      return dbLinks;
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (user && links.length > 0) {
      const savedOrder = localStorage.getItem(`powerbi_order_${user.id}`);
      if (savedOrder) {
        try {
          setOrderedIds(JSON.parse(savedOrder));
        } catch {
          setOrderedIds(links.map((l) => l.id));
        }
      } else {
        setOrderedIds(links.map((l) => l.id));
      }
    }
  }, [user, links]);

  const sortedLinks = useMemo(() => {
    const baseLinks =
      !isAdmin && areaPermissions && !areaPermissions.all_access
        ? links.filter((link) => areaPermissions.powerbi_report_ids?.includes(link.id))
        : links;

    if (orderedIds.length === 0) return baseLinks;

    const linkMap = new Map(baseLinks.map((l) => [l.id, l]));
    const result: PowerBILink[] = [];

    orderedIds.forEach((id) => {
      const link = linkMap.get(id);
      if (link) {
        result.push(link);
        linkMap.delete(id);
      }
    });

    linkMap.forEach((link) => result.push(link));
    return result;
  }, [links, orderedIds, areaPermissions, isAdmin]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const currentIds = sortedLinks.map((l) => l.id);
      const oldIndex = currentIds.indexOf(active.id as string);
      const newIndex = currentIds.indexOf(over.id as string);
      const newOrderIds = arrayMove(currentIds, oldIndex, newIndex);
      setOrderedIds(newOrderIds);
      if (user) {
        localStorage.setItem(`powerbi_order_${user.id}`, JSON.stringify(newOrderIds));
      }
    }
  };

  const handleRefresh = useCallback(() => {
    // Clear iframes to force reload
    setMountedIframes(new Set());
    refetch().then(() => {
      // Re-add current iframe after refetch completes
      if (selectedLinkId) {
        setMountedIframes(new Set([selectedLinkId]));
      }
    });
    trackAction("Acionou o botão de refresh no Power BI");
  }, [selectedLinkId, refetch, trackAction]);

  const selectLink = (link: PowerBILink) => {
    trackAction(`Acessou o BI: ${link.titulo}`);
    navigate(`/powerbi?id=${link.id}`);
  };

  const selectedLink = sortedLinks.find((l) => l.id === selectedLinkId) || null;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Compact toolbar */}
      <div className="border-b bg-card/60 backdrop-blur-sm shrink-0">
        <div className="px-4 h-11 flex items-center gap-3">
          {selectedLinkId ? (
            <Button variant="ghost" size="sm" onClick={() => navigate("/powerbi")} className="gap-1 px-2">
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline text-sm">Voltar</span>
            </Button>
          ) : null}
          <div className="p-0.5 bg-transparent w-7 h-7 flex items-center justify-center overflow-hidden shrink-0">
            <img src="/ability-logo.png" alt="Logo" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-sm font-semibold text-foreground truncate">
            {selectedLink ? selectedLink.titulo : "Relatórios Power BI"}
          </h1>
          <div className="ml-auto">
            <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={loading} className="gap-1.5 h-8">
              <RotateCcw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline text-xs">Atualizar</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden">
        {loading ? (
          <div className="flex-1 flex items-center justify-center h-full">
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
            {/* Card grid */}
            <div className="px-4 py-6 overflow-y-auto h-full" style={{ display: selectedLinkId ? "none" : "block" }}>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={sortedLinks.map((l) => l.id)} strategy={rectSortingStrategy}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {sortedLinks.map((link) => (
                      <SortableItem key={link.id} link={link} onSelect={selectLink} />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>

            {/* Iframes - no sandbox restriction for Power BI compatibility */}
            {sortedLinks
              .filter((link) => mountedIframes.has(link.id))
              .map((link) => (
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
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
              ))}
          </>
        )}
      </div>
    </div>
  );
};

export default PowerBI;
