import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAccessTracking } from "@/hooks/useAccessTracking";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, RefreshCw, AlertTriangle, Layers, MapPin, Wrench, FileSpreadsheet, Zap, ArrowUp, ArrowDown, ArrowUpDown, Building2, Filter, Clock, Activity } from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
  LabelList,
} from "recharts";

type FatoRow = {
  id: string;
  ds_estado: string | null;
  ds_macro_atividade: string | null;
  raw: Record<string, unknown> | null;
};

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

const getRaw = (r: FatoRow, keys: string[]): string => {
  const raw = r.raw || {};
  const lookup = new Map<string, string>();
  Object.keys(raw).forEach((k) => {
    lookup.set(norm(k), String((raw as Record<string, unknown>)[k] ?? ""));
  });
  for (const c of keys) {
    const v = lookup.get(norm(c));
    if (v && v.toUpperCase() !== "NULL") return v;
  }
  return "";
};

// Corrige caracteres mojibake comuns (UTF-8 lido como latin-1)
const fixText = (s: string): string => {
  if (!s) return "";
  return s
    .replace(/Ã£/g, "ã").replace(/Ã¡/g, "á").replace(/Ã©/g, "é").replace(/Ã­/g, "í")
    .replace(/Ã³/g, "ó").replace(/Ãº/g, "ú").replace(/Ã§/g, "ç").replace(/Ãµ/g, "õ")
    .replace(/Ã¢/g, "â").replace(/Ãª/g, "ê").replace(/Ã´/g, "ô").replace(/Ã /g, "à")
    .replace(/Ã‰/g, "É").replace(/Ã‡/g, "Ç").replace(/Ã“/g, "Ó").replace(/Ã”/g, "Ô")
    .replace(/Ã‚/g, "Â").replace(/Ãƒ/g, "Ã")
    .replace(/Ã\x8D/g, "Í").replace(/Ã\x81/g, "Á").replace(/Ã\x9A/g, "Ú")
    .replace(/NULL/gi, "").trim();
};

const fixEstado = (s: string): string => {
  const f = fixText(s);
  if (/n.?o\s*atribu/i.test(f)) return "Não Atribuido";
  if (/^atribu/i.test(f)) return "Atribuido";
  return f;
};

// Para nomes de bairro/cidade: remove acentos e ~ para padronizar agrupamentos
// (ex.: "SÃO VICENTE" e "SAO VICENTE" passam a contar como o mesmo bairro).
const stripAccents = (s: string): string =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const cleanLocal = (s: string): string => stripAccents(fixText(s));

const fmtDateTime = (val: string): string => {
  if (!val) return "";
  const v = val.trim();
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})[\sT]+(\d{2}:\d{2}:\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1].slice(-2)} ${m[4]}`;
  m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})[\sT]+(\d{2}:\d{2}:\d{2})/);
  if (m) return `${m[1]}/${m[2]}/${m[3].slice(-2)} ${m[4]}`;
  return v;
};

const fmtPot = (val: string): string => {
  if (!val) return "";
  const n = parseFloat(val.replace(",", "."));
  if (isNaN(n)) return val;
  return n.toFixed(2).replace(".", ",");
};

const parsePot = (val: string): number | null => {
  if (!val) return null;
  const n = parseFloat(val.replace(",", "."));
  return isNaN(n) ? null : n;
};

// Calcula Status Potências combinando Status NAF + Ptcia_OLT + Ptcia_ONT.
// Regra: < -27 => atenuado (sinal pior). Ambas atenuadas => Sinal_Atenuado.
const computeStatusPot = (statusNaf: string, potOlt: string, potOnt: string): string => {
  if (!statusNaf) return "";
  if (/sem\s*pot/i.test(statusNaf)) return "Sem Potência";
  if (/com\s*pot/i.test(statusNaf)) {
    const olt = parsePot(potOlt);
    const ont = parsePot(potOnt);
    const oltAt = olt !== null && olt < -27;
    const ontAt = ont !== null && ont < -27;
    if (oltAt && ontAt) return "Sinal_Atenuado";
    if (oltAt) return "OLT_Atenuado";
    if (ontAt) return "ONT_Atenuada";
    return "Potência OK";
  }
  return statusNaf;
};

const MultiFilter = ({
  label, options, value, onChange, width = 170,
}: { label: string; options: string[]; value: string[]; onChange: (v: string[]) => void; width?: number }) => {
  const active = value.length > 0;
  const toggle = (opt: string) => {
    const next = value.includes(opt) ? value.filter((x) => x !== opt) : [...value, opt];
    onChange(next.length === options.length ? [] : next);
  };
  const display = !active ? <span className="text-muted-foreground">{label}</span>
    : value.length === 1 ? <span className="truncate">{value[0]}</span>
    : <span className="truncate">{label}: {value.length}</span>;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" style={{ width }}
          className={`flex h-8 items-center justify-between rounded-md border border-input bg-background px-3 text-xs ${active ? "border-primary/50 bg-primary/5" : ""}`}>
          {display}
          <span className="ml-2 opacity-50">▾</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="start">
        <div className="max-h-[280px] overflow-auto p-1">
          {options.length === 0 && <div className="p-2 text-xs text-muted-foreground">Sem opções</div>}
          {options.map((opt) => (
            <label key={opt} className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent">
              <Checkbox checked={value.length === 0 ? false : value.includes(opt)} onCheckedChange={() => toggle(opt)} />
              <span className="truncate">{opt}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

const ConcentracaoReparos = () => {
  useAccessTracking("/concentracao-reparos", true, "Concentração de Reparos");
  const [fato, setFato] = useState<FatoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [estadoFilter, setEstadoFilter] = useState<string[]>([]);
  const [municipioFilter, setMunicipioFilter] = useState<string[]>([]);
  const [setorFilter, setSetorFilter] = useState<string[]>([]);
  const [statusNafFilter, setStatusNafFilter] = useState<string[]>([]);
  const [statusPotFilter, setStatusPotFilter] = useState<string[]>([]);
  const [estacaoFilter, setEstacaoFilter] = useState<string[]>([]);
  const [cdoFilter, setCdoFilter] = useState<string[]>([]);
  const [bairroFilter, setBairroFilter] = useState<string[]>([]);
  const [bairroOnlyConc, setBairroOnlyConc] = useState(false);
  const [cdoOnlyConc, setCdoOnlyConc] = useState(false);
  const [comPotenciaOnly, setComPotenciaOnly] = useState(false);
  const [semPotenciaOnly, setSemPotenciaOnly] = useState(false);
  const [timOnly, setTimOnly] = useState(false);
  const [nioOnly, setNioOnly] = useState(false);
  const [cidadeOnlyConc, setCidadeOnlyConc] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selectedDay, setSelectedDay] = useState<string | null>(new Date().getDate().toString().padStart(2, '0'));

  const toggleSort = (k: string) => {
    if (sortKey !== k) { setSortKey(k); setSortDir("asc"); }
    else if (sortDir === "asc") setSortDir("desc");
    else { setSortKey(null); setSortDir("asc"); }
  };
  const SortIcon = ({ k }: { k: string }) => {
    if (sortKey !== k) return <ArrowUpDown className="w-3 h-3 inline ml-1 opacity-40" />;
    return sortDir === "asc"
      ? <ArrowUp className="w-3 h-3 inline ml-1" />
      : <ArrowDown className="w-3 h-3 inline ml-1" />;
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      // Buscar somente REP-FTTH para reduzir payload
      const { data, error } = await supabase
        .from("atividades_fato")
        .select("id, ds_estado, ds_macro_atividade, raw")
        .eq("ds_macro_atividade", "REP-FTTH");
      if (error) throw error;
      setFato((data || []) as FatoRow[]);

      // Buscar timestamp da última importação/sincronização da tabela FATO
      const { data: logData } = await supabase
        .from("atividades_sync_log")
        .select("finished_at, started_at")
        .eq("status", "success")
        .order("finished_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      const ts = logData?.finished_at || logData?.started_at;
      setLastUpdate(ts ? new Date(ts) : null);
    } finally {
      setLoading(false);
    }
  };

  const clearAllFilters = () => {
    setEstadoFilter([]); setMunicipioFilter([]); setSetorFilter([]); setStatusNafFilter([]); setStatusPotFilter([]);
    setEstacaoFilter([]); setCdoFilter([]); setBairroFilter([]);
    setBairroOnlyConc(false); setCdoOnlyConc(false); setCidadeOnlyConc(false);
    setComPotenciaOnly(false); setSemPotenciaOnly(false); setTimOnly(false); setNioOnly(false); setSearch("");
  };

  useEffect(() => { fetchData(); }, []);

  // Realtime: quando uma nova sincronização da FATO concluir, recarrega
  // os dados automaticamente e limpa filtros aplicados — sem refresh.
  useEffect(() => {
    const channel = supabase
      .channel("atividades-sync-log-watch")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "atividades_sync_log" },
        (payload) => {
          const row = (payload.new ?? payload.old) as { status?: string } | null;
          if (row?.status === "success") {
            clearAllFilters();
            fetchData();
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Status considerados "em aberto" — alinhado ao relatório:
  // exclui apenas "Concluído com sucesso". "Concluído sem sucesso" e
  // "Fechado em WFM" continuam contando como REP-FTTH em aberto, pois o
  // reparo não foi efetivamente finalizado com êxito.
  const STATUS_ABERTO = useMemo(
    () => new Set([
      "atribuido",
      "cancelado",
      "emdeslocamento",
      "emexecucao",
      "naoatribuido",
      "recebido",
      "concluidosemsucesso",
      "fechadoemwfm",
    ]),
    []
  );

  // Base já filtrada por: macro=REP-FTTH, UF=SC, in_pronto_execucao=SIM, status em aberto
  const base = useMemo(() => {
    return fato.filter((r) => {
      const uf = getRaw(r, ["cd_uf", "uf"]).trim().toUpperCase();
      if (uf !== "SC") return false;
      const pe = getRaw(r, ["in_pronto_execucao", "pronto_execucao"]).trim().toUpperCase();
      if (pe !== "SIM") return false;
      const estadoKey = norm(fixEstado(r.ds_estado || ""));
      if (!STATUS_ABERTO.has(estadoKey)) return false;
      return true;
    });
  }, [fato, STATUS_ABERTO]);

  // Aplica filtros das listas suspensas + busca (cards refletem isso)
  const filteredBase = useMemo(() => {
    const q = search.trim().toLowerCase();
    return base.filter((r) => {
      const estado = fixEstado(r.ds_estado || "");
      if (estadoFilter.length && !estadoFilter.includes(estado)) return false;
      const mun = fixText(getRaw(r, ["ds_municipio"]));
      if (municipioFilter.length && !municipioFilter.includes(mun)) return false;
      const setor = getRaw(r, ["cd_setor"]);
      if (setorFilter.length && !setorFilter.includes(setor)) return false;
      const sn = getRaw(r, ["status_naf"]);
      if (statusNafFilter.length && !statusNafFilter.includes(sn)) return false;
      if (statusPotFilter.length) {
        const sp = computeStatusPot(sn, getRaw(r, ["potencia_na_olt"]), getRaw(r, ["potencia_na_ont"]));
        if (!statusPotFilter.includes(sp)) return false;
      }
      const estacao = getRaw(r, ["cd_estacao"]);
      if (estacaoFilter.length && !estacaoFilter.includes(estacao)) return false;
      const cdoVal = getRaw(r, ["cdo"]);
      if (cdoFilter.length && !cdoFilter.includes(cdoVal)) return false;
      const bairroVal = fixText(getRaw(r, ["ds_bairro"]));
      if (bairroFilter.length && !bairroFilter.includes(bairroVal)) return false;
      if (q) {
        const blob = JSON.stringify(r.raw || {}).toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [base, estadoFilter, municipioFilter, setorFilter, statusNafFilter, statusPotFilter, estacaoFilter, cdoFilter, bairroFilter, search]);

  // Mapas de concentração base (sobre filteredBase) - usados para identificar
  // bairros/cdos/cidades concentradas independentemente dos toggles dos cards
  const bairroCount = useMemo(() => {
    const m = new Map<string, number>();
    filteredBase.forEach((r) => {
      const b = fixText(getRaw(r, ["ds_bairro"])).toUpperCase();
      const mun = fixText(getRaw(r, ["ds_municipio"])).toUpperCase();
      if (!b) return;
      const key = `${mun}||${b}`;
      m.set(key, (m.get(key) || 0) + 1);
    });
    return m;
  }, [filteredBase]);

  const cdoCount = useMemo(() => {
    const m = new Map<string, number>();
    filteredBase.forEach((r) => {
      const c = getRaw(r, ["cdo"]).toUpperCase();
      if (!c) return;
      m.set(c, (m.get(c) || 0) + 1);
    });
    return m;
  }, [filteredBase]);

  const cidadeCount = useMemo(() => {
    const m = new Map<string, number>();
    filteredBase.forEach((r) => {
      const c = fixText(getRaw(r, ["ds_municipio"])).toUpperCase();
      if (!c) return;
      m.set(c, (m.get(c) || 0) + 1);
    });
    return m;
  }, [filteredBase]);

  // Aplica os toggles dos cards sobre filteredBase, com possibilidade de
  // pular determinado toggle (para o card daquele toggle continuar mostrando
  // sua contagem mesmo quando ativo).
  type SkipKeys = { bairro?: boolean; cdo?: boolean; cidade?: boolean; comPot?: boolean; semPot?: boolean; tim?: boolean; nio?: boolean };
  const applyCardToggles = (skip: SkipKeys = {}) => {
    return filteredBase.filter((r) => {
      if (!skip.bairro && bairroOnlyConc) {
        const b = fixText(getRaw(r, ["ds_bairro"])).toUpperCase();
        const mun = fixText(getRaw(r, ["ds_municipio"])).toUpperCase();
        if ((bairroCount.get(`${mun}||${b}`) || 0) < 2) return false;
      }
      if (!skip.cdo && cdoOnlyConc) {
        const c = getRaw(r, ["cdo"]).toUpperCase();
        if ((cdoCount.get(c) || 0) < 2) return false;
      }
      if (!skip.cidade && cidadeOnlyConc) {
        const c = fixText(getRaw(r, ["ds_municipio"])).toUpperCase();
        if ((cidadeCount.get(c) || 0) <= 20) return false;
      }
      if (!skip.comPot && comPotenciaOnly && !/com\s*pot/i.test(getRaw(r, ["status_naf"]))) return false;
      if (!skip.semPot && semPotenciaOnly && !/sem\s*pot/i.test(getRaw(r, ["status_naf"]))) return false;
      const cp = getRaw(r, ["cp", "cd_cp"]).trim().toUpperCase();
      if (!skip.tim && timOnly && cp !== "TIM") return false;
      if (!skip.nio && nioOnly && cp !== "NIO") return false;
      return true;
    });
  };

  // Conjunto totalmente filtrado (filtros suspensos + busca + toggles dos cards)
  const fullyFiltered = useMemo(
    () => applyCardToggles(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filteredBase, bairroOnlyConc, cdoOnlyConc, cidadeOnlyConc, comPotenciaOnly, semPotenciaOnly, timOnly, nioOnly, bairroCount, cdoCount, cidadeCount]
  );

  // Cards de concentração: cada card usa o conjunto filtrado pelos demais
  // toggles (pulando o próprio), de modo que a interação entre filtros é
  // cumulativa, mas o usuário ainda enxerga a contagem do próprio card ativo.
  const bairrosConcentrados = useMemo(() => {
    const m = new Map<string, number>();
    applyCardToggles({ bairro: true }).forEach((r) => {
      const b = fixText(getRaw(r, ["ds_bairro"])).toUpperCase();
      const mun = fixText(getRaw(r, ["ds_municipio"])).toUpperCase();
      if (!b) return;
      const key = `${mun}||${b}`;
      m.set(key, (m.get(key) || 0) + 1);
    });
    return Array.from(m.entries()).filter(([, n]) => n > 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredBase, cdoOnlyConc, cidadeOnlyConc, comPotenciaOnly, semPotenciaOnly, timOnly, nioOnly, bairroCount, cdoCount, cidadeCount]);

  const cdosConcentradas = useMemo(() => {
    const m = new Map<string, number>();
    applyCardToggles({ cdo: true }).forEach((r) => {
      const c = getRaw(r, ["cdo"]).toUpperCase();
      if (!c) return;
      m.set(c, (m.get(c) || 0) + 1);
    });
    return Array.from(m.entries()).filter(([, n]) => n > 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredBase, bairroOnlyConc, cidadeOnlyConc, comPotenciaOnly, semPotenciaOnly, timOnly, nioOnly, bairroCount, cdoCount, cidadeCount]);

  const cidadesConcentradas = useMemo(() => {
    const m = new Map<string, number>();
    applyCardToggles({ cidade: true }).forEach((r) => {
      const c = fixText(getRaw(r, ["ds_municipio"])).toUpperCase();
      if (!c) return;
      m.set(c, (m.get(c) || 0) + 1);
    });
    return Array.from(m.entries()).filter(([, n]) => n > 20);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredBase, bairroOnlyConc, cdoOnlyConc, comPotenciaOnly, semPotenciaOnly, timOnly, nioOnly, bairroCount, cdoCount, cidadeCount]);

  // Total REP-FTTH em aberto — reflete TODOS os filtros (suspensos + cards)
  const totalAberto = useMemo(() => fullyFiltered.length, [fullyFiltered]);

  // Status NAF "Com Potência" — pula o próprio toggle e o oposto (excludentes)
  const comPotenciaCount = useMemo(
    () => applyCardToggles({ comPot: true, semPot: true })
      .filter((r) => /com\s*pot/i.test(getRaw(r, ["status_naf"]))).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filteredBase, bairroOnlyConc, cdoOnlyConc, cidadeOnlyConc, timOnly, nioOnly, bairroCount, cdoCount, cidadeCount]
  );

  // Status NAF "Sem Potência" — idem
  const semPotenciaCount = useMemo(
    () => applyCardToggles({ comPot: true, semPot: true })
      .filter((r) => /sem\s*pot/i.test(getRaw(r, ["status_naf"]))).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filteredBase, bairroOnlyConc, cdoOnlyConc, cidadeOnlyConc, timOnly, nioOnly, bairroCount, cdoCount, cidadeCount]
  );

  const timCount = useMemo(() => {
    return applyCardToggles({ tim: true, nio: true }).filter(r => {
      const cp = getRaw(r, ["cp", "cd_cp"]).trim().toUpperCase();
      return cp === "TIM";
    }).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredBase, bairroOnlyConc, cdoOnlyConc, cidadeOnlyConc, comPotenciaOnly, semPotenciaOnly, bairroCount, cdoCount, cidadeCount]);

  const nioCount = useMemo(() => {
    return applyCardToggles({ tim: true, nio: true }).filter(r => {
      const cp = getRaw(r, ["cp", "cd_cp"]).trim().toUpperCase();
      return cp === "NIO";
    }).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredBase, bairroOnlyConc, cdoOnlyConc, cidadeOnlyConc, comPotenciaOnly, semPotenciaOnly, bairroCount, cdoCount, cidadeCount]);

  // Opções de filtros — refletem todos os filtros ativos (cards + demais
  // listas suspensas + busca), exceto o próprio filtro. Isso garante que
  // ao filtrar por uma cidade, as outras listas mostrem apenas valores
  // existentes para essa cidade, e vice-versa.
  type DropKey = "estado" | "municipio" | "setor" | "statusNaf" | "statusPot" | "estacao" | "cdo" | "bairro";
  const buildPool = (skip: DropKey) => {
    const q = search.trim().toLowerCase();
    const dropFiltered = base.filter((r) => {
      const estado = fixEstado(r.ds_estado || "");
      if (skip !== "estado" && estadoFilter.length && !estadoFilter.includes(estado)) return false;
      const mun = fixText(getRaw(r, ["ds_municipio"]));
      if (skip !== "municipio" && municipioFilter.length && !municipioFilter.includes(mun)) return false;
      const setor = getRaw(r, ["cd_setor"]);
      if (skip !== "setor" && setorFilter.length && !setorFilter.includes(setor)) return false;
      const sn = getRaw(r, ["status_naf"]);
      if (skip !== "statusNaf" && statusNafFilter.length && !statusNafFilter.includes(sn)) return false;
      if (skip !== "statusPot" && statusPotFilter.length) {
        const sp = computeStatusPot(sn, getRaw(r, ["potencia_na_olt"]), getRaw(r, ["potencia_na_ont"]));
        if (!statusPotFilter.includes(sp)) return false;
      }
      const estacao = getRaw(r, ["cd_estacao"]);
      if (skip !== "estacao" && estacaoFilter.length && !estacaoFilter.includes(estacao)) return false;
      const cdoVal = getRaw(r, ["cdo"]);
      if (skip !== "cdo" && cdoFilter.length && !cdoFilter.includes(cdoVal)) return false;
      const bairroVal = fixText(getRaw(r, ["ds_bairro"]));
      if (skip !== "bairro" && bairroFilter.length && !bairroFilter.includes(bairroVal)) return false;
      if (q) {
        const blob = JSON.stringify(r.raw || {}).toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
    // Aplica também os toggles dos cards
    return dropFiltered.filter((r) => {
      if (bairroOnlyConc) {
        const b = fixText(getRaw(r, ["ds_bairro"])).toUpperCase();
        const mun = fixText(getRaw(r, ["ds_municipio"])).toUpperCase();
        if ((bairroCount.get(`${mun}||${b}`) || 0) < 2) return false;
      }
      if (cdoOnlyConc) {
        const c = getRaw(r, ["cdo"]).toUpperCase();
        if ((cdoCount.get(c) || 0) < 2) return false;
      }
      if (cidadeOnlyConc) {
        const c = fixText(getRaw(r, ["ds_municipio"])).toUpperCase();
        if ((cidadeCount.get(c) || 0) <= 20) return false;
      }
      if (comPotenciaOnly && !/com\s*pot/i.test(getRaw(r, ["status_naf"]))) return false;
      if (semPotenciaOnly && !/sem\s*pot/i.test(getRaw(r, ["status_naf"]))) return false;
      const cp = getRaw(r, ["cp", "cd_cp"]).trim().toUpperCase();
      if (timOnly && cp !== "TIM") return false;
      if (nioOnly && cp !== "NIO") return false;
      return true;
    });
  };

  const optionsDeps = [
    base, estadoFilter, municipioFilter, setorFilter, statusNafFilter,
    statusPotFilter, estacaoFilter, cdoFilter, bairroFilter, search,
    bairroOnlyConc, cdoOnlyConc, cidadeOnlyConc, comPotenciaOnly, semPotenciaOnly,
    timOnly, nioOnly, bairroCount, cdoCount, cidadeCount,
  ];

  const chartDataDay = useMemo(() => {
    const counts: Record<string, { day: string; TIM: number; NIO: number; Total: number }> = {};
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    fullyFiltered.forEach(r => {
      const dateStr = getRaw(r, ["dh_abertura_ba"]);
      if (!dateStr) return;
      
      let d: Date | null = null;
      let m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) {
        d = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
      } else {
        m = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
        if (m) d = new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
      }

      if (d && d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
        const dayKey = d.getDate().toString().padStart(2, '0');
        if (!counts[dayKey]) counts[dayKey] = { day: dayKey, TIM: 0, NIO: 0, Total: 0 };
        
        const cp = getRaw(r, ["cp", "cd_cp"]).trim().toUpperCase();
        if (cp === "TIM") counts[dayKey].TIM++;
        else if (cp === "NIO") counts[dayKey].NIO++;
        counts[dayKey].Total++;
      }
    });

    return Object.values(counts).sort((a, b) => a.day.localeCompare(b.day));
  }, [fullyFiltered]);

  const chartDataHour = useMemo(() => {
    const counts: Record<string, { hour: string; TIM: number; NIO: number; Total: number }> = {};
    for (let i = 0; i < 24; i++) {
      const h = i.toString().padStart(2, '0') + ":00";
      counts[h] = { hour: h, TIM: 0, NIO: 0, Total: 0 };
    }

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const currentHour = now.getHours();
    const todayStr = now.getDate().toString().padStart(2, '0');

    fullyFiltered.forEach(r => {
      const dateStr = getRaw(r, ["dh_abertura_ba"]);
      if (!dateStr) return;
      
      let d: Date | null = null;
      let m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) {
        d = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
      } else {
        m = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
        if (m) d = new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
      }
      if (d && d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
        const dayKey = d.getDate().toString().padStart(2, '0');
        if (selectedDay && dayKey !== selectedDay) return;

        let hourStr = "";
        let hm = dateStr.match(/(\d{2}):\d{2}:\d{2}/);
        if (hm) {
          const hInt = parseInt(hm[1]);
          if (selectedDay === todayStr && hInt > currentHour) return;
          hourStr = hm[1] + ":00";
        }

        if (hourStr && counts[hourStr]) {
          const cp = getRaw(r, ["cp", "cd_cp"]).trim().toUpperCase();
          if (cp === "TIM") counts[hourStr].TIM++;
          else if (cp === "NIO") counts[hourStr].NIO++;
          counts[hourStr].Total++;
        }
      }
    });

    if (selectedDay === todayStr) {
      Object.keys(counts).forEach(h => {
        const hInt = parseInt(h.split(':')[0]);
        if (hInt > currentHour) {
          delete counts[h];
        }
      });
    }

    return Object.values(counts);
  }, [fullyFiltered, selectedDay]);
  
  const estadoOptions = useMemo(() => {
    const s = new Set<string>();
    buildPool("estado").forEach((r) => { const v = fixEstado(r.ds_estado || ""); if (v) s.add(v); });
    return Array.from(s).sort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, optionsDeps);

  const municipioOptions = useMemo(() => {
    const s = new Set<string>();
    buildPool("municipio").forEach((r) => { const v = fixText(getRaw(r, ["ds_municipio"])); if (v) s.add(v); });
    return Array.from(s).sort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, optionsDeps);

  const setorOptions = useMemo(() => {
    const s = new Set<string>();
    buildPool("setor").forEach((r) => { const v = getRaw(r, ["cd_setor"]); if (v) s.add(v); });
    return Array.from(s).sort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, optionsDeps);

  const statusNafOptions = useMemo(() => {
    const s = new Set<string>();
    buildPool("statusNaf").forEach((r) => { const v = getRaw(r, ["status_naf"]); if (v) s.add(v); });
    return Array.from(s).sort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, optionsDeps);

  const statusPotOptions = useMemo(() => {
    const s = new Set<string>();
    buildPool("statusPot").forEach((r) => {
      const v = computeStatusPot(getRaw(r, ["status_naf"]), getRaw(r, ["potencia_na_olt"]), getRaw(r, ["potencia_na_ont"]));
      if (v) s.add(v);
    });
    return Array.from(s).sort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, optionsDeps);

  const estacaoOptions = useMemo(() => {
    const s = new Set<string>();
    buildPool("estacao").forEach((r) => { const v = getRaw(r, ["cd_estacao"]); if (v) s.add(v); });
    return Array.from(s).sort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, optionsDeps);

  const cdoOptions = useMemo(() => {
    const s = new Set<string>();
    buildPool("cdo").forEach((r) => { const v = getRaw(r, ["cdo"]); if (v) s.add(v); });
    return Array.from(s).sort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, optionsDeps);

  const bairroOptions = useMemo(() => {
    const s = new Set<string>();
    buildPool("bairro").forEach((r) => { const v = fixText(getRaw(r, ["ds_bairro"])); if (v) s.add(v); });
    return Array.from(s).sort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, optionsDeps);

  // Linhas para tabela usando o conjunto totalmente filtrado
  const rows = useMemo(() => {
    return fullyFiltered.map((r) => {
        const sa = getRaw(r, ["cd_nrba", "nrba"]);
        const estado = fixEstado(r.ds_estado || "");
        const abertura = fmtDateTime(getRaw(r, ["dh_abertura_ba"]));
        const gpon = getRaw(r, ["cd_gpon"]);
        const municipio = fixText(getRaw(r, ["ds_municipio"]));
        const estacao = getRaw(r, ["cd_estacao"]);
        const setor = getRaw(r, ["cd_setor"]);
        const logradouro = fixText(getRaw(r, ["ds_logradouro"]));
        const numero = fixText(getRaw(r, ["ds_numero"]));
        const compTipo = fixText(getRaw(r, ["ds_complemento_tipo"]));
        const compDesc = fixText(getRaw(r, ["ds_complemento_desc"]));
        const rua = [logradouro, numero, compTipo, compDesc].filter(Boolean).join(", ");
        const bairro = fixText(getRaw(r, ["ds_bairro"]));
        const bairroKey = `${municipio.toUpperCase()}||${bairro.toUpperCase()}`;
        const bairroAfet = bairroCount.get(bairroKey) || 0;
        const cabo1 = getRaw(r, ["cabo_primario"]);
        const cabo2 = getRaw(r, ["cabo_secundario"]);
        const olt = getRaw(r, ["olt"]);
        const cdo = getRaw(r, ["cdo"]);
        const cdoAfet = cdoCount.get(cdo.toUpperCase()) || 0;
        const statusNaf = getRaw(r, ["status_naf"]);
        const potOlt = fmtPot(getRaw(r, ["potencia_na_olt"]));
        const potOnt = fmtPot(getRaw(r, ["potencia_na_ont"]));
        const statusPot = computeStatusPot(statusNaf, getRaw(r, ["potencia_na_olt"]), getRaw(r, ["potencia_na_ont"]));
        return { id: r.id, sa, atividade: "REP-FTTH", estado, abertura, gpon, municipio, estacao, setor, rua, bairro, bairroAfet, cabo1, cabo2, olt, cdo, cdoAfet, statusNaf, statusPot, potOlt, potOnt };
    });
  }, [fullyFiltered, bairroCount, cdoCount]);

  // Ordenação
  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    const arr = [...rows];
    arr.sort((a, b) => {
      const av = (a as Record<string, unknown>)[sortKey];
      const bv = (b as Record<string, unknown>)[sortKey];
      const an = typeof av === "number" ? av : parseFloat(String(av ?? "").replace(",", "."));
      const bn = typeof bv === "number" ? bv : parseFloat(String(bv ?? "").replace(",", "."));
      let cmp: number;
      if (!isNaN(an) && !isNaN(bn) && String(av).match(/^[\d.,\s-]+$/) && String(bv).match(/^[\d.,\s-]+$/)) {
        cmp = an - bn;
      } else {
        cmp = String(av ?? "").localeCompare(String(bv ?? ""), "pt-BR", { numeric: true });
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  const exportXlsx = () => {
    const data = sortedRows.map((r) => ({
      SA: r.sa,
      Atividade: r.atividade,
      Status_SA: r.estado,
      Abertura: r.abertura,
      Gpon: r.gpon,
      "Município": r.municipio,
      "Estação": r.estacao,
      Setor: r.setor,
      Rua: r.rua,
      Bairro: r.bairro,
      "Afet. Bairro": r.bairroAfet,
      Cabo_Primario: r.cabo1,
      Cabo_Secundario: r.cabo2,
      olt: r.olt,
      cdo: r.cdo,
      "Afet. CDO": r.cdoAfet,
      "Status Naf": r.statusNaf,
      "Status Potências": r.statusPot,
      Ptcia_OLT: r.potOlt,
      Ptcia_ONT: r.potOnt,
      "Nome do Cliente": "",
      "Contato": "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Concentracao");
    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    XLSX.writeFile(wb, `concentracao_reparos_${ts}.xlsx`);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)] overflow-hidden p-3 gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Concentração de Reparos</h1>
          <p className="text-xs text-muted-foreground">
            Reparos REP-FTTH em SC com prontidão de execução
            {lastUpdate && (
              <span className="ml-2 text-[10px] opacity-70">
                · atualizado em {lastUpdate.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportXlsx} disabled={loading || rows.length === 0}>
            <FileSpreadsheet className="w-4 h-4 mr-1" />
            Exportar Excel
          </Button>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
            Atualizar
          </Button>
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-2 md:grid-cols-9 gap-3">
        <Card>
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Layers className="w-3.5 h-3.5" /> REP-FTTH (Base)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-2xl font-bold">{base.length}</div>
            <p className="text-[10px] text-muted-foreground">SC + Pronto p/ Execução</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Wrench className="w-3.5 h-3.5" /> REP-FTTH Aberto
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-2xl font-bold text-primary">{totalAberto}</div>
            <p className="text-[10px] text-muted-foreground">Excluindo cancelados</p>
          </CardContent>
        </Card>

        <Card className={`cursor-pointer transition ${bairroOnlyConc ? "ring-2 ring-primary" : ""}`}
          onClick={() => setBairroOnlyConc((v) => !v)}>
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" /> Bairros Concentrados
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-2xl font-bold text-orange-600">{bairrosConcentrados.length}</div>
            <p className="text-[10px] text-muted-foreground">Bairros c/ {">"} 1 reparo</p>
          </CardContent>
        </Card>

        <Card className={`cursor-pointer transition ${cdoOnlyConc ? "ring-2 ring-primary" : ""}`}
          onClick={() => setCdoOnlyConc((v) => !v)}>
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> CDOs Concentradas
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-2xl font-bold text-red-600">{cdosConcentradas.length}</div>
            <p className="text-[10px] text-muted-foreground">CDOs c/ {">"} 1 reparo</p>
          </CardContent>
        </Card>

        <Card className={`cursor-pointer transition ${cidadeOnlyConc ? "ring-2 ring-primary" : ""}`}
          onClick={() => setCidadeOnlyConc((v) => !v)}>
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5" /> Cidades Concentradas
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-2xl font-bold text-purple-600">{cidadesConcentradas.length}</div>
            <p className="text-[10px] text-muted-foreground">Cidades c/ {">"} 20 reparos</p>
          </CardContent>
        </Card>

        <Card className={`cursor-pointer transition ${comPotenciaOnly ? "ring-2 ring-primary" : ""}`}
          onClick={() => setComPotenciaOnly((v) => !v)}>
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Zap className="w-3.5 h-3.5" /> Status NAF Com Potência
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-2xl font-bold text-emerald-600">{comPotenciaCount}</div>
            <p className="text-[10px] text-muted-foreground">Naf com potência</p>
          </CardContent>
        </Card>

        <Card className={`cursor-pointer transition ${semPotenciaOnly ? "ring-2 ring-primary" : ""}`}
          onClick={() => setSemPotenciaOnly((v) => !v)}>
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Zap className="w-3.5 h-3.5" /> Status NAF Sem Potência
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-2xl font-bold text-amber-600">{semPotenciaCount}</div>
            <p className="text-[10px] text-muted-foreground">Naf sem potência</p>
          </CardContent>
        </Card>

        <Card className={`cursor-pointer transition ${timOnly ? "ring-2 ring-primary" : ""}`}
          onClick={() => { setTimOnly((v) => !v); setNioOnly(false); }}>
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">TIM (Abertos)</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-2xl font-bold text-blue-600">{timCount}</div>
            <p className="text-[10px] text-muted-foreground">Operadora TIM</p>
          </CardContent>
        </Card>

        <Card className={`cursor-pointer transition ${nioOnly ? "ring-2 ring-primary" : ""}`}
          onClick={() => { setNioOnly((v) => !v); setTimOnly(false); }}>
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">NIO (Abertos)</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-2xl font-bold text-teal-600">{nioCount}</div>
            <p className="text-[10px] text-muted-foreground">Operadora NIO</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground mr-1" />
          <MultiFilter label="Status_SA" options={estadoOptions} value={estadoFilter} onChange={setEstadoFilter} />
          <MultiFilter label="Município" options={municipioOptions} value={municipioFilter} onChange={setMunicipioFilter} />
          <MultiFilter label="Bairro" options={bairroOptions} value={bairroFilter} onChange={setBairroFilter} />
          <MultiFilter label="Setor" options={setorOptions} value={setorFilter} onChange={setSetorFilter} />
          <MultiFilter label="Estação" options={estacaoOptions} value={estacaoFilter} onChange={setEstacaoFilter} />
          <MultiFilter label="CDO" options={cdoOptions} value={cdoFilter} onChange={setCdoFilter} />
          <MultiFilter label="Status NAF" options={statusNafOptions} value={statusNafFilter} onChange={setStatusNafFilter} />
          <MultiFilter label="Status Potências" options={statusPotOptions} value={statusPotFilter} onChange={setStatusPotFilter} width={190} />
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          <div className="ml-auto flex items-center gap-2">
            {(() => {
              const hasAny = estadoFilter.length || municipioFilter.length || setorFilter.length || statusNafFilter.length || statusPotFilter.length || estacaoFilter.length || cdoFilter.length || bairroFilter.length || bairroOnlyConc || cdoOnlyConc || cidadeOnlyConc || comPotenciaOnly || semPotenciaOnly || timOnly || nioOnly || search;
              return (
                <Button
                  variant={hasAny ? "default" : "outline"}
                  size="sm"
                  disabled={!hasAny}
                  className="h-8 text-xs"
                  onClick={clearAllFilters}
                >
                  Limpar todos os filtros
                </Button>
              );
            })()}
            <Input 
              placeholder="Buscar (SA, GPON, endereço...)" 
              value={search} 
              onChange={(e) => setSearch(e.target.value)} 
              className="h-8 w-[240px] text-xs" 
            />
            <Badge variant="secondary" className="text-xs h-8 px-3">{sortedRows.length} registros</Badge>
          </div>
        </div>
      </div>

      <Tabs defaultValue="tabela" className="flex-1 min-h-0 flex flex-col">
        <TabsList className="self-start h-9">
          <TabsTrigger value="tabela" className="text-xs">Tabela</TabsTrigger>
          <TabsTrigger value="dinamica" className="text-xs">Dinâmica</TabsTrigger>
        </TabsList>

        <TabsContent value="tabela" className="flex-1 min-h-0 mt-2">
          <div className="h-full rounded-md border overflow-auto relative scroll-hover">
            <table className="w-full caption-bottom text-sm min-w-max [&_th]:whitespace-nowrap [&_td]:whitespace-nowrap border-collapse">
              <TableHeader className="sticky top-0 z-20 bg-background shadow-[0_1px_0_0_hsl(var(--border))]">
                <TableRow>
                  {[
                    { k: "sa", l: "SA" },
                    { k: "atividade", l: "Atividade" },
                    { k: "estado", l: "Status_SA" },
                    { k: "abertura", l: "Abertura" },
                    { k: "gpon", l: "Gpon" },
                    { k: "municipio", l: "Município" },
                    { k: "estacao", l: "Estação" },
                    { k: "setor", l: "Setor" },
                    { k: "rua", l: "Rua" },
                    { k: "bairro", l: "Bairro" },
                    { k: "bairroAfet", l: "Afet. Bairro", align: "center" as const },
                    { k: "cabo1", l: "Cabo_Primario" },
                    { k: "cabo2", l: "Cabo_Secundario" },
                    { k: "olt", l: "olt" },
                    { k: "cdo", l: "cdo" },
                    { k: "cdoAfet", l: "Afet. CDO", align: "center" as const },
                    { k: "statusNaf", l: "Status Naf" },
                    { k: "statusPot", l: "Status Potências" },
                    { k: "potOlt", l: "Ptcia_OLT", align: "right" as const },
                    { k: "potOnt", l: "Ptcia_ONT", align: "right" as const },
                  ].map((c) => (
                    <TableHead
                      key={c.k}
                      onClick={() => toggleSort(c.k)}
                      className={`text-[11px] cursor-pointer select-none hover:bg-muted/50 ${c.align === "center" ? "text-center" : c.align === "right" ? "text-right" : ""}`}
                    >
                      {c.l}<SortIcon k={c.k} />
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRows.length === 0 && (
                  <TableRow><TableCell colSpan={20} className="text-center text-muted-foreground text-xs py-6">
                    {loading ? "Carregando..." : "Nenhum registro"}
                  </TableCell></TableRow>
                )}
                {sortedRows.map((r) => (
                  <TableRow key={r.id} className="text-[11px]">
                    <TableCell className="p-2 font-mono">{r.sa}</TableCell>
                    <TableCell className="p-2">{r.atividade}</TableCell>
                    <TableCell className="p-2">{r.estado}</TableCell>
                    <TableCell className="p-2 whitespace-nowrap">{r.abertura}</TableCell>
                    <TableCell className="p-2 font-mono">{r.gpon}</TableCell>
                    <TableCell className="p-2">{r.municipio}</TableCell>
                    <TableCell className="p-2">{r.estacao}</TableCell>
                    <TableCell className="p-2">{r.setor}</TableCell>
                    <TableCell className="p-2" title={r.rua}>{r.rua}</TableCell>
                    <TableCell className="p-2">{r.bairro}</TableCell>
                    <TableCell className="p-2 text-center">
                      {r.bairroAfet > 1 ? <Badge variant="destructive" className="text-[10px] px-1.5">{r.bairroAfet}</Badge> : <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="p-2">{r.cabo1}</TableCell>
                    <TableCell className="p-2">{r.cabo2}</TableCell>
                    <TableCell className="p-2">{r.olt}</TableCell>
                    <TableCell className="p-2">{r.cdo}</TableCell>
                    <TableCell className="p-2 text-center">
                      {r.cdoAfet > 1 ? <Badge variant="destructive" className="text-[10px] px-1.5">{r.cdoAfet}</Badge> : <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="p-2">{r.statusNaf}</TableCell>
                    <TableCell className="p-2">
                      {r.statusPot === "Sem Potência" ? (
                        <Badge variant="secondary" className="text-[10px] px-1.5">{r.statusPot}</Badge>
                      ) : r.statusPot === "Potência OK" ? (
                        <Badge className="text-[10px] px-1.5 bg-emerald-600 hover:bg-emerald-600">{r.statusPot}</Badge>
                      ) : r.statusPot === "Sinal_Atenuado" ? (
                        <Badge variant="destructive" className="text-[10px] px-1.5">{r.statusPot}</Badge>
                      ) : r.statusPot === "OLT_Atenuado" || r.statusPot === "ONT_Atenuada" ? (
                        <Badge className="text-[10px] px-1.5 bg-amber-600 hover:bg-amber-600">{r.statusPot}</Badge>
                      ) : (
                        <span className="text-muted-foreground">{r.statusPot || "-"}</span>
                      )}
                    </TableCell>
                    <TableCell className="p-2 text-right font-mono">{r.potOlt}</TableCell>
                    <TableCell className="p-2 text-right font-mono">{r.potOnt}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="dinamica" className="flex-1 min-h-0 mt-2 overflow-auto scroll-hover">
          <DinamicaPanel
            cidades={cidadesConcentradas}
            bairros={bairrosConcentrados}
            cdos={cdosConcentradas}
            comPotencia={comPotenciaCount}
            semPotencia={semPotenciaCount}
            totalAberto={totalAberto}
            chartDataDay={chartDataDay}
            chartDataHour={chartDataHour}
            selectedDay={selectedDay}
            setSelectedDay={setSelectedDay}
            municipioFilter={municipioFilter}
            setMunicipioFilter={setMunicipioFilter}
            bairroFilter={bairroFilter}
            setBairroFilter={setBairroFilter}
            cdoFilter={cdoFilter}
            setCdoFilter={setCdoFilter}
            comPotenciaOnly={comPotenciaOnly}
            setComPotenciaOnly={setComPotenciaOnly}
            semPotenciaOnly={semPotenciaOnly}
            setSemPotenciaOnly={setSemPotenciaOnly}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

// ============================================================
// Painel "Dinâmica" — gráficos derivados dos cards/filtros ativos
// ============================================================
type DinamicaProps = {
  cidades: [string, number][];
  bairros: [string, number][];
  cdos: [string, number][];
  comPotencia: number;
  semPotencia: number;
  totalAberto: number;
  chartDataDay: any[];
  chartDataHour: any[];
  selectedDay: string | null;
  setSelectedDay: (d: string | null) => void;
  municipioFilter: string[];
  setMunicipioFilter: (v: string[]) => void;
  bairroFilter: string[];
  setBairroFilter: (v: string[]) => void;
  cdoFilter: string[];
  setCdoFilter: (v: string[]) => void;
  comPotenciaOnly: boolean;
  setComPotenciaOnly: (v: boolean | ((p: boolean) => boolean)) => void;
  semPotenciaOnly: boolean;
  setSemPotenciaOnly: (v: boolean | ((p: boolean) => boolean)) => void;
};

const DinamicaPanel = ({
  cidades, bairros, cdos, comPotencia, semPotencia, totalAberto,
  chartDataDay, chartDataHour, selectedDay, setSelectedDay,
  municipioFilter, setMunicipioFilter,
  bairroFilter, setBairroFilter,
  cdoFilter, setCdoFilter,
  comPotenciaOnly, setComPotenciaOnly,
  semPotenciaOnly, setSemPotenciaOnly,
}: DinamicaProps) => {
  const topCidades = [...cidades].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([name, value]) => ({ name, value }));
  const topBairros = [...bairros].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([key, value]) => {
    const [mun, bairro] = key.split("||");
    return { name: `${mun}||${bairro}`, value };
  });
  const topCdos = [...cdos].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([name, value]) => ({ name, value }));

  // Helpers: toggle item em array de filtro (clique = ativa, novo clique = remove)
  const toggleInArray = (arr: string[], setArr: (v: string[]) => void, val: string) => {
    if (!val) return;
    if (arr.includes(val)) setArr(arr.filter(x => x !== val));
    else setArr([...arr, val]);
  };
  const ACTIVE_OPACITY = 1;
  const DIM_OPACITY = 0.55;
  const cellOpacity = (active: boolean, anyActive: boolean) =>
    !anyActive ? ACTIVE_OPACITY : active ? ACTIVE_OPACITY : DIM_OPACITY;
  // Cor usada para destacar a barra/fatia selecionada nos gráficos.
  // Tom slate suave para manter a leitura confortável (sem agressividade visual).
  const ACTIVE_STROKE = "hsl(215 35% 25%)";
  
  const potData = [
    { name: "Com Potência", value: comPotencia },
    { name: "Sem Potência", value: semPotencia },
  ];
  const POT_COLORS = ["hsl(160 70% 40%)", "hsl(35 90% 50%)"];

  const ChartCard = ({ title, subtitle, children, headerRight }: { title: string; subtitle?: string; children: React.ReactNode; headerRight?: React.ReactNode }) => (
    <Card>
      <CardHeader className="p-3 pb-1 flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
          {subtitle && <p className="text-[10px] text-muted-foreground">{subtitle}</p>}
        </div>
        {headerRight && <div>{headerRight}</div>}
      </CardHeader>
      <CardContent className="p-3 pt-1 h-[320px]">{children}</CardContent>
    </Card>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pb-6">
      <ChartCard title="Cidades com maior concentração de REP-FTTH" subtitle="Top 15 — > 20 reparos">
        {topCidades.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground">Sem dados</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topCidades} layout="vertical" margin={{ left: 20, right: 20, top: 5, bottom: 5 }}>
              <XAxis type="number" hide={true} />
              <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 11 }} />
              <Bar
                dataKey="value"
                radius={[0, 4, 4, 0]}
                cursor="pointer"
                onClick={(d: any) => toggleInArray(municipioFilter, setMunicipioFilter, d?.name)}
              >
                <LabelList dataKey="value" position="right" fontSize={10} fill="hsl(var(--foreground))" stroke="hsl(var(--background))" strokeWidth={3} style={{ paintOrder: "stroke" }} />
                {topCidades.map((e) => {
                  const active = municipioFilter.includes(e.name);
                  return (
                    <Cell key={e.name} fill="hsl(270 60% 55%)"
                      fillOpacity={cellOpacity(active, municipioFilter.length > 0)}
                      stroke={active ? ACTIVE_STROKE : "none"} strokeWidth={active ? 2 : 0} />
                  );
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard title="Bairros com maior concentração" subtitle="Top 15 — > 1 reparo (cidade + bairro)">
        {topBairros.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground">Sem dados</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topBairros} layout="vertical" margin={{ left: 30, right: 20, top: 5, bottom: 5 }}>
              <XAxis type="number" hide={true} />
              <YAxis 
                type="category" 
                dataKey="name" 
                width={180} 
                tick={(props: any) => {
                  const { x, y, payload } = props;
                  const parts = payload.value.split("||");
                  return (
                    <g transform={`translate(${x},${y})`}>
                      <text x={-5} y={-2} fontSize={10} textAnchor="end" fontWeight="600" fill="hsl(var(--foreground))">
                        {parts[1]}
                      </text>
                      <text x={-5} y={10} fontSize={8} textAnchor="end" opacity={0.6} fill="hsl(var(--foreground))">
                        {parts[0]}
                      </text>
                    </g>
                  );
                }} 
              />
              <Tooltip contentStyle={{ fontSize: 11 }} />
              <Bar
                dataKey="value"
                radius={[0, 4, 4, 0]}
                cursor="pointer"
                onClick={(d: any) => {
                  const bairro = String(d?.name || "").split("||")[1] || "";
                  toggleInArray(bairroFilter, setBairroFilter, bairro);
                }}
              >
                <LabelList dataKey="value" position="right" fontSize={10} fill="hsl(var(--foreground))" stroke="hsl(var(--background))" strokeWidth={3} style={{ paintOrder: "stroke" }} />
                {topBairros.map((e) => {
                  const bairro = e.name.split("||")[1] || "";
                  const active = bairroFilter.includes(bairro);
                  return (
                    <Cell key={e.name} fill="hsl(25 90% 55%)"
                      fillOpacity={cellOpacity(active, bairroFilter.length > 0)}
                      stroke={active ? ACTIVE_STROKE : "none"} strokeWidth={active ? 2 : 0} />
                  );
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard title="Com Potência × Sem Potência" subtitle={`Total em aberto considerado: ${totalAberto}`}>
        {comPotencia + semPotencia === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground">Sem dados</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip contentStyle={{ fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Pie
                data={potData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={100}
                label={(e) => `${e.name}: ${e.value}`}
                cursor="pointer"
                onClick={(d: any) => {
                  if (d?.name === "Com Potência") {
                    if (semPotenciaOnly) setSemPotenciaOnly(false);
                    setComPotenciaOnly(v => !v);
                  } else if (d?.name === "Sem Potência") {
                    if (comPotenciaOnly) setComPotenciaOnly(false);
                    setSemPotenciaOnly(v => !v);
                  }
                }}
              >
                {potData.map((p, i) => {
                  const active = (p.name === "Com Potência" && comPotenciaOnly) || (p.name === "Sem Potência" && semPotenciaOnly);
                  const anyActive = comPotenciaOnly || semPotenciaOnly;
                  return (
                    <Cell key={i} fill={POT_COLORS[i]}
                      fillOpacity={cellOpacity(active, anyActive)}
                      stroke={active ? ACTIVE_STROKE : "#fff"} strokeWidth={active ? 3 : 1} />
                  );
                })}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard title="CDOs Concentradas" subtitle="Top 15 — > 1 reparo">
        {topCdos.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground">Sem dados</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topCdos} layout="vertical" margin={{ left: 20, right: 20, top: 5, bottom: 5 }}>
              <XAxis type="number" hide={true} />
              <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 11 }} />
              <Bar
                dataKey="value"
                radius={[0, 4, 4, 0]}
                cursor="pointer"
                onClick={(d: any) => toggleInArray(cdoFilter, setCdoFilter, d?.name)}
              >
                <LabelList dataKey="value" position="right" fontSize={10} fill="hsl(var(--foreground))" stroke="hsl(var(--background))" strokeWidth={3} style={{ paintOrder: "stroke" }} />
                {topCdos.map((e) => {
                  const active = cdoFilter.includes(e.name);
                  return (
                    <Cell key={e.name} fill="hsl(0 70% 55%)"
                      fillOpacity={cellOpacity(active, cdoFilter.length > 0)}
                      stroke={active ? ACTIVE_STROKE : "none"} strokeWidth={active ? 2 : 0} />
                  );
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard title="Aberturas por Dia (Mês Atual)" subtitle="Segmentado por TIM e NIO">
        {chartDataDay.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground">Sem dados</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartDataDay} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
              <XAxis dataKey="day" fontSize={10} axisLine={false} tickLine={false} />
              <YAxis fontSize={10} axisLine={false} tickLine={false} />
              <Tooltip 
                contentStyle={{ backgroundColor: "rgba(0,0,0,0.8)", border: "none", borderRadius: "8px", fontSize: "12px", color: "#fff" }}
                itemStyle={{ padding: "2px 0" }}
              />
              <Legend verticalAlign="top" height={36} iconType="circle" />
              <Bar 
                dataKey="TIM" 
                fill="#3b82f6" 
                radius={[4, 4, 0, 0]} 
                barSize={15} 
                stackId="a" 
                cursor="pointer"
                onClick={(data) => setSelectedDay(data.day)}
              >
                <LabelList dataKey="TIM" position="inside" fontSize={9} fill="#fff" formatter={(v: number) => v > 0 ? v : ""} />
              </Bar>
              <Bar 
                dataKey="NIO" 
                fill="#14b8a6" 
                radius={[4, 4, 0, 0]} 
                barSize={15} 
                stackId="a"
                cursor="pointer"
                onClick={(data) => setSelectedDay(data.day)}
              >
                <LabelList dataKey="NIO" position="inside" fontSize={9} fill="#fff" formatter={(v: number) => v > 0 ? v : ""} />
                <LabelList dataKey="Total" position="top" fontSize={10} fill="hsl(var(--foreground))" offset={5} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard 
        title={`Aberturas por Hora ${selectedDay ? `(Dia ${selectedDay})` : '(Geral)'}`} 
        subtitle="Média de aberturas por faixa horária"
        headerRight={
          <Select value={selectedDay || ""} onValueChange={setSelectedDay}>
            <SelectTrigger className="h-7 w-[90px] text-[10px]">
              <SelectValue placeholder="Dia" />
            </SelectTrigger>
            <SelectContent>
              {chartDataDay.map(d => (
                <SelectItem key={d.day} value={d.day} className="text-[10px]">Dia {d.day}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      >
        {chartDataHour.every(h => h.Total === 0) ? (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground">Sem dados para este dia</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartDataHour} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
              <XAxis dataKey="hour" fontSize={10} axisLine={false} tickLine={false} interval={2} />
              <YAxis fontSize={10} axisLine={false} tickLine={false} />
              <Tooltip 
                contentStyle={{ backgroundColor: "rgba(0,0,0,0.8)", border: "none", borderRadius: "8px", fontSize: "12px", color: "#fff" }}
              />
              <Legend verticalAlign="top" height={36} iconType="circle" />
              <Bar dataKey="TIM" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={15} stackId="a">
                <LabelList dataKey="TIM" position="inside" fontSize={9} fill="#fff" formatter={(v: number) => v > 0 ? v : ""} />
              </Bar>
              <Bar dataKey="NIO" fill="#14b8a6" radius={[4, 4, 0, 0]} barSize={15} stackId="a">
                <LabelList dataKey="NIO" position="inside" fontSize={9} fill="#fff" formatter={(v: number) => v > 0 ? v : ""} />
                <LabelList dataKey="Total" position="top" fontSize={10} fill="hsl(var(--foreground))" offset={5} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  );
};

export default ConcentracaoReparos;
