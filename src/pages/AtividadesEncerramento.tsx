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
import { Loader2, RefreshCw, Upload, Save, Activity as ActivityIcon, Filter, X } from "lucide-react";
import * as XLSX from "xlsx";

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

  // settings
  const [csvUrl, setCsvUrl] = useState("");
  const [savingUrl, setSavingUrl] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const fatoFileRef = useRef<HTMLInputElement>(null);
  const [uploadingFato, setUploadingFato] = useState(false);

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

  useEffect(() => {
    loadData();
  }, [date]);

  useEffect(() => {
    if (isAdmin) loadSettings();
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
      if (coordenadorFilter !== "ALL" && p.coordenador?.trim() !== coordenadorFilter) return;
      if (p.supervisor) s.add(p.supervisor.trim());
    });
    return Array.from(s).filter(Boolean).sort();
  }, [presenca, coordenadorFilter]);

  const coordenadores = useMemo(() => {
    const s = new Set<string>();
    presenca.forEach((p) => p.coordenador && s.add(p.coordenador.trim()));
    return Array.from(s).filter(Boolean).sort();
  }, [presenca]);

  const tecnicos = useMemo(() => {
    const s = new Set<string>();
    presenca.forEach((p) => {
      if (coordenadorFilter !== "ALL" && p.coordenador?.trim() !== coordenadorFilter) return;
      if (supervisorFilter !== "ALL" && p.supervisor?.trim() !== supervisorFilter) return;
      if (p.funcionario) s.add(p.funcionario.trim());
    });
    fato.forEach((r) => {
      const info = getPresencaInfo(r);
      if (coordenadorFilter !== "ALL" && (info?.coordenador || "").trim() !== coordenadorFilter) return;
      if (supervisorFilter !== "ALL" && (info?.supervisor || "").trim() !== supervisorFilter) return;
      if (r.nome_tecnico) s.add(r.nome_tecnico.trim());
    });
    return Array.from(s).filter(Boolean).sort();
  }, [presenca, fato, coordenadorFilter, supervisorFilter, presencaByTT, presencaByTR]);


  // Conjunto de TTs ativos na presença (status em branco/vazio)
  const ttsAtivos = useMemo(() => {
    const s = new Set<string>();
    presenca.forEach((p) => {
      if (coordenadorFilter !== "ALL" && p.coordenador?.trim() !== coordenadorFilter) return;
      if (supervisorFilter !== "ALL" && p.supervisor?.trim() !== supervisorFilter) return;
      if (tecnicoFilter !== "ALL" && p.funcionario?.trim() !== tecnicoFilter) return;
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
      if (coordenadorFilter !== "ALL" && (info?.coordenador || "").trim() !== coordenadorFilter) return;
      if (supervisorFilter !== "ALL" && (info?.supervisor || "").trim() !== supervisorFilter) return;
      if (tecnicoFilter !== "ALL" && (info?.funcionario || "").trim() !== tecnicoFilter && (r.nome_tecnico || "").trim() !== tecnicoFilter) return;

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
      if (coordenadorFilter !== "ALL" && (info?.coordenador || "").trim() !== coordenadorFilter) return;
      if (supervisorFilter !== "ALL" && (info?.supervisor || "").trim() !== supervisorFilter) return;
      if (tecnicoFilter !== "ALL" && (info?.funcionario || "").trim() !== tecnicoFilter && (r.nome_tecnico || "").trim() !== tecnicoFilter) return;

      const tt = (r.matricula_tt || "").trim().toUpperCase();
      if (tt) s.add(tt);
    });
    return s;
  }, [fato, coordenadorFilter, supervisorFilter, tecnicoFilter, presencaByTT, presencaByTR]);

  // Técnicos SEM PRESENÇA confirmada (inverso exato do cartão "Presença Confirmada"):
  // Parte da base de técnicos com TT (ou TR) cadastrados na planilha Dimensão (Presença)
  // e remove aqueles que estão em ttsPresencaOK.
  // Resultado: técnicos da escala que NÃO fecharam nenhuma INST/MUD/SRV/REP-FTTH com sucesso.
  const ttsSemPresenca = useMemo(() => {
    const s = new Set<string>();
    presenca.forEach((p) => {
      if (coordenadorFilter !== "ALL" && p.coordenador?.trim() !== coordenadorFilter) return;
      if (supervisorFilter !== "ALL" && p.supervisor?.trim() !== supervisorFilter) return;
      if (tecnicoFilter !== "ALL" && p.funcionario?.trim() !== tecnicoFilter) return;

      // Ignora linhas BUFFER
      const nome = (p.funcionario || "").toUpperCase();
      if (nome.includes("BUFFER")) return;
      const tt = (p.tt || "").trim().toUpperCase();
      const tr = (p.tr || "").trim().toUpperCase();
      // Identificador prioritário: TT; se não houver, usa TR
      const key = tt || tr;
      if (!key) return;
      // Status "Técnico de Dados" fica fora do saldo Sem Presença
      if ((tt && ttsTecnicoDeDados.has(tt)) || (tr && ttsTecnicoDeDados.has(tr))) return;
      // Se o técnico (por TT ou TR) já confirmou presença, não entra em "Sem Presença"
      if (tt && ttsPresencaOK.has(tt)) return;
      if (tr && ttsPresencaOK.has(tr)) return;
      s.add(key);
    });
    return s;
  }, [presenca, ttsPresencaOK, ttsTecnicoDeDados, coordenadorFilter, supervisorFilter, tecnicoFilter]);

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
      if (supervisorFilter !== "ALL" && (info?.supervisor || "").trim() !== supervisorFilter) return false;
      if (coordenadorFilter !== "ALL" && (info?.coordenador || "").trim() !== coordenadorFilter) return false;
      if (tecnicoFilter !== "ALL" && (info?.funcionario || "").trim() !== tecnicoFilter && (r.nome_tecnico || "").trim() !== tecnicoFilter) return false;

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
      if (supervisorFilter !== "ALL" && (info?.supervisor || "").trim() !== supervisorFilter) return;
      if (coordenadorFilter !== "ALL" && (info?.coordenador || "").trim() !== coordenadorFilter) return;
      if (tecnicoFilter !== "ALL" && (info?.funcionario || "").trim() !== tecnicoFilter && (r.nome_tecnico || "").trim() !== tecnicoFilter) return;
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
      if (coordenadorFilter !== "ALL" && p.coordenador?.trim() !== coordenadorFilter) return false;
      if (supervisorFilter !== "ALL" && p.supervisor?.trim() !== supervisorFilter) return false;
      if (tecnicoFilter !== "ALL" && p.funcionario?.trim() !== tecnicoFilter) return false;
      return true;
    });

    const totalTecnicosPresenca = filteredPresenca.length;
    const totalAtivos = ttsAtivos.size;

    const baseFato = fato.filter(r => {
      if (!isSC(r)) return false;
      const info = getPresencaInfo(r);
      if (coordenadorFilter !== "ALL" && (info?.coordenador || "").trim() !== coordenadorFilter) return false;
      if (supervisorFilter !== "ALL" && (info?.supervisor || "").trim() !== supervisorFilter) return false;
      if (tecnicoFilter !== "ALL" && (info?.funcionario || "").trim() !== tecnicoFilter && (r.nome_tecnico || "").trim() !== tecnicoFilter) return false;
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
    // Deprecated via web
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
      setTecnicoFilter(r.nome);
    } else if (r.tt) {
      setSearch(r.tt);
    } else if (r.tr) {
      setSearch(r.tr);
    }
    setActiveTab("atividades");
  };

  return (
    <div className="flex-1 overflow-auto p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <ActivityIcon className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold">Encerramento de Atividades</h1>
          {lastSync && (
            <Badge variant="secondary" className="text-[10px]">
              Última sync: {new Date(lastSync).toLocaleString("pt-BR")}
            </Badge>
          )}
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
          <Button onClick={loadData} size="sm" variant="outline" disabled={loading}>
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="resumo">Resumo Diário</TabsTrigger>
          <TabsTrigger value="atividades">Atividades</TabsTrigger>
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
                <div className="text-[10px] text-muted-foreground mt-1">Dimensão sem OK</div>
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

          <Card>
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
              <CardTitle className="text-sm">Atividades do dia ({filteredFato.length})</CardTitle>
              <CardDescription className="text-xs">Use os filtros acima para refinar.</CardDescription>
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
                    {filteredFato.slice(0, 2000).map((r) => {
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

        {/* CONFIGURAÇÃO ADMIN */}
        {isAdmin && (
          <TabsContent value="config" className="space-y-4">
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