import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAccessTracking } from "@/hooks/useAccessTracking";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, Upload, Save, Activity as ActivityIcon, Filter, X, Clock, Plus, Trash2, Download, FileSpreadsheet, Copy, FileText } from "lucide-react";
import * as XLSX from "xlsx";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip as RTooltip, CartesianGrid, Legend,
} from "recharts";

type FatoRow = {
  id: string;
  ds_estado: string | null;
  ds_macro_atividade: string | null;
  matricula_tt: string | null;
  matricula_tr: string | null;
  nome_tecnico: string | null;
  data_atividade: string | null;
  raw: Record<string, unknown> | null;
};

type PresencaRow = {
  tr: string | null;
  tt: string | null;
  funcionario: string | null;
  operadora: string | null;
  supervisor: string | null;
  coordenador: string | null;
  setor_origem: string | null;
  setor_atual: string | null;
  status: string | null;
};

const todayISO = () => new Date().toISOString().slice(0, 10);

function fmtDataNaf(val: string): string {
  if (!val || val.trim() === "") return "";
  const v = val.trim();
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})[\sT]+(\d{2}:\d{2}:\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1].slice(-2)} - ${m[4]}`;
  m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})[\sT]+(\d{2}:\d{2}:\d{2})/);
  if (m) return `${m[1]}/${m[2]}/${m[3].slice(-2)} - ${m[4]}`;
  const d = new Date(v.replace(" ", "T"));
  if (isNaN(d.getTime())) return v;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${pad(d.getFullYear() % 100)} - ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function fmtPotencia(val: string): string {
  if (!val || val.trim() === "") return "";
  const n = parseFloat(val.replace(",", "."));
  if (isNaN(n)) return val;
  return n.toFixed(2).replace(".", ",");
}

// Estados que contam como "Total de Atividades" (em andamento)
const ESTADOS_EM_ANDAMENTO = [
  "atribuído",
  "em deslocamento",
  "não atribuído",
  "recebido",
  "em execução",
];

// Macro atividades que contabilizam presença do técnico quando concluídas com sucesso
const MACROS_PRESENCA_OK = ["INST-FTTH", "MUD-FTTH", "SRV-FTTH", "REP-FTTH"];
const MACRO_PRESENCA_EXCLUIR = "RET-FTTH";

// Status manualmente atribuíveis no Resumo Diário (sobrepostos a cada carga automática).
const STATUS_MANUAL_OPTIONS = [
  "Ativo",
  "Afastado",
  "Atestado",
  "Audiencia",
  "Consulta Medica",
  "Desligado",
  "Duplado",
  "Em Contratação",
  "Falta",
  "Folga",
  "Licença Paternidade",
  "Luto Familiar",
  "Outros",
  "Renovação de CNH",
  "RH",
  "Saude",
  "Sistemico",
  "Técnico de Dados",
  "Treinamento",
  "Veiculo Avaria",
  "Veiculo Manutenção",
];

const norm = (s: string | null | undefined) =>
  (s || "").toString().trim().toLowerCase();

const normTecnico = (s: string | null | undefined) =>
  (s || "").toString().trim().toUpperCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(DE|DO|DA|DOS|DAS)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

type CardFilter =
  | "ALL"
  | "ATIVOS"
  | "EM_ANDAMENTO"
  | "AGENDA_DIA"
  | "PRESENCA_OK"
  | "SEM_PRESENCA"
  | "SEM_ENCERRAMENTO"
  | "SUCESSO"
  | "INSUCESSO"
  | "BAIXA_PROD"
  | "FECHOU_QUALQUER";

const MultiFilter = ({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
}) => {
  const active = value.length > 0;
  const toggle = (opt: string) => {
    if (value.includes(opt)) {
      const next = value.filter((x) => x !== opt);
      onChange(next);
    } else {
      const next = [...value, opt];
      // se selecionar todos => trata como "todos liberados" (limpa)
      if (next.length === options.length) onChange([]);
      else onChange(next);
    }
  };
  const display = !active
    ? <span className="text-muted-foreground">{label}</span>
    : value.length === 1
      ? <span className="truncate">{value[0]}</span>
      : <span className="truncate">{label}: {value.length} selecionados</span>;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`flex h-8 w-[180px] items-center justify-between rounded-md border border-input bg-background px-3 text-xs ${active ? "border-primary/50 bg-primary/5" : ""}`}
        >
          {display}
          <span className="ml-2 opacity-50">▾</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-0" align="start">
        <div className="max-h-[280px] overflow-auto p-1">
          {options.length === 0 && (
            <div className="p-2 text-xs text-muted-foreground">Sem opções</div>
          )}
          {options.map((opt) => {
            const checked = value.includes(opt) || value.length === 0;
            return (
              <label
                key={opt}
                className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent"
              >
                <Checkbox
                  checked={value.length === 0 ? false : checked}
                  onCheckedChange={() => toggle(opt)}
                />
                <span className="truncate">{opt}</span>
              </label>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};

const AtividadesEncerramento = () => {
  const { isAdmin, profile } = useAuth();
  const { toast } = useToast();
  useAccessTracking("/atividades-encerramento", true, "Acompanhamento de Atividades");

  const [date, setDate] = useState<string>(todayISO());
  const [fato, setFato] = useState<FatoRow[]>([]);
  const [presenca, setPresenca] = useState<PresencaRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [lastSyncBy, setLastSyncBy] = useState<string | null>(null);

  // filters (multi-select). Vazio = todos liberados.
  const [estadoFilter, setEstadoFilter] = useState<string[]>([]);
  const [macroFilter, setMacroFilter] = useState<string[]>([]);
  const [supervisorFilter, setSupervisorFilter] = useState<string[]>([]);
  const [coordenadorFilter, setCoordenadorFilter] = useState<string[]>([]);
  const [tecnicoFilter, setTecnicoFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [cardFilter, setCardFilter] = useState<CardFilter>("ALL");
  const [activeTab, setActiveTab] = useState<string>("resumo");
  const [search, setSearch] = useState("");
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);
  const [atividadesTabSearch, setAtividadesTabSearch] = useState("");
  const [atividadesSortConfig, setAtividadesSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);
  const [atividadesResultadoFilter, setAtividadesResultadoFilter] = useState<"ALL" | "SUCESSO" | "INSUCESSO">("ALL");
  const [atividadesMacroFilter, setAtividadesMacroFilter] = useState<string[]>([]);
  const [atividadesProntoExecucaoFilter, setAtividadesProntoExecucaoFilter] = useState<string[]>([]);
  const [atividadesUnicoSaFilter, setAtividadesUnicoSaFilter] = useState<string[]>([]);
  const [atividadesStatusSaFilter, setAtividadesStatusSaFilter] = useState<string[]>([]);
  const [atividadesSetorFilter, setAtividadesSetorFilter] = useState<string[]>([]);
  const [atividadesStatusNafFilter, setAtividadesStatusNafFilter] = useState<string[]>([]);
  const [exportOpen, setExportOpen] = useState(false);

  // Histórico (últimos 60 dias) — usado para o resumo do dia / comparativo dia x mês
  type HistRow = {
    data_atividade: string | null;
    ds_estado: string | null;
    ds_macro_atividade: string | null;
    matricula_tt: string | null;
    nome_tecnico: string | null;
  };
  const [historico, setHistorico] = useState<HistRow[]>([]);
  const [loadingHist, setLoadingHist] = useState(false);

  const matchFilter = (val: string | null | undefined, filter: string[]) => {
    if (!filter || filter.length === 0) return true;
    const v = (val || "").trim().toUpperCase();
    return filter.some((f) => v === f.toUpperCase());
  };

  // Helpers para ler raw
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

  const isSC = (r: FatoRow): boolean => {
    const uf = getRawStr(r, ["cd_uf", "uf", "sg_uf", "estado", "ds_estado_sigla"]).trim().toUpperCase();
    // Se o estado estiver vazio, nulo ou for SC, permitimos.
    return !uf || uf === "" || uf === "SC" || uf === "S/C";
  };

  // Atividade considerada "agendada para o dia": dh_inicio_agendamento cai na data selecionada
  const isAgendadaParaDia = (r: FatoRow): boolean => {
    const v = getRawStr(r, ["dh_inicio_agendamento", "dh inicio agendamento"]);
    if (!v) return false;
    // Extrair YYYY-MM-DD
    let s = v.trim();
    // formato dd/MM/yyyy ...
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    let iso = "";
    if (m) {
      iso = `${m[3]}-${m[2]}-${m[1]}`;
    } else {
      // ISO-like
      s = s.replace(/\s+(UTC|GMT)\s*$/i, "Z").replace(" ", "T");
      const d = new Date(s);
      if (!isNaN(d.getTime())) iso = d.toISOString().slice(0, 10);
    }
    return iso === date;
  };

  // settings
  const [csvUrl, setCsvUrl] = useState("");
  const [savingUrl, setSavingUrl] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const fatoFileRef = useRef<HTMLInputElement>(null);
  const [uploadingFato, setUploadingFato] = useState(false);

  // Sync schedule settings
  type SyncMode = "comercial" | "hourly" | "daily" | "custom";
  type SyncSchedule = {
    mode: SyncMode;
    intervalMinutes: number;       // for hourly mode (minutes between runs)
    businessStart: string;          // "HH:MM"
    businessEnd: string;            // "HH:MM"
    businessIntervalMinutes: number;// for comercial mode
    dailyTime: string;              // "HH:MM" for daily mode
    customTimes: string[];          // ["HH:MM", ...] for custom mode
    weekdaysOnly: boolean;
    enabled: boolean;
  };
  const defaultSchedule: SyncSchedule = {
    mode: "comercial",
    intervalMinutes: 60,
    businessStart: "08:00",
    businessEnd: "18:00",
    businessIntervalMinutes: 60,
    dailyTime: "08:00",
    customTimes: ["08:00", "12:00", "18:00"],
    weekdaysOnly: true,
    enabled: true,
  };
  const [schedule, setSchedule] = useState<SyncSchedule>(defaultSchedule);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [newCustomTime, setNewCustomTime] = useState("08:00");

  const loadSchedule = async () => {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "atividades_sync_schedule")
      .maybeSingle();
    if (data?.value && typeof data.value === "object") {
      setSchedule({ ...defaultSchedule, ...(data.value as Partial<SyncSchedule>) });
    }
  };

  const saveSchedule = async () => {
    setSavingSchedule(true);
    try {
      const { data: existing } = await supabase
        .from("app_settings")
        .select("id")
        .eq("key", "atividades_sync_schedule")
        .maybeSingle();
      if (existing) {
        await supabase
          .from("app_settings")
          .update({ value: schedule as any, updated_by: profile?.user_id })
          .eq("key", "atividades_sync_schedule");
      } else {
        await supabase.from("app_settings").insert({
          key: "atividades_sync_schedule",
          value: schedule as any,
          updated_by: profile?.user_id,
        });
      }
      toast({ title: "Configuração de sincronismo salva" });
    } catch (e) {
      toast({
        title: "Erro ao salvar configuração",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setSavingSchedule(false);
    }
  };

  // Compute a human-readable summary + cron expression preview
  const scheduleSummary = useMemo(() => {
    if (!schedule.enabled) return "Sincronismo automático desativado.";
    const dow = schedule.weekdaysOnly ? "Seg–Sex" : "Todos os dias";
    switch (schedule.mode) {
      case "comercial":
        return `Horário comercial (${schedule.businessStart}–${schedule.businessEnd}) a cada ${schedule.businessIntervalMinutes} min — ${dow}.`;
      case "hourly":
        return `A cada ${schedule.intervalMinutes} minuto(s) — ${dow}, 24h.`;
      case "daily":
        return `Uma vez por dia às ${schedule.dailyTime} — ${dow}.`;
      case "custom":
        return `Horários específicos: ${schedule.customTimes.join(", ") || "—"} — ${dow}.`;
    }
  }, [schedule]);

  const cronPreview = useMemo(() => {
    const dow = schedule.weekdaysOnly ? "1-5" : "*";
    switch (schedule.mode) {
      case "comercial": {
        const sh = parseInt(schedule.businessStart.split(":")[0] || "8", 10);
        const eh = parseInt(schedule.businessEnd.split(":")[0] || "18", 10);
        const m = `*/${Math.max(1, schedule.businessIntervalMinutes)}`;
        return `${m} ${sh}-${eh} * * ${dow}`;
      }
      case "hourly":
        return `*/${Math.max(1, schedule.intervalMinutes)} * * * ${dow}`;
      case "daily": {
        const [hh, mm] = schedule.dailyTime.split(":");
        return `${parseInt(mm || "0", 10)} ${parseInt(hh || "8", 10)} * * ${dow}`;
      }
      case "custom": {
        const byHour = new Map<number, number[]>();
        schedule.customTimes.forEach((t) => {
          const [h, m] = t.split(":").map((x) => parseInt(x, 10));
          if (!byHour.has(h)) byHour.set(h, []);
          byHour.get(h)!.push(m);
        });
        const hours = Array.from(byHour.keys()).sort((a, b) => a - b).join(",");
        const mins = Array.from(new Set(schedule.customTimes.map((t) => parseInt(t.split(":")[1], 10)))).sort((a, b) => a - b).join(",");
        return `${mins || 0} ${hours || "*"} * * ${dow}`;
      }
    }
  }, [schedule]);

  const addCustomTime = () => {
    if (!/^\d{2}:\d{2}$/.test(newCustomTime)) return;
    if (schedule.customTimes.includes(newCustomTime)) return;
    setSchedule({
      ...schedule,
      customTimes: [...schedule.customTimes, newCustomTime].sort(),
    });
  };
  const removeCustomTime = (t: string) => {
    setSchedule({ ...schedule, customTimes: schedule.customTimes.filter((x) => x !== t) });
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [{ data: f }, { data: p }, { data: log }] = await Promise.all([
        supabase
          .from("atividades_fato")
          .select("id, ds_estado, ds_macro_atividade, matricula_tt, matricula_tr, nome_tecnico, data_atividade, raw")
          .eq("data_atividade", date)
          .limit(10000),
        supabase
          .from("tecnicos_presenca")
          .select("tr, tt, funcionario, operadora, supervisor, coordenador, setor_origem, setor_atual, status")
          .limit(10000),
        supabase
          .from("atividades_sync_log")
          .select("finished_at, status, triggered_by")
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      // Filtrar técnicos com "BUFFER" ou "EXTERNO" no nome (sai do relatório inteiro)
      const cleaned = ((f || []) as FatoRow[]).filter((r) => {
        const n = (r.nome_tecnico || "").toUpperCase();
        return !n.includes("BUFFER") && !n.includes("EXTERNO");
      });
      setFato(cleaned);
      const cleanedPresenca = ((p || []) as PresencaRow[]).filter((r) => {
        const n = (r.funcionario || "").toUpperCase();
        return !n.includes("BUFFER") && !n.includes("EXTERNO");
      });
      setPresenca(cleanedPresenca);
      setLastSync(log?.finished_at ?? null);
      setLastSyncBy((log as { triggered_by?: string } | null)?.triggered_by ?? null);
    } finally {
      setLoading(false);
    }
  };

  const loadSettings = async () => {
    // This function is kept for signature compatibility but no longer fetches FATO CSV URL.
  };

  // Atualiza manualmente o Status do técnico no Resumo Diário.
  // O valor é gravado em tecnicos_presenca (Dimensão) e sobreposto na próxima carga automática.
  // "Ativo" é armazenado como string vazia (convenção existente).
  const handleManualStatusChange = async (tt: string, novoStatus: string) => {
    const ttKey = (tt || "").trim();
    if (!ttKey) {
      toast({ title: "Não foi possível alterar", description: "Técnico sem matrícula (TT).", variant: "destructive" });
      return;
    }
    const valorBanco = novoStatus === "Ativo" ? "" : novoStatus;
    // Atualiza otimista localmente
    setPresenca((prev) =>
      prev.map((p) =>
        (p.tt || "").trim().toUpperCase() === ttKey.toUpperCase()
          ? { ...p, status: valorBanco }
          : p,
      ),
    );
    const { error } = await supabase
      .from("tecnicos_presenca")
      .update({ status: valorBanco })
      .eq("tt", ttKey);
    if (error) {
      toast({ title: "Erro ao salvar status", description: error.message, variant: "destructive" });
      // Recarrega para reverter
      loadData();
    } else {
      toast({ title: "Status atualizado", description: `${novoStatus}` });
    }
  };

  // Carrega últimos 60 dias para o resumo histórico (cálculo on-the-fly)
  const loadHistorico = async () => {
    setLoadingHist(true);
    try {
      const start = new Date();
      start.setDate(start.getDate() - 60);
      const startISO = start.toISOString().slice(0, 10);
      const { data } = await supabase
        .from("atividades_fato")
        .select("data_atividade, ds_estado, ds_macro_atividade, matricula_tt, nome_tecnico")
        .gte("data_atividade", startISO)
        .limit(200000);
      const cleaned = ((data || []) as HistRow[]).filter((r) => {
        const n = (r.nome_tecnico || "").toUpperCase();
        return !n.includes("BUFFER") && !n.includes("EXTERNO");
      });
      setHistorico(cleaned);
    } finally {
      setLoadingHist(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [date]);

  useEffect(() => {
    loadHistorico();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-refresh do painel quando uma sincronização automática (cron/auto-*)
  // grava no atividades_sync_log. Aguarda 15s para garantir que o INSERT na
  // tabela atividades_fato terminou e então recarrega dados + histórico.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel("atividades-sync-log-auto")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "atividades_sync_log" },
        (payload) => {
          const by = ((payload.new as { triggered_by?: string } | null)?.triggered_by || "").toLowerCase();
          const isAuto = by === "cron" || by.startsWith("auto");
          if (!isAuto) return;
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            loadData();
            loadHistorico();
          }, 15000);
        },
      )
      .subscribe();
    // Polling de segurança a cada 60s para refletir o último log mesmo
    // quando o realtime não estiver disponível.
    const poll = setInterval(() => {
      supabase
        .from("atividades_sync_log")
        .select("finished_at, triggered_by, status")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data }) => {
          if (!data?.finished_at) return;
          const newSync = data.finished_at as string;
          if (newSync !== lastSync) {
            const by = ((data as { triggered_by?: string }).triggered_by || "").toLowerCase();
            const isAuto = by === "cron" || by.startsWith("auto");
            setLastSync(newSync);
            setLastSyncBy((data as { triggered_by?: string }).triggered_by ?? null);
            if (isAuto) {
              loadData();
              loadHistorico();
            }
          }
        });
    }, 60000);
    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSync]);

  useEffect(() => {
    if (isAdmin) loadSettings();
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin) loadSchedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  // unique values for filters
  const estados = useMemo(() => {
    const s = new Set<string>();
    fato.forEach((r) => r.ds_estado && s.add(r.ds_estado));
    return Array.from(s).sort();
  }, [fato]);

  const macros = useMemo(() => {
    const s = new Set<string>();
    fato.forEach((r) => r.ds_macro_atividade && s.add(r.ds_macro_atividade));
    return Array.from(s).sort();
  }, [fato]);

  // map presença by TT and TR (for join)
  const presencaByTT = useMemo(() => {
    const m = new Map<string, PresencaRow>();
    presenca.forEach((p) => {
      if (p.tt) m.set(p.tt.trim().toUpperCase(), p);
    });
    return m;
  }, [presenca]);

  const presencaByTR = useMemo(() => {
    const m = new Map<string, PresencaRow>();
    presenca.forEach((p) => {
      if (p.tr) m.set(p.tr.trim().toUpperCase(), p);
    });
    return m;
  }, [presenca]);

  const presencaByNome = useMemo(() => {
    const m = new Map<string, PresencaRow>();
    presenca.forEach((p) => {
      if (p.funcionario) {
        const key = (p.funcionario || "").trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
        if (key) m.set(key, p);
      }
    });
    return m;
  }, [presenca]);

  // Helper para obter info de presença de um registro fato
  const getPresencaInfo = (r: FatoRow): PresencaRow | null => {
    const ttKey = (r.matricula_tt || "").trim().toUpperCase();
    const trKey = (r.matricula_tr || "").trim().toUpperCase();
    const nomeKey = (r.nome_tecnico || "").trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
    
    return (
      (ttKey && presencaByTT.get(ttKey)) ||
      (trKey && presencaByTR.get(trKey)) ||
      (nomeKey && presencaByNome.get(nomeKey)) ||
      (ttKey && presencaByTR.get(ttKey)) ||
      (trKey && presencaByTT.get(trKey)) ||
      null
    );
  };

  // Listas únicas de Supervisor / Coordenador a partir da Presença
  const supervisores = useMemo(() => {
    const s = new Set<string>();
    presenca.forEach((p) => {
      if (!matchFilter(p.coordenador, coordenadorFilter)) return;
      if (p.supervisor) s.add(p.supervisor.trim().toUpperCase());
    });
    return Array.from(s).filter(Boolean).sort();
  }, [presenca, coordenadorFilter]);

  const coordenadores = useMemo(() => {
    const s = new Set<string>();
    presenca.forEach((p) => p.coordenador && s.add(p.coordenador.trim().toUpperCase()));
    return Array.from(s).filter(Boolean).sort();
  }, [presenca]);

  const statuses = useMemo(() => {
    const s = new Set<string>();
    presenca.forEach((p) => {
      if (!matchFilter(p.coordenador, coordenadorFilter)) return;
      if (!matchFilter(p.supervisor, supervisorFilter)) return;
      if (!matchFilter(p.funcionario, tecnicoFilter)) return;
      const stat = (p.status || "").trim();
      s.add(stat === "" ? "Ativo" : stat);
    });
    s.add("Ativo");
    return Array.from(s).sort();
  }, [presenca, coordenadorFilter, supervisorFilter, tecnicoFilter]);

  const tecnicos = useMemo(() => {
    const s = new Set<string>();
    presenca.forEach((p) => {
      if (!matchFilter(p.coordenador, coordenadorFilter)) return;
      if (!matchFilter(p.supervisor, supervisorFilter)) return;
      if (p.funcionario) s.add(p.funcionario.trim().toUpperCase());
    });
    fato.forEach((r) => {
      const info = getPresencaInfo(r);
      if (!matchFilter(info?.coordenador, coordenadorFilter)) return;
      if (!matchFilter(info?.supervisor, supervisorFilter)) return;
      if (r.nome_tecnico) s.add(r.nome_tecnico.trim().toUpperCase());
    });
    return Array.from(s).filter(Boolean).sort();
  }, [presenca, fato, coordenadorFilter, supervisorFilter, presencaByTT, presencaByTR]);


  // Conjunto de nomes de técnicos ativos na presença (status em branco/vazio)
  const ttsAtivos = useMemo(() => {
    const s = new Set<string>();
    presenca.forEach((p) => {
      if (!matchFilter(p.coordenador, coordenadorFilter)) return;
      if (!matchFilter(p.supervisor, supervisorFilter)) return;
      if (!matchFilter(p.funcionario, tecnicoFilter)) return;
      
      const stat = (p.status || "").trim();
      const effStat = stat === "" ? "Ativo" : stat;
      if (!matchFilter(effStat, statusFilter)) return;

      const nameKey = normTecnico(p.funcionario);
      if (!stat && nameKey) s.add(nameKey);
    });
    return s;
  }, [presenca, coordenadorFilter, supervisorFilter, tecnicoFilter, statusFilter]);

  // Conjunto de nomes de técnicos cujo Status na planilha Dimensão (tecnicos_presenca)
  // é "Técnico de Dados".
  const ttsTecnicoDeDados = useMemo(() => {
    const s = new Set<string>();
    presenca.forEach((p) => {
      const stat = (p.status || "").trim().toLowerCase();
      if (stat !== "técnico de dados" && stat !== "tecnico de dados") return;
      const nameKey = normTecnico(p.funcionario);
      if (nameKey) s.add(nameKey);
    });
    return s;
  }, [presenca]);

  // Conjunto de nomes de técnicos que fecharam ao menos 1 atividade OK (presença efetiva)
  const ttsPresencaOK = useMemo(() => {
    const s = new Set<string>();
    fato.forEach((r) => {
      const info = getPresencaInfo(r);
      if (!matchFilter(info?.coordenador, coordenadorFilter)) return;
      if (!matchFilter(info?.supervisor, supervisorFilter)) return;
      if (!matchFilter(info?.funcionario, tecnicoFilter) && !matchFilter(r.nome_tecnico, tecnicoFilter)) return;

      const stat = info ? ((info.status || "").trim() === "" ? "Ativo" : info.status) : "Ativo";
      if (!matchFilter(stat, statusFilter)) return;

      const estado = norm(r.ds_estado);
      const macro = (r.ds_macro_atividade || "").trim().toUpperCase();
      if (
        estado.includes("conclu") &&
        estado.includes("sucesso") &&
        !estado.includes("sem sucesso") &&
        MACROS_PRESENCA_OK.includes(macro) &&
        macro !== MACRO_PRESENCA_EXCLUIR
      ) {
        const nameKey = info ? normTecnico(info.funcionario) : normTecnico(r.nome_tecnico);
        if (nameKey) s.add(nameKey);
      }
    });
    return s;
  }, [fato, coordenadorFilter, supervisorFilter, tecnicoFilter, statusFilter, presencaByTT, presencaByTR, presencaByNome]);

  const ttsComAtividade = useMemo(() => {
    const s = new Set<string>();
    fato.forEach((r) => {
      const info = getPresencaInfo(r);
      if (!matchFilter(info?.coordenador, coordenadorFilter)) return;
      if (!matchFilter(info?.supervisor, supervisorFilter)) return;
      if (!matchFilter(info?.funcionario, tecnicoFilter) && !matchFilter(r.nome_tecnico, tecnicoFilter)) return;

      const stat = info ? ((info.status || "").trim() === "" ? "Ativo" : info.status) : "Ativo";
      if (!matchFilter(stat, statusFilter)) return;

      const nameKey = info ? normTecnico(info.funcionario) : normTecnico(r.nome_tecnico);
      if (nameKey) s.add(nameKey);
    });
    return s;
  }, [fato, coordenadorFilter, supervisorFilter, tecnicoFilter, statusFilter, presencaByTT, presencaByTR, presencaByNome]);

  // Técnicos SEM PRESENÇA confirmada
  const ttsSemPresenca = useMemo(() => {
    const s = new Set<string>();
    presenca.forEach((p) => {
      if (!matchFilter(p.coordenador, coordenadorFilter)) return;
      if (!matchFilter(p.supervisor, supervisorFilter)) return;
      if (!matchFilter(p.funcionario, tecnicoFilter)) return;

      const statRaw = (p.status || "").trim();
      const effStat = statRaw === "" ? "Ativo" : statRaw;
      if (!matchFilter(effStat, statusFilter)) return;

      const nameKey = normTecnico(p.funcionario);
      if (!nameKey || nameKey.includes("BUFFER") || nameKey.includes("EXTERNO")) return;
      if (statRaw) return;

      // Se já confirmou presença, não entra no grupo "Sem Presença"
      if (ttsPresencaOK.has(nameKey)) return;

      s.add(nameKey);
    });
    return s;
  }, [presenca, ttsPresencaOK, coordenadorFilter, supervisorFilter, tecnicoFilter, statusFilter]);

  const ttsComSucesso = useMemo(() => {
    const s = new Set<string>();
    fato.forEach((r) => {
      const estado = norm(r.ds_estado);
      if (estado.includes("conclu") && estado.includes("sucesso") && !estado.includes("sem sucesso")) {
        const info = getPresencaInfo(r);
        const nameKey = info ? normTecnico(info.funcionario) : normTecnico(r.nome_tecnico);
        if (nameKey) s.add(nameKey);
      }
    });
    return s;
  }, [fato, presencaByTT, presencaByTR, presencaByNome]);

  const ttsComInsucesso = useMemo(() => {
    const s = new Set<string>();
    fato.forEach((r) => {
      const estado = norm(r.ds_estado);
      if (estado.includes("conclu") && estado.includes("sem sucesso")) {
        const info = getPresencaInfo(r);
        const nameKey = info ? normTecnico(info.funcionario) : normTecnico(r.nome_tecnico);
        if (nameKey) s.add(nameKey);
      }
    });
    return s;
  }, [fato, presencaByTT, presencaByTR, presencaByNome]);

  const ttsComFechamento = useMemo(() => {
    const s = new Set<string>();
    fato.forEach((r) => {
      if (!isSC(r)) return;
      const estado = norm(r.ds_estado);
      const isConcluida = estado.includes("conclu");
      const isFechadoWfm = estado.includes("wfm");
      const isFechada = isConcluida || isFechadoWfm;
      if (!isFechada) return;
      
      const info = getPresencaInfo(r);
      const nameKey = info ? normTecnico(info.funcionario) : normTecnico(r.nome_tecnico);
      if (nameKey) s.add(nameKey);
    });
    return s;
  }, [fato, presencaByTT, presencaByTR, presencaByNome]);

  // Técnicos que fecharam QUALQUER atividade no dia — Concluído (com/sem sucesso)
  // somado ao status "Fechado em WFM" (qualquer estado contendo WFM). Sem regra de presença ou macro.
  const ttsFechouQualquer = useMemo(() => {
    const s = new Set<string>();
    fato.forEach((r) => {
      const estado = norm(r.ds_estado);
      const isConcluida = estado.includes("conclu");
      const isFechadoWfm = estado.includes("wfm");
      if (!isConcluida && !isFechadoWfm) return;
      const info = getPresencaInfo(r);
      const nameKey = info ? normTecnico(info.funcionario) : normTecnico(r.nome_tecnico);
      if (nameKey) s.add(nameKey);
    });
    return s;
  }, [fato, presencaByTT, presencaByTR, presencaByNome]);

  // Conjunto de nomes de técnicos com atividade EM ANDAMENTO
  const ttsEmAndamento = useMemo(() => {
    const s = new Set<string>();
    fato.forEach((r) => {
      if (!isSC(r)) return;
      if (!ESTADOS_EM_ANDAMENTO.includes(norm(r.ds_estado))) return;
      const info = getPresencaInfo(r);
      const nameKey = info ? normTecnico(info.funcionario) : normTecnico(r.nome_tecnico);
      if (nameKey) s.add(nameKey);
    });
    return s;
  }, [fato, presencaByTT, presencaByTR, presencaByNome]);

  // Conjunto de nomes de técnicos com atividade AGENDADA PARA O DIA
  const ttsAgendaDia = useMemo(() => {
    const s = new Set<string>();
    fato.forEach((r) => {
      if (!isSC(r)) return;
      if (!isAgendadaParaDia(r)) return;
      const info = getPresencaInfo(r);
      const nameKey = info ? normTecnico(info.funcionario) : normTecnico(r.nome_tecnico);
      if (nameKey) s.add(nameKey);
    });
    return s;
  }, [fato, presencaByTT, presencaByTR, presencaByNome, date]);

  // Técnicos SEM ENCERRAMENTO (P0 — Produção Zero)
  const ttsSemEncerramento = useMemo(() => {
    const s = new Set<string>();
    presenca.forEach((p) => {
      if (!matchFilter(p.coordenador, coordenadorFilter)) return;
      if (!matchFilter(p.supervisor, supervisorFilter)) return;
      if (!matchFilter(p.funcionario, tecnicoFilter)) return;
      const statRaw = (p.status || "").trim();
      const effStat = statRaw === "" ? "Ativo" : statRaw;
      if (!matchFilter(effStat, statusFilter)) return;
      
      const nameKey = normTecnico(p.funcionario);
      if (!nameKey || nameKey.includes("BUFFER") || nameKey.includes("EXTERNO")) return;
      if (statRaw) return;
      
      if (ttsComFechamento.has(nameKey)) return;
      
      s.add(nameKey);
    });
    return s;
  }, [presenca, ttsComFechamento, coordenadorFilter, supervisorFilter, tecnicoFilter, statusFilter]);


  // Técnicos com BAIXA PRODUTIVIDADE no dia: fecharam <= 3 atividades (sucesso + insucesso).
  // Considera apenas técnicos presentes na escala (presenca) e respeita filtros globais
  // de coordenador/supervisor/técnico/status. Não depende de cardFilter para evitar recursão.
  const ttsBaixaProd = useMemo(() => {
    const counts = new Map<string, number>();
    fato.forEach((r) => {
      if (!isSC(r)) return;
      const estado = norm(r.ds_estado);
      const fechada = estado.includes("conclu"); // sucesso + sem sucesso
      if (!fechada) return;
      const info = getPresencaInfo(r);
      const nameKey = info ? normTecnico(info.funcionario) : normTecnico(r.nome_tecnico);
      if (!nameKey) return;
      counts.set(nameKey, (counts.get(nameKey) || 0) + 1);
    });
    const s = new Set<string>();
    const considered = new Set<string>();
    presenca.forEach((p) => {
      if (!matchFilter(p.coordenador, coordenadorFilter)) return;
      if (!matchFilter(p.supervisor, supervisorFilter)) return;
      if (!matchFilter(p.funcionario, tecnicoFilter)) return;
      const effStat = (p.status || "").trim() === "" ? "Ativo" : p.status;
      if (!matchFilter(effStat, statusFilter)) return;
      const nameKey = normTecnico(p.funcionario);
      if (!nameKey || nameKey.includes("BUFFER") || nameKey.includes("EXTERNO")) return;
      // Base: técnicos ATIVOS e com PRESENÇA CONFIRMADA (atuando no dia).
      if (!ttsAtivos.has(nameKey)) return;
      if (!ttsPresencaOK.has(nameKey)) return;
      considered.add(nameKey);
      const c = counts.get(nameKey) || 0;
      if (c <= 3) s.add(nameKey);
    });
    // Acréscimo: técnicos que fecharam atividades mas NÃO estão na base de presença
    // (saíram da presença ou não constam) — também contam para a visão do dia.
    counts.forEach((c, nameKey) => {
      if (considered.has(nameKey)) return;
      if (!nameKey || nameKey.includes("BUFFER") || nameKey.includes("EXTERNO")) return;
      if (c > 0 && c <= 3) s.add(nameKey);
    });
    return s;
  }, [fato, presenca, presencaByTT, presencaByTR, presencaByNome, coordenadorFilter, supervisorFilter, tecnicoFilter, statusFilter, ttsAtivos, ttsPresencaOK]);


  // filtered fato (estados/macros + supervisor/coordenador + cardFilter)
  const filteredFato = useMemo(() => {
    return fato.filter((r) => {
      // sempre filtra UF=SC (quando informado)
      if (!isSC(r)) return false;
      if (!matchFilter(r.ds_estado, estadoFilter)) return false;
      if (!matchFilter(r.ds_macro_atividade, macroFilter)) return false;

      const info = getPresencaInfo(r);
      if (!matchFilter(info?.supervisor, supervisorFilter)) return false;
      if (!matchFilter(info?.coordenador, coordenadorFilter)) return false;
      if (!matchFilter(info?.funcionario, tecnicoFilter) && !matchFilter(r.nome_tecnico, tecnicoFilter)) return false;

      const stat = info ? ((info.status || "").trim() === "" ? "Ativo" : info.status) : "Ativo";
      if (!matchFilter(stat, statusFilter)) return false;

      if (cardFilter === "EM_ANDAMENTO") {
        const info = getPresencaInfo(r);
        const nameKey = info ? normTecnico(info.funcionario) : normTecnico(r.nome_tecnico);
        if (!nameKey || !ttsEmAndamento.has(nameKey)) return false;
      } else if (cardFilter === "AGENDA_DIA") {
        const info = getPresencaInfo(r);
        const nameKey = info ? normTecnico(info.funcionario) : normTecnico(r.nome_tecnico);
        if (!nameKey || !ttsAgendaDia.has(nameKey)) return false;
      } else if (cardFilter === "PRESENCA_OK") {
        const info = getPresencaInfo(r);
        const nameKey = info ? normTecnico(info.funcionario) : normTecnico(r.nome_tecnico);
        if (!nameKey || !ttsPresencaOK.has(nameKey)) return false;
      } else if (cardFilter === "ATIVOS") {
        const info = getPresencaInfo(r);
        const nameKey = info ? normTecnico(info.funcionario) : normTecnico(r.nome_tecnico);
        if (!nameKey || !ttsAtivos.has(nameKey)) return false;
      } else if (cardFilter === "SEM_PRESENCA") {
        const info = getPresencaInfo(r);
        const nameKey = info ? normTecnico(info.funcionario) : normTecnico(r.nome_tecnico);
        if (!nameKey || !ttsSemPresenca.has(nameKey)) return false;
      } else if (cardFilter === "SEM_ENCERRAMENTO") {
        const info = getPresencaInfo(r);
        const nameKey = info ? normTecnico(info.funcionario) : normTecnico(r.nome_tecnico);
        if (!nameKey || !ttsSemEncerramento.has(nameKey)) return false;
      } else if (cardFilter === "SUCESSO") {
        const info = getPresencaInfo(r);
        const nameKey = info ? normTecnico(info.funcionario) : normTecnico(r.nome_tecnico);
        if (!nameKey || !ttsComSucesso.has(nameKey)) return false;
      } else if (cardFilter === "INSUCESSO") {
        const info = getPresencaInfo(r);
        const nameKey = info ? normTecnico(info.funcionario) : normTecnico(r.nome_tecnico);
        if (!nameKey || !ttsComInsucesso.has(nameKey)) return false;
      } else if (cardFilter === "BAIXA_PROD") {
        const info = getPresencaInfo(r);
        const nameKey = info ? normTecnico(info.funcionario) : normTecnico(r.nome_tecnico);
        if (!nameKey || !ttsBaixaProd.has(nameKey)) return false;
      } else if (cardFilter === "FECHOU_QUALQUER") {
        const info = getPresencaInfo(r);
        const nameKey = info ? normTecnico(info.funcionario) : normTecnico(r.nome_tecnico);
        if (!nameKey || !ttsFechouQualquer.has(nameKey)) return false;
      }
      return true;
    });
  }, [fato, estadoFilter, macroFilter, supervisorFilter, coordenadorFilter, tecnicoFilter, statusFilter, cardFilter, presencaByTT, presencaByTR, presencaByNome, ttsAtivos, ttsSemPresenca, ttsSemEncerramento, ttsComSucesso, ttsComInsucesso, ttsBaixaProd, ttsFechouQualquer, date]);

  // Aggregate per technician (only "Ativo" status counted; mas mostra todos)
  const aggregated = useMemo(() => {
    const map = new Map<
      string,
      {
        tt: string;
        tr: string;
        nome: string;
        operadora: string;
        supervisor: string;
        coordenador: string;
        setor_atual: string;
        status: string;
        sucesso: number;
        insucesso: number;
        outros: Record<string, number>;
        total: number;
      }
    >();

    const initTecnico = (p: PresencaRow) => {
      const nomeKey = normTecnico(p.funcionario);
      if (!nomeKey) return; // não exibir técnicos sem nome
      const ttKey = (p.tt || "").trim().toUpperCase();
      const trKey = (p.tr || "").trim().toUpperCase();

      const key = nomeKey;

      if (!map.has(key)) {
        map.set(key, {
          tt: ttKey,
          tr: trKey,
          nome: p.funcionario || "—",
          operadora: p.operadora || "",
          supervisor: p.supervisor || "",
          coordenador: p.coordenador || "",
          setor_atual: p.setor_atual || "",
          status: (p.status || "").trim() === "" ? "Ativo" : p.status,
          sucesso: 0,
          insucesso: 0,
          outros: {},
          total: 0,
        });
      } else {
        const existing = map.get(key)!;
        if (!existing.tt && ttKey) existing.tt = ttKey;
        if (!existing.tr && trKey) existing.tr = trKey;
      }
    };

    // Pré-popular o map com técnicos da planilha de presença baseados no filtro do card.
    // Assim, se um técnico não tem NENHUMA atividade no Fato, ele ainda aparece com total=0
    presenca.forEach((p) => {
      if (!matchFilter(p.coordenador, coordenadorFilter)) return;
      if (!matchFilter(p.supervisor, supervisorFilter)) return;
      if (!matchFilter(p.funcionario, tecnicoFilter)) return;

      const stat = (p.status || "").trim() === "" ? "Ativo" : p.status;
      if (!matchFilter(stat, statusFilter)) return;

      const nameKey = normTecnico(p.funcionario);
      if (!nameKey) return;

      if (cardFilter === "SEM_PRESENCA") {
        if (ttsSemPresenca.has(nameKey)) initTecnico(p);
      } else if (cardFilter === "SEM_ENCERRAMENTO") {
        if (ttsSemEncerramento.has(nameKey)) initTecnico(p);
      } else if (cardFilter === "EM_ANDAMENTO") {
        if (ttsEmAndamento.has(nameKey)) initTecnico(p);
      } else if (cardFilter === "AGENDA_DIA") {
        if (ttsAgendaDia.has(nameKey)) initTecnico(p);
      } else if (cardFilter === "ATIVOS") {
        if (ttsAtivos.has(nameKey)) initTecnico(p);
      } else if (cardFilter === "PRESENCA_OK") {
        if (ttsPresencaOK.has(nameKey)) initTecnico(p);
      } else if (cardFilter === "BAIXA_PROD") {
        if (ttsBaixaProd.has(nameKey)) initTecnico(p);
      } else if (cardFilter === "FECHOU_QUALQUER") {
        if (ttsFechouQualquer.has(nameKey)) initTecnico(p);
      } else if (cardFilter === "ALL") {
        initTecnico(p);
      }
    });

    filteredFato.forEach((r) => {
      const ttKey = (r.matricula_tt || "").trim().toUpperCase();
      const trKey = (r.matricula_tr || "").trim().toUpperCase();
      const presencaInfo = getPresencaInfo(r);

      // Técnicos que não estão na planilha Dimensão (presença) não devem aparecer no relatório
      if (!presencaInfo) return;
      // Ignorar registros sem nome de técnico na presença
      if (!(presencaInfo.funcionario || "").trim()) return;

      const nomeFato = (r.nome_tecnico || "").trim().toUpperCase();
      const nomePresenca = (presencaInfo?.funcionario || "").trim().toUpperCase();
      
      const pTT = (presencaInfo?.tt || "").trim().toUpperCase();
      const pTR = (presencaInfo?.tr || "").trim().toUpperCase();

      const finalNome = nomePresenca || nomeFato || "SEM_TECNICO";
      const finalTT = pTT || ttKey;
      const finalTR = pTR || trKey;

      const normFinalNome = normTecnico(finalNome);

      const key = normFinalNome !== "SEM_TECNICO" ? normFinalNome : (finalTT || finalTR || "SEM_TECNICO");

      if (!map.has(key)) {
        map.set(key, {
          tt: finalTT,
          tr: finalTR,
          nome: presencaInfo?.funcionario || r.nome_tecnico || "—",
          operadora: presencaInfo?.operadora || "",
          supervisor: presencaInfo?.supervisor || "",
          coordenador: presencaInfo?.coordenador || "",
          setor_atual: presencaInfo?.setor_atual || "",
          status: presencaInfo ? ((presencaInfo.status || "").trim() === "" ? "Ativo" : presencaInfo.status) : "",
          sucesso: 0,
          insucesso: 0,
          outros: {},
          total: 0,
        });
      }
      
      const row = map.get(key)!;
      if (!row.tt && (ttKey || presencaInfo?.tt)) row.tt = (ttKey || presencaInfo?.tt) as string;
      if (!row.tr && (trKey || presencaInfo?.tr)) row.tr = (trKey || presencaInfo?.tr) as string;

      const estado = (r.ds_estado || "").toLowerCase();
      if (estado.includes("conclu") && estado.includes("sem sucesso")) {
        row.insucesso++;
      } else if (estado.includes("conclu") && estado.includes("sucesso")) {
        row.sucesso++;
      } else {
        const e = r.ds_estado || "Outros";
        row.outros[e] = (row.outros[e] || 0) + 1;
      }
      row.total++;
    });

    let arr = Array.from(map.values());
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      arr = arr.filter(
        (x) =>
          x.nome.toLowerCase().includes(q) ||
          x.tt.toLowerCase().includes(q) ||
          x.tr.toLowerCase().includes(q) ||
          x.supervisor.toLowerCase().includes(q) ||
          x.coordenador.toLowerCase().includes(q),
      );
    }

    if (sortConfig) {
      arr.sort((a: any, b: any) => {
        let aVal = a[sortConfig.key];
        let bVal = b[sortConfig.key];
        
        // Trata % Sucesso como número
        if (sortConfig.key === "pct") {
          const fechadasA = a.sucesso + a.insucesso;
          const fechadasB = b.sucesso + b.insucesso;
          aVal = fechadasA > 0 ? a.sucesso / fechadasA : -1;
          bVal = fechadasB > 0 ? b.sucesso / fechadasB : -1;
        }

        if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    } else {
      arr.sort((a, b) => b.total - a.total);
    }
    return arr;
  }, [
    filteredFato, presenca, presencaByTT, presencaByTR, search, cardFilter,
    coordenadorFilter, supervisorFilter, tecnicoFilter, statusFilter,
    ttsSemPresenca, ttsAtivos, ttsPresencaOK, ttsSemEncerramento, ttsBaixaProd, ttsFechouQualquer, sortConfig
  ]);

  // Totais de sucesso/insucesso baseados em TODAS as atividades do dia (UF=SC),
  // sem aplicar cardFilter — somente filtros de seletor (estado/macro/sup/coord).
  const totalsAll = useMemo(() => {
    let sucesso = 0, insucesso = 0;
    fato.forEach((r) => {
      if (!isSC(r)) return;
      if (!matchFilter(r.ds_estado, estadoFilter)) return;
      if (!matchFilter(r.ds_macro_atividade, macroFilter)) return;
      const info = getPresencaInfo(r);
      if (!matchFilter(info?.supervisor, supervisorFilter)) return;
      if (!matchFilter(info?.coordenador, coordenadorFilter)) return;
      if (!matchFilter(info?.funcionario, tecnicoFilter) && !matchFilter(r.nome_tecnico, tecnicoFilter)) return;
      
      const stat = info ? ((info.status || "").trim() === "" ? "Ativo" : info.status) : "Ativo";
      if (!matchFilter(stat, statusFilter)) return;

      const estado = norm(r.ds_estado);
      if (estado.includes("conclu") && estado.includes("sem sucesso")) {
        insucesso++;
      }
      else if (estado.includes("conclu") && estado.includes("sucesso")) sucesso++;
    });
    return { sucesso, insucesso };
  }, [fato, estadoFilter, macroFilter, supervisorFilter, coordenadorFilter, tecnicoFilter, statusFilter, presencaByTT, presencaByTR, presencaByNome]);

  const totals = useMemo(() => {
    return aggregated.reduce(
      (acc, x) => {
        acc.sucesso += x.sucesso;
        acc.insucesso += x.insucesso;
        acc.total += x.total;
        return acc;
      },
      { sucesso: 0, insucesso: 0, total: 0 },
    );
  }, [aggregated]);

  // Métricas dos cartões (calculadas aplicando os filtros globais sobre o fato bruto do dia)
  const cardMetrics = useMemo(() => {
    const filteredPresenca = presenca.filter(p => {
      if (!matchFilter(p.coordenador, coordenadorFilter)) return false;
      if (!matchFilter(p.supervisor, supervisorFilter)) return false;
      if (!matchFilter(p.funcionario, tecnicoFilter)) return false;
      
      const stat = (p.status || "").trim() === "" ? "Ativo" : p.status;
      if (!matchFilter(stat, statusFilter)) return false;
      
      return true;
    });

    const totalTecnicosPresenca = filteredPresenca.length;
    const totalAtivos = ttsAtivos.size;

    const baseFato = fato.filter(r => {
      if (!isSC(r)) return false;
      const info = getPresencaInfo(r);
      if (!matchFilter(info?.coordenador, coordenadorFilter)) return false;
      if (!matchFilter(info?.supervisor, supervisorFilter)) return false;
      if (!matchFilter(info?.funcionario, tecnicoFilter) && !matchFilter(r.nome_tecnico, tecnicoFilter)) return false;
      
      const stat = info ? ((info.status || "").trim() === "" ? "Ativo" : info.status) : "Ativo";
      if (!matchFilter(stat, statusFilter)) return false;

      if (!matchFilter(r.ds_estado, estadoFilter)) return false;
      if (!matchFilter(r.ds_macro_atividade, macroFilter)) return false;
      return true;
    });

    const totalEmAndamento = baseFato.filter((r) =>
      ESTADOS_EM_ANDAMENTO.includes(norm(r.ds_estado)),
    ).length;
    const totalAgendaDia = baseFato.filter(isAgendadaParaDia).length;

    const totalPresencaOK = ttsPresencaOK.size;
    const totalSemPresenca = ttsSemPresenca.size;
    const totalSemEncerramento = ttsSemEncerramento.size;
    const totalBaixaProd = ttsBaixaProd.size;

    return {
      totalTecnicosPresenca,
      totalAtivos,
      totalEmAndamento,
      totalAgendaDia,
      totalPresencaOK,
      totalSemPresenca,
      totalSemEncerramento,
      totalBaixaProd,
      totalFechouQualquer: ttsFechouQualquer.size,
    };
  }, [presenca, fato, ttsAtivos, ttsPresencaOK, ttsSemPresenca, ttsSemEncerramento, ttsBaixaProd, ttsFechouQualquer, ttsEmAndamento, ttsAgendaDia, date, coordenadorFilter, supervisorFilter, tecnicoFilter, statusFilter, estadoFilter, macroFilter, presencaByTT, presencaByTR]);

  const handleSync = async () => {
    // Sincronização manual: recarrega dados do dia + histórico + último log de sync.
    // Trabalha em conjunto com o agendamento automático (também grava em atividades_sync_log).
    setSyncing(true);
    try {
      await Promise.all([loadData(), loadHistorico()]);
      toast({
        title: "Atualização manual concluída",
        description: "Dados do dia e histórico recarregados.",
      });
    } catch (e) {
      toast({
        title: "Erro ao atualizar",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveUrl = async () => {
    if (!csvUrl.trim()) return;
    setSavingUrl(true);
    try {
      // upsert na app_settings
      const { data: existing } = await supabase
        .from("app_settings")
        .select("id")
        .eq("key", "atividades_csv_url")
        .maybeSingle();
      if (existing) {
        await supabase
          .from("app_settings")
          .update({ value: csvUrl, updated_by: profile?.user_id })
          .eq("key", "atividades_csv_url");
      } else {
        await supabase.from("app_settings").insert({
          key: "atividades_csv_url",
          value: csvUrl,
          updated_by: profile?.user_id,
        });
      }
      toast({ title: "URL salva com sucesso" });
    } catch (e) {
      toast({
        title: "Erro ao salvar",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setSavingUrl(false);
    }
  };

  const handleUploadPresenca = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet =
        wb.Sheets["Tecnicos"] ||
        wb.Sheets["TECNICOS"] ||
        wb.Sheets["Técnicos"] ||
        wb.Sheets[wb.SheetNames[0]];
      if (!sheet) throw new Error("Aba 'Tecnicos' não encontrada");
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: "",
        raw: false,
      });

      const norm = (s: string) =>
        s
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]/g, "");

      const findKey = (obj: Record<string, unknown>, candidates: string[]) => {
        const keys = Object.keys(obj);
        const map = new Map(keys.map((k) => [norm(k), k]));
        for (const c of candidates) {
          const k = map.get(norm(c));
          if (k) return k;
        }
        return null;
      };

      const rows = json.map((r) => {
        const kTR = findKey(r, ["TR"]);
        const kTT = findKey(r, ["TT"]);
        const kFunc = findKey(r, ["FUNCIONARIO", "FUNCIONÁRIO", "NOME"]);
        const kOp = findKey(r, ["OPERADORA"]);
        const kSup = findKey(r, ["SUPERVISOR"]);
        const kCoord = findKey(r, ["COORDENADOR"]);
        const kSetorO = findKey(r, ["SETOR ORIGEM", "SETOR_ORIGEM", "SETORORIGEM"]);
        const kSetorA = findKey(r, ["SETOR ATUAL", "SETOR_ATUAL", "SETORATUAL"]);
        const kStatus = findKey(r, ["STATUS"]);
        return {
          tr: kTR ? String(r[kTR] || "").trim().toUpperCase() : null,
          tt: kTT ? String(r[kTT] || "").trim().toUpperCase() : null,
          funcionario: kFunc ? String(r[kFunc] || "").trim() : null,
          operadora: kOp ? String(r[kOp] || "").trim() : null,
          supervisor: kSup ? String(r[kSup] || "").trim() : null,
          coordenador: kCoord ? String(r[kCoord] || "").trim() : null,
          setor_origem: kSetorO ? String(r[kSetorO] || "").trim() : null,
          setor_atual: kSetorA ? String(r[kSetorA] || "").trim() : null,
          status: kStatus ? String(r[kStatus] || "").trim() : null,
          uploaded_by: profile?.user_id,
        };
      }).filter((r) => r.tt || r.tr);

      // Replace strategy
      const { error: delErr } = await supabase
        .from("tecnicos_presenca")
        .delete()
        .gte("uploaded_at", "1900-01-01");
      if (delErr) throw delErr;

      // batch insert
      const batch = 500;
      for (let i = 0; i < rows.length; i += batch) {
        const slice = rows.slice(i, i + batch);
        const { error } = await supabase.from("tecnicos_presenca").insert(slice);
        if (error) throw error;
      }

      toast({ title: "Presença carregada", description: `${rows.length} técnicos importados.` });
      await loadData();
    } catch (e) {
      toast({
        title: "Erro no upload",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleUploadFato = async (file: File) => {
    setUploadingFato(true);
    try {
      const text = await file.text();
      const { data, error } = await supabase.functions.invoke("sync-atividades-fato", {
        body: text,
        headers: { "Content-Type": "text/csv" },
      });
      if (error) throw error;
      const result = data as { ok?: boolean; rows?: number; error?: string };
      if (result?.ok) {
        toast({
          title: "Sincronização concluída",
          description: `${result.rows ?? 0} registros Fato importados localmente.`,
        });
        await loadData();
      } else {
        toast({
          title: "Falha na sincronização",
          description: result?.error || "Erro desconhecido",
          variant: "destructive",
        });
      }
    } catch (e) {
      toast({
        title: "Erro no upload",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      if (fatoFileRef.current) fatoFileRef.current.value = "";
      setUploadingFato(false);
    }
  };

  const handleNumberClick = (r: any, tipo: "ALL" | "SUCESSO" | "INSUCESSO") => {
    if (r.nome && r.nome !== "—") {
      setAtividadesTabSearch(r.nome);
    } else if (r.tt) {
      setAtividadesTabSearch(r.tt);
    } else if (r.tr) {
      setAtividadesTabSearch(r.tr);
    }
    setAtividadesResultadoFilter(tipo);
    setActiveTab("atividades");
  };

  const prontoExecucaoOptions = useMemo(() => {
    const s = new Set<string>();
    filteredFato.forEach((r) => {
      let val = getRawStr(r, ["in_pronto_execucao", "pronto_execucao"]).toUpperCase();
      if (val === "NÃƒO" || val === "NÃO" || val === "NAO") val = "SIM";
      if (val) s.add(val);
    });
    return Array.from(s).sort();
  }, [filteredFato]);

  const unicoSaOptions = useMemo(() => {
    const s = new Set<string>();
    filteredFato.forEach((r) => {
      const val = getRawStr(r, ["primeiro_sa", "unico_sa"]);
      if (val) s.add(val);
    });
    return Array.from(s).sort();
  }, [filteredFato]);

  const atividadesMacroOptions = useMemo(() => {
    const s = new Set<string>();
    filteredFato.forEach((r) => {
      if (r.ds_macro_atividade) s.add(r.ds_macro_atividade);
    });
    return Array.from(s).sort();
  }, [filteredFato]);

  const atividadesStatusSaOptions = useMemo(() => {
    const s = new Set<string>();
    filteredFato.forEach((r) => {
      if (r.ds_estado) s.add(r.ds_estado);
    });
    return Array.from(s).sort();
  }, [filteredFato]);

  const atividadesSetorOptions = useMemo(() => {
    const s = new Set<string>();
    filteredFato.forEach((r) => {
      const setor = getRawStr(r, ["cd_setor", "ds_setor", "setor", "setor_atual", "setor_origem"]);
      if (setor) s.add(setor);
    });
    return Array.from(s).sort();
  }, [filteredFato]);

  const atividadesStatusNafOptions = useMemo(() => {
    const s = new Set<string>();
    filteredFato.forEach((r) => {
      const val = getRawStr(r, ["status_naf"]) || "-";
      s.add(val);
    });
    return Array.from(s).sort();
  }, [filteredFato]);

  const atividadesTabFato = useMemo(() => {
    let arr = filteredFato;

    if (atividadesResultadoFilter === "SUCESSO") {
      arr = arr.filter((r) => {
        const est = (r.ds_estado || "").toLowerCase().trim();
        return est.includes("conclu") && est.includes("sucesso") && !est.includes("sem sucesso");
      });
    } else if (atividadesResultadoFilter === "INSUCESSO") {
      arr = arr.filter((r) => {
        const est = (r.ds_estado || "").toLowerCase().trim();
        return est.includes("conclu") && est.includes("sem sucesso");
      });
    }
    
    if (atividadesMacroFilter.length > 0) {
      arr = arr.filter((r) => r.ds_macro_atividade && atividadesMacroFilter.includes(r.ds_macro_atividade));
    }
    if (atividadesProntoExecucaoFilter.length > 0) {
      arr = arr.filter((r) => {
        let val = getRawStr(r, ["in_pronto_execucao", "pronto_execucao"]).toUpperCase();
        if (val === "NÃƒO" || val === "NÃO" || val === "NAO") val = "SIM";
        return atividadesProntoExecucaoFilter.includes(val);
      });
    }
    if (atividadesUnicoSaFilter.length > 0) {
      arr = arr.filter((r) => {
        const val = getRawStr(r, ["primeiro_sa", "unico_sa"]);
        return atividadesUnicoSaFilter.includes(val);
      });
    }
    if (atividadesStatusSaFilter.length > 0) {
      arr = arr.filter((r) => r.ds_estado && atividadesStatusSaFilter.includes(r.ds_estado));
    }
    if (atividadesSetorFilter.length > 0) {
      arr = arr.filter((r) => {
        const setor = getRawStr(r, ["cd_setor", "ds_setor", "setor", "setor_atual", "setor_origem"]);
        return atividadesSetorFilter.includes(setor);
      });
    }
    if (atividadesStatusNafFilter.length > 0) {
      arr = arr.filter((r) => {
        const statusNaf = getRawStr(r, ["status_naf"]) || "-";
        return atividadesStatusNafFilter.includes(statusNaf);
      });
    }

    if (atividadesTabSearch.trim()) {
      const q = atividadesTabSearch.trim().toLowerCase();
      arr = arr.filter((r) => 
        (r.nome_tecnico || "").toLowerCase().includes(q) ||
        (r.matricula_tt || "").toLowerCase().includes(q) ||
        (r.matricula_tr || "").toLowerCase().includes(q)
      );
    }

    if (atividadesSortConfig) {
      arr = [...arr].sort((a: any, b: any) => {
        let aVal, bVal;
        
        // Mapeamento de chaves complexas para o sorting
        if (atividadesSortConfig.key === "sa") {
          aVal = getRawStr(a, ["cd_nrba", "nrba", "sa"]);
          bVal = getRawStr(b, ["cd_nrba", "nrba", "sa"]);
        } else if (atividadesSortConfig.key === "status_naf") {
          aVal = getRawStr(a, ["status_naf"]);
          bVal = getRawStr(b, ["status_naf"]);
        } else {
          aVal = a[atividadesSortConfig.key] || "";
          bVal = b[atividadesSortConfig.key] || "";
        }

        if (aVal < bVal) return atividadesSortConfig.direction === "asc" ? -1 : 1;
        if (aVal > bVal) return atividadesSortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }

    return arr;
  }, [filteredFato, atividadesTabSearch, atividadesMacroFilter, atividadesProntoExecucaoFilter, atividadesUnicoSaFilter, atividadesStatusSaFilter, atividadesSetorFilter, atividadesStatusNafFilter, atividadesResultadoFilter, atividadesSortConfig]);

  const handleExportAtividades = () => {
    if (atividadesTabFato.length === 0) {
      toast({ title: "Nenhum dado para exportar", variant: "destructive" });
      return;
    }
    const dataToExport = atividadesTabFato.map(r => {
      const setorStr = getRawStr(r, ["cd_setor", "ds_setor", "setor", "setor_atual", "setor_origem"]);
      const sa = getRawStr(r, ["cd_nrba", "nrba", "sa"]);
      const gpon = getRawStr(r, ["cd_gpon", "gpon"]);
      const docAssoc = getRawStr(r, ["cd_documento_associado", "documento_associado", "doc_associado"]);
      const cpRaw = getRawStr(r, ["cp", "cd_cp"]).trim().toUpperCase();
      const cps = cpRaw === "" ? "" : (cpRaw === "NIO" ? "NIO" : cpRaw === "TIM" ? "TIM" : "Others");
      const statusNaf = getRawStr(r, ["status_naf"]) || "-";
      const dataNaf = fmtDataNaf(getRawStr(r, ["data_naf"]));
      const hrFechado = fmtDataNaf(getRawStr(r, ["dh_fim_execucao_real", "dh_fim_execucao", "fim_execucao_real"]));
      const potOlt = fmtPotencia(getRawStr(r, ["potencia_na_olt", "potencia_olt"]));
      const potOnt = fmtPotencia(getRawStr(r, ["potencia_na_ont", "potencia_ont"]));
      
      return {
        "TT": r.matricula_tt || "",
        "TR": r.matricula_tr || "",
        "Técnico": r.nome_tecnico || "",
        "Setor": setorStr,
        "SA": sa,
        "Gpon": gpon,
        "Doc. Associado": docAssoc,
        "Cps": cps,
        "Status NAF": statusNaf,
        "Data NAF": dataNaf,
        "Hora Fechado": hrFechado,
        "Potência OLT": potOlt,
        "Potência ONT": potOnt,
        "Macro Atividade": r.ds_macro_atividade || "",
        "Estado": r.ds_estado || "",
      };
    });

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Atividades");
    XLSX.writeFile(wb, `Atividades_Filtradas_${date}.xlsx`);
  };

  const handleExportResumo = () => {
    if (aggregated.length === 0) {
      toast({ title: "Nenhum dado para exportar", variant: "destructive" });
      return;
    }
    const dataToExport = aggregated.map(r => ({
      "TT": r.tt,
      "TR": r.tr,
      "Técnico": r.nome,
      "Operadora": r.operadora,
      "Supervisor": r.supervisor,
      "Coordenador": r.coordenador,
      "Setor": r.setor_atual,
      "Status": r.status,
      "Sucesso": r.sucesso,
      "Insucesso": r.insucesso,
      "Total": r.total,
      "% Sucesso": r.total > 0 ? ((r.sucesso / (r.sucesso + r.insucesso)) * 100).toFixed(1) + "%" : "—"
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Resumo");
    XLSX.writeFile(wb, `Resumo_Atividades_${date}.xlsx`);
  };

  const handleExportFSL = () => {
    if (aggregated.length === 0) {
      toast({ title: "Nenhum técnico filtrado", variant: "destructive" });
      return;
    }
    const names = aggregated.map(r => r.nome).filter(n => n && n !== "—").join(", ");
    
    // Criar um blob de texto e baixar como .txt ou gerar um Excel de uma célula
    const blob = new Blob([names], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Tecnicos_FSL_${date}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast({ title: "Lista para FSL gerada", description: "O arquivo .txt foi baixado." });
  };

  // ===== Histórico (60 dias) - agregações =====
  const isOkClose = (estado: string | null) => {
    const e = (estado || "").toLowerCase();
    return e.includes("conclu") && e.includes("sucesso") && !e.includes("sem sucesso");
  };
  const isFailClose = (estado: string | null) => {
    const e = (estado || "").toLowerCase();
    return e.includes("conclu") && e.includes("sem sucesso");
  };

  // Diário: por dia => sucesso, insucesso, total
  const histDaily = useMemo(() => {
    const m = new Map<string, { dia: string; sucesso: number; insucesso: number; total: number }>();
    historico.forEach((r) => {
      const d = r.data_atividade;
      if (!d) return;
      if (!m.has(d)) m.set(d, { dia: d, sucesso: 0, insucesso: 0, total: 0 });
      const row = m.get(d)!;
      if (isOkClose(r.ds_estado)) row.sucesso++;
      else if (isFailClose(r.ds_estado)) row.insucesso++;
      row.total++;
    });
    return Array.from(m.values()).sort((a, b) => a.dia.localeCompare(b.dia));
  }, [historico]);

  // Mensal: YYYY-MM
  const histMonthly = useMemo(() => {
    const m = new Map<string, { mes: string; sucesso: number; insucesso: number; total: number }>();
    historico.forEach((r) => {
      const d = r.data_atividade;
      if (!d) return;
      const ym = d.slice(0, 7);
      if (!m.has(ym)) m.set(ym, { mes: ym, sucesso: 0, insucesso: 0, total: 0 });
      const row = m.get(ym)!;
      if (isOkClose(r.ds_estado)) row.sucesso++;
      else if (isFailClose(r.ds_estado)) row.insucesso++;
      row.total++;
    });
    return Array.from(m.values()).sort((a, b) => a.mes.localeCompare(b.mes));
  }, [historico]);

  // Comparativo: dia selecionado vs anterior, mês atual vs anterior
  const histCompare = useMemo(() => {
    const byDay = new Map(histDaily.map((d) => [d.dia, d]));
    const sel = byDay.get(date) || { sucesso: 0, insucesso: 0, total: 0 };
    const prevDate = (() => {
      const dt = new Date(date);
      dt.setDate(dt.getDate() - 1);
      return dt.toISOString().slice(0, 10);
    })();
    const prev = byDay.get(prevDate) || { sucesso: 0, insucesso: 0, total: 0 };
    const ym = date.slice(0, 7);
    const prevYm = (() => {
      const dt = new Date(date + "T00:00:00");
      dt.setMonth(dt.getMonth() - 1);
      return dt.toISOString().slice(0, 7);
    })();
    const cur = histMonthly.find((m) => m.mes === ym) || { sucesso: 0, insucesso: 0, total: 0 };
    const past = histMonthly.find((m) => m.mes === prevYm) || { sucesso: 0, insucesso: 0, total: 0 };
    return { sel, prev, prevDate, cur, past, ym, prevYm };
  }, [histDaily, histMonthly, date]);

  // Ranking dos técnicos no DIA selecionado (do histórico — independente de filtros)
  const rankingDia = useMemo(() => {
    const m = new Map<string, { tt: string; nome: string; sucesso: number; insucesso: number; total: number }>();
    historico.forEach((r) => {
      if (r.data_atividade !== date) return;
      const tt = (r.matricula_tt || "").trim().toUpperCase();
      const key = tt || (r.nome_tecnico || "—");
      if (!m.has(key)) m.set(key, { tt, nome: r.nome_tecnico || "—", sucesso: 0, insucesso: 0, total: 0 });
      const row = m.get(key)!;
      if (isOkClose(r.ds_estado)) row.sucesso++;
      else if (isFailClose(r.ds_estado)) row.insucesso++;
      row.total++;
    });
    return Array.from(m.values()).sort((a, b) => b.sucesso - a.sucesso || b.total - a.total).slice(0, 10);
  }, [historico, date]);

  const fmtDateBR = (iso: string) => {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-");
    return d ? `${d}/${m}/${y}` : iso;
  };
  const fmtMonthBR = (ym: string) => {
    if (!ym) return "—";
    const [y, m] = ym.split("-");
    return `${m}/${y}`;
  };
  const delta = (cur: number, prev: number) => {
    if (prev === 0) return cur > 0 ? "+∞" : "0%";
    const v = ((cur - prev) / prev) * 100;
    return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
  };

  return (
    <div className="flex-1 overflow-auto p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <ActivityIcon className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold">Acompanhamento de Atividades</h1>
          {lastSync && (() => {
            const by = (lastSyncBy || "").toLowerCase();
            const isAuto = by === "cron" || by.startsWith("auto");
            return (
              <Badge variant="secondary" className="text-[10px]">
                Última sync: {new Date(lastSync).toLocaleString("pt-BR")}{" "}
                <span
                  className="ml-1 font-bold"
                  title={isAuto ? "A = Automático" : "M = Manual"}
                >
                  {isAuto ? "A" : "M"}
                </span>
              </Badge>
            );
          })()}
          <Badge
            variant={schedule.enabled ? "default" : "outline"}
            className="text-[10px] gap-1"
            title={`Cron: ${cronPreview}`}
          >
            <Clock className="w-3 h-3" />
            {schedule.enabled ? scheduleSummary : "Auto: desativado"}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="dt" className="text-xs">Data:</Label>
          <Input
            id="dt"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-[160px] h-8"
          />
          <Button
            onClick={handleSync}
            size="sm"
            variant="default"
            disabled={syncing || loading}
            title="Atualização manual — recarrega dados e histórico (trabalha junto com o sincronismo automático)"
          >
            {syncing || loading ? (
              <Loader2 className="w-3 h-3 animate-spin mr-1" />
            ) : (
              <RefreshCw className="w-3 h-3 mr-1" />
            )}
            <span className="text-xs">Atualizar</span>
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="sticky top-0 z-40 bg-background shadow-sm">
          <TabsTrigger value="resumo">Resumo Diário</TabsTrigger>
          <TabsTrigger value="atividades">Atividades</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
          {isAdmin && <TabsTrigger value="config">Configuração</TabsTrigger>}
        </TabsList>

        {/* RESUMO POR TÉCNICO */}
        <TabsContent value="resumo" className="space-y-3">
          {/* Container "sticky" — ao rolar a página, os cartões e o filtro
              ficam congelados no topo (logo abaixo das abas). Apenas a tabela
              de técnicos rola por baixo. */}
          <div className="sticky top-10 z-30 bg-background pt-2 pb-2 space-y-3 shadow-sm">
          <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2">
            {/* Técnicos: total na presença vs ativos (status em branco) */}
            <Card
              onClick={() => setCardFilter(cardFilter === "ATIVOS" ? "ALL" : "ATIVOS")}
              className={`cursor-pointer transition-all hover:shadow-md ${cardFilter === "ATIVOS" ? "ring-2 ring-primary" : ""}`}
            >
              <CardContent className="p-3">
                <div className="text-[11px] text-muted-foreground">Técnicos Ativos / Total</div>
                <div className="text-2xl font-bold">
                  <span className="text-primary">{cardMetrics.totalAtivos}</span>
                  <span className="text-muted-foreground text-base"> / {cardMetrics.totalTecnicosPresenca}</span>
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">Ativos na escala</div>
              </CardContent>
            </Card>

            {/* Total de técnicos que fecharam qualquer atividade (sem regras de presença/sucesso) */}
            <Card
              onClick={() => setCardFilter(cardFilter === "FECHOU_QUALQUER" ? "ALL" : "FECHOU_QUALQUER")}
              className={`cursor-pointer transition-all hover:shadow-md ${cardFilter === "FECHOU_QUALQUER" ? "ring-2 ring-primary" : ""}`}
              title="Total de técnicos distintos que encerraram ao menos uma atividade no dia (com ou sem sucesso), sem regra de presença"
            >
              <CardContent className="p-3">
                <div className="text-[11px] text-muted-foreground">Técnicos que Fecharam</div>
                <div className="text-2xl font-bold text-primary">{cardMetrics.totalFechouQualquer}</div>
                <div className="text-[10px] text-muted-foreground mt-1">Qualquer atividade</div>
              </CardContent>
            </Card>

            {/* Presença OK por macro de sucesso */}
            <Card
              onClick={() => setCardFilter(cardFilter === "PRESENCA_OK" ? "ALL" : "PRESENCA_OK")}
              className={`cursor-pointer transition-all hover:shadow-md ${cardFilter === "PRESENCA_OK" ? "ring-2 ring-primary" : ""}`}
            >
              <CardContent className="p-3">
                <div className="text-[11px] text-muted-foreground">Presença Confirmada</div>
                <div className="text-2xl font-bold text-success">{cardMetrics.totalPresencaOK}</div>
                <div className="text-[10px] text-muted-foreground mt-1">INST/MUD/SRV/REP OK</div>
              </CardContent>
            </Card>

            {/* Baixa Produtividade — técnicos com 3 ou menos atividades fechadas no dia */}
            <Card
              onClick={() => setCardFilter(cardFilter === "BAIXA_PROD" ? "ALL" : "BAIXA_PROD")}
              className={`cursor-pointer transition-all hover:shadow-md ${cardFilter === "BAIXA_PROD" ? "ring-2 ring-primary" : ""}`}
              title="Técnicos que fecharam 3 ou menos atividades no dia (sucesso + insucesso)"
            >
              <CardContent className="p-3">
                <div className="text-[11px] text-muted-foreground">Baixa Produtividade</div>
                <div className="text-2xl font-bold text-warning">{cardMetrics.totalBaixaProd}</div>
                <div className="text-[10px] text-muted-foreground mt-1">≤ 3 atividades no dia</div>
              </CardContent>
            </Card>

            {/* Sem Presença */}
            <Card
              onClick={() => setCardFilter(cardFilter === "SEM_PRESENCA" ? "ALL" : "SEM_PRESENCA")}
              className={`cursor-pointer transition-all hover:shadow-md ${cardFilter === "SEM_PRESENCA" ? "ring-2 ring-primary" : ""}`}
            >
              <CardContent className="p-3">
                <div className="text-[11px] text-muted-foreground">Sem Presença</div>
                <div className="text-2xl font-bold text-warning">{cardMetrics.totalSemPresenca}</div>
                <div className="text-[10px] text-muted-foreground mt-1">Sem OK</div>
              </CardContent>
            </Card>

            {/* Sem Encerramento (P0 — Produção Zero) */}
            <Card
              onClick={() => setCardFilter(cardFilter === "SEM_ENCERRAMENTO" ? "ALL" : "SEM_ENCERRAMENTO")}
              className={`cursor-pointer transition-all hover:shadow-md ${cardFilter === "SEM_ENCERRAMENTO" ? "ring-2 ring-primary" : ""}`}
              title="P0 — Produção Zero: técnicos ativos sem nenhuma atividade encerrada"
            >
              <CardContent className="p-3">
                <div className="text-[11px] text-muted-foreground">Sem Encerramento</div>
                <div className="text-2xl font-bold text-destructive">{cardMetrics.totalSemEncerramento}</div>
                <div className="text-[10px] text-muted-foreground mt-1">P0 — Produção Zero</div>
              </CardContent>
            </Card>

            {/* Total atividades em andamento (cartão filtro) */}
            <Card
              onClick={() => setCardFilter(cardFilter === "EM_ANDAMENTO" ? "ALL" : "EM_ANDAMENTO")}
              className={`cursor-pointer transition-all hover:shadow-md ${cardFilter === "EM_ANDAMENTO" ? "ring-2 ring-primary" : ""}`}
            >
              <CardContent className="p-3">
                <div className="text-[11px] text-muted-foreground">Total em Andamento</div>
                <div className="text-2xl font-bold">{cardMetrics.totalEmAndamento}</div>
                <div className="text-[10px] text-muted-foreground mt-1">Em curso</div>
              </CardContent>
            </Card>

            {/* Agenda do dia */}
            <Card
              onClick={() => setCardFilter(cardFilter === "AGENDA_DIA" ? "ALL" : "AGENDA_DIA")}
              className={`cursor-pointer transition-all hover:shadow-md ${cardFilter === "AGENDA_DIA" ? "ring-2 ring-primary" : ""}`}
            >
              <CardContent className="p-3">
                <div className="text-[11px] text-muted-foreground">Agenda do Dia</div>
                <div className="text-2xl font-bold text-primary">{cardMetrics.totalAgendaDia}</div>
                <div className="text-[10px] text-muted-foreground mt-1">Agendadas hoje (SC)</div>
              </CardContent>
            </Card>

            <Card
              onClick={() => setCardFilter(cardFilter === "SUCESSO" ? "ALL" : "SUCESSO")}
              className={`cursor-pointer transition-all hover:shadow-md ${cardFilter === "SUCESSO" ? "ring-2 ring-primary" : ""}`}
            >
              <CardContent className="p-3">
                <div className="text-[11px] text-muted-foreground">Concluídas c/ Sucesso</div>
                <div className="text-2xl font-bold text-success">{totalsAll.sucesso}</div>
              </CardContent>
            </Card>
            <Card
              onClick={() => setCardFilter(cardFilter === "INSUCESSO" ? "ALL" : "INSUCESSO")}
              className={`cursor-pointer transition-all hover:shadow-md ${cardFilter === "INSUCESSO" ? "ring-2 ring-primary" : ""}`}
            >
              <CardContent className="p-3">
                <div className="text-[11px] text-muted-foreground">Concluídas s/ Sucesso</div>
                <div className="text-2xl font-bold text-destructive">{totalsAll.insucesso}</div>
              </CardContent>
            </Card>
          </div>

          {cardFilter !== "ALL" && (
            <div className="flex items-center gap-2 text-xs">
              <Badge variant="secondary">
                Filtro ativo: {
                  cardFilter === "ATIVOS" ? "Técnicos Ativos" :
                  cardFilter === "PRESENCA_OK" ? "Presença Confirmada" :
                  cardFilter === "SEM_PRESENCA" ? "Sem Presença" :
                  cardFilter === "SEM_ENCERRAMENTO" ? "Sem Encerramento (P0)" :
                  cardFilter === "EM_ANDAMENTO" ? "Em Andamento" :
                  cardFilter === "SUCESSO" ? "Concluídas c/ Sucesso" :
                  cardFilter === "INSUCESSO" ? "Concluídas s/ Sucesso" :
                  cardFilter === "BAIXA_PROD" ? "Baixa Produtividade (≤3)" :
                  cardFilter === "FECHOU_QUALQUER" ? "Técnicos que Fecharam" :
                  "Agenda do Dia"
                }
              </Badge>
              <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setCardFilter("ALL")}>
                Limpar
              </Button>
            </div>
          )}
          </div>

          <Card className="bg-background shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center gap-2">
                <Filter className="w-4 h-4 text-muted-foreground" />
                
                {(() => {
                  return (
                    <>
                      <MultiFilter
                        label="Coordenador"
                        options={coordenadores}
                        value={coordenadorFilter}
                        onChange={(v) => { setCoordenadorFilter(v); setSupervisorFilter([]); setTecnicoFilter([]); }}
                      />
                      <MultiFilter
                        label="Supervisor"
                        options={supervisores}
                        value={supervisorFilter}
                        onChange={(v) => { setSupervisorFilter(v); setTecnicoFilter([]); }}
                      />
                      <MultiFilter
                        label="Técnico"
                        options={tecnicos}
                        value={tecnicoFilter}
                        onChange={setTecnicoFilter}
                      />
                      <MultiFilter
                        label="Status"
                        options={statuses}
                        value={statusFilter}
                        onChange={setStatusFilter}
                      />
                      <MultiFilter
                        label="Estado"
                        options={estados}
                        value={estadoFilter}
                        onChange={setEstadoFilter}
                      />
                      <MultiFilter
                        label="Macro atividade"
                        options={macros}
                        value={macroFilter}
                        onChange={setMacroFilter}
                      />
                    </>
                  );
                })()}

                <Input
                  placeholder="Buscar técnico, TT, supervisor..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className={`w-[260px] h-8 text-xs ${search ? "border-primary/50 bg-primary/5" : ""}`}
                />

                <div className="flex items-center gap-1 ml-auto">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-8 text-[11px] gap-1"
                    onClick={handleExportResumo}
                    title="Exportar resumo atual para Excel"
                  >
                    <Download className="w-3 h-3" />
                    Excel
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-8 text-[11px] gap-1"
                    onClick={handleExportFSL}
                    title="Gerar lista de nomes concatenados para o FSL"
                  >
                    <FileSpreadsheet className="w-3 h-3" />
                    Lista FSL
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-auto max-h-[600px] [&>div]:overflow-visible">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-20 shadow-sm">
                    <TableRow className="bg-background">
                      {([
                        { k: "tt", l: "TT" },
                        { k: "tr", l: "TR" },
                        { k: "nome", l: "Técnico" },
                        { k: "operadora", l: "Operadora" },
                        { k: "supervisor", l: "Supervisor" },
                        { k: "coordenador", l: "Coordenador" },
                        { k: "setor_atual", l: "Setor" },
                        { k: "status", l: "Status", c: "text-center" },
                        { k: "sucesso", l: "Sucesso", c: "text-center text-success" },
                        { k: "insucesso", l: "Insucesso", c: "text-center text-destructive" },
                        { k: "total", l: "Total", c: "text-center" },
                        { k: "pct", l: "% Sucesso", c: "text-center" },
                      ]).map(col => (
                        <TableHead 
                          key={col.k}
                          className={`text-[11px] cursor-pointer hover:bg-muted/50 transition-colors ${col.c || ""}`}
                          onClick={() => {
                            setSortConfig(prev => ({
                              key: col.k,
                              direction: prev?.key === col.k && prev.direction === "asc" ? "desc" : "asc"
                            }));
                          }}
                        >
                          <div className={`flex items-center gap-1 ${col.c?.includes("center") ? "justify-center" : ""}`}>
                            {col.l}
                            <ActivityIcon className={`w-2 h-2 opacity-30 ${sortConfig?.key === col.k ? "opacity-100 text-primary" : ""}`} />
                          </div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {aggregated.length === 0 ? (
                      <TableRow><TableCell colSpan={12} className="text-center text-xs text-muted-foreground py-6">Nenhuma atividade encontrada para esta data.</TableCell></TableRow>
                    ) : aggregated.map((r) => {
                      const fechadas = r.sucesso + r.insucesso;
                      const pct = fechadas > 0 ? (r.sucesso / fechadas) * 100 : 0;
                      return (
                        <TableRow key={`${r.tt}-${r.tr}-${r.nome}`}>
                          <TableCell className="text-[11px] font-mono">{r.tt}</TableCell>
                          <TableCell className="text-[11px] font-mono">{r.tr}</TableCell>
                          <TableCell className="text-[11px]">{r.nome}</TableCell>
                          <TableCell className="text-[11px]">{r.operadora}</TableCell>
                          <TableCell className="text-[11px]">{r.supervisor}</TableCell>
                          <TableCell className="text-[11px]">{r.coordenador}</TableCell>
                          <TableCell className="text-[11px]">{r.setor_atual}</TableCell>
                          <TableCell className="text-[11px] text-center">
                            <Select
                              value={r.status || "Ativo"}
                              onValueChange={(v) => handleManualStatusChange(r.tt, v)}
                            >
                              <SelectTrigger
                                className={`h-7 px-2 text-[10px] w-[140px] mx-auto ${r.status === 'Ativo' ? 'bg-success/10 text-success border-success/20' : 'bg-warning/10 text-warning border-warning/20'}`}
                                title="Clique para alterar o status manualmente"
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {STATUS_MANUAL_OPTIONS.map((opt) => (
                                  <SelectItem key={opt} value={opt} className="text-xs">{opt}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-[11px] text-center font-semibold text-success cursor-pointer hover:underline" onClick={() => handleNumberClick(r, "SUCESSO")}>{r.sucesso}</TableCell>
                          <TableCell className="text-[11px] text-center font-semibold text-destructive cursor-pointer hover:underline" onClick={() => handleNumberClick(r, "INSUCESSO")}>{r.insucesso}</TableCell>
                          <TableCell className="text-[11px] text-center font-semibold cursor-pointer hover:underline" onClick={() => handleNumberClick(r, "ALL")}>{r.total}</TableCell>
                          <TableCell className="text-[11px] text-center">{fechadas > 0 ? `${pct.toFixed(1)}%` : "—"}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ATIVIDADES BRUTAS */}
        <TabsContent value="atividades">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex flex-col gap-3">
                <div className="flex justify-between items-center flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <div>
                      <CardTitle className="text-sm">Atividades do dia ({atividadesTabFato.length})</CardTitle>
                      <CardDescription className="text-xs">Use os filtros abaixo para refinar os resultados desta aba.</CardDescription>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-muted-foreground hover:text-primary ml-2"
                      onClick={handleExportAtividades}
                      title="Exportar para Excel"
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                  </div>
                  {(atividadesTabSearch || atividadesResultadoFilter !== "ALL") && (
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">
                        Exibindo: {atividadesTabSearch || "Todos"} 
                        {atividadesResultadoFilter !== "ALL" && ` (${atividadesResultadoFilter === "SUCESSO" ? "Sucesso" : "Insucesso"})`}
                      </Badge>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => {
                          setAtividadesTabSearch("");
                          setAtividadesResultadoFilter("ALL");
                        }} 
                        className="h-6 text-xs text-muted-foreground hover:text-destructive"
                      >
                        Limpar filtro
                      </Button>
                    </div>
                  )}
                </div>
                
                <div className="flex flex-wrap items-center gap-2">
                  <Filter className="w-4 h-4 text-muted-foreground" />
                  <MultiFilter
                    label="Macro atividade"
                    options={atividadesMacroOptions}
                    value={atividadesMacroFilter}
                    onChange={setAtividadesMacroFilter}
                  />
                  <MultiFilter
                    label="Pronto execução"
                    options={prontoExecucaoOptions}
                    value={atividadesProntoExecucaoFilter}
                    onChange={setAtividadesProntoExecucaoFilter}
                  />
                  <MultiFilter
                    label="Único SA"
                    options={unicoSaOptions}
                    value={atividadesUnicoSaFilter}
                    onChange={setAtividadesUnicoSaFilter}
                  />
                  <MultiFilter
                    label="Status_SA"
                    options={atividadesStatusSaOptions}
                    value={atividadesStatusSaFilter}
                    onChange={setAtividadesStatusSaFilter}
                  />
                  <MultiFilter
                    label="Setor"
                    options={atividadesSetorOptions}
                    value={atividadesSetorFilter}
                    onChange={setAtividadesSetorFilter}
                  />
                  <MultiFilter
                    label="Status NAF"
                    options={atividadesStatusNafOptions}
                    value={atividadesStatusNafFilter}
                    onChange={setAtividadesStatusNafFilter}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-auto max-h-[600px]">
                <Table className="whitespace-nowrap">
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      {([
                        { k: "nome_tecnico", l: "Técnico" },
                        { k: "sa", l: "SA" },
                        { k: "gpon", l: "gpon" },
                        { k: "docAssociado", l: "DocAssociado" },
                        { k: "cps", l: "Cps" },
                        { k: "status_naf", l: "status_naf" },
                        { k: "data_naf", l: "data_naf" },
                        { k: "hr_fechado", l: "Hr_Fechado" },
                        { k: "potencia_olt", l: "potencia_OLT" },
                        { k: "potencia_ont", l: "potencia_ONT" },
                        { k: "ds_macro_atividade", l: "ds_macro_atividade" },
                        { k: "ds_estado", l: "ds_estado" },
                      ]).map(col => (
                        <TableHead 
                          key={col.k}
                          className="text-[11px] cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => {
                            setAtividadesSortConfig(prev => ({
                              key: col.k,
                              direction: prev?.key === col.k && prev.direction === "asc" ? "desc" : "asc"
                            }));
                          }}
                        >
                          <div className="flex items-center gap-1">
                            {col.l}
                            <ActivityIcon className={`w-2 h-2 opacity-30 ${atividadesSortConfig?.key === col.k ? "opacity-100 text-primary" : ""}`} />
                          </div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {atividadesTabFato.slice(0, 2000).map((r) => {
                      const estado = (r.ds_estado || "").toLowerCase().trim();
                      const macro = (r.ds_macro_atividade || "").trim().toUpperCase();
                      const sucesso = estado.includes("conclu") && estado.includes("sucesso") && !estado.includes("sem sucesso");
                      const insucesso = estado.includes("conclu") && estado.includes("sem sucesso");
                      const contaPresenca = MACROS_PRESENCA_OK.includes(macro) && macro !== MACRO_PRESENCA_EXCLUIR;
                      
                      let badgeColor = "";
                      if (sucesso && contaPresenca) badgeColor = "bg-success/10 text-success border-success/20";
                      else if (sucesso && !contaPresenca) badgeColor = "bg-warning/10 text-warning border-warning/20";
                      else if (insucesso) badgeColor = "bg-destructive/10 text-destructive border-destructive/20";

                      const setorStr = getRawStr(r, ["ds_setor", "setor", "setor_atual", "setor_origem"]);
                      const sa = getRawStr(r, ["cd_nrba", "nrba", "sa"]);
                      const gpon = getRawStr(r, ["cd_gpon", "gpon"]);
                      const docAssoc = getRawStr(r, ["cd_documento_associado", "documento_associado", "doc_associado"]);
                      const cpRaw = getRawStr(r, ["cp", "cd_cp"]).trim().toUpperCase();
                      const cps = cpRaw === "" ? "" : (cpRaw === "NIO" ? "NIO" : cpRaw === "TIM" ? "TIM" : "Others");
                      
                      let prontoExecucao = getRawStr(r, ["in_pronto_execucao", "pronto_execucao"]).toUpperCase();
                      if (prontoExecucao === "NÃƒO" || prontoExecucao === "NÃO" || prontoExecucao === "NAO") prontoExecucao = "SIM";
                      const unicoSa = getRawStr(r, ["primeiro_sa", "unico_sa"]);
                      const potOlt = fmtPotencia(getRawStr(r, ["potencia_na_olt", "potencia_olt"]));
                      const potOnt = fmtPotencia(getRawStr(r, ["potencia_na_ont", "potencia_ont"]));

                      const statusNaf = getRawStr(r, ["status_naf"]) || "-";
                      const dataNaf = fmtDataNaf(getRawStr(r, ["data_naf"]));
                      const hrFechado = fmtDataNaf(getRawStr(r, ["dh_fim_execucao_real", "dh_fim_execucao", "fim_execucao_real"]));

                      return (
                        <TableRow key={r.id}>
                          <TableCell className="text-[11px]">{r.nome_tecnico}</TableCell>
                          <TableCell className="text-[11px] font-mono">{sa}</TableCell>
                          <TableCell className="text-[11px] font-mono">{gpon}</TableCell>
                          <TableCell className="text-[11px] font-mono">{docAssoc}</TableCell>
                          <TableCell className="text-[11px]">{cps}</TableCell>
                          <TableCell className="text-[11px]">{statusNaf}</TableCell>
                          <TableCell className="text-[11px] font-mono">{dataNaf}</TableCell>
                          <TableCell className="text-[11px] font-mono">{hrFechado}</TableCell>
                          <TableCell className="text-[11px] font-mono">{potOlt}</TableCell>
                          <TableCell className="text-[11px] font-mono">{potOnt}</TableCell>
                          <TableCell className="text-[11px]">{r.ds_macro_atividade}</TableCell>
                          <TableCell className="text-[11px]"><Badge variant="outline" className={`text-[10px] ${badgeColor}`}>{r.ds_estado}</Badge></TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* HISTÓRICO (60 dias) */}
        <TabsContent value="historico" className="space-y-3">
          <Card>
            <CardContent className="flex items-center justify-center min-h-[480px]">
              <div className="text-center space-y-2">
                <div className="text-2xl font-semibold text-muted-foreground">Em Desenvolvimento</div>
                <div className="text-xs text-muted-foreground">Esta aba está sendo reconstruída e voltará em breve.</div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* CONFIGURAÇÃO ADMIN */}
        {isAdmin && (
          <TabsContent value="config" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" />
                  Agendamento do Sincronismo Automático
                </CardTitle>
                <CardDescription className="text-xs">
                  Defina de quanto em quanto tempo a automação local deve enviar o CSV FATO. A automação lê esta configuração para saber quando executar.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <Label className="text-xs">Status:</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant={schedule.enabled ? "default" : "outline"}
                    onClick={() => setSchedule({ ...schedule, enabled: !schedule.enabled })}
                  >
                    {schedule.enabled ? "Ativo" : "Desativado"}
                  </Button>
                  <Label className="text-xs ml-4">Dias úteis (Seg–Sex):</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant={schedule.weekdaysOnly ? "default" : "outline"}
                    onClick={() => setSchedule({ ...schedule, weekdaysOnly: !schedule.weekdaysOnly })}
                  >
                    {schedule.weekdaysOnly ? "Sim" : "Todos os dias"}
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Modo de execução</Label>
                  <Select
                    value={schedule.mode}
                    onValueChange={(v) => setSchedule({ ...schedule, mode: v as SyncMode })}
                  >
                    <SelectTrigger className="h-9 text-xs max-w-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="comercial">Horário comercial (intervalo)</SelectItem>
                      <SelectItem value="hourly">A cada X minutos (24h)</SelectItem>
                      <SelectItem value="daily">Uma vez por dia (horário fixo)</SelectItem>
                      <SelectItem value="custom">Horários específicos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {schedule.mode === "comercial" && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-2xl">
                    <div className="space-y-1">
                      <Label className="text-xs">Início</Label>
                      <Input
                        type="time"
                        value={schedule.businessStart}
                        onChange={(e) => setSchedule({ ...schedule, businessStart: e.target.value })}
                        className="h-9 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Fim</Label>
                      <Input
                        type="time"
                        value={schedule.businessEnd}
                        onChange={(e) => setSchedule({ ...schedule, businessEnd: e.target.value })}
                        className="h-9 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Intervalo (min)</Label>
                      <Input
                        type="number"
                        min={1}
                        max={1440}
                        value={schedule.businessIntervalMinutes}
                        onChange={(e) => setSchedule({ ...schedule, businessIntervalMinutes: Math.max(1, parseInt(e.target.value || "1", 10)) })}
                        className="h-9 text-xs"
                      />
                    </div>
                  </div>
                )}

                {schedule.mode === "hourly" && (
                  <div className="space-y-1 max-w-xs">
                    <Label className="text-xs">Intervalo entre execuções (minutos)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={1440}
                      value={schedule.intervalMinutes}
                      onChange={(e) => setSchedule({ ...schedule, intervalMinutes: Math.max(1, parseInt(e.target.value || "1", 10)) })}
                      className="h-9 text-xs"
                    />
                    <p className="text-[10px] text-muted-foreground">Ex.: 60 = de hora em hora; 30 = a cada 30 min.</p>
                  </div>
                )}

                {schedule.mode === "daily" && (
                  <div className="space-y-1 max-w-xs">
                    <Label className="text-xs">Horário (HH:MM)</Label>
                    <Input
                      type="time"
                      value={schedule.dailyTime}
                      onChange={(e) => setSchedule({ ...schedule, dailyTime: e.target.value })}
                      className="h-9 text-xs"
                    />
                  </div>
                )}

                {schedule.mode === "custom" && (
                  <div className="space-y-2 max-w-xl">
                    <Label className="text-xs">Horários específicos</Label>
                    <div className="flex flex-wrap gap-1">
                      {schedule.customTimes.length === 0 && (
                        <span className="text-[11px] text-muted-foreground">Nenhum horário cadastrado.</span>
                      )}
                      {schedule.customTimes.map((t) => (
                        <Badge key={t} variant="secondary" className="gap-1 text-[11px]">
                          {t}
                          <button
                            type="button"
                            onClick={() => removeCustomTime(t)}
                            className="hover:text-destructive"
                            aria-label={`Remover ${t}`}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                    <div className="flex gap-2 items-center">
                      <Input
                        type="time"
                        value={newCustomTime}
                        onChange={(e) => setNewCustomTime(e.target.value)}
                        className="h-9 text-xs w-32"
                      />
                      <Button type="button" size="sm" variant="outline" onClick={addCustomTime}>
                        <Plus className="w-3 h-3 mr-1" /> Adicionar
                      </Button>
                    </div>
                  </div>
                )}

                <div className="rounded-md border p-3 bg-muted/40 space-y-1">
                  <div className="text-[11px] text-muted-foreground">Resumo</div>
                  <div className="text-xs font-medium">{scheduleSummary}</div>
                  <div className="text-[10px] text-muted-foreground mt-1">
                    Expressão cron: <code className="text-foreground">{cronPreview}</code>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button onClick={saveSchedule} size="sm" disabled={savingSchedule}>
                    {savingSchedule ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
                    Salvar configuração
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Upload Manual CSV (FATO)</CardTitle>
                <CardDescription className="text-xs">
                  Faça o upload do arquivo CSV diretamente de sua máquina caso não queira usar a automação local. A URL configurada foi descontinuada a favor do envio direto FATO.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex gap-2 items-center">
                  <Input
                    ref={fatoFileRef}
                    type="file"
                    accept=".csv"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleUploadFato(f);
                    }}
                    className="text-xs max-w-sm"
                    disabled={uploadingFato}
                  />
                  {uploadingFato && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Upload Planilha Presença (DIMENSÃO)</CardTitle>
                <CardDescription className="text-xs">
                  Carregue o arquivo .xlsx com a aba "Tecnicos". Carregamento substitui a base atual ({presenca.length} técnicos cadastrados).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUploadPresenca(f);
                  }}
                  className="text-xs"
                />
                <p className="text-[11px] text-muted-foreground">
                  <Upload className="w-3 h-3 inline mr-1" />
                  Colunas esperadas: TR, TT, FUNCIONARIO, OPERADORA, SUPERVISOR, COORDENADOR, SETOR ORIGEM, SETOR ATUAL, STATUS.
                </p>
              </CardContent>
            </Card>

          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};

export default AtividadesEncerramento;