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
        const { error } = await (supabase as any).from(table).select("*", { count: "exact", head: true });
        status[table] = !error;
      } catch {
        status[table] = false;
      }
    }
    setDbStatus(status);
    setCheckingDb(false);
  };

  if (!isAdmin) {
    return (
      <div className="p-8 text-center text-zinc-500 font-bold">
        Acesso restrito a administradores.
      </div>
    );
  }

  const updateFileInfo = (key: keyof UploadState, info: Partial<FileProgress>) => {
    setFiles(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        info: { ...prev[key].info, ...info }
      }
    }));
  };

  const handleFileChange = (type: keyof UploadState) => (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFiles(prev => ({
        ...prev,
        [type]: {
          file: e.target.files![0],
          info: { status: "idle", progress: 0, message: "Arquivo pronto." }
        }
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

  const uploadBase = async (key: keyof UploadState, tableName: string, mapping: Record<string, string[]>) => {
    const fileObj = files[key];
    if (!fileObj.file) return toast.error("Selecione o arquivo.");

    updateFileInfo(key, { status: "reading", progress: 5, message: "Lendo buffer..." });

    return new Promise<void>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          console.log(`[Upload] Processando: ${tableName}`);
          const buffer = e.target?.result as ArrayBuffer;
          
          // Use header 1 to get raw grid (avoid object creation)
          const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];
          
          if (!rows || rows.length < 2) throw new Error("Documento sem dados.");

          const headers = rows[0].map(h => h?.toString().toUpperCase().trim());
          const dataOnly = rows.slice(1);

          updateFileInfo(key, { progress: 10, message: "Mapeando colunas..." });

          const idxMap: Record<string, number> = {};
          for (const [targetKey, aliases] of Object.entries(mapping)) {
            for (const alias of aliases) {
              const idx = headers.indexOf(alias.toUpperCase().trim());
              if (idx !== -1) {
                idxMap[targetKey] = idx;
                break;
              }
            }
          }

          updateFileInfo(key, { status: "uploading", progress: 15, message: "Limpando tabela..." });
          const { error: delError } = await (supabase as any).from(tableName).delete().neq("id", "00000000-0000-0000-0000-000000000000");
          if (delError) {
              console.error(`[DB Error] Delete failed for ${tableName}:`, delError);
              throw new Error(`Erro ao limpar ${tableName}: ${delError.message}`);
          }

          // Insert Chunks using a more primitive approach to avoid Proxy enumeration
          for (let i = 0; i < dataOnly.length; i += CHUNK_SIZE) {
            const chunk = dataOnly.slice(i, i + CHUNK_SIZE);
            const batch = chunk.map(rowArray => {
              // Creating a simple object literal
              const obj: any = {};
              for (const key in idxMap) {
                const colIdx = idxMap[key];
                const rawVal = rowArray[colIdx];
                if (key.startsWith('data_')) {
                  obj[key] = parseDate(rawVal);
                } else if (['tmr', 'tmr_pend_vtal', 'tmr_pend_oi', 'cldv', 'tempo_repetida'].includes(key)) {
                  const n = parseFloat(rawVal || "0");
                  obj[key] = isNaN(n) ? 0 : n;
                } else {
                  const s = rawVal?.toString().trim();
                  obj[key] = s === "" ? null : s;
                }
              }
              return obj;
            });

            // The 'Killer' for Proxies: Deep clone to plain objects
            const cleanBatch = JSON.parse(JSON.stringify(batch));

            const { error: insError } = await (supabase as any).from(tableName).insert(cleanBatch);
            if (insError) {
                console.error(`[DB Error] Insert failed for ${tableName} at row ${i}:`, insError);
                throw new Error(`Erro ao inserir ${tableName}: ${insError.message}`);
            }

            const perc = 15 + Math.floor(((i + chunk.length) / dataOnly.length) * 85);
            updateFileInfo(key, { progress: perc, message: `Progresso: ${i + chunk.length}/${dataOnly.length}` });
          }

          updateFileInfo(key, { status: "success", progress: 100, message: "Carga completa." });
          toast.success(`${tableName} carregada.`);
          checkDatabase(); // Update status
          resolve();
        } catch (error: any) {
          console.error(`[Diagnostic] Catch em ${tableName}:`, error);
          const msg = error.message || "Falha técnica";
          updateFileInfo(key, { status: "error", message: msg });
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error("Falha na leitura física do arquivo."));
      reader.readAsArrayBuffer(fileObj.file!);
    });
  };

  const handleProcessBI = async () => {
    setLoading(true);
    try {
      const { error } = await (supabase as any).rpc("process_bi_etl");
      if (error) throw error;
      toast.success("BI Consolidado com sucesso!");
    } catch (error: any) {
      toast.error("Erro no processamento: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-6 sm:p-10">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Superior Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="h-6 w-6" />
            </Button>
            <div>
              <h1 className="text-3xl font-black tracking-tight text-zinc-900 dark:text-white">Carga de Bases Operacionais</h1>
              <p className="text-zinc-500 text-sm">Atualize os dados brutos e cruze as informações para o dashboard.</p>
            </div>
          </div>
          <div className="flex gap-3">
             <Button variant="outline" size="sm" onClick={checkDatabase} disabled={checkingDb}>
                <Search className={`h-4 w-4 mr-2 ${checkingDb ? "animate-spin" : ""}`} /> Diagnosticar Banco
             </Button>
             <Button size="sm" className="bg-zinc-900 text-white font-bold" onClick={handleProcessBI} disabled={loading}>
                <Play className="h-4 w-4 mr-2" /> Consolidar BI
             </Button>
          </div>
        </div>

        {/* DB Diagnostic Alert */}
        <Card className="bg-zinc-900 border-none text-white overflow-hidden">
          <CardContent className="p-4 flex flex-wrap gap-4 items-center justify-center sm:justify-between text-xs font-mono">
            <div className="flex items-center gap-2">
               <Database className="h-4 w-4 text-indigo-400" />
               <span className="text-zinc-400">STATUS SCHEMAS:</span>
            </div>
            <div className="flex flex-wrap gap-4">
               {Object.entries(dbStatus).map(([name, exists]) => (
                 <div key={name} className="flex items-center gap-1.5">
                    <div className={`h-2 w-2 rounded-full ${exists ? "bg-green-500" : "bg-red-500 animate-pulse"}`} />
                    <span className={exists ? "text-zinc-300" : "text-red-400 font-bold"}>{name}</span>
                 </div>
               ))}
            </div>
          </CardContent>
        </Card>

        {/* Upload Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { id: "b2b", name: "FCT Oficial (B2B)", table: "raw_b2b", mapping: {
              designacao: ["DESIGNACAO", "Designação", "Circuito"],
              protocolo: ["PROTOCOLO", "Protocolo"],
              cliente: ["CLIENTE", "Cliente"],
              produto: ["PRODUTO", "Produto"],
              data_abertura: ["ABERTURA", "Abertura", "DATA_ABERTURA", "Data Abertura"],
              data_fechamento: ["FECHAMENTO", "Fechamento", "DATA_FECHAMENTO", "Data Fechamento"],
              uf: ["UF"],
              municipio: ["MUNICIPIO", "Municipio"],
              tecnologia_acesso: ["TECNOLOGIA_ACESSO", "Tecnologia Acesso"],
              posto_encerramento: ["POSTO_ENCERRAMENTO", "Posto Encerramento"],
              posto_anterior: ["POSTO_ANTERIOR", "Posto Anterior"],
              cldv: ["CLDV"],
              causa_ofensora_n1: ["CAUSA_OFENSORA_N1", "Causa N1"],
              causa_ofensora_n2: ["CAUSA_OFENSORA_N2", "Causa N2"],
              causa_ofensora_n3: ["CAUSA_OFENSORA_N3", "Causa N3"],
            }},
            { id: "tmr", name: "VIP - TMR Médio", table: "raw_vip_tmr", mapping: {
              circuito: ["CIRCUITO", "Circuito", "Designação"],
              tmr: ["TMR"],
              tmr_pend_vtal: ["TMR_PEND_VTAL", "Pendência Vtal"],
              tmr_pend_oi: ["TMR_PEND_OI", "Pendência Oi"],
            }},
            { id: "prazo", name: "VIP - SLA Prazo", table: "raw_vip_prazo", mapping: {
              circuito: ["CIRCUITO", "Circuito", "Designação"],
              reparo_prazo: ["REPARO_PRAZO", "Reparo Prazo", "SLA"],
              posto_prazo: ["POSTO_PRAZO", "Posto Prazo", "Posto Ofensor"],
            }},
            { id: "repetida", name: "VIP - Repetidas", table: "raw_vip_repetida", mapping: {
              circuito: ["CIRCUITO", "Circuito", "Designação"],
              rep: ["REP"],
              retido: ["RETIDO"],
              tempo_repetida: ["TEMPO_REPETIDA", "Tempo Rep"],
              faixa_repetida: ["FAIXA_REPETIDA", "Faixa"],
            }},
          ].map((cfg) => {
            const item = files[cfg.id as keyof UploadState];
            const isWorking = item.info.status === "reading" || item.info.status === "uploading";
            const isError = item.info.status === "error";
            const isSuccess = item.info.status === "success";

            return (
              <Card key={cfg.id} className={`${isSuccess ? "border-green-500/50 bg-green-50/5" : isError ? "border-red-500/50 bg-red-50/5 shadow-md" : ""}`}>
                <CardHeader className="p-5 pb-3">
                  <CardTitle className="text-sm font-bold flex items-center justify-between uppercase tracking-wider">
                    {cfg.name}
                    {isSuccess && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-5 pt-0 space-y-4">
                  <Input type="file" accept=".xlsx,.csv" onChange={handleFileChange(cfg.id as keyof UploadState)} disabled={isWorking || loading} className="text-[10px]" />
                  
                  {(isWorking || isSuccess || isError) && (
                    <div className="space-y-1.5">
                       <Progress value={item.info.progress} className={`h-1.5 ${isError ? "bg-red-200" : ""}`} />
                       <p className={`text-[10px] font-bold truncate ${isError ? "text-red-600" : "text-zinc-500"}`}>{item.info.message}</p>
                    </div>
                  )}

                  <Button 
                    className="w-full text-xs font-bold uppercase py-5"
                    variant={isSuccess ? "secondary" : isError ? "destructive" : "default"}
                    onClick={() => uploadBase(cfg.id as keyof UploadState, cfg.table, cfg.mapping)} 
                    disabled={!item.file || isWorking || loading}
                  >
                    {isWorking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                    {isSuccess ? "Reenviar Dados" : "Carregar Base"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Footer help */}
        {Object.values(dbStatus).some(v => v === false) && (
          <div className="p-6 bg-red-50 border border-red-200 rounded-2xl flex gap-5">
             <AlertCircle className="h-6 w-6 text-red-600 shrink-0" />
             <div className="space-y-2">
                <h4 className="text-sm font-bold text-red-900">TABELAS NÃO ENCONTRADAS NO BANCO</h4>
                <p className="text-xs text-red-700 leading-relaxed">
                  O sistema detectou que tabelas do BI estão faltando. Isso causa o erro de "Schema cache".
                  Abra o <strong>SQL Editor</strong> no Supabase e cole os comandos de criação de tabela que foram passados nas mensagens anteriores.
                </p>
                <Button variant="outline" size="sm" className="text-[10px] h-7 border-red-300" onClick={() => navigate("/dashboard")}>
                   <FileCode className="h-3 w-3 mr-2" /> Copiar SQL de Criação (no chat)
                </Button>
             </div>
          </div>
        )}

      </div>
    </div>
  );
}
