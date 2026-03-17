import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Upload, CheckCircle2, Play, Trash2, Database, AlertCircle, Loader2, Info } from "lucide-react";
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

const CHUNK_SIZE = 300; // Even smaller for safety

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
        Permissão negada.
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
    try {
      const d = new Date(val);
      return isNaN(d.getTime()) ? null : d.toISOString();
    } catch {
      return null;
    }
  };

  const uploadBase = async (key: keyof UploadState, tableName: string, mapping: Record<string, string[]>) => {
    const fileObj = files[key];
    if (!fileObj.file) {
      toast.error("Nenhum arquivo selecionado.");
      return;
    }

    updateFileInfo(key, { status: "reading", progress: 5, message: "Lendo buffer..." });

    return new Promise<void>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const buffer = e.target?.result as ArrayBuffer;
          
          // PHASE 1: Detect Headers and Valid Range
          // Only read the first 100 cells to find the header row and column count
          const workbookSample = XLSX.read(buffer, { type: "array", sheetRows: 1 });
          const sheetSample = workbookSample.Sheets[workbookSample.SheetNames[0]];
          const sampleRows = XLSX.utils.sheet_to_json(sheetSample, { header: 1 }) as any[][];
          
          if (!sampleRows || sampleRows.length === 0) {
            throw new Error("Planilha vazia.");
          }

          const fileHeaders = (sampleRows[0] || []).map(h => h?.toString().toUpperCase().trim());
          const maxColsFound = fileHeaders.length;

          updateFileInfo(key, { progress: 10, message: `Mapeando ${maxColsFound} colunas...` });

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

          // PHASE 2: Full Read with Restricted Range
          // Restricting range prevents "Too many properties to enumerate" by limiting ghost columns
          const workbook = XLSX.read(buffer, { 
            type: "array", 
            cellDates: true, 
            cellNF: false, 
            cellText: false,
          });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          
          // Detect current range and restrict column end (to avoid ghost columns XFD...)
          const fullRange = XLSX.utils.decode_range(sheet['!ref'] || "A1:A1");
          fullRange.e.c = Math.max(fullRange.e.c, maxColsFound - 1);
          const restrictedRange = XLSX.utils.encode_range(fullRange);

          const rows = XLSX.utils.sheet_to_json(sheet, { 
            header: 1, 
            defval: "", 
            range: restrictedRange 
          }) as any[][];
          
          const dataOnly = rows.slice(1);
          updateFileInfo(key, { progress: 20, message: `Preparando ${dataOnly.length} registros...` });

          // Database clean deletion
          updateFileInfo(key, { status: "uploading", progress: 25, message: "Limpando banco..." });
          const { error: delError } = await (supabase as any).from(tableName).delete().neq("id", "00000000-0000-0000-0000-000000000000");
          if (delError) {
              if (delError.message?.includes("cache")) {
                  throw new Error(`Tabela '${tableName}' não encontrada no Supabase. Execute as migrações primeiro.`);
              }
              throw delError;
          }

          // Sequential Batch Insert
          for (let i = 0; i < dataOnly.length; i += CHUNK_SIZE) {
            const chunk = dataOnly.slice(i, i + CHUNK_SIZE);
            const payload = chunk.map(rowArray => {
              const obj: any = {};
              for (const [targetKey, colIdx] of Object.entries(idxMap)) {
                if (colIdx >= rowArray.length) {
                    obj[targetKey] = null;
                    continue;
                }
                const rawVal = rowArray[colIdx];
                if (targetKey.includes('data_')) {
                  obj[targetKey] = parseDate(rawVal);
                } else if (['tmr', 'tmr_pend_vtal', 'tmr_pend_oi', 'cldv', 'tempo_repetida'].includes(targetKey)) {
                  const num = parseFloat(rawVal);
                  obj[targetKey] = isNaN(num) ? 0 : num;
                } else {
                  const s = rawVal?.toString().trim();
                  obj[targetKey] = s === "" ? null : s;
                }
              }
              return obj;
            });

            // Extreme laundering: stringify/parse per chunk
            const superClean = JSON.parse(JSON.stringify(payload));

            const { error: insError } = await (supabase as any).from(tableName).insert(superClean);
            if (insError) throw insError;

            const perc = 25 + Math.floor(((i + chunk.length) / dataOnly.length) * 75);
            updateFileInfo(key, { progress: perc, message: `Inserindo: ${i + chunk.length}/${dataOnly.length}` });
          }

          updateFileInfo(key, { status: "success", progress: 100, message: "Sucesso!" });
          toast.success(`${tableName} atualizada.`);
          resolve();
        } catch (error: any) {
          console.error(error);
          updateFileInfo(key, { status: "error", message: error.message });
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error("Erro ao ler arquivo."));
      reader.readAsArrayBuffer(fileObj.file!);
    });
  };

  const handleProcessBI = async () => {
    setLoading(true);
    try {
      const { error } = await (supabase as any).rpc("process_bi_etl");
      if (error) throw error;
      toast.success("Dashboard consolidado com sucesso!");
    } catch (error: any) {
      toast.error("Falha no processamento: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const renderCard = (key: keyof UploadState, title: string, tableName: string, mapping: Record<string, string[]>) => {
    const item = files[key];
    const isWorking = item.info.status === "reading" || item.info.status === "uploading";
    const isError = item.info.status === "error";
    const isSuccess = item.info.status === "success";

    return (
      <Card className={`overflow-hidden transition-all duration-300 ${isSuccess ? "border-green-500 shadow-green-100" : isError ? "border-red-500 shadow-red-100 shadow-md" : "hover:border-primary/50"}`}>
        <CardHeader className="p-4 pb-2 bg-muted/20">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            {isSuccess ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : isError ? <AlertCircle className="h-4 w-4 text-red-600" /> : <Database className="h-4 w-4 text-primary" />}
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          <Input 
            type="file" 
            accept=".xlsx,.csv" 
            onChange={handleFileChange(key)} 
            disabled={isWorking || loading}
            className="text-[10px] h-9"
          />
          
          {(isWorking || isSuccess || isError) && (
            <div className="space-y-2">
              <div className="flex justify-between text-[11px] font-semibold text-zinc-600">
                <span className="truncate max-w-[80%]">{item.info.message}</span>
                <span>{item.info.progress}%</span>
              </div>
              <Progress value={item.info.progress} className={`h-2 ${isError ? "bg-red-100" : isSuccess ? "bg-green-100" : ""}`} />
            </div>
          )}

          <Button 
            className="w-full text-xs font-bold"
            variant={isSuccess ? "secondary" : isError ? "destructive" : "default"}
            onClick={() => uploadBase(key, tableName, mapping)} 
            disabled={!item.file || isWorking || loading}
          >
            {isWorking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            {isSuccess ? "Reenviar Base" : "Carregar Agora"}
          </Button>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-5">
            <Button variant="outline" size="icon" className="rounded-full h-12 w-12" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="h-6 w-6" />
            </Button>
            <div>
              <h1 className="text-3xl font-black text-slate-800 dark:text-white">Central de Dados BI</h1>
              <p className="text-slate-500 dark:text-zinc-400 text-sm">Atualize os relatórios oficiais e consolide as métricas de performance.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
             <Button variant="ghost" size="sm" className="text-slate-400" onClick={() => (supabase as any).rpc("clear_raw_tables").then(() => toast.success("Bases temporárias limpas."))}>
                <Trash2 className="h-4 w-4 mr-2" /> Limpar
             </Button>
             <Button size="lg" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-8 shadow-lg shadow-indigo-200" onClick={handleProcessBI} disabled={loading}>
                <Play className="h-5 w-5 mr-3" /> Consolidar BI Nativo
             </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {renderCard("b2b", "FCT Oficial (B2B)", "raw_b2b", {
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
          })}

          {renderCard("tmr", "VIP - Performance TMR", "raw_vip_tmr", {
            circuito: ["CIRCUITO", "Circuito", "Designação"],
            tmr: ["TMR"],
            tmr_pend_vtal: ["TMR_PEND_VTAL", "Pendência Vtal"],
            tmr_pend_oi: ["TMR_PEND_OI", "Pendência Oi"],
          })}

          {renderCard("prazo", "VIP - Gestão de Prazo", "raw_vip_prazo", {
            circuito: ["CIRCUITO", "Circuito", "Designação"],
            reparo_prazo: ["REPARO_PRAZO", "Reparo Prazo", "SLA"],
            posto_prazo: ["POSTO_PRAZO", "Posto Prazo", "Posto Ofensor"],
          })}

          {renderCard("repetida", "VIP - Repetidas ICD02", "raw_vip_repetida", {
            circuito: ["CIRCUITO", "Circuito", "Designação"],
            rep: ["REP"],
            retido: ["RETIDO"],
            tempo_repetida: ["TEMPO_REPETIDA", "Tempo Rep"],
            faixa_repetida: ["FAIXA_REPETIDA", "Faixa"],
          })}
        </div>

        <div className="p-6 bg-white dark:bg-zinc-900 rounded-2xl border border-slate-100 flex items-start gap-5">
           <div className="bg-amber-100 dark:bg-amber-950 p-3 rounded-xl">
             <Info className="h-6 w-6 text-amber-600" />
           </div>
           <div className="space-y-1">
             <h4 className="font-bold text-slate-800 dark:text-zinc-100">Instruções de Importação</h4>
             <p className="text-sm text-slate-500 dark:text-zinc-400">
                Se alguma base retornar erro de "Tabela não encontrada", verifique se as migrações SQL foram aplicadas no banco de dados. 
                Para arquivos muito grandes da B2B que travam o navegador, tente salvar o documento como **CSV (UTF-8)** antes de enviar.
             </p>
           </div>
        </div>

      </div>
    </div>
  );
}
