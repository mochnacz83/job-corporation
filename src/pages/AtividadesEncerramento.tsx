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
import { Loader2, RefreshCw, Upload, Save, Activity as ActivityIcon, Filter } from "lucide-react";
import * as XLSX from "xlsx";

type FatoRow = {
  id: string;
  ds_estado: string | null;
  ds_macro_atividade: string | null;
  matricula_tt: string | null;
  matricula_tr: string | null;
  nome_tecnico: string | null;
  data_atividade: string | null;
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
          .select("id, ds_estado, ds_macro_atividade, matricula_tt, matricula_tr, nome_tecnico, data_atividade")
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
      setFato((f || []) as FatoRow[]);
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

  // filtered fato
  const filteredFato = useMemo(() => {
    return fato.filter((r) => {
      if (estadoFilter !== "ALL" && r.ds_estado !== estadoFilter) return false;
      if (macroFilter !== "ALL" && r.ds_macro_atividade !== macroFilter) return false;
      return true;
    });
  }, [fato, estadoFilter, macroFilter]);

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
          status: presencaInfo?.status || "",
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

      <Tabs defaultValue="resumo" className="w-full">
        <TabsList>
          <TabsTrigger value="resumo">Resumo Diário</TabsTrigger>
          <TabsTrigger value="atividades">Atividades</TabsTrigger>
          {isAdmin && <TabsTrigger value="config">Configuração</TabsTrigger>}
        </TabsList>

        {/* RESUMO POR TÉCNICO */}
        <TabsContent value="resumo" className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Card><CardContent className="p-3"><div className="text-[11px] text-muted-foreground">Técnicos Ativos no dia</div><div className="text-2xl font-bold">{aggregated.length}</div></CardContent></Card>
            <Card><CardContent className="p-3"><div className="text-[11px] text-muted-foreground">Concluídas com Sucesso</div><div className="text-2xl font-bold text-success">{totals.sucesso}</div></CardContent></Card>
            <Card><CardContent className="p-3"><div className="text-[11px] text-muted-foreground">Concluídas sem Sucesso</div><div className="text-2xl font-bold text-destructive">{totals.insucesso}</div></CardContent></Card>
            <Card><CardContent className="p-3"><div className="text-[11px] text-muted-foreground">Total de Atividades</div><div className="text-2xl font-bold">{totals.total}</div></CardContent></Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center gap-2">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <Select value={estadoFilter} onValueChange={setEstadoFilter}>
                  <SelectTrigger className="w-[200px] h-8 text-xs"><SelectValue placeholder="ds_estado" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todos os estados</SelectItem>
                    {estados.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={macroFilter} onValueChange={setMacroFilter}>
                  <SelectTrigger className="w-[220px] h-8 text-xs"><SelectValue placeholder="ds_macro_atividade" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todas as macro atividades</SelectItem>
                    {macros.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Buscar técnico, TT, supervisor..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-[260px] h-8 text-xs"
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
                          <TableCell className="text-[11px] text-center">{r.status && <Badge variant="outline" className="text-[10px]">{r.status}</Badge>}</TableCell>
                          <TableCell className="text-[11px] text-center font-semibold text-success">{r.sucesso}</TableCell>
                          <TableCell className="text-[11px] text-center font-semibold text-destructive">{r.insucesso}</TableCell>
                          <TableCell className="text-[11px] text-center font-semibold">{r.total}</TableCell>
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
                    {filteredFato.slice(0, 2000).map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-[11px] font-mono">{r.matricula_tt}</TableCell>
                        <TableCell className="text-[11px] font-mono">{r.matricula_tr}</TableCell>
                        <TableCell className="text-[11px]">{r.nome_tecnico}</TableCell>
                        <TableCell className="text-[11px]">{r.ds_macro_atividade}</TableCell>
                        <TableCell className="text-[11px]"><Badge variant="outline" className="text-[10px]">{r.ds_estado}</Badge></TableCell>
                      </TableRow>
                    ))}
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