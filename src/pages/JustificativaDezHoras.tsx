import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAccessTracking } from "@/hooks/useAccessTracking";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { 
  Clock, AlertTriangle, CheckCircle2, Lock, Unlock, 
  Save, RefreshCw, FileSpreadsheet, Search, Filter,
  Users, UserCheck, ShieldAlert, BookOpen, BarChart3, TrendingUp
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LabelList, LineChart, Line, PieChart, Pie, Cell, Legend
} from "recharts";

type FatoRow = {
  id: string;
  ds_estado: string | null;
  ds_macro_atividade: string | null;
  matricula_tt: string | null;
  nome_tecnico: string | null;
  data_atividade: string | null;
  raw: Record<string, unknown> | null;
};

type PresencaRow = {
  tt: string | null;
  funcionario: string | null;
  supervisor: string | null;
  coordenador: string | null;
  setor_origem: string | null;
  setor_atual: string | null;
  status: string | null;
};

type JustificativaRow = {
  id?: string;
  matricula_tt: string;
  nome_tecnico: string;
  supervisor: string | null;
  coordenador: string | null;
  setor: string | null;
  data_atividade: string;
  causa: string;
  observacao: string | null;
  bloqueado: boolean;
  created_at?: string;
  created_by?: string;
};

const CAUSAS_PERMITIDAS = [
  "Inversão de atividade",
  "Cancelamento",
  "Atividade Complexa",
  "Carro Quebrado",
  "Consulta Medica",
  "Exame Medico",
];

const todayISO = () => new Date().toISOString().slice(0, 10);

const JustificativaDezHoras = () => {
  const { isAdmin, profile } = useAuth();
  useAccessTracking("/justificativa-10h", true, "Justificativa de Atividades 10h");

  const [date, setDate] = useState<string>(todayISO());
  const [fato, setFato] = useState<FatoRow[]>([]);
  const [presenca, setPresenca] = useState<PresencaRow[]>([]);
  const [justificativas, setJustificativas] = useState<JustificativaRow[]>([]);
  const [historico, setHistorico] = useState<JustificativaRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Form states for each technician
  const [formsState, setFormsState] = useState<Record<string, { causa: string; observacao: string }>>({});

  // Filters
  const [supervisorFilter, setSupervisorFilter] = useState<string>("todos");
  const [coordenadorFilter, setCoordenadorFilter] = useState<string>("todos");
  const [statusFiltroJustificativa, setStatusFiltroJustificativa] = useState<"todos" | "pendentes" | "justificados">("todos");
  const [searchQuery, setSearchQuery] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      const [{ data: f }, { data: p }, { data: j }, { data: hist }] = await Promise.all([
        supabase
          .from("atividades_fato")
          .select("id, ds_estado, ds_macro_atividade, matricula_tt, nome_tecnico, data_atividade, raw")
          .eq("data_atividade", date)
          .limit(15000),
        supabase
          .from("tecnicos_presenca")
          .select("tt, funcionario, supervisor, coordenador, setor_origem, setor_atual, status")
          .limit(10000),
        supabase
          .from("justificativas_10h" as any)
          .select("*")
          .eq("data_atividade", date),
        supabase
          .from("justificativas_10h" as any)
          .select("matricula_tt, nome_tecnico, supervisor, coordenador, setor, data_atividade, causa")
          .limit(50000),
      ]);

      const cleanedFato = ((f || []) as FatoRow[]).filter((r) => {
        const n = (r.nome_tecnico || "").toUpperCase();
        return !n.includes("BUFFER") && !n.includes("EXTERNO");
      });
      setFato(cleanedFato);

      const cleanedPresenca = ((p || []) as PresencaRow[]).filter((r) => {
        const n = (r.funcionario || "").toUpperCase();
        return !n.includes("BUFFER") && !n.includes("EXTERNO");
      });
      setPresenca(cleanedPresenca);

      setJustificativas((j || []) as unknown as JustificativaRow[]);
      setHistorico((hist || []) as unknown as JustificativaRow[]);

      // Reset form states
      setFormsState({});
    } catch (err: any) {
      console.error("Erro ao carregar dados:", err);
      toast.error("Erro ao carregar os dados das atividades.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [date]);

  // Helper function to read raw JSON values
  const getRawStr = (r: FatoRow, keys: string[]): string => {
    const raw = r.raw || {};
    const lookup = new Map<string, string>();
    Object.keys(raw).forEach((k) => {
      const norm = k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
      lookup.set(norm, String((raw as Record<string, unknown>)[k] ?? ""));
    });
    for (const c of keys) {
      const n = c.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
      const v = lookup.get(n);
      if (v) return v;
    }
    return "";
  };

  // Group activities by technician matricula
  const activitiesByTech = useMemo(() => {
    const map = new Map<string, FatoRow[]>();
    fato.forEach(r => {
      if (r.matricula_tt) {
        const tt = r.matricula_tt.trim().toUpperCase();
        if (!map.has(tt)) map.set(tt, []);
        map.get(tt)!.push(r);
      }
    });
    return map;
  }, [fato]);

  // Check if technician closed any activity before 10 AM
  const hasClosedBefore10 = (tt: string): boolean => {
    const techActs = activitiesByTech.get(tt.trim().toUpperCase()) || [];
    if (techActs.length === 0) return false;

    return techActs.some(act => {
      // Alinhado ao módulo Acompanhamento de Atividades: estado contém "conclu" (Com/Sem Sucesso)
      // ou "wfm" (Fechado em WFM). Qualquer outra coisa não conta como fechamento.
      const state = (act.ds_estado || "").toLowerCase();
      const isClosed = state.includes("conclu") || state.includes("wfm");
      if (!isClosed) return false;

      const endTimeStr = getRawStr(act, ["dh_fim_execucao_real", "dh_fim_execucao", "fim_execucao_real"]);
      if (!endTimeStr) return false;

      // Extrai HH:MM:SS e considera fechada se for <= 10:00:00
      const timeMatch = endTimeStr.match(/(\d{2}):(\d{2}):(\d{2})/);
      if (!timeMatch) return false;
      const hh = parseInt(timeMatch[1], 10);
      const mm = parseInt(timeMatch[2], 10);
      const ss = parseInt(timeMatch[3], 10);
      const totalSec = hh * 3600 + mm * 60 + ss;
      return totalSec <= 10 * 3600; // antes ou igual às 10:00
    });
  };

  // Compute final lists of technicians and metrics
  const analysisList = useMemo(() => {
    // Only active technicians: status is empty, null or "Ativo"
    const activeTechs = presenca.filter(p => {
      const status = (p.status || "").trim().toLowerCase();
      return p.tt && (status === "" || status === "ativo");
    });

    return activeTechs.map(p => {
      const tt = p.tt!.trim().toUpperCase();
      const closedBefore10 = hasClosedBefore10(tt);
      const justification = justificativas.find(j => j.matricula_tt.trim().toUpperCase() === tt);

      return {
        tt,
        nome: p.funcionario || "Técnico Sem Nome",
        supervisor: p.supervisor || "—",
        coordenador: p.coordenador || "—",
        setor: p.setor_atual || p.setor_origem || "—",
        closedBefore10,
        justification
      };
    });
  }, [presenca, activitiesByTech, justificativas]);

  // Filter options for Dropdowns
  const supervisorsList = useMemo(() => {
    const set = new Set<string>();
    presenca.forEach(p => p.supervisor && set.add(p.supervisor.trim()));
    return Array.from(set).sort();
  }, [presenca]);

  const coordenadoresList = useMemo(() => {
    const set = new Set<string>();
    presenca.forEach(p => p.coordenador && set.add(p.coordenador.trim()));
    return Array.from(set).sort();
  }, [presenca]);

  // Metrics
  const metrics = useMemo(() => {
    const totalActive = analysisList.length;
    const closedOk = analysisList.filter(item => item.closedBefore10).length;
    const missingClosure = totalActive - closedOk;
    const justifiedCount = analysisList.filter(item => !item.closedBefore10 && item.justification).length;

    return {
      totalActive,
      closedOk,
      closedOkPct: totalActive ? Math.round((closedOk / totalActive) * 100) : 0,
      missingClosure,
      missingClosurePct: totalActive ? Math.round((missingClosure / totalActive) * 100) : 0,
      justifiedCount
    };
  }, [analysisList]);

  // Filtered List for Table
  const filteredList = useMemo(() => {
    return analysisList.filter(item => {
      // 1. We ONLY show technicians who DID NOT close any activity before 10 AM
      if (item.closedBefore10) return false;

      // 2. Supervisor filter
      if (supervisorFilter !== "todos" && item.supervisor !== supervisorFilter) return false;

      // 3. Coordinator filter
      if (coordenadorFilter !== "todos" && item.coordenador !== coordenadorFilter) return false;

      // 4. Justification status filter
      if (statusFiltroJustificativa === "pendentes" && item.justification) return false;
      if (statusFiltroJustificativa === "justificados" && !item.justification) return false;

      // 5. Search query filter (Nome or TT)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = item.nome.toLowerCase().includes(q);
        const matchTT = item.tt.toLowerCase().includes(q);
        if (!matchName && !matchTT) return false;
      }

      return true;
    });
  }, [analysisList, supervisorFilter, coordenadorFilter, statusFiltroJustificativa, searchQuery]);

  // ===================== DINÂMICA — agregações sobre a base histórica =====================
  const dinamica = useMemo(() => {
    const byTec = new Map<string, { nome: string; count: number }>();
    const bySup = new Map<string, number>();
    const byCausa = new Map<string, number>();
    const byDia = new Map<string, number>();

    historico.forEach((h) => {
      const tt = (h.matricula_tt || "").trim().toUpperCase();
      if (tt) {
        const cur = byTec.get(tt) || { nome: h.nome_tecnico || tt, count: 0 };
        cur.count++;
        cur.nome = h.nome_tecnico || cur.nome;
        byTec.set(tt, cur);
      }
      const sup = (h.supervisor || "").trim();
      if (sup && sup !== "—") bySup.set(sup, (bySup.get(sup) || 0) + 1);

      const causa = (h.causa || "").trim();
      if (causa) byCausa.set(causa, (byCausa.get(causa) || 0) + 1);

      const d = (h.data_atividade || "").slice(0, 10);
      if (d) byDia.set(d, (byDia.get(d) || 0) + 1);
    });

    const topTecnicos = Array.from(byTec.entries())
      .map(([tt, v]) => ({ tt, nome: v.nome, qtd: v.count, label: `${v.nome} (${tt})` }))
      .sort((a, b) => b.qtd - a.qtd)
      .slice(0, 10);

    const topSupervisores = Array.from(bySup.entries())
      .map(([nome, qtd]) => ({ nome, qtd }))
      .sort((a, b) => b.qtd - a.qtd)
      .slice(0, 10);

    const causas = Array.from(byCausa.entries())
      .map(([causa, qtd]) => ({ causa, qtd }))
      .sort((a, b) => b.qtd - a.qtd);

    const porDia = Array.from(byDia.entries())
      .map(([d, qtd]) => {
        const [y, m, dd] = d.split("-");
        return { data: `${dd}/${m}`, dataIso: d, qtd };
      })
      .sort((a, b) => a.dataIso.localeCompare(b.dataIso));

    return { topTecnicos, topSupervisores, causas, porDia, total: historico.length };
  }, [historico]);

  const PIE_COLORS = ["#0ea5e9", "#f59e0b", "#10b981", "#6366f1", "#ef4444", "#a855f7", "#14b8a6", "#f43f5e"];

  // Handle Form changes
  const handleFormChange = (tt: string, field: "causa" | "observacao", value: string) => {
    setFormsState(prev => ({
      ...prev,
      [tt]: {
        causa: prev[tt]?.causa || "",
        observacao: prev[tt]?.observacao || "",
        [field]: value
      }
    }));
  };

  // Submit Justification
  const handleSaveJustification = async (item: typeof analysisList[0]) => {
    const form = formsState[item.tt];
    const causa = form?.causa || "";
    const observacao = form?.observacao || "";

    if (!causa) {
      toast.warning("Selecione uma causa para a justificativa.");
      return;
    }

    try {
      const payload: any = {
        matricula_tt: item.tt,
        nome_tecnico: item.nome,
        supervisor: item.supervisor,
        coordenador: item.coordenador,
        setor: item.setor,
        data_atividade: date,
        causa,
        observacao: observacao.trim() || null,
        bloqueado: true,
        created_by: profile?.nome || "Supervisor",
        created_by_user: profile?.user_id || null,
      };

      const { error } = await supabase
        .from("justificativas_10h" as any)
        .insert(payload);

      if (error) throw error;

      toast.success(`Justificativa de ${item.nome} salva e bloqueada com sucesso!`);
      loadData();
    } catch (err: any) {
      console.error("Erro ao salvar justificativa:", err);
      toast.error("Erro ao salvar a justificativa: " + err.message);
    }
  };

  // Admin Unlock function
  const handleUnlockJustification = async (justificationId: string) => {
    if (!isAdmin) {
      toast.error("Apenas administradores podem liberar registros bloqueados.");
      return;
    }

    if (!window.confirm("Deseja desbloquear esta justificativa para edição?")) return;

    try {
      const { error } = await supabase
        .from("justificativas_10h" as any)
        .delete()
        .eq("id", justificationId);

      if (error) throw error;

      toast.success("Justificativa desbloqueada com sucesso! Ela pode ser reeditada agora.");
      loadData();
    } catch (err: any) {
      console.error("Erro ao desbloquear:", err);
      toast.error("Erro ao desbloquear: " + err.message);
    }
  };

  // Export to Excel
  const handleExportExcel = () => {
    // We export all active technicians that didn't close before 10 AM on this day
    const exportData = analysisList
      .filter(item => !item.closedBefore10)
      .map(item => ({
        "Matrícula TT": item.tt,
        "Nome do Técnico": item.nome,
        "Supervisor": item.supervisor,
        "Coordenador": item.coordenador,
        "Setor": item.setor,
        "Data Atividade": date,
        "Causa": item.justification?.causa || "Pendente de Justificativa",
        "Detalhes / Obs": item.justification?.observacao || "—",
        "Status": item.justification ? "Justificado (Bloqueado)" : "Pendente",
        "Justificado Por": item.justification?.created_by || "—"
      }));

    if (exportData.length === 0) {
      toast.info("Nenhuma justificativa pendente ou registrada para exportar.");
      return;
    }

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Justificativas 10h");
    XLSX.writeFile(wb, `Justificativas_10h_${date}.xlsx`);
    toast.success("Relatório de justificativas gerado!");
  };

  return (
    <div className="flex flex-col h-full bg-slate-50/50 p-6 overflow-y-auto">
      
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Justificativas das 10h</h1>
            <p className="text-xs text-slate-500 mt-0.5">Controle de colaboradores ativos sem encerramento de atividade até as 10:00 da manhã</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs">
            <span className="font-semibold text-slate-600">Data de Análise:</span>
            <input
              type="date"
              className="bg-transparent border-0 font-medium text-slate-800 outline-none w-28 text-xs cursor-pointer"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <Button 
            variant="outline" 
            size="sm" 
            className="text-xs text-slate-600 border-slate-200 hover:bg-slate-50"
            onClick={loadData}
            disabled={loading}
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 text-slate-500 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>

          <Button 
            size="sm" 
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
            onClick={handleExportExcel}
          >
            <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" />
            Exportar XLSX
          </Button>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card className="border-slate-100 shadow-sm rounded-xl bg-white p-4">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-semibold text-slate-500 uppercase block">Total Técnicos Ativos</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-2xl font-black text-slate-800 mt-1">{metrics.totalActive}</p>
          <span className="text-[10px] text-slate-400 mt-1 block">Técnicos com presença ativa</span>
        </Card>

        <Card className="border-slate-100 shadow-sm rounded-xl bg-white p-4">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-semibold text-slate-500 uppercase block">Encerramento antes das 10h</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-black text-emerald-600 mt-1">
            {metrics.closedOk}
            <span className="text-xs font-bold text-slate-400 ml-1.5">({metrics.closedOkPct}%)</span>
          </p>
          <span className="text-[10px] text-slate-400 mt-1 block">Fecharam ao menos 1 atividade</span>
        </Card>

        <Card className="border-slate-100 shadow-sm rounded-xl bg-white p-4">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-semibold text-slate-500 uppercase block">Sem Encerramento antes das 10h</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl font-black text-amber-600 mt-1">
            {metrics.missingClosure}
            <span className="text-xs font-bold text-slate-400 ml-1.5">({metrics.missingClosurePct}%)</span>
          </p>
          <span className="text-[10px] text-slate-400 mt-1 block">Exigem justificativa do supervisor</span>
        </Card>

        <Card className="border-slate-100 shadow-sm rounded-xl bg-white p-4">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-semibold text-slate-500 uppercase block">Justificados</span>
            <Lock className="w-4 h-4 text-sky-500" />
          </div>
          <p className="text-2xl font-black text-sky-600 mt-1">
            {metrics.justifiedCount}
            <span className="text-xs font-bold text-slate-400 ml-1.5">de {metrics.missingClosure}</span>
          </p>
          <span className="text-[10px] text-slate-400 mt-1 block">Justificativas salvas e bloqueadas</span>
        </Card>
      </div>

      {/* Filter and Table Panel */}
      <Card className="border-slate-100 shadow-sm bg-white rounded-xl">
        <CardHeader className="pb-4 border-b border-slate-100">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-sm font-bold text-slate-800">Pendências de Justificativas</CardTitle>
              <CardDescription className="text-xs">Lista de colaboradores ativos que necessitam de justificativa na data selecionada</CardDescription>
            </div>

            {/* Filter Group */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Supervisor Filter */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Supervisor:</span>
                <Select value={supervisorFilter} onValueChange={setSupervisorFilter}>
                  <SelectTrigger className="h-8 text-[11px] bg-slate-50 border-slate-200 w-44">
                    <SelectValue placeholder="Filtrar Supervisor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos" className="text-xs">Todos</SelectItem>
                    {supervisorsList.map(s => (
                      <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Coordinator Filter */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Coord:</span>
                <Select value={coordenadorFilter} onValueChange={setCoordenadorFilter}>
                  <SelectTrigger className="h-8 text-[11px] bg-slate-50 border-slate-200 w-44">
                    <SelectValue placeholder="Filtrar Coordenador" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos" className="text-xs">Todos</SelectItem>
                    {coordenadoresList.map(c => (
                      <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Justification State Filter */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Status:</span>
                <Select 
                  value={statusFiltroJustificativa} 
                  onValueChange={(val: any) => setStatusFiltroJustificativa(val)}
                >
                  <SelectTrigger className="h-8 text-[11px] bg-slate-50 border-slate-200 w-36">
                    <SelectValue placeholder="Filtrar Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos" className="text-xs">Todos</SelectItem>
                    <SelectItem value="pendentes" className="text-xs">Pendentes</SelectItem>
                    <SelectItem value="justificados" className="text-xs">Justificados</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Search text input */}
              <div className="relative">
                <Input
                  type="text"
                  placeholder="Buscar TT ou Nome..."
                  className="bg-slate-50 border-slate-200 h-8 text-[11px] pr-8 w-44"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <Search className="absolute right-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
              </div>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="p-0">
          {filteredList.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center justify-center text-slate-400">
              <CheckCircle2 className="w-10 h-10 text-emerald-300 mb-2 animate-bounce" />
              <p className="text-xs font-bold text-slate-600">Nenhuma pendência encontrada</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Todos os colaboradores ativos já fecharam atividades antes das 10h ou as justificativas foram concluídas para os filtros selecionados.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-slate-50/50 border-b border-slate-100">
                <TableRow>
                  <TableHead className="text-xs font-semibold text-slate-600 py-3 pl-6 w-24">Matrícula</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-600 py-3 w-48">Nome do Técnico</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-600 py-3">Supervisor</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-600 py-3">Coord.</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-600 py-3">Setor</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-600 py-3 w-[220px]">Causa Justificativa</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-600 py-3 w-72">Informações Complementares</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-600 py-3 pr-6 text-right w-36">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredList.map((item) => {
                  const isJustified = !!item.justification;
                  const currentForm = formsState[item.tt] || { causa: "", observacao: "" };

                  return (
                    <TableRow key={item.tt} className="border-b border-slate-100 hover:bg-slate-50/20">
                      <TableCell className="text-xs font-bold text-slate-800 py-3 pl-6 font-mono">{item.tt}</TableCell>
                      <TableCell className="text-xs font-semibold text-slate-700 py-3">{item.nome}</TableCell>
                      <TableCell className="text-xs text-slate-500 py-3">{item.supervisor}</TableCell>
                      <TableCell className="text-xs text-slate-500 py-3">{item.coordenador}</TableCell>
                      <TableCell className="text-xs text-slate-500 py-3">{item.setor}</TableCell>
                      
                      {/* CAUSE SELECT / READ-ONLY */}
                      <TableCell className="text-xs py-3">
                        {isJustified ? (
                          <Badge className="bg-sky-50 text-sky-700 border border-sky-200 text-[10px] font-semibold rounded-full px-2 py-0.5">
                            {item.justification!.causa}
                          </Badge>
                        ) : (
                          <Select 
                            value={currentForm.causa} 
                            onValueChange={(val) => handleFormChange(item.tt, "causa", val)}
                          >
                            <SelectTrigger className="h-8 text-[11px] bg-slate-50 border-slate-200 w-44">
                              <SelectValue placeholder="Selecione a Causa..." />
                            </SelectTrigger>
                            <SelectContent>
                              {CAUSAS_PERMITIDAS.map(cause => (
                                <SelectItem key={cause} value={cause} className="text-xs">{cause}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>

                      {/* COMPLEMENTARY INFORMATION */}
                      <TableCell className="text-xs py-3">
                        {isJustified ? (
                          <p className="text-[11px] text-slate-600 line-clamp-2 pr-4">{item.justification!.observacao || "Sem observações."}</p>
                        ) : (
                          <Input
                            type="text"
                            placeholder="Descreva detalhes adicionais..."
                            className="bg-slate-50 border-slate-200 h-8 text-[11px] w-full"
                            value={currentForm.observacao}
                            onChange={(e) => handleFormChange(item.tt, "observacao", e.target.value)}
                          />
                        )}
                      </TableCell>

                      {/* LOCK STATUS & ACTIONS */}
                      <TableCell className="text-xs py-3 pr-6 text-right">
                        {isJustified ? (
                          <div className="flex items-center justify-end gap-2">
                            <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold rounded-full px-2.5 py-0.5 gap-1.5">
                              <Lock className="w-3 h-3 text-emerald-600" />
                              LOCKED
                            </Badge>
                            {isAdmin && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[10px] text-rose-600 border-rose-100 hover:bg-rose-50"
                                onClick={() => handleUnlockJustification(item.justification!.id!)}
                                title="Desbloquear registro (Admin)"
                              >
                                <Unlock className="w-3 h-3 mr-1" />
                                Liberar
                              </Button>
                            )}
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            className="bg-sky-600 hover:bg-sky-700 text-white h-8 text-[11px] rounded-lg shadow-sm"
                            onClick={() => handleSaveJustification(item)}
                          >
                            <Save className="w-3.5 h-3.5 mr-1" />
                            Gravar
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default JustificativaDezHoras;
