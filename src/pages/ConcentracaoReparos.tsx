import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAccessTracking } from "@/hooks/useAccessTracking";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, RefreshCw, AlertTriangle, Layers, MapPin, Wrench } from "lucide-react";
import { FileSpreadsheet, Zap, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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
    .replace(/Ã‚/g, "Â").replace(/Ãƒ/g, "Ã").replace(/Ã�/g, "Í")
    .replace(/Ã�/g, "Á").replace(/Ã š/g, "Ú").replace(/NULL/gi, "").trim();
};

const fixEstado = (s: string): string => {
  const f = fixText(s);
  if (/n.?o\s*atribu/i.test(f)) return "Não Atribuido";
  if (/^atribu/i.test(f)) return "Atribuido";
  return f;
};

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
  const [bairroOnlyConc, setBairroOnlyConc] = useState(false);
  const [cdoOnlyConc, setCdoOnlyConc] = useState(false);
  const [comPotenciaOnly, setComPotenciaOnly] = useState(false);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

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
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // Base já filtrada por: macro=REP-FTTH, UF=SC, in_pronto_execucao=SIM
  const base = useMemo(() => {
    return fato.filter((r) => {
      const uf = getRaw(r, ["cd_uf", "uf"]).trim().toUpperCase();
      if (uf !== "SC") return false;
      const pe = getRaw(r, ["in_pronto_execucao", "pronto_execucao"]).trim().toUpperCase();
      if (pe !== "SIM") return false;
      return true;
    });
  }, [fato]);

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
      if (q) {
        const blob = JSON.stringify(r.raw || {}).toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [base, estadoFilter, municipioFilter, setorFilter, statusNafFilter, search]);

  // Mapas de concentração (recalculados dentro do escopo filtrado)
  const bairroCount = useMemo(() => {
    const m = new Map<string, number>();
    filteredBase.forEach((r) => {
      const b = fixText(getRaw(r, ["ds_bairro"])).toUpperCase();
      if (!b) return;
      m.set(b, (m.get(b) || 0) + 1);
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

  const bairrosConcentrados = useMemo(
    () => Array.from(bairroCount.entries()).filter(([, n]) => n > 1),
    [bairroCount]
  );
  const cdosConcentradas = useMemo(
    () => Array.from(cdoCount.entries()).filter(([, n]) => n > 1),
    [cdoCount]
  );

  // Total REP-FTTH aberto (exclui cancelado) — refletindo filtros
  const totalAberto = useMemo(
    () => filteredBase.filter((r) => !/cancel/i.test(fixText(r.ds_estado || ""))).length,
    [filteredBase]
  );

  // Status NAF "Com Potência" — refletindo filtros
  const comPotenciaCount = useMemo(
    () => filteredBase.filter((r) => /com\s*pot/i.test(getRaw(r, ["status_naf"]))).length,
    [filteredBase]
  );

  // Opções de filtros
  const estadoOptions = useMemo(() => {
    const s = new Set<string>();
    base.forEach((r) => { const v = fixEstado(r.ds_estado || ""); if (v) s.add(v); });
    return Array.from(s).sort();
  }, [base]);

  const municipioOptions = useMemo(() => {
    const s = new Set<string>();
    base.forEach((r) => { const v = fixText(getRaw(r, ["ds_municipio"])); if (v) s.add(v); });
    return Array.from(s).sort();
  }, [base]);

  const setorOptions = useMemo(() => {
    const s = new Set<string>();
    base.forEach((r) => { const v = getRaw(r, ["cd_setor"]); if (v) s.add(v); });
    return Array.from(s).sort();
  }, [base]);

  const statusNafOptions = useMemo(() => {
    const s = new Set<string>();
    base.forEach((r) => { const v = getRaw(r, ["status_naf"]); if (v) s.add(v); });
    return Array.from(s).sort();
  }, [base]);

  // Linhas para tabela com filtros aplicados (toggles dos cards)
  const rows = useMemo(() => {
    return filteredBase
      .filter((r) => {
        if (bairroOnlyConc) {
          const b = fixText(getRaw(r, ["ds_bairro"])).toUpperCase();
          if ((bairroCount.get(b) || 0) < 2) return false;
        }
        if (cdoOnlyConc) {
          const c = getRaw(r, ["cdo"]).toUpperCase();
          if ((cdoCount.get(c) || 0) < 2) return false;
        }
        if (comPotenciaOnly && !/com\s*pot/i.test(getRaw(r, ["status_naf"]))) return false;
        return true;
      })
      .map((r) => {
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
        const bairroKey = bairro.toUpperCase();
        const bairroAfet = bairroCount.get(bairroKey) || 0;
        const cabo1 = getRaw(r, ["cabo_primario"]);
        const cabo2 = getRaw(r, ["cabo_secundario"]);
        const olt = getRaw(r, ["olt"]);
        const cdo = getRaw(r, ["cdo"]);
        const cdoAfet = cdoCount.get(cdo.toUpperCase()) || 0;
        const statusNaf = getRaw(r, ["status_naf"]);
        const potOlt = fmtPot(getRaw(r, ["potencia_na_olt"]));
        const potOnt = fmtPot(getRaw(r, ["potencia_na_ont"]));
        return { id: r.id, sa, atividade: "REP-FTTH", estado, abertura, gpon, municipio, estacao, setor, rua, bairro, bairroAfet, cabo1, cabo2, olt, cdo, cdoAfet, statusNaf, potOlt, potOnt };
      });
  }, [filteredBase, bairroOnlyConc, cdoOnlyConc, comPotenciaOnly, bairroCount, cdoCount]);

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
      Ptcia_OLT: r.potOlt,
      Ptcia_ONT: r.potOnt,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Concentracao");
    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    XLSX.writeFile(wb, `concentracao_reparos_${ts}.xlsx`);
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden p-3 gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Concentração de Reparos</h1>
          <p className="text-xs text-muted-foreground">Reparos REP-FTTH em SC com prontidão de execução</p>
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
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
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
            <p className="text-[10px] text-muted-foreground">Bairros com mais de 1 REP-FTTH</p>
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
            <p className="text-[10px] text-muted-foreground">CDOs com mais de 1 REP-FTTH</p>
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
            <p className="text-[10px] text-muted-foreground">Apenas status_naf "Com Potência"</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Buscar (SA, GPON, endereço...)" value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 w-[260px] text-xs" />
        <MultiFilter label="Status_SA" options={estadoOptions} value={estadoFilter} onChange={setEstadoFilter} />
        <MultiFilter label="Município" options={municipioOptions} value={municipioFilter} onChange={setMunicipioFilter} />
        <MultiFilter label="Setor" options={setorOptions} value={setorFilter} onChange={setSetorFilter} />
        <MultiFilter label="Status NAF" options={statusNafOptions} value={statusNafFilter} onChange={setStatusNafFilter} />
        {(estadoFilter.length || municipioFilter.length || setorFilter.length || statusNafFilter.length || bairroOnlyConc || cdoOnlyConc || comPotenciaOnly || search) ? (
          <Button variant="ghost" size="sm" className="h-8 text-xs"
            onClick={() => { setEstadoFilter([]); setMunicipioFilter([]); setSetorFilter([]); setStatusNafFilter([]); setBairroOnlyConc(false); setCdoOnlyConc(false); setComPotenciaOnly(false); setSearch(""); }}>
            Limpar
          </Button>
        ) : null}
        <Badge variant="secondary" className="ml-auto text-xs">{sortedRows.length} registros</Badge>
      </div>

      {/* Tabela */}
      <div className="flex-1 overflow-auto rounded-md border">
        <Table className="min-w-max [&_th]:whitespace-nowrap [&_td]:whitespace-nowrap">
          <TableHeader className="sticky top-0 bg-background z-10">
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
              <TableRow><TableCell colSpan={19} className="text-center text-muted-foreground text-xs py-6">
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
                <TableCell className="p-2 text-right font-mono">{r.potOlt}</TableCell>
                <TableCell className="p-2 text-right font-mono">{r.potOnt}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default ConcentracaoReparos;
