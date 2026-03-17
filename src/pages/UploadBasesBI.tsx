import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Upload, CheckCircle2, Play, Trash2, Database, AlertCircle, Loader2, Info, FileSpreadsheet } from "lucide-react";
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

const CHUNK_SIZE = 400;

export default function UploadBasesBI() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<UploadState>({
    b2b: { file: null, info: { status: "idle", progress: 0, message: "" } },
    tmr: { file: null, info: { status: "idle", progress: 0, message: "" } },
    prazo: { file: null, info: { status: "idle", progress: 0, message: "" } },
    repetida: { file: null, info: { status: "idle", progress: 0, message: "" } },
  });

  if (!isAdmin) {
    return (
      <div className="p-8 text-center text-muted-foreground font-medium">
        Acesso restrito.
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
          info: { status: "idle", progress: 0, message: "Arquivo selecionado." }
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

    updateFileInfo(key, { status: "reading", progress: 5, message: "Abrindo arquivo..." });

    return new Promise<void>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const buffer = e.target?.result as ArrayBuffer;
          
          // PHASE 1: Low-Memory Reading
          const workbook = XLSX.read(buffer, { 
            type: "array", 
            cellDates: true, 
            cellNF: false, 
            cellText: false,
            sheets: [XLSX.read(buffer, {type: "array", bookProps:true}).SheetNames[0]] // Read only first sheet
          });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          
          // PHASE 2: Convert to CSV string to escape XLSX's object proxies (Fixes 'Too many properties' error)
          updateFileInfo(key, { progress: 10, message: "Convertendo dados estruturados..." });
          const csvString = XLSX.utils.sheet_to_csv(sheet, { FS: "|", RS: "\n" });
          const rows = csvString.split("\n").map(line => line.split("|"));
          
          if (rows.length < 2) throw new Error("Documento sem dados.");

          const fileHeaders = rows[0].map(h => h.trim().toUpperCase());
          const dataRows = rows.slice(1).filter(r => r.some(cell => cell.trim() !== ""));

          // Map indices
          const idxMap: Record<string, number> = {};
          for (const [targetKey, aliases] of Object.entries(mapping)) {
            for (const alias of aliases) {
              const idx = fileHeaders.indexOf(alias.toUpperCase().trim());
              if (idx !== -1) {
                idxMap[targetKey] = idx;
                break;
              }
            }
          }

          updateFileInfo(key, { status: "uploading", progress: 15, message: "Limpando base atual..." });
          await (supabase as any).from(tableName).delete().neq("id", "00000000-0000-0000-0000-000000000000");

          // PHASE 3: Iterative Chunked Insertion
          for (let i = 0; i < dataRows.length; i += CHUNK_SIZE) {
            const chunk = dataRows.slice(i, i + CHUNK_SIZE);
            const payload = chunk.map(rowArray => {
              const obj: any = {};
              for (const [targetKey, colIdx] of Object.entries(idxMap)) {
                const rawVal = rowArray[colIdx]?.trim() || null;
                if (targetKey.includes('data_')) {
                  obj[targetKey] = parseDate(rawVal);
                } else if (['tmr', 'tmr_pend_vtal', 'tmr_pend_oi', 'cldv', 'tempo_repetida'].includes(targetKey)) {
                  const n = parseFloat(rawVal || "0");
                  obj[targetKey] = isNaN(n) ? 0 : n;
                } else {
                  obj[targetKey] = rawVal === "" ? null : rawVal;
                }
              }
              return obj;
            });

            const { error: insError } = await (supabase as any).from(tableName).insert(payload);
            if (insError) throw insError;

            const perc = 15 + Math.floor(((i + chunk.length) / dataRows.length) * 85);
            updateFileInfo(key, { progress: perc, message: `Upload: ${i + chunk.length}/${dataRows.length}` });
          }

          updateFileInfo(key, { status: "success", progress: 100, message: "Carregado com sucesso." });
          toast.success(`${tableName} atualizada.`);
          resolve();
        } catch (error: any) {
          console.error(error);
          updateFileInfo(key, { status: "error", message: `Falha: ${error.message}` });
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error("Erro na leitura."));
      reader.readAsArrayBuffer(fileObj.file!);
    });
  };

  const handleProcessBI = async () => {
    setLoading(true);
    try {
      const { error } = await (supabase as any).rpc("process_bi_etl");
      if (error) throw error;
      toast.success("Dashboard consolidado!");
    } catch (error: any) {
      toast.error("Erro final: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 p-6 sm:p-12">
      <div className="max-w-6xl mx-auto space-y-10">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b pb-8">
          <div className="flex items-center gap-6">
            <Button variant="ghost" size="icon" className="rounded-full" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="h-7 w-7" />
            </Button>
            <div>
              <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white">Carga de Bases (BI)</h1>
              <p className="text-slate-500 dark:text-zinc-400 font-medium">Transforme planilhas brutas em inteligência operacional.</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
             <Button variant="outline" size="lg" className="border-2" onClick={() => (supabase as any).rpc("clear_raw_tables").then(() => toast.success("Bases limpas."))}>
                <Trash2 className="h-5 w-5 mr-3" /> Limpar Dados
             </Button>
             <Button size="lg" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-10 shadow-indigo-200 shadow-xl border-b-4 border-indigo-800" onClick={handleProcessBI} disabled={loading}>
                <Play className="h-5 w-5 mr-3" /> Consolidar BI
             </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { id: "b2b", name: "Relatório FCT (B2B)", table: "raw_b2b", map: {
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
            { id: "tmr", name: "VIP - TMR Médio", table: "raw_vip_tmr", map: {
              circuito: ["CIRCUITO", "Circuito", "Designação"],
              tmr: ["TMR"],
              tmr_pend_vtal: ["TMR_PEND_VTAL", "Pendência Vtal"],
              tmr_pend_oi: ["TMR_PEND_OI", "Pendência Oi"],
            }},
            { id: "prazo", name: "VIP - SLA Prazo", table: "raw_vip_prazo", map: {
              circuito: ["CIRCUITO", "Circuito", "Designação"],
              reparo_prazo: ["REPARO_PRAZO", "Reparo Prazo", "SLA"],
              posto_prazo: ["POSTO_PRAZO", "Posto Prazo", "Posto Ofensor"],
            }},
            { id: "repetida", name: "VIP - Repetidas", table: "raw_vip_repetida", map: {
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
              <Card key={cfg.id} className={`group hover:shadow-2xl transition-all duration-300 ${isSuccess ? "border-green-500 bg-green-50/10" : isError ? "border-red-500 bg-red-50/10" : "border-slate-200"}`}>
                <CardHeader className="p-5">
                  <div className="flex items-center gap-3 mb-1">
                    <FileSpreadsheet className={`h-6 w-6 ${isSuccess ? "text-green-500" : isError ? "text-red-500" : "text-indigo-500"}`} />
                    <CardTitle className="text-base font-bold">{cfg.name}</CardTitle>
                  </div>
                  <CardDescription className="text-xs uppercase font-bold tracking-widest text-slate-400">Origem: XLS/CSV</CardDescription>
                </CardHeader>
                <CardContent className="px-5 pb-5 space-y-5">
                  <Input type="file" accept=".xlsx,.csv" onChange={handleFileChange(cfg.id as keyof UploadState)} disabled={isWorking || loading} className="text-[10px] h-10 border-dashed" />
                  
                  {(isWorking || isSuccess || isError) && (
                    <div className="space-y-2">
                       <Progress value={item.info.progress} className={`h-2 ${isError ? "bg-red-100" : isSuccess ? "bg-green-100" : ""}`} />
                       <p className="text-[11px] font-bold text-slate-600 truncate">{item.info.message}</p>
                    </div>
                  )}

                  <Button 
                    className={`w-full font-black text-xs h-12 uppercase tracking-tighter ${isSuccess ? "bg-green-600 hover:bg-green-700" : ""}`}
                    onClick={() => uploadBase(cfg.id as keyof UploadState, cfg.table, cfg.map)} 
                    disabled={!item.file || isWorking || loading}
                  >
                    {isWorking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                    {isSuccess ? "Atualizar Base" : "Iniciar Carga"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="flex gap-6 p-8 bg-indigo-50 dark:bg-zinc-900 rounded-3xl border border-indigo-100 dark:border-zinc-800">
           <Info className="h-8 w-8 text-indigo-500 shrink-0 mt-1" />
           <div className="space-y-2">
             <h4 className="text-lg font-black text-indigo-900 dark:text-zinc-100">Dica Pró: Evirando Erros de Memória</h4>
             <p className="text-sm text-indigo-800/80 dark:text-zinc-400 leading-relaxed font-medium">
                Esta nova versão converte os dados em texto puro rapidamente para evitar falhas do Excel. 
                Se o arquivo for extremamente longo (ex: 50 mil linhas), o melhor é salvar como **CSV (Com vírgulas)** no Excel antes de subir aqui. Isso garante 100% de estabilidade.
             </p>
           </div>
        </div>

      </div>
    </div>
  );
}
