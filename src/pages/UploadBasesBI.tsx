import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Upload, CheckCircle2, Play, Trash2, Database, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

type FileStatus = "idle" | "reading" | "uploading" | "success" | "error";

type FileProgress = {
  status: FileStatus;
  progress: number; // 0 to 100
  message: string;
};

type UploadState = {
  b2b: { file: File | null; info: FileProgress };
  tmr: { file: File | null; info: FileProgress };
  prazo: { file: File | null; info: FileProgress };
  repetida: { file: File | null; info: FileProgress };
};

const CHUNK_SIZE = 400; // Smaller chunks for added safety

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
      toast.error("Selecione o arquivo primeiro.");
      return;
    }

    updateFileInfo(key, { status: "reading", progress: 5, message: "Lendo planilha..." });

    return new Promise<void>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const buffer = e.target?.result as ArrayBuffer;
          const workbook = XLSX.read(buffer, { type: "array", cellDates: true, cellNF: false, cellText: false });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          
          // Header 1 = Array of Arrays (no Proxy/Object bloat)
          const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];
          if (!rows || rows.length < 2) {
            throw new Error("Arquivo sem dados ou cabeçalhos.");
          }

          const fileHeaders = (rows[0] || []).map(h => h?.toString().toUpperCase().trim());
          const dataOnly = rows.slice(1);

          updateFileInfo(key, { progress: 15, message: "Mapeando colunas..." });

          // Index of each required column
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

          // Clear old data
          updateFileInfo(key, { status: "uploading", progress: 20, message: "Limpando registros antigos..." });
          const { error: delError } = await (supabase as any).from(tableName).delete().neq("id", "00000000-0000-0000-0000-000000000000");
          if (delError) throw delError;

          // Sequential Upload in Small Chunks
          for (let i = 0; i < dataOnly.length; i += CHUNK_SIZE) {
            const chunk = dataOnly.slice(i, i + CHUNK_SIZE);
            
            // Transform to POJO (Plain Old JavaScript Object) carefully
            const payload = chunk.map(rowArray => {
              const obj: any = {};
              for (const [targetKey, colIdx] of Object.entries(idxMap)) {
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

            // POJO Laundering: Kill hidden properties from XLSX objects/proxies
            const safePayload = JSON.parse(JSON.stringify(payload));

            const { error: insError } = await (supabase as any).from(tableName).insert(safePayload);
            if (insError) throw insError;

            const perc = 20 + Math.floor(((i + chunk.length) / dataOnly.length) * 80);
            updateFileInfo(key, { progress: perc, message: `Carregando: ${i + chunk.length}/${dataOnly.length}` });
          }

          updateFileInfo(key, { status: "success", progress: 100, message: "Concluído com sucesso!" });
          toast.success(`${tableName} carregada.`);
          resolve();
        } catch (error: any) {
          updateFileInfo(key, { status: "error", message: `Erro: ${error.message}` });
          console.error(`Falha em ${tableName}:`, error);
          reject(error);
        }
      };
      reader.onerror = (err) => reject(new Error("Falha na leitura do arquivo."));
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
      toast.error("Erro no cruzamento: " + error.message);
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
      <Card className={`relative transition-all ${isSuccess ? "border-green-500/30 bg-green-500/5 shadow-sm" : isError ? "border-red-500/30 bg-red-500/5" : ""}`}>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-semibold flex items-center justify-between">
            {title}
            {isSuccess && <CheckCircle2 className="h-4 w-4 text-green-600" />}
            {isError && <AlertCircle className="h-4 w-4 text-red-600" />}
          </CardTitle>
          <CardDescription className="text-[10px]">Tabela: {tableName}</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0 space-y-3">
          <Input 
            type="file" 
            accept=".xlsx,.csv" 
            onChange={handleFileChange(key)} 
            disabled={isWorking || loading} 
            className="text-[10px] h-8 file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90" 
          />
          
          {(isWorking || isSuccess || isError) && (
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] font-medium italic">
                <span>{item.info.message}</span>
                <span>{item.info.progress}%</span>
              </div>
              <Progress value={item.info.progress} className={`h-1.5 ${isError ? "bg-red-200" : ""}`} />
            </div>
          )}

          <Button 
            variant="outline" 
            size="sm" 
            className="w-full text-xs h-8"
            onClick={() => uploadBase(key, tableName, mapping)} 
            disabled={!item.file || isWorking || loading}
          >
            {isWorking ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Upload className="mr-2 h-3 w-3" />}
            {isSuccess ? "Reenviar" : "Enviar Agora"}
          </Button>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-zinc-950 p-6 sm:p-10">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <Button variant="ghost" size="icon" className="hover:bg-zinc-200 dark:hover:bg-zinc-800" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="h-6 w-6" />
            </Button>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100">Carga de Bases Operacionais</h1>
              <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">Gerencie os dados brutos e consolide as métricas do BI Nativo.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" size="sm" onClick={() => (supabase as any).rpc("clear_raw_tables").then(() => toast.success("Limpo"))}>
              <Trash2 className="h-4 w-4 mr-2" /> Limpar Tudo
            </Button>
            <Button size="sm" className="bg-zinc-900 hover:bg-zinc-800 text-white shadow-xl px-6" onClick={handleProcessBI} disabled={loading}>
              <Play className="h-4 w-4 mr-2" /> Consolidar Dashboard
            </Button>
          </div>
        </div>

        {/* Upload Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {renderCard("b2b", "Relatório FCT (B2B)", "raw_b2b", {
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

          {renderCard("tmr", "VIP - TMR Médio", "raw_vip_tmr", {
            circuito: ["CIRCUITO", "Circuito", "Designação"],
            tmr: ["TMR"],
            tmr_pend_vtal: ["TMR_PEND_VTAL", "Pendência Vtal"],
            tmr_pend_oi: ["TMR_PEND_OI", "Pendência Oi"],
          })}

          {renderCard("prazo", "VIP - SLA Prazo", "raw_vip_prazo", {
            circuito: ["CIRCUITO", "Circuito", "Designação"],
            reparo_prazo: ["REPARO_PRAZO", "Reparo Prazo", "SLA"],
            posto_prazo: ["POSTO_PRAZO", "Posto Prazo", "Posto Ofensor"],
          })}

          {renderCard("repetida", "VIP - Repetidas", "raw_vip_repetida", {
            circuito: ["CIRCUITO", "Circuito", "Designação"],
            rep: ["REP"],
            retido: ["RETIDO"],
            tempo_repetida: ["TEMPO_REPETIDA", "Tempo Rep"],
            faixa_repetida: ["FAIXA_REPETIDA", "Faixa"],
          })}
        </div>

        {/* Integration Note */}
        <Card className="bg-zinc-100 dark:bg-zinc-900 border-none">
          <CardContent className="p-6 flex gap-4">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
               <Database className="h-5 w-5 text-primary" />
            </div>
            <div className="space-y-2">
              <h3 className="font-bold text-zinc-900 dark:text-zinc-100 italic flex items-center gap-2">
                Como funciona o cruzamento?
              </h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                As bases VIP são utilizadas para "enriquecer" os dados da base B2B oficial. O cruzamento é feito através da <strong>Designação do Circuito</strong>. 
                Uma chave única composta garante que registros duplicados entre as planilhas VIP não gerem divergências no relatório final.
              </p>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
