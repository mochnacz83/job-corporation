import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft, Upload, CheckCircle2, Play, Trash2, Database,
  AlertCircle, Loader2, Search, Wrench, Info, RefreshCw
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

// --- Types ---
type FileStatus = "idle" | "reading" | "uploading" | "success" | "error";
type FileProgress = { status: FileStatus; progress: number; message: string; };
type BaseKey = "b2b" | "tmr" | "prazo" | "repetida";

// --- Persistent state via localStorage ---
const LS_KEY = "bi_upload_status";
type PersistedStatus = Record<BaseKey, { loaded: boolean; rowCount: number; loadedAt: string | null }>;

const defaultPersisted: PersistedStatus = {
  b2b: { loaded: false, rowCount: 0, loadedAt: null },
  tmr: { loaded: false, rowCount: 0, loadedAt: null },
  prazo: { loaded: false, rowCount: 0, loadedAt: null },
  repetida: { loaded: false, rowCount: 0, loadedAt: null },
};

function loadPersistedStatus(): PersistedStatus {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : defaultPersisted;
  } catch { return defaultPersisted; }
}

function savePersistedStatus(status: PersistedStatus) {
  localStorage.setItem(LS_KEY, JSON.stringify(status));
}

const CHUNK_SIZE = 250;
const BASES = [
  {
    id: "b2b" as BaseKey, name: "FCT Oficial (B2B)", table: "raw_b2b",
    map: {
      designacao: ["DESIGNACAO", "Designação", "Circuito"], protocolo: ["PROTOCOLO", "Protocolo"],
      cliente: ["CLIENTE", "Cliente"], produto: ["PRODUTO", "Produto"],
      data_abertura: ["ABERTURA", "Abertura", "DATA_ABERTURA", "Data Abertura"],
      data_fechamento: ["FECHAMENTO", "Fechamento", "DATA_FECHAMENTO", "Data Fechamento"],
      uf: ["UF"], municipio: ["MUNICIPIO", "Municipio"],
      tecnologia_acesso: ["TECNOLOGIA_ACESSO", "Tecnologia Acesso"],
      posto_encerramento: ["POSTO_ENCERRAMENTO", "Posto Encerramento"],
      posto_anterior: ["POSTO_ANTERIOR", "Posto Anterior"], cldv: ["CLDV"],
      causa_ofensora_n1: ["CAUSA_OFENSORA_N1", "Causa N1"],
      causa_ofensora_n2: ["CAUSA_OFENSORA_N2", "Causa N2"],
      causa_ofensora_n3: ["CAUSA_OFENSORA_N3", "Causa N3"],
    }
  },
  {
    id: "tmr" as BaseKey, name: "VIP - TMR Médio", table: "raw_vip_tmr",
    map: { circuito: ["CIRCUITO", "Circuito", "Designação"], tmr: ["TMR"], tmr_pend_vtal: ["TMR_PEND_VTAL", "Pendência Vtal"], tmr_pend_oi: ["TMR_PEND_OI", "Pendência Oi"] }
  },
  {
    id: "prazo" as BaseKey, name: "VIP - SLA Prazo", table: "raw_vip_prazo",
    map: { circuito: ["CIRCUITO", "Circuito", "Designação"], reparo_prazo: ["REPARO_PRAZO", "Reparo Prazo", "SLA"], posto_prazo: ["POSTO_PRAZO", "Posto Prazo", "Posto Ofensor"] }
  },
  {
    id: "repetida" as BaseKey, name: "VIP - Repetidas", table: "raw_vip_repetida",
    map: { circuito: ["CIRCUITO", "Circuito", "Designação"], rep: ["REP"], retido: ["RETIDO"], tempo_repetida: ["TEMPO_REPETIDA", "Tempo Rep"], faixa_repetida: ["FAIXA_REPETIDA", "Faixa"] }
  },
];

export default function UploadBasesBI() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [dbStatus, setDbStatus] = useState<Record<string, boolean>>({});
  const [fnStatus, setFnStatus] = useState<Record<string, boolean>>({});
  const [checkingDb, setCheckingDb] = useState(false);
  const [fatoCount, setFatoCount] = useState<number | null>(null);
  const [persisted, setPersisted] = useState<PersistedStatus>(loadPersistedStatus);
  const [fileInputs, setFileInputs] = useState<Record<BaseKey, File | null>>({ b2b: null, tmr: null, prazo: null, repetida: null });
  const [progress, setProgress] = useState<Record<BaseKey, FileProgress>>({
    b2b: { status: "idle", progress: 0, message: "" },
    tmr: { status: "idle", progress: 0, message: "" },
    prazo: { status: "idle", progress: 0, message: "" },
    repetida: { status: "idle", progress: 0, message: "" },
  });

  useEffect(() => { if (isAdmin) checkDatabase(); }, [isAdmin]);

  const checkDatabase = async () => {
    setCheckingDb(true);
    const tables = ["raw_b2b", "raw_vip_tmr", "raw_vip_prazo", "raw_vip_repetida", "fato_reparos"];
    const fns = ["process_bi_etl", "clear_raw_tables"];
    const tStatus: Record<string, boolean> = {};
    const fStatus: Record<string, boolean> = {};
    for (const t of tables) {
      const { error } = await (supabase as any).from(t).select("id", { head: true, count: "exact" }).limit(1);
      tStatus[t] = !error;
    }
    for (const f of fns) {
      const { error } = await (supabase as any).rpc(f);
      fStatus[f] = !error || !error.message?.includes("Could not find the function");
    }
    const { count } = await (supabase as any).from("fato_reparos").select("*", { head: true, count: "exact" });
    setFatoCount(count || 0);
    setDbStatus(tStatus);
    setFnStatus(fStatus);
    setCheckingDb(false);
  };

  if (!isAdmin) return <div className="p-8 text-center text-zinc-500 font-bold">Acesso restrito.</div>;

  const updateProgress = (key: BaseKey, info: Partial<FileProgress>) => {
    setProgress(prev => ({ ...prev, [key]: { ...prev[key], ...info } }));
  };

  const updatePersisted = (key: BaseKey, update: Partial<PersistedStatus[BaseKey]>) => {
    setPersisted(prev => {
      const next = { ...prev, [key]: { ...prev[key], ...update } };
      savePersistedStatus(next);
      return next;
    });
  };

  const parseDate = (val: any) => {
    if (!val && val !== 0) return null;
    if (typeof val === "number") return new Date(new Date(1899, 11, 30).getTime() + val * 86400000).toISOString();
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d.toISOString();
  };

  const handleFileChange = (key: BaseKey) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (persisted[key].loaded) {
      const confirmOverwrite = window.confirm(
        `Já existe uma base "${BASES.find(b => b.id === key)?.name}" carregada (${persisted[key].rowCount} registros, em ${persisted[key].loadedAt ? new Date(persisted[key].loadedAt!).toLocaleString("pt-BR") : "—"}).\n\nDeseja sobrescrever com o novo arquivo?`
      );
      if (!confirmOverwrite) {
        e.target.value = "";
        return;
      }
    }
    setFileInputs(prev => ({ ...prev, [key]: file }));
    updateProgress(key, { status: "idle", progress: 0, message: "Arquivo selecionado." });
  };

  const uploadCsv = async (key: BaseKey, tableName: string, mapping: Record<string, string[]>, file: File) => {
    updateProgress(key, { status: "reading", progress: 5, message: "Lendo CSV..." });
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) throw new Error("CSV sem dados.");
    const sep = lines[0].includes(";") ? ";" : ",";
    const headers = lines[0].split(sep).map(h => h.replace(/["']/g, "").trim().toUpperCase());
    const idxMap: Record<string, number> = {};
    for (const [k, aliases] of Object.entries(mapping)) {
      for (const a of aliases) {
        const i = headers.indexOf(a.toUpperCase().trim());
        if (i !== -1) { idxMap[k] = i; break; }
      }
    }
    updateProgress(key, { status: "uploading", progress: 15, message: "Limpando..." });
    await (supabase as any).from(tableName).delete().neq("id", "00000000-0000-0000-0000-000000000000");
    let inserted = 0;
    for (let i = 1; i < lines.length; i += CHUNK_SIZE) {
      const batch = lines.slice(i, i + CHUNK_SIZE).map(line => {
        const cells = line.split(sep).map(c => c.replace(/["']/g, "").trim());
        const obj: any = {};
        for (const k in idxMap) {
          const v = cells[idxMap[k]] || null;
          if (k.startsWith("data_")) obj[k] = parseDate(v);
          else if (["tmr","tmr_pend_vtal","tmr_pend_oi","cldv","tempo_repetida"].includes(k)) { const n = parseFloat(v || "0"); obj[k] = isNaN(n) ? 0 : n; }
          else obj[k] = v === "" ? null : v;
        }
        return obj;
      });
      const { error } = await (supabase as any).from(tableName).insert(batch);
      if (error) throw error;
      inserted += batch.length;
      updateProgress(key, { progress: 15 + Math.floor((inserted / lines.length) * 85), message: `Upload: ${inserted}/${lines.length}` });
    }
    return inserted;
  };

  const uploadExcel = async (key: BaseKey, tableName: string, mapping: Record<string, string[]>, file: File) => {
    updateProgress(key, { status: "reading", progress: 5, message: "Lendo Excel..." });
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "array", cellDates: true, sheets: [XLSX.read(buffer, {type:"array", bookProps:true}).SheetNames[0]] });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
    const headers: string[] = [];
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cell = sheet[XLSX.utils.encode_cell({ r: range.s.r, c: C })];
      headers.push(cell ? cell.v.toString().trim().toUpperCase() : "");
    }
    const idxMap: Record<string, number> = {};
    for (const [k, aliases] of Object.entries(mapping)) {
      for (const a of aliases) {
        const i = headers.indexOf(a.toUpperCase().trim());
        if (i !== -1) { idxMap[k] = i; break; }
      }
    }
    updateProgress(key, { status: "uploading", progress: 15, message: "Limpando..." });
    await (supabase as any).from(tableName).delete().neq("id", "00000000-0000-0000-0000-000000000000");
    let inserted = 0;
    const total = range.e.r - range.s.r;
    for (let R = range.s.r + 1; R <= range.e.r; R += CHUNK_SIZE) {
      const batch: any[] = [];
      const endR = Math.min(R + CHUNK_SIZE - 1, range.e.r);
      for (let iR = R; iR <= endR; iR++) {
        const obj: any = {};
        let empty = true;
        for (const k in idxMap) {
          const cell = sheet[XLSX.utils.encode_cell({ r: iR, c: idxMap[k] })];
          const val = cell ? cell.v : null;
          if (val !== null && val !== "") empty = false;
          if (k.startsWith("data_")) obj[k] = parseDate(val);
          else if (["tmr","tmr_pend_vtal","tmr_pend_oi","cldv","tempo_repetida"].includes(k)) { const n = parseFloat(val?.toString() || "0"); obj[k] = isNaN(n) ? 0 : n; }
          else obj[k] = val?.toString().trim() || null;
        }
        if (!empty) batch.push(obj);
      }
      if (batch.length > 0) {
        const { error } = await (supabase as any).from(tableName).insert(batch);
        if (error) throw error;
        inserted += batch.length;
      }
      updateProgress(key, { progress: 15 + Math.floor(((R - range.s.r) / total) * 85), message: `Upload: ${R}/${range.e.r}` });
    }
    return inserted;
  };

  const uploadBase = async (key: BaseKey, tableName: string, mapping: Record<string, string[]>) => {
    const file = fileInputs[key];
    if (!file) return;
    try {
      let inserted = 0;
      if (file.name.toLowerCase().endsWith(".csv")) {
        inserted = await uploadCsv(key, tableName, mapping, file);
      } else {
        inserted = await uploadExcel(key, tableName, mapping, file);
      }
      updateProgress(key, { status: "success", progress: 100, message: `${inserted} registros carregados.` });
      updatePersisted(key, { loaded: true, rowCount: inserted, loadedAt: new Date().toISOString() });
      toast.success(`${tableName} carregada — ${inserted} registros.`);
      checkDatabase();
    } catch (e: any) {
      updateProgress(key, { status: "error", message: `Falha: ${e.message}` });
      toast.error(`Erro: ${e.message}`);
    }
  };

  const handleConsolidate = async () => {
    setLoading(true);
    try {
      const { error } = await (supabase as any).rpc("process_bi_etl");
      if (error) throw error;
      const { count } = await (supabase as any).from("fato_reparos").select("*", { head: true, count: "exact" });
      setFatoCount(count || 0);
      toast.success(`Dashboard consolidado! ${count || 0} reparos processados.`);
    } catch (e: any) {
      toast.error("Falha na consolidação: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 p-6 sm:p-10">
      <div className="max-w-6xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="h-6 w-6" />
            </Button>
            <div>
              <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">Central de Dados BI</h1>
              <p className="text-slate-500 text-sm">Carregue as bases operacionais e consolide o dashboard.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" size="sm" onClick={checkDatabase} disabled={checkingDb}>
              <Search className={`h-4 w-4 mr-2 ${checkingDb ? "animate-spin" : ""}`} /> Diagnóstico
            </Button>
            <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-lg" onClick={handleConsolidate} disabled={loading}>
              <Play className="h-4 w-4 mr-2" /> Consolidar Dashboard
            </Button>
          </div>
        </div>

        {/* Fact Table Status */}
        {fatoCount !== null && (
          <div className={`flex items-center gap-4 p-4 rounded-xl border ${fatoCount > 0 ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"}`}>
            <div className={`h-10 w-10 rounded-full flex items-center justify-center ${fatoCount > 0 ? "bg-green-100" : "bg-amber-100"}`}>
              <Database className={`h-5 w-5 ${fatoCount > 0 ? "text-green-700" : "text-amber-700"}`} />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">
                {fatoCount > 0 ? `✅ ${fatoCount.toLocaleString("pt-BR")} reparos consolidados na fato_reparos` : "⚠️ Tabela fato_reparos está vazia — carregue as bases e clique em Consolidar."}
              </p>
              {fatoCount > 0 && (
                <Button variant="link" size="sm" className="p-0 h-auto text-xs text-indigo-600" onClick={() => navigate("/relatorio-gerencial")}>
                  Ver Dashboard →
                </Button>
              )}
            </div>
            <Button variant="ghost" size="icon" onClick={() => checkDatabase()} className="ml-auto">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Diagnostic Bar */}
        <Card className="bg-zinc-900 border-none text-white shadow-2xl">
          <CardContent className="p-4 grid md:grid-cols-2 gap-6 text-[10px] font-mono">
            <div className="space-y-2">
              <div className="text-zinc-400 uppercase mb-2 flex items-center gap-2"><Database className="h-3 w-3" /> Tabelas</div>
              <div className="flex flex-wrap gap-3">
                {Object.entries(dbStatus).map(([name, exists]) => (
                  <div key={name} className={`flex items-center gap-1.5 px-2 py-1 rounded ${exists ? "bg-zinc-800" : "bg-red-950"}`}>
                    <div className={`h-1.5 w-1.5 rounded-full ${exists ? "bg-green-400" : "bg-red-500 animate-pulse"}`} />
                    <span className={exists ? "text-zinc-300" : "text-red-400"}>{name}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-zinc-400 uppercase mb-2 flex items-center gap-2"><Wrench className="h-3 w-3" /> Funções</div>
              <div className="flex flex-wrap gap-3">
                {Object.entries(fnStatus).map(([name, exists]) => (
                  <div key={name} className={`flex items-center gap-1.5 px-2 py-1 rounded ${exists ? "bg-zinc-800" : "bg-red-950"}`}>
                    <div className={`h-1.5 w-1.5 rounded-full ${exists ? "bg-indigo-400" : "bg-red-500 animate-pulse"}`} />
                    <span className={exists ? "text-zinc-300" : "text-red-400"}>{name}()</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Upload Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {BASES.map((cfg) => {
            const p = progress[cfg.id];
            const pers = persisted[cfg.id];
            const isWorking = p.status === "reading" || p.status === "uploading";
            const isError = p.status === "error";
            const isSuccess = p.status === "success";
            const alreadyLoaded = pers.loaded && p.status === "idle";

            return (
              <Card key={cfg.id} className={`${isSuccess || alreadyLoaded ? "border-green-500/60 bg-green-50/5" : isError ? "border-red-500/60" : ""}`}>
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-xs font-bold uppercase tracking-wider flex justify-between items-start">
                    <span>{cfg.name}</span>
                    {(isSuccess || alreadyLoaded) && <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />}
                    {isError && <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />}
                  </CardTitle>
                  {alreadyLoaded && (
                    <p className="text-[9px] text-green-700 font-bold">
                      {pers.rowCount.toLocaleString("pt-BR")} registros · {pers.loadedAt ? new Date(pers.loadedAt).toLocaleString("pt-BR") : ""}
                    </p>
                  )}
                </CardHeader>
                <CardContent className="p-4 pt-0 space-y-3">
                  <Input type="file" accept=".xlsx,.csv" onChange={handleFileChange(cfg.id)} disabled={isWorking || loading} className="text-[10px]" />
                  {(isWorking || isSuccess || isError) && (
                    <div className="space-y-1">
                      <Progress value={p.progress} className={`h-1 ${isError ? "bg-red-100" : ""}`} />
                      <p className={`text-[9px] font-bold truncate ${isError ? "text-red-600" : "text-slate-500"}`}>{p.message}</p>
                    </div>
                  )}
                  <Button className="w-full text-[10px] font-black h-10" variant={isSuccess || alreadyLoaded ? "secondary" : isError ? "destructive" : "default"} onClick={() => uploadBase(cfg.id, cfg.table, cfg.map)} disabled={!fileInputs[cfg.id] || isWorking || loading}>
                    {isWorking ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Upload className="mr-2 h-3 w-3" />}
                    {alreadyLoaded ? "Atualizar Base" : isSuccess ? "Reenviar" : "Carregar"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Help Box */}
        <div className="p-5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl flex gap-4 shadow-sm">
          <Info className="h-5 w-5 text-indigo-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-bold text-slate-800 dark:text-zinc-100">Fluxo de trabalho</p>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-relaxed">
              <strong>1.</strong> Carregue o FCT Oficial (B2B) e as 3 bases VIP. · <strong>2.</strong> Clique em <em>Consolidar Dashboard</em> para cruzar os dados. · <strong>3.</strong> Acesse o <em>BI Gerencial de Reparos</em> para ver os indicadores.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
