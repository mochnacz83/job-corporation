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
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, Upload, Save, Activity as ActivityIcon, Filter, X, Clock, Plus, Trash2 } from "lucide-react";
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

const norm = (s: string | null | undefined) =>
  (s || "").toString().trim().toLowerCase();

type CardFilter =
  | "ALL"
  | "ATIVOS"
  | "EM_ANDAMENTO"
  | "AGENDA_DIA"
  | "PRESENCA_OK"
  | "SEM_PRESENCA"
  | "SUCESSO"
  | "INSUCESSO";

const AtividadesEncerramento = () => {
  const { isAdmin, profile } = useAuth();
  const { toast } = useToast();
  useAccessTracking("/atividades-encerramento", true, "Encerramento de Atividades");

  const [date, setDate] = useState<string>(todayISO());
  const [fato, setFato] = useState<FatoRow[]>([]);
  const [presenca, setPresenca] = useState<PresencaRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);

  // filters
  const [estadoFilter, setEstadoFilter] = useState<string>("ALL");
  const [macroFilter, setMacroFilter] = useState<string>("ALL");
  const [supervisorFilter, setSupervisorFilter] = useState<string>("ALL");
  const [coordenadorFilter, setCoordenadorFilter] = useState<string>("ALL");
  const [tecnicoFilter, setTecnicoFilter] = useState<string>("ALL");
  const [cardFilter, setCardFilter] = useState<CardFilter>("ALL");
  const [activeTab, setActiveTab] = useState<string>("resumo");
  const [search, setSearch] = useState("");
  const [atividadesTabSearch, setAtividadesTabSearch] = useState("");

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

  const matchFilter = (val: string | null | undefined, filter: string) => {
    if (filter === "ALL") return true;
    return (val || "").trim().toUpperCase() === filter.toUpperCase();
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
          .select("finished_at, status")
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      // Filtrar técnicos com "BUFFER" no nome (sai do relatório inteiro)
      const cleaned = ((f || []) as FatoRow[]).filter((r) => {
        const n = (r.nome_tecnico || "").toUpperCase();
        return !n.includes("BUFFER");
      });
      setFato(cleaned);
      setPresenca((p || []) as PresencaRow[]);
      setLastSync(log?.finished_at ?? null);
    } finally {
      setLoading(false);
    }
  };

  const loadSettings = async () => {
    // This function is kept for signature compatibility but no longer fetches FATO CSV URL.
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
      const cleaned = ((data || []) as HistRow[]).filter(
        (r) => !(r.nome_tecnico || "").toUpperCase().includes("BUFFER"),
      );
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

  // Helper para obter info de presença de um registro fato
  const getPresencaInfo = (r: FatoRow): PresencaRow | null => {
    const ttKey = (r.matricula_tt || "").trim().toUpperCase();
    const trKey = (r.matricula_tr || "").trim().toUpperCase();
    return (
      (ttKey && presencaByTT.get(ttKey)) ||
      (trKey && presencaByTR.get(trKey)) ||
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


  // Conjunto de TTs ativos na presença (status em branco/vazio)
  const ttsAtivos = useMemo(() => {
    const s = new Set<string>();
    presenca.forEach((p) => {
      if (!matchFilter(p.coordenador, coordenadorFilter)) return;
      if (!matchFilter(p.supervisor, supervisorFilter)) return;
      if (!matchFilter(p.funcionario, tecnicoFilter)) return;
      const stat = (p.status || "").trim();
      if (!stat && p.tt) s.add(p.tt.trim().toUpperCase());
    });
    return s;
  }, [presenca, coordenadorFilter, supervisorFilter, tecnicoFilter]);

  // Conjunto de TTs/TRs cujo Status na planilha Dimensão (tecnicos_presenca)
  // é "Técnico de Dados". Esses técnicos NÃO contabilizam em "Técnicos Ativos"
  // nem em "Sem Presença" — ficam fora do saldo. Porém, se fecharem alguma
  // atividade Concluída Com Sucesso (regra da Presença Confirmada), entram
  // normalmente em ttsPresencaOK, como qualquer outro técnico.
  const ttsTecnicoDeDados = useMemo(() => {
    const s = new Set<string>();
    presenca.forEach((p) => {
      const stat = (p.status || "").trim().toLowerCase();
      if (stat !== "técnico de dados" && stat !== "tecnico de dados") return;
      const tt = (p.tt || "").trim().toUpperCase();
      const tr = (p.tr || "").trim().toUpperCase();
      if (tt) s.add(tt);
      if (tr) s.add(tr);
    });
    return s;
  }, [presenca]);

  // Conjunto de TTs que fecharam ao menos 1 atividade OK (presença efetiva)
  // Conta INST/MUD/SRV/REP-FTTH com sucesso. RET-FTTH NÃO conta.
  const ttsPresencaOK = useMemo(() => {
    const s = new Set<string>();
    fato.forEach((r) => {
      const info = getPresencaInfo(r);
      if (!matchFilter(info?.coordenador, coordenadorFilter)) return;
      if (!matchFilter(info?.supervisor, supervisorFilter)) return;
      if (!matchFilter(info?.funcionario, tecnicoFilter) && !matchFilter(r.nome_tecnico, tecnicoFilter)) return;

      const estado = norm(r.ds_estado);
      const macro = (r.ds_macro_atividade || "").trim().toUpperCase();
      if (
        estado.includes("conclu") &&
        estado.includes("sucesso") &&
        !estado.includes("sem sucesso") &&
        MACROS_PRESENCA_OK.includes(macro) &&
        macro !== MACRO_PRESENCA_EXCLUIR
      ) {
        const tt = (r.matricula_tt || "").trim().toUpperCase();
        if (tt) s.add(tt);
      }
    });
    return s;
  }, [fato, coordenadorFilter, supervisorFilter, tecnicoFilter, presencaByTT, presencaByTR]);

  // TTs que fecharam alguma atividade no dia (qualquer estado/macro)
  const ttsComAtividade = useMemo(() => {
    const s = new Set<string>();
    fato.forEach((r) => {
      const info = getPresencaInfo(r);
      if (!matchFilter(info?.coordenador, coordenadorFilter)) return;
      if (!matchFilter(info?.supervisor, supervisorFilter)) return;
      if (!matchFilter(info?.funcionario, tecnicoFilter) && !matchFilter(r.nome_tecnico, tecnicoFilter)) return;

      const tt = (r.matricula_tt || "").trim().toUpperCase();
      if (tt) s.add(tt);
    });
    return s;
  }, [fato, coordenadorFilter, supervisorFilter, tecnicoFilter, presencaByTT, presencaByTR]);

  // Técnicos SEM PRESENÇA confirmada (inverso exato do cartão "Presença Confirmada"):
  // Parte da base de técnicos ATIVOS na planilha Dimensão (Presença) — ou seja, com a
  // coluna Status em branco ("Células Vazias"). Quem tem qualquer outro Status
  // (ex.: "Técnico de Dados", afastado, etc.) NÃO entra nesse saldo.
  // Em seguida remove os que estão em ttsPresencaOK (já confirmaram presença).
  // Resultado: começa no total de Técnicos Ativos e só baixa conforme técnicos
  // fecharem INST/MUD/SRV/REP-FTTH com sucesso. Técnicos com status alterado que
  // fecharem atividade entram em Presença Confirmada normalmente, mas nunca em Sem Presença.
  const ttsSemPresenca = useMemo(() => {
    const s = new Set<string>();
    presenca.forEach((p) => {
      if (!matchFilter(p.coordenador, coordenadorFilter)) return;
      if (!matchFilter(p.supervisor, supervisorFilter)) return;
      if (!matchFilter(p.funcionario, tecnicoFilter)) return;

      // Ignora linhas BUFFER
      const nome = (p.funcionario || "").toUpperCase();
      if (nome.includes("BUFFER")) return;
      // Só considera técnicos ATIVOS (status vazio na planilha Dimensão)
      const stat = (p.status || "").trim();
      if (stat) return;
      const tt = (p.tt || "").trim().toUpperCase();
      const tr = (p.tr || "").trim().toUpperCase();
      // Identificador prioritário: TT; se não houver, usa TR
      const key = tt || tr;
      if (!key) return;
      // Se o técnico (por TT ou TR) já confirmou presença, não entra em "Sem Presença"
      if (tt && ttsPresencaOK.has(tt)) return;
      if (tr && ttsPresencaOK.has(tr)) return;
      s.add(key);
    });
    return s;
  }, [presenca, ttsPresencaOK, coordenadorFilter, supervisorFilter, tecnicoFilter]);

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
    const uf = getRawStr(r, ["cd_uf", "uf", "sg_uf"]).trim().toUpperCase();
    return uf === "" || uf === "SC";
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

  // filtered fato (estados/macros + supervisor/coordenador + cardFilter)
  const filteredFato = useMemo(() => {
    return fato.filter((r) => {
      // sempre filtra UF=SC (quando informado)
      if (!isSC(r)) return false;
      if (estadoFilter !== "ALL" && r.ds_estado !== estadoFilter) return false;
      if (macroFilter !== "ALL" && r.ds_macro_atividade !== macroFilter) return false;

      const info = getPresencaInfo(r);
      if (!matchFilter(info?.supervisor, supervisorFilter)) return false;
      if (!matchFilter(info?.coordenador, coordenadorFilter)) return false;
      if (!matchFilter(info?.funcionario, tecnicoFilter) && !matchFilter(r.nome_tecnico, tecnicoFilter)) return false;

      if (cardFilter === "EM_ANDAMENTO") {
        if (!ESTADOS_EM_ANDAMENTO.includes(norm(r.ds_estado))) return false;
      } else if (cardFilter === "AGENDA_DIA") {
        if (!isAgendadaParaDia(r)) return false;
      } else if (cardFilter === "PRESENCA_OK") {
        const macro = (r.ds_macro_atividade || "").trim().toUpperCase();
        const estado = norm(r.ds_estado);
        const isOK =
          estado.includes("conclu") &&
          estado.includes("sucesso") &&
          !estado.includes("sem sucesso") &&
          MACROS_PRESENCA_OK.includes(macro);
        if (!isOK) return false;
      } else if (cardFilter === "ATIVOS") {
        const tt = (r.matricula_tt || "").trim().toUpperCase();
        if (!tt || !ttsAtivos.has(tt)) return false;
      } else if (cardFilter === "SEM_PRESENCA") {
        const tt = (r.matricula_tt || "").trim().toUpperCase();
        const tr = (r.matricula_tr || "").trim().toUpperCase();
        if (!(tt && ttsSemPresenca.has(tt)) && !(tr && ttsSemPresenca.has(tr))) return false;
      } else if (cardFilter === "SUCESSO") {
        const estado = norm(r.ds_estado);
        if (!(estado.includes("conclu") && estado.includes("sucesso") && !estado.includes("sem sucesso"))) return false;
      } else if (cardFilter === "INSUCESSO") {
        const estado = norm(r.ds_estado);
        if (!(estado.includes("conclu") && estado.includes("sem sucesso"))) return false;
      }
      return true;
    });
  }, [fato, estadoFilter, macroFilter, supervisorFilter, coordenadorFilter, tecnicoFilter, cardFilter, presencaByTT, presencaByTR, ttsAtivos, ttsSemPresenca, date]);

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
      const ttKey = (p.tt || "").trim().toUpperCase();
      const trKey = (p.tr || "").trim().toUpperCase();
      const key = ttKey || trKey;
      if (!key) return;
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
      }
    };

    // Pré-popular o map com técnicos da planilha de presença baseados no filtro do card.
    // Assim, se um técnico não tem NENHUMA atividade no Fato, ele ainda aparece com total=0
    presenca.forEach((p) => {
      if (!matchFilter(p.coordenador, coordenadorFilter)) return;
      if (!matchFilter(p.supervisor, supervisorFilter)) return;
      if (!matchFilter(p.funcionario, tecnicoFilter)) return;

      const tt = (p.tt || "").trim().toUpperCase();
      const tr = (p.tr || "").trim().toUpperCase();

      if (cardFilter === "SEM_PRESENCA") {
        if ((tt && ttsSemPresenca.has(tt)) || (tr && ttsSemPresenca.has(tr))) initTecnico(p);
      } else if (cardFilter === "ATIVOS") {
        if ((tt && ttsAtivos.has(tt)) || (tr && ttsAtivos.has(tr))) initTecnico(p);
      } else if (cardFilter === "PRESENCA_OK") {
        if ((tt && ttsPresencaOK.has(tt)) || (tr && ttsPresencaOK.has(tr))) initTecnico(p);
      } else if (cardFilter === "ALL") {
        initTecnico(p);
      }
    });

    filteredFato.forEach((r) => {
      const ttKey = (r.matricula_tt || "").trim().toUpperCase();
      const trKey = (r.matricula_tr || "").trim().toUpperCase();
      const key = ttKey || trKey || (r.nome_tecnico || "SEM_TECNICO");
      const presencaInfo =
        (ttKey && presencaByTT.get(ttKey)) ||
        (trKey && presencaByTR.get(trKey)) ||
        null;

      if (!map.has(key)) {
        map.set(key, {
          tt: ttKey || presencaInfo?.tt || "",
          tr: trKey || presencaInfo?.tr || "",
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
    return arr.sort((a, b) => b.total - a.total);
  }, [filteredFato, presencaByTT, presencaByTR, search]);

  // Totais de sucesso/insucesso baseados em TODAS as atividades do dia (UF=SC),
  // sem aplicar cardFilter — somente filtros de seletor (estado/macro/sup/coord).
  const totalsAll = useMemo(() => {
    let sucesso = 0, insucesso = 0;
    fato.forEach((r) => {
      if (!isSC(r)) return;
      if (estadoFilter !== "ALL" && r.ds_estado !== estadoFilter) return;
      if (macroFilter !== "ALL" && r.ds_macro_atividade !== macroFilter) return;
      const info = getPresencaInfo(r);
      if (!matchFilter(info?.supervisor, supervisorFilter)) return;
      if (!matchFilter(info?.coordenador, coordenadorFilter)) return;
      if (!matchFilter(info?.funcionario, tecnicoFilter) && !matchFilter(r.nome_tecnico, tecnicoFilter)) return;
      const estado = norm(r.ds_estado);
      if (estado.includes("conclu") && estado.includes("sem sucesso")) {
        insucesso++;
      }
      else if (estado.includes("conclu") && estado.includes("sucesso")) sucesso++;
    });
    return { sucesso, insucesso };
  }, [fato, estadoFilter, macroFilter, supervisorFilter, coordenadorFilter, tecnicoFilter, presencaByTT, presencaByTR]);

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
      if (estadoFilter !== "ALL" && r.ds_estado !== estadoFilter) return false;
      if (macroFilter !== "ALL" && r.ds_macro_atividade !== macroFilter) return false;
      return true;
    });

    const totalEmAndamento = baseFato.filter((r) =>
      ESTADOS_EM_ANDAMENTO.includes(norm(r.ds_estado)),
    ).length;
    const totalAgendaDia = baseFato.filter(isAgendadaParaDia).length;

    const totalPresencaOK = ttsPresencaOK.size;
    const totalSemPresenca = ttsSemPresenca.size;

    return {
      totalTecnicosPresenca,
      totalAtivos,
      totalEmAndamento,
      totalAgendaDia,
      totalPresencaOK,
      totalSemPresenca,
    };
  }, [presenca, fato, ttsAtivos, ttsPresencaOK, ttsSemPresenca, date, coordenadorFilter, supervisorFilter, tecnicoFilter, estadoFilter, macroFilter, presencaByTT, presencaByTR]);

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

  const handleNumberClick = (r: any) => {
    if (r.nome && r.nome !== "—") {
      setAtividadesTabSearch(r.nome);
    } else if (r.tt) {
      setAtividadesTabSearch(r.tt);
    } else if (r.tr) {
      setAtividadesTabSearch(r.tr);
    }
    setActiveTab("atividades");
  };

  const atividadesTabFato = useMemo(() => {
    let arr = filteredFato;
    if (atividadesTabSearch.trim()) {
      const q = atividadesTabSearch.trim().toLowerCase();
      arr = arr.filter((r) => 
        (r.nome_tecnico || "").toLowerCase().includes(q) ||
        (r.matricula_tt || "").toLowerCase().includes(q) ||
        (r.matricula_tr || "").toLowerCase().includes(q)
      );
    }
    return arr;
  }, [filteredFato, atividadesTabSearch]);

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
          <h1 className="text-xl font-bold">Encerramento de Atividades</h1>
          {lastSync && (
            <Badge variant="secondary" className="text-[10px]">
              Última sync: {new Date(lastSync).toLocaleString("pt-BR")}
            </Badge>
          )}
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
        <TabsList className="sticky top-0 z-30 bg-background shadow-sm">
          <TabsTrigger value="resumo">Resumo Diário</TabsTrigger>
          <TabsTrigger value="atividades">Atividades</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
          {isAdmin && <TabsTrigger value="config">Configuração</TabsTrigger>}
        </TabsList>

        {/* RESUMO POR TÉCNICO */}
        <TabsContent value="resumo" className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
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
                  cardFilter === "EM_ANDAMENTO" ? "Em Andamento" :
                  cardFilter === "SUCESSO" ? "Concluídas c/ Sucesso" :
                  cardFilter === "INSUCESSO" ? "Concluídas s/ Sucesso" :
                  "Agenda do Dia"
                }
              </Badge>
              <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setCardFilter("ALL")}>
                Limpar
              </Button>
            </div>
          )}

          <Card className="sticky top-10 z-20 bg-background shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center gap-2">
                <Filter className="w-4 h-4 text-muted-foreground" />
                
                {/* Botão de Limpar Todos os Filtros */}
                {(coordenadorFilter !== "ALL" || supervisorFilter !== "ALL" || tecnicoFilter !== "ALL" || estadoFilter !== "ALL" || macroFilter !== "ALL" || search !== "") && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => {
                      setCoordenadorFilter("ALL");
                      setSupervisorFilter("ALL");
                      setTecnicoFilter("ALL");
                      setEstadoFilter("ALL");
                      setMacroFilter("ALL");
                      setSearch("");
                    }} 
                    className="h-8 text-xs border-dashed text-muted-foreground hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-colors mr-2"
                  >
                    <X className="w-3 h-3 mr-1" />
                    Limpar Filtros
                  </Button>
                )}

                <div className="relative group">
                  <Select value={coordenadorFilter} onValueChange={(v) => { setCoordenadorFilter(v); setSupervisorFilter("ALL"); setTecnicoFilter("ALL"); }}>
                    <SelectTrigger className={`w-[180px] h-8 text-xs ${coordenadorFilter !== "ALL" ? "border-primary/50 bg-primary/5" : ""}`}><SelectValue placeholder="Coordenador" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL" className="font-medium text-muted-foreground">-- Limpar Coordenador --</SelectItem>
                      {coordenadores.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="relative group">
                  <Select value={supervisorFilter} onValueChange={(v) => { setSupervisorFilter(v); setTecnicoFilter("ALL"); }}>
                    <SelectTrigger className={`w-[180px] h-8 text-xs ${supervisorFilter !== "ALL" ? "border-primary/50 bg-primary/5" : ""}`}><SelectValue placeholder="Supervisor" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL" className="font-medium text-muted-foreground">-- Limpar Supervisor --</SelectItem>
                      {supervisores.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="relative group">
                  <Select value={tecnicoFilter} onValueChange={setTecnicoFilter}>
                    <SelectTrigger className={`w-[180px] h-8 text-xs ${tecnicoFilter !== "ALL" ? "border-primary/50 bg-primary/5" : ""}`}><SelectValue placeholder="Técnico" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL" className="font-medium text-muted-foreground">-- Limpar Técnico --</SelectItem>
                      {tecnicos.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="relative group">
                  <Select value={estadoFilter} onValueChange={setEstadoFilter}>
                    <SelectTrigger className={`w-[180px] h-8 text-xs ${estadoFilter !== "ALL" ? "border-primary/50 bg-primary/5" : ""}`}><SelectValue placeholder="Estado" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL" className="font-medium text-muted-foreground">-- Limpar Estado --</SelectItem>
                      {estados.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="relative group">
                  <Select value={macroFilter} onValueChange={setMacroFilter}>
                    <SelectTrigger className={`w-[180px] h-8 text-xs ${macroFilter !== "ALL" ? "border-primary/50 bg-primary/5" : ""}`}><SelectValue placeholder="Macro atividade" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL" className="font-medium text-muted-foreground">-- Limpar Macro Ativ. --</SelectItem>
                      {macros.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <Input
                  placeholder="Buscar técnico, TT, supervisor..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className={`w-[260px] h-8 text-xs ${search ? "border-primary/50 bg-primary/5" : ""}`}
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-auto max-h-[600px]">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="text-[11px]">TT</TableHead>
                      <TableHead className="text-[11px]">TR</TableHead>
                      <TableHead className="text-[11px]">Técnico</TableHead>
                      <TableHead className="text-[11px]">Operadora</TableHead>
                      <TableHead className="text-[11px]">Supervisor</TableHead>
                      <TableHead className="text-[11px]">Coordenador</TableHead>
                      <TableHead className="text-[11px]">Setor</TableHead>
                      <TableHead className="text-[11px] text-center">Status</TableHead>
                      <TableHead className="text-[11px] text-center text-success">Sucesso</TableHead>
                      <TableHead className="text-[11px] text-center text-destructive">Insucesso</TableHead>
                      <TableHead className="text-[11px] text-center">Total</TableHead>
                      <TableHead className="text-[11px] text-center">% Sucesso</TableHead>
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
                          <TableCell className="text-[11px] text-center">{r.status && <Badge variant="outline" className={`text-[10px] ${r.status === 'Ativo' ? 'bg-success/10 text-success border-success/20' : ''}`}>{r.status}</Badge>}</TableCell>
                          <TableCell className="text-[11px] text-center font-semibold text-success cursor-pointer hover:underline" onClick={() => handleNumberClick(r)}>{r.sucesso}</TableCell>
                          <TableCell className="text-[11px] text-center font-semibold text-destructive cursor-pointer hover:underline" onClick={() => handleNumberClick(r)}>{r.insucesso}</TableCell>
                          <TableCell className="text-[11px] text-center font-semibold cursor-pointer hover:underline" onClick={() => handleNumberClick(r)}>{r.total}</TableCell>
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
              <div className="flex justify-between items-center flex-wrap gap-2">
                <div>
                  <CardTitle className="text-sm">Atividades do dia ({atividadesTabFato.length})</CardTitle>
                  <CardDescription className="text-xs">Use os filtros acima para refinar.</CardDescription>
                </div>
                {atividadesTabSearch && (
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">Filtrado por: {atividadesTabSearch}</Badge>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => setAtividadesTabSearch("")} 
                      className="h-6 text-xs text-muted-foreground hover:text-destructive"
                    >
                      Limpar filtro
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-auto max-h-[600px]">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="text-[11px]">TT</TableHead>
                      <TableHead className="text-[11px]">TR</TableHead>
                      <TableHead className="text-[11px]">Técnico</TableHead>
                      <TableHead className="text-[11px]">ds_macro_atividade</TableHead>
                      <TableHead className="text-[11px]">ds_estado</TableHead>
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

                      return (
                        <TableRow key={r.id}>
                          <TableCell className="text-[11px] font-mono">{r.matricula_tt}</TableCell>
                          <TableCell className="text-[11px] font-mono">{r.matricula_tr}</TableCell>
                          <TableCell className="text-[11px]">{r.nome_tecnico}</TableCell>
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
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="text-sm">Histórico (últimos 60 dias)</CardTitle>
                  <CardDescription className="text-[11px]">
                    Resumo do dia {fmtDateBR(date)} + comparativo diário e mensal
                  </CardDescription>
                </div>
                <Button size="sm" variant="outline" onClick={loadHistorico} disabled={loadingHist}>
                  {loadingHist ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  <span className="ml-1 text-xs">Atualizar</span>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Tabela comparativa */}
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[11px]">Período</TableHead>
                      <TableHead className="text-[11px] text-center text-success">Sucesso</TableHead>
                      <TableHead className="text-[11px] text-center text-destructive">Insucesso</TableHead>
                      <TableHead className="text-[11px] text-center">Total</TableHead>
                      <TableHead className="text-[11px] text-center">Δ vs anterior</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="text-[11px] font-medium">Dia ({fmtDateBR(date)})</TableCell>
                      <TableCell className="text-[11px] text-center text-success font-semibold">{histCompare.sel.sucesso}</TableCell>
                      <TableCell className="text-[11px] text-center text-destructive font-semibold">{histCompare.sel.insucesso}</TableCell>
                      <TableCell className="text-[11px] text-center font-semibold">{histCompare.sel.total}</TableCell>
                      <TableCell className="text-[11px] text-center">{delta(histCompare.sel.total, histCompare.prev.total)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-[11px] text-muted-foreground">Dia anterior ({fmtDateBR(histCompare.prevDate)})</TableCell>
                      <TableCell className="text-[11px] text-center">{histCompare.prev.sucesso}</TableCell>
                      <TableCell className="text-[11px] text-center">{histCompare.prev.insucesso}</TableCell>
                      <TableCell className="text-[11px] text-center">{histCompare.prev.total}</TableCell>
                      <TableCell className="text-[11px] text-center text-muted-foreground">—</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-[11px] font-medium">Mês ({fmtMonthBR(histCompare.ym)})</TableCell>
                      <TableCell className="text-[11px] text-center text-success font-semibold">{histCompare.cur.sucesso}</TableCell>
                      <TableCell className="text-[11px] text-center text-destructive font-semibold">{histCompare.cur.insucesso}</TableCell>
                      <TableCell className="text-[11px] text-center font-semibold">{histCompare.cur.total}</TableCell>
                      <TableCell className="text-[11px] text-center">{delta(histCompare.cur.total, histCompare.past.total)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-[11px] text-muted-foreground">Mês anterior ({fmtMonthBR(histCompare.prevYm)})</TableCell>
                      <TableCell className="text-[11px] text-center">{histCompare.past.sucesso}</TableCell>
                      <TableCell className="text-[11px] text-center">{histCompare.past.insucesso}</TableCell>
                      <TableCell className="text-[11px] text-center">{histCompare.past.total}</TableCell>
                      <TableCell className="text-[11px] text-center text-muted-foreground">—</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              {/* Gráficos */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-medium mb-1">Evolução diária (últimos 60 dias)</div>
                  <div className="h-[220px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={histDaily} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="dia" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <RTooltip labelFormatter={(d: string) => fmtDateBR(d)} contentStyle={{ fontSize: 11 }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Line type="monotone" dataKey="sucesso" stroke="hsl(var(--success))" strokeWidth={2} dot={false} name="Sucesso" />
                        <Line type="monotone" dataKey="insucesso" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} name="Insucesso" />
                        <Line type="monotone" dataKey="total" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Total" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium mb-1">Comparativo mensal</div>
                  <div className="h-[220px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={histMonthly} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="mes" tick={{ fontSize: 10 }} tickFormatter={fmtMonthBR} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <RTooltip labelFormatter={(m: string) => fmtMonthBR(m)} contentStyle={{ fontSize: 11 }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="sucesso" fill="hsl(var(--success))" name="Sucesso" />
                        <Bar dataKey="insucesso" fill="hsl(var(--destructive))" name="Insucesso" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Top 10 técnicos do dia */}
              <div>
                <div className="text-xs font-medium mb-1">Top 10 técnicos — {fmtDateBR(date)}</div>
                <div className="overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[11px]">#</TableHead>
                        <TableHead className="text-[11px]">TT</TableHead>
                        <TableHead className="text-[11px]">Técnico</TableHead>
                        <TableHead className="text-[11px] text-center text-success">Sucesso</TableHead>
                        <TableHead className="text-[11px] text-center text-destructive">Insucesso</TableHead>
                        <TableHead className="text-[11px] text-center">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rankingDia.length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-4">Sem atividades neste dia.</TableCell></TableRow>
                      ) : rankingDia.map((r, i) => (
                        <TableRow key={`${r.tt}-${r.nome}-${i}`}>
                          <TableCell className="text-[11px] font-mono">{i + 1}</TableCell>
                          <TableCell className="text-[11px] font-mono">{r.tt}</TableCell>
                          <TableCell className="text-[11px]">{r.nome}</TableCell>
                          <TableCell className="text-[11px] text-center text-success font-semibold">{r.sucesso}</TableCell>
                          <TableCell className="text-[11px] text-center text-destructive font-semibold">{r.insucesso}</TableCell>
                          <TableCell className="text-[11px] text-center font-semibold">{r.total}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
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