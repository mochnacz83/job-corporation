import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { toast } from "@/components/ui/use-toast";
import {
  Activity, Upload, RefreshCw, ChevronLeft, Loader2, BarChart3, Download, FileSpreadsheet,
} from "lucide-react";

type IndicadorKey =
  | "reparo_por_planta"
  | "reparo_no_prazo"
  | "instalacao_no_prazo"
  | "infancia_30_dias"
  | "cumprimento_1a_reparo"
  | "cumprimento_1a_instalacao"
  | "infancia_30_dias_instalacao"
  | "repetida_30_dias";

const INDICADORES: Array<{
  key: IndicadorKey; label: string; short: string; url: string;
}> = [
  {
    key: "reparo_por_planta", label: "Reparo por Planta", short: "Rep. Planta",
    url: "https://storage.cloud.google.com/vtal-bucket-psr-ability/VIP/2026_06_ANL_FTTH_REPARO_POR_PLANTA000000000000.csv?authuser=0",
  },
  {
    key: "reparo_no_prazo", label: "Reparo no Prazo", short: "Rep. Prazo",
    url: "https://storage.cloud.google.com/vtal-bucket-psr-ability/VIP/2026_06_ANL_FTTH_REPARO_NO_PRAZO000000000000.csv?authuser=0",
  },
  {
    key: "instalacao_no_prazo", label: "Instalação no Prazo", short: "Inst. Prazo",
    url: "https://storage.cloud.google.com/vtal-bucket-psr-ability/VIP/2026_06_ANL_FTTH_INSTALACAO_NO_PRAZO000000000000.csv?authuser=0",
  },
  {
    key: "infancia_30_dias", label: "Infância 30 Dias (Reparo)", short: "Inf. 30d",
    url: "https://storage.cloud.google.com/vtal-bucket-psr-ability/VIP/2026_06_ANL_FTTH_INFANCIA_30_DIAS000000000000.csv?authuser=0",
  },
  {
    key: "cumprimento_1a_reparo", label: "Cumprimento 1ª Agenda — Reparo", short: "1ª Ag. Rep.",
    url: "https://storage.cloud.google.com/vtal-bucket-psr-ability/VIP/2026_06_ANL_FTTH_CUMPRIMENTO_DE_1A_AGENDA_REPARO000000000000.csv?authuser=0",
  },
  {
    key: "cumprimento_1a_instalacao", label: "Cumprimento 1ª Agenda — Instalação", short: "1ª Ag. Inst.",
    url: "https://storage.cloud.google.com/vtal-bucket-psr-ability/VIP/2026_06_ANL_FTTH_CUMPRIMENTO_DE_1A_AGENDA_INSTALACAO000000000000.csv?authuser=0",
  },
  {
    key: "infancia_30_dias_instalacao", label: "Infância 30 Dias (Instalação)", short: "Inf. Inst.",
    url: "https://storage.cloud.google.com/vtal-bucket-psr-ability/VIP/2026_06_ANL_FTTH_INFANCIA_30_DIAS_INSTALACAO000000000000.csv?authuser=0",
  },
  {
    key: "repetida_30_dias", label: "Repetida 30 Dias", short: "Rep. 30d",
    url: "https://storage.cloud.google.com/vtal-bucket-psr-ability/VIP/2026_06_ANL_FTTH_REPETIDA_30_DIAS000000000000.csv?authuser=0",
  },
];

type QRecord = {
  indicador: IndicadorKey;
  tecnico_matricula: string | null;
  municipio: string | null;
  uf: string | null;
  in_flag_indicador: string | null;
};

type Tecnico = {
  tr: string | null;
  tt: string | null;
  nome_tecnico: string | null;
  supervisor: string | null;
  coordenador: string | null;
};

type Cell = { total: number; sim: number };
type GroupRow = {
  key: string;
  label: string;
  sub?: string;
  cells: Partial<Record<IndicadorKey, Cell>> & Record<string, any>;
};

const emptyCells = (): Record<IndicadorKey, Cell> => {
  const o: any = {};
  INDICADORES.forEach((i) => (o[i.key] = { total: 0, sim: 0 }));
  return o;
};

const fmtPct = (c?: Cell) => {
  if (!c || c.total === 0) return "—";
  return `${Math.round((c.sim / c.total) * 100)}%`;
};

const cellTone = (c?: Cell) => {
  if (!c || c.total === 0) return "text-muted-foreground";
  const pct = (c.sim / c.total) * 100;
  if (pct >= 90) return "text-emerald-700 font-semibold";
  if (pct >= 75) return "text-amber-700 font-semibold";
  return "text-red-700 font-semibold";
};

export default function QualidadeFTTH() {
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<QRecord[]>([]);
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [imports, setImports] = useState<any[]>([]);
  const [tab, setTab] = useState<"painel" | "tecnicos" | "carregar">("painel");
  const [selectedSupervisor, setSelectedSupervisor] = useState<string | null>(null);
  const [filterMun, setFilterMun] = useState("");
  const [filterUf, setFilterUf] = useState("");
  const [uploading, setUploading] = useState<IndicadorKey | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const loadAll = async () => {
    setLoading(true);
    const [r, t, imp] = await Promise.all([
      supabase
        .from("quality_records")
        .select("indicador, tecnico_matricula, municipio, uf, in_flag_indicador"),
      supabase
        .from("tecnicos_cadastro")
        .select("tr, tt, nome_tecnico, supervisor, coordenador"),
      supabase
        .from("quality_imports")
        .select("*")
        .order("imported_at", { ascending: false })
        .limit(50),
    ]);
    setRecords((r.data as QRecord[]) || []);
    setTecnicos((t.data as Tecnico[]) || []);
    setImports(imp.data || []);
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  // Lookup matricula -> tecnico
  const tecMap = useMemo(() => {
    const m = new Map<string, Tecnico>();
    tecnicos.forEach((t) => {
      [t.tr, t.tt].forEach((mat) => {
        if (mat) m.set(mat.toUpperCase(), t);
      });
    });
    return m;
  }, [tecnicos]);

  // Filtered records
  const filtered = useMemo(() => {
    const mu = filterMun.trim().toUpperCase();
    const uf = filterUf.trim().toUpperCase();
    return records.filter((r) => {
      if (mu && !(r.municipio || "").includes(mu)) return false;
      if (uf && (r.uf || "") !== uf) return false;
      return true;
    });
  }, [records, filterMun, filterUf]);

  // Group by supervisor
  const supervisorRows: GroupRow[] = useMemo(() => {
    const map = new Map<string, GroupRow>();
    for (const r of filtered) {
      const tec = r.tecnico_matricula ? tecMap.get(r.tecnico_matricula.toUpperCase()) : null;
      const sup = tec?.supervisor || "— Sem supervisor —";
      const coord = tec?.coordenador || "—";
      let row = map.get(sup);
      if (!row) {
        row = { key: sup, label: sup, sub: coord, cells: emptyCells() };
        map.set(sup, row);
      }
      const cell = (row.cells as any)[r.indicador] as Cell;
      cell.total++;
      if ((r.in_flag_indicador || "").toUpperCase() === "SIM") cell.sim++;
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [filtered, tecMap]);

  // Group by technician for selected supervisor
  const tecnicoRows: GroupRow[] = useMemo(() => {
    if (!selectedSupervisor) return [];
    const map = new Map<string, GroupRow>();
    for (const r of filtered) {
      if (!r.tecnico_matricula) continue;
      const tec = tecMap.get(r.tecnico_matricula.toUpperCase());
      const sup = tec?.supervisor || "— Sem supervisor —";
      if (sup !== selectedSupervisor) continue;
      const key = r.tecnico_matricula.toUpperCase();
      let row = map.get(key);
      if (!row) {
        row = {
          key,
          label: tec?.nome_tecnico || key,
          sub: `${tec?.tr || ""} / ${tec?.tt || ""}`.trim().replace(/^\//, "").replace(/\/$/, ""),
          cells: emptyCells(),
        };
        map.set(key, row);
      }
      const cell = (row.cells as any)[r.indicador] as Cell;
      cell.total++;
      if ((r.in_flag_indicador || "").toUpperCase() === "SIM") cell.sim++;
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [filtered, tecMap, selectedSupervisor]);

  const totalsByIndicador = useMemo(() => {
    const o = emptyCells();
    filtered.forEach((r) => {
      const c = (o as any)[r.indicador] as Cell;
      c.total++;
      if ((r.in_flag_indicador || "").toUpperCase() === "SIM") c.sim++;
    });
    return o;
  }, [filtered]);

  const lastImportByIndicador = useMemo(() => {
    const m = new Map<string, any>();
    for (const imp of imports) {
      if (imp.status !== "success") continue;
      if (!m.has(imp.indicador)) m.set(imp.indicador, imp);
    }
    return m;
  }, [imports]);

  const handleUpload = async (key: IndicadorKey, file: File) => {
    setUploading(key);
    try {
      const fd = new FormData();
      fd.append("indicador", key);
      fd.append("file", file);
      const { data, error } = await supabase.functions.invoke("upload-qualidade-csv", {
        body: fd,
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Falha no upload");
      toast({ title: "Base importada", description: `${data.rows} linhas para ${key}.` });
      await loadAll();
    } catch (e: any) {
      toast({ title: "Erro ao importar", description: e.message || String(e), variant: "destructive" });
    } finally {
      setUploading(null);
    }
  };

  const renderTable = (rows: GroupRow[], firstColLabel: string, onClickRow?: (row: GroupRow) => void) => (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="sticky left-0 bg-muted/50 text-xs font-bold uppercase min-w-[200px]">
              {firstColLabel}
            </TableHead>
            {INDICADORES.map((i) => (
              <TableHead key={i.key} className="text-center text-[10px] font-bold uppercase whitespace-nowrap">
                {i.short}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={INDICADORES.length + 1} className="text-center text-muted-foreground py-6 text-sm">
                Nenhum dado. Importe as bases na aba "Carregar Bases".
              </TableCell>
            </TableRow>
          )}
          {rows.map((row) => (
            <TableRow
              key={row.key}
              className={onClickRow ? "cursor-pointer hover:bg-primary/5" : ""}
              onClick={() => onClickRow?.(row)}
            >
              <TableCell className="sticky left-0 bg-background">
                <div className="font-semibold text-sm">{row.label}</div>
                {row.sub && <div className="text-[11px] text-muted-foreground">{row.sub}</div>}
              </TableCell>
              {INDICADORES.map((i) => {
                const c = (row.cells as any)[i.key] as Cell;
                return (
                  <TableCell key={i.key} className="text-center whitespace-nowrap">
                    <div className="text-xs">{c.total || 0}</div>
                    <div className={`text-[11px] ${cellTone(c)}`}>{fmtPct(c)}</div>
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
          {rows.length > 0 && (
            <TableRow className="bg-muted/30 font-bold">
              <TableCell className="sticky left-0 bg-muted/30">TOTAL</TableCell>
              {INDICADORES.map((i) => {
                const c = (totalsByIndicador as any)[i.key] as Cell;
                return (
                  <TableCell key={i.key} className="text-center">
                    <div className="text-xs">{c.total || 0}</div>
                    <div className={`text-[11px] ${cellTone(c)}`}>{fmtPct(c)}</div>
                  </TableCell>
                );
              })}
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className="flex-1 overflow-auto bg-background">
      <div className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold">Qualidade FTTH</h1>
            <Badge variant="outline" className="text-[10px]">{records.length} registros</Badge>
          </div>
          <Button size="sm" variant="outline" onClick={loadAll} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      <div className="container mx-auto px-4 py-4">
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList>
            <TabsTrigger value="painel">
              <BarChart3 className="w-3.5 h-3.5 mr-1" /> Painel por Supervisor
            </TabsTrigger>
            <TabsTrigger value="tecnicos" disabled={!selectedSupervisor}>
              Detalhe Técnicos {selectedSupervisor ? `(${selectedSupervisor})` : ""}
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="carregar">
                <Upload className="w-3.5 h-3.5 mr-1" /> Carregar Bases
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="painel" className="space-y-3 pt-3">
            <Card>
              <CardContent className="pt-4 flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] text-muted-foreground">UF</span>
                  <Input
                    className="h-8 w-24"
                    placeholder="Ex: SC"
                    value={filterUf}
                    onChange={(e) => setFilterUf(e.target.value.toUpperCase())}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] text-muted-foreground">Município (contém)</span>
                  <Input
                    className="h-8 w-56"
                    placeholder="Ex: ITAJAI"
                    value={filterMun}
                    onChange={(e) => setFilterMun(e.target.value.toUpperCase())}
                  />
                </div>
                <div className="ml-auto text-[11px] text-muted-foreground">
                  Cada célula: <b>quantidade</b> em cima e <b>% cumprimento</b> abaixo.
                  Clique em uma linha para ver os técnicos.
                </div>
              </CardContent>
            </Card>

            {loading ? (
              <div className="flex items-center gap-2 py-12 justify-center text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
              </div>
            ) : (
              renderTable(supervisorRows, "Supervisor / Coordenador", (row) => {
                setSelectedSupervisor(row.key);
                setTab("tecnicos");
              })
            )}
          </TabsContent>

          <TabsContent value="tecnicos" className="space-y-3 pt-3">
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setTab("painel")}>
                <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Voltar ao Painel
              </Button>
              <div className="text-sm">
                Supervisor: <b>{selectedSupervisor}</b>
              </div>
            </div>
            {renderTable(tecnicoRows, "Técnico (TR / TT)")}
          </TabsContent>

          {isAdmin && (
            <TabsContent value="carregar" className="pt-3 space-y-3">
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">Como funciona</CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground space-y-1">
                  <p>1. Clique no link "Baixar do Google" do indicador desejado e baixe o CSV (precisa estar logado na sua conta Google).</p>
                  <p>2. Volte aqui, clique em "Selecionar CSV" no mesmo card e escolha o arquivo baixado.</p>
                  <p>3. O sistema substitui automaticamente os dados anteriores daquele indicador.</p>
                  <p>4. Repita para cada uma das 8 bases. Você pode atualizar quando quiser — sempre substituirá os dados antigos.</p>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {INDICADORES.map((ind) => {
                  const last = lastImportByIndicador.get(ind.key);
                  const isUp = uploading === ind.key;
                  return (
                    <Card key={ind.key}>
                      <CardHeader className="py-3">
                        <CardTitle className="text-sm flex items-center justify-between">
                          <span className="flex items-center gap-2">
                            <FileSpreadsheet className="w-4 h-4 text-primary" />
                            {ind.label}
                          </span>
                          {last && (
                            <Badge variant="outline" className="text-[10px]">
                              {last.rows_count} linhas
                            </Badge>
                          )}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-xs">
                        <div className="text-muted-foreground">
                          Última importação:{" "}
                          {last
                            ? new Date(last.imported_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
                            : "nunca"}
                        </div>
                        <div className="flex gap-2">
                          <a
                            href={ind.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 h-8 px-3 rounded border bg-background hover:bg-muted text-[12px]"
                          >
                            <Download className="w-3.5 h-3.5" /> Baixar do Google
                          </a>
                          <input
                            type="file"
                            accept=".csv,text/csv"
                            className="hidden"
                            ref={(el) => { fileInputs.current[ind.key] = el; }}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleUpload(ind.key, f);
                              e.target.value = "";
                            }}
                          />
                          <Button
                            size="sm"
                            disabled={isUp}
                            onClick={() => fileInputs.current[ind.key]?.click()}
                          >
                            {isUp ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Upload className="w-3.5 h-3.5 mr-1" />}
                            Selecionar CSV
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}