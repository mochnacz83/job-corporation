import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Upload, CheckCircle2, Play, Trash2, Database, AlertCircle, Loader2, Info, Search, FileCode } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

type FileStatus = "idle" | "reading" | "uploading" | "success" | "error";

type FileProgress = {
  status: FileStatus;
  progress: number;
  message: string;
};

type UploadState = {
  b2b: { file: File | null; info: FileProgress };
  tmr: { file: File | null; info: FileProgress };
  prazo: { file: File | null; info: FileProgress };
  repetida: { file: File | null; info: FileProgress };
};

const CHUNK_SIZE = 250; 

export default function UploadBasesBI() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [dbStatus, setDbStatus] = useState<Record<string, boolean>>({});
  const [checkingDb, setCheckingDb] = useState(false);
  const [files, setFiles] = useState<UploadState>({
    b2b: { file: null, info: { status: "idle", progress: 0, message: "" } },
    tmr: { file: null, info: { status: "idle", progress: 0, message: "" } },
    prazo: { file: null, info: { status: "idle", progress: 0, message: "" } },
    repetida: { file: null, info: { status: "idle", progress: 0, message: "" } },
  });

  useEffect(() => {
    if (isAdmin) checkDatabase();
  }, [isAdmin]);

  const checkDatabase = async () => {
    setCheckingDb(true);
    const tables = ["raw_b2b", "raw_vip_tmr", "raw_vip_prazo", "raw_vip_repetida", "fato_reparos"];
    const status: Record<string, boolean> = {};
    for (const table of tables) {
      try {
        const { error } = await (supabase as any).from(table).select("id", { count: "exact", head: true }).limit(1);
        status[table] = !error;
      } catch { status[table] = false; }
    }
    setDbStatus(status);
    setCheckingDb(false);
  };

  if (!isAdmin) return <div className="p-8 text-center text-zinc-500 font-bold">Acesso restrito.</div>;

  const updateFileInfo = (key: keyof UploadState, info: Partial<FileProgress>) => {
    setFiles(prev => ({ ...prev, [key]: { ...prev[key], info: { ...prev[key].info, ...info } } }));
  };

  const handleFileChange = (type: keyof UploadState) => (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFiles(prev => ({
        ...prev,
        [type]: { file: e.target.files![0], info: { status: "idle", progress: 0, message: "Arquivo selecionado." } }
      }));
    }
  };

  const parseDate = (val: any) => {
    if (val === null || val === undefined || val === "") return null;
    if (typeof val === "number") {
      const epoch = new Date(1899, 11, 30);
      return new Date(epoch.getTime() + val * 86400000).toISOString();
    }
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d.toISOString();
  };

  // ULTRA-SAFE CSV PARSER (Manual String Stream)
  const uploadCsvSafe = async (key: keyof UploadState, tableName: string, mapping: Record<string, string[]>, file: File) => {
    updateFileInfo(key, { status: "reading", progress: 5, message: "Lendo CSV..." });
    const text = await file.text();
    const allLines = text.split(/\r?\n/).filter(l => l.trim() !== "");
    if (allLines.length < 2) throw new Error("CSV sem dados.");

    const separator = allLines[0].includes(";") ? ";" : ",";
    const headers = allLines[0].split(separator).map(h => h.replace(/['"]+/g, '').trim().toUpperCase());
    
    const idxMap: Record<string, number> = {};
    for (const [tKey, aliases] of Object.entries(mapping)) {
      for (const alias of aliases) {
        const idx = headers.indexOf(alias.toUpperCase().trim());
        if (idx !== -1) { idxMap[tKey] = idx; break; }
      }
    }

    updateFileInfo(key, { status: "uploading", progress: 15, message: "Limpando tabela..." });
    await (supabase as any).from(tableName).delete().neq("id", "00000000-0000-0000-0000-000000000000");

    for (let i = 1; i < allLines.length; i += CHUNK_SIZE) {
      const chunk = allLines.slice(i, i + CHUNK_SIZE);
      const batch = chunk.map(line => {
        const cells = line.split(separator).map(c => c.replace(/['"]+/g, '').trim());
        const obj: any = {};
        for (const k in idxMap) {
          const val = cells[idxMap[k]] || null;
          if (k.startsWith('data_')) obj[k] = parseDate(val);
          else if (['tmr', 'tmr_pend_vtal', 'tmr_pend_oi', 'cldv', 'tempo_repetida'].includes(k)) {
            const n = parseFloat(val || "0");
            obj[k] = isNaN(n) ? 0 : n;
          } else obj[k] = val === "" ? null : val;
        }
        return obj;
      });
      const { error } = await (supabase as any).from(tableName).insert(batch);
      if (error) throw error;
      updateFileInfo(key, { progress: 15 + Math.floor((i / allLines.length) * 85), message: `Upload: ${i}/${allLines.length}` });
    }
  };

  // ULTRA-SAFE EXCEL ITERATOR (No Property Enumeration)
  const uploadExcelSafe = async (key: keyof UploadState, tableName: string, mapping: Record<string, string[]>, file: File) => {
    updateFileInfo(key, { status: "reading", progress: 5, message: "Lendo Excel (Seguro)..." });
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true, sheets: [XLSX.read(buffer, {type: "array", bookProps:true}).SheetNames[0]] });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];

    const range = XLSX.utils.decode_range(sheet['!ref'] || "A1:A1");
    const headers: string[] = [];
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cell = sheet[XLSX.utils.encode_cell({ r: range.s.r, c: C })];
      headers.push(cell ? cell.v.toString().trim().toUpperCase() : "");
    }

    const idxMap: Record<string, number> = {};
    for (const [tKey, aliases] of Object.entries(mapping)) {
      for (const alias of aliases) {
        const idx = headers.indexOf(alias.toUpperCase().trim());
        if (idx !== -1) { idxMap[tKey] = idx; break; }
      }
    }

    updateFileInfo(key, { status: "uploading", progress: 15, message: "Limpando tabela..." });
    await (supabase as any).from(tableName).delete().neq("id", "00000000-0000-0000-0000-000000000000");

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
          if (k.startsWith('data_')) obj[k] = parseDate(val);
          else if (['tmr', 'tmr_pend_vtal', 'tmr_pend_oi', 'cldv', 'tempo_repetida'].includes(k)) {
            const n = parseFloat(val?.toString() || "0");
            obj[k] = isNaN(n) ? 0 : n;
          } else obj[k] = val?.toString().trim() || null;
        }
        if (!empty) batch.push(obj);
      }

      if (batch.length > 0) {
        const { error } = await (supabase as any).from(tableName).insert(batch);
        if (error) throw error;
      }
      updateFileInfo(key, { progress: 15 + Math.floor(((R - range.s.r) / (range.e.r - range.s.r)) * 85), message: `Upload: ${R}/${range.e.r}` });
    }
  };

  const uploadBase = async (key: keyof UploadState, tableName: string, mapping: Record<string, string[]>) => {
    const file = files[key].file;
    if (!file) return;
    try {
      if (file.name.toLowerCase().endsWith(".csv")) {
        await uploadCsvSafe(key, tableName, mapping, file);
      } else {
        await uploadExcelSafe(key, tableName, mapping, file);
      }
      updateFileInfo(key, { status: "success", progress: 100, message: "Sucesso!" });
      toast.success(`${tableName} carregada.`);
      checkDatabase();
    } catch (e: any) {
      console.error(e);
      updateFileInfo(key, { status: "error", message: `Falha: ${e.message}` });
      toast.error(`Erro ao carregar: ${e.message}`);
    }
  };

  const handleProcessBI = async () => {
    setLoading(true);
    try {
      const { error } = await (supabase as any).rpc("process_bi_etl");
      if (error) throw error;
      toast.success("BI Consolidado!");
    } catch (e: any) { toast.error("Erro: " + e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 p-6 sm:p-10">
      <div className="max-w-6xl mx-auto space-y-8">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="h-6 w-6" />
            </Button>
            <div>
              <h1 className="text-3xl font-black tracking-tight text-zinc-900 dark:text-white">Central de Dados BI</h1>
              <p className="text-zinc-500 text-sm">Atualize as bases e consolide o dashboard gerencial.</p>
            </div>
          </div>
          <div className="flex gap-3">
             <Button variant="outline" size="sm" onClick={checkDatabase} disabled={checkingDb}>
                <Search className={`h-4 w-4 mr-2 ${checkingDb ? "animate-spin" : ""}`} /> Diagnóstico
             </Button>
             <Button size="sm" className="bg-zinc-900 text-white font-bold" onClick={handleProcessBI} disabled={loading}>
                <Play className="h-4 w-4 mr-2" /> Consolidar Dashboard
             </Button>
          </div>
        </div>

        <Card className="bg-zinc-900 border-none text-white overflow-hidden">
          <CardContent className="p-4 flex flex-wrap gap-4 items-center justify-center sm:justify-between text-[10px] font-mono">
            <div className="flex items-center gap-2">
               <Database className="h-3 w-3 text-indigo-400" />
               <span className="text-zinc-400 uppercase">STATUS TABELAS:</span>
            </div>
            <div className="flex flex-wrap gap-4">
               {Object.entries(dbStatus).map(([name, exists]) => (
                 <div key={name} className="flex items-center gap-1.5">
                    <div className={`h-1.5 w-1.5 rounded-full ${exists ? "bg-green-500" : "bg-red-500 animate-pulse"}`} />
                    <span className={exists ? "text-zinc-300" : "text-red-400 font-bold"}>{name}</span>
                 </div>
               ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { id: "b2b", name: "FCT Oficial (B2B)", table: "raw_b2b", map: {
              designacao: ["DESIGNACAO", "Designação", "Circuito"], protocolo: ["PROTOCOLO", "Protocolo"], cliente: ["CLIENTE", "Cliente"], produto: ["PRODUTO", "Produto"],
              data_abertura: ["ABERTURA", "Abertura", "DATA_ABERTURA", "Data Abertura"], data_fechamento: ["FECHAMENTO", "Fechamento", "DATA_FECHAMENTO", "Data Fechamento"],
              uf: ["UF"], municipio: ["MUNICIPIO", "Municipio"], tecnologia_acesso: ["TECNOLOGIA_ACESSO", "Tecnologia Acesso"], posto_encerramento: ["POSTO_ENCERRAMENTO", "Posto Encerramento"],
              posto_anterior: ["POSTO_ANTERIOR", "Posto Anterior"], cldv: ["CLDV"], causa_ofensora_n1: ["CAUSA_OFENSORA_N1", "Causa N1"],
              causa_ofensora_n2: ["CAUSA_OFENSORA_N2", "Causa N2"], causa_ofensora_n3: ["CAUSA_OFENSORA_N3", "Causa N3"],
            }},
            { id: "tmr", name: "VIP - TMR Médio", table: "raw_vip_tmr", map: { circuito: ["CIRCUITO", "Circuito", "Designação"], tmr: ["TMR"], tmr_pend_vtal: ["TMR_PEND_VTAL", "Pendência Vtal"], tmr_pend_oi: ["TMR_PEND_OI", "Pendência Oi"] }},
            { id: "prazo", name: "VIP - SLA Prazo", table: "raw_vip_prazo", map: { circuito: ["CIRCUITO", "Circuito", "Designação"], reparo_prazo: ["REPARO_PRAZO", "Reparo Prazo", "SLA"], posto_prazo: ["POSTO_PRAZO", "Posto Prazo", "Posto Ofensor"] }},
            { id: "repetida", name: "VIP - Repetidas", table: "raw_vip_repetida", map: { circuito: ["CIRCUITO", "Circuito", "Designação"], rep: ["REP"], retido: ["RETIDO"], tempo_repetida: ["TEMPO_REPETIDA", "Tempo Rep"], faixa_repetida: ["FAIXA_REPETIDA", "Faixa"] }},
          ].map((cfg) => {
            const item = files[cfg.id as keyof UploadState];
            const isWorking = item.info.status === "reading" || item.info.status === "uploading";
            const isError = item.info.status === "error";
            const isSuccess = item.info.status === "success";
            return (
              <Card key={cfg.id} className={`${isSuccess ? "border-green-500/50" : isError ? "border-red-500/50" : ""}`}>
                <CardHeader className="p-5 pb-3">
                  <CardTitle className="text-xs font-bold flex items-center justify-between uppercase">
                    {cfg.name}
                    {isSuccess && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-5 pt-0 space-y-4">
                  <Input type="file" accept=".xlsx,.csv" onChange={handleFileChange(cfg.id as keyof UploadState)} disabled={isWorking || loading} className="text-[10px]" />
                  {(isWorking || isSuccess || isError) && (
                    <div className="space-y-1">
                       <Progress value={item.info.progress} className={`h-1.5 ${isError ? "bg-red-200" : ""}`} />
                       <p className={`text-[9px] font-bold truncate ${isError ? "text-red-600" : "text-zinc-500"}`}>{item.info.message}</p>
                    </div>
                  )}
                  <Button className="w-full text-xs font-bold" variant={isSuccess ? "secondary" : isError ? "destructive" : "default"} onClick={() => uploadBase(cfg.id as keyof UploadState, cfg.table, cfg.map)} disabled={!item.file || isWorking || loading}>
                    {isWorking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                    {isSuccess ? "Reenviar" : "Carregar AGORA"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="p-6 bg-amber-50 border border-amber-200 rounded-2xl flex gap-5">
           <AlertCircle className="h-6 w-6 text-amber-600 shrink-0" />
           <div className="space-y-1">
             <h4 className="text-sm font-bold text-amber-900">PROBLEMAS COM B2B?</h4>
             <p className="text-[11px] text-amber-800 leading-relaxed font-medium">
                Se o carregamento do B2B (FCT Oficial) continuar falhando, **SALVE O ARQUIVO COMO CSV (UTF-8)** no Excel antes de subir.
                O formato CSV é processado linha a linha de forma ultra-leve e evita todos os erros de memória do navegador.
             </p>
           </div>
        </div>

      </div>
    </div>
  );
}
