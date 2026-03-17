import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Upload, CheckCircle2, Play, Trash2, Database, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

type UploadState = {
  b2b: File | null;
  tmr: File | null;
  prazo: File | null;
  repetida: File | null;
};

const CHUNK_SIZE = 500;

export default function UploadBasesBI() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [files, setFiles] = useState<UploadState>({
    b2b: null,
    tmr: null,
    prazo: null,
    repetida: null,
  });
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<string>("");

  if (!isAdmin) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Você não tem permissão para acessar esta página.
      </div>
    );
  }

  const handleFileChange = (type: keyof UploadState) => (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFiles(prev => ({ ...prev, [type]: e.target.files![0] }));
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

  const parseExcelAndInsert = async (file: File, tableName: string, mapping: Record<string, string[]>) => {
    return new Promise<void>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          console.log(`Lendo arquivo: ${file.name}`);
          const dataBuffer = e.target?.result as ArrayBuffer;
          const workbook = XLSX.read(dataBuffer, { type: "array", cellText: false, cellNF: false });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          
          // Header: 1 returns array of arrays (no objects created by XLSX yet)
          const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];
          if (!rows || rows.length < 2) {
            reject(new Error(`Arquivo ${file.name} sem dados.`));
            return;
          }

          const fileHeaders = (rows[0] || []).map(h => h?.toString().toUpperCase().trim());
          const dataOnly = rows.slice(1);

          // Map column indices
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

          setProgress(`Limpando base antiga: ${tableName}...`);
          const { error: delError } = await (supabase as any).from(tableName).delete().neq("id", "00000000-0000-0000-0000-000000000000");
          if (delError) {
              console.error("Erro ao deletar:", delError);
              throw delError;
          }

          setProgress(`Preparando ${dataOnly.length} linhas em ${tableName}...`);
          
          // Process in chunks to avoid memory spikes and enumeration issues
          for (let i = 0; i < dataOnly.length; i += CHUNK_SIZE) {
            const chunkRows = dataOnly.slice(i, i + CHUNK_SIZE);
            const payload = chunkRows.map(rowArray => {
              // Build a 100% CLEAN object (POJO) manually
              const obj: any = {};
              for (const [key, colIdx] of Object.entries(idxMap)) {
                  const rawVal = rowArray[colIdx];
                  if (key.includes('data_')) {
                    obj[key] = parseDate(rawVal);
                  } else if (['tmr', 'tmr_pend_vtal', 'tmr_pend_oi', 'cldv', 'tempo_repetida'].includes(key)) {
                    const parsedNum = parseFloat(rawVal);
                    obj[key] = isNaN(parsedNum) ? 0 : parsedNum;
                  } else {
                    const strVal = rawVal?.toString().trim();
                    obj[key] = strVal === "" ? null : strVal;
                  }
              }
              return obj;
            });

            // Double check: Stringify and parse to "kill" any hidden properties from XLSX arrays
            const superCleanPayload = JSON.parse(JSON.stringify(payload));
            
            const { error: insError } = await (supabase as any).from(tableName).insert(superCleanPayload);
            if (insError) {
                console.error(`Erro no chunk ${i} de ${tableName}:`, insError);
                throw insError;
            }
            
            setProgress(`${Math.min(i + CHUNK_SIZE, dataOnly.length)} / ${dataOnly.length} em ${tableName}...`);
          }

          console.log(`Sucesso: ${tableName}`);
          resolve();
        } catch (error: any) {
          console.error("Catch error in process:", error);
          reject(error);
        }
      };
      reader.onerror = (error) => reject(error);
      reader.readAsArrayBuffer(file);
    });
  };

  const handleUploadAll = async () => {
    if (!files.b2b || !files.tmr || !files.prazo || !files.repetida) {
      toast.error("Selecione as quatro (4) bases antes de prosseguir.");
      return;
    }

    setLoading(true);
    try {
      // B2B
      await parseExcelAndInsert(files.b2b, "raw_b2b", {
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
      });

      // VIP TMR
      await parseExcelAndInsert(files.tmr, "raw_vip_tmr", {
        circuito: ["CIRCUITO", "Circuito", "Designação"],
        tmr: ["TMR"],
        tmr_pend_vtal: ["TMR_PEND_VTAL", "Pendência Vtal"],
        tmr_pend_oi: ["TMR_PEND_OI", "Pendência Oi"],
      });

      // VIP Prazo
      await parseExcelAndInsert(files.prazo, "raw_vip_prazo", {
        circuito: ["CIRCUITO", "Circuito", "Designação"],
        reparo_prazo: ["REPARO_PRAZO", "Reparo Prazo", "SLA"],
        posto_prazo: ["POSTO_PRAZO", "Posto Prazo", "Posto Ofensor"],
      });

      // VIP Repetida
      await parseExcelAndInsert(files.repetida, "raw_vip_repetida", {
        circuito: ["CIRCUITO", "Circuito", "Designação"],
        rep: ["REP"],
        retido: ["RETIDO"],
        tempo_repetida: ["TEMPO_REPETIDA", "Tempo Rep"],
        faixa_repetida: ["FAIXA_REPETIDA", "Faixa"],
      });

      toast.success("Carga realizada com sucesso!");
    } catch (error: any) {
      console.error("Global catch:", error);
      const msg = error?.message || "Erro desconhecido";
      toast.error(`Falha no carregamento: ${msg}`);
      if (msg.includes("properties to enumerate")) {
          toast.warning("Dica: Tente salvar sua planilha como CSV se o Excel for muito grande.");
      }
    } finally {
      setLoading(false);
      setProgress("");
    }
  };

  const handleProcessETL = async () => {
    setLoading(true);
    setProgress("Cruzando dados e gerando Dashboard...");
    try {
      const { error } = await (supabase as any).rpc("process_bi_etl");
      if (error) throw error;
      toast.success("BI consolidado com sucesso!");
    } catch (error: any) {
      toast.error("Erro no cruzamento: " + error.message);
    } finally {
      setLoading(false);
      setProgress("");
    }
  };

  const handleClearRaw = async () => {
    if (!window.confirm("Limpar dados temporários?")) return;
    setLoading(true);
    try {
      await (supabase as any).rpc("clear_raw_tables");
      toast.success("Limpo.");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-6 w-6" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Carga de Bases para BI</h1>
            <p className="text-muted-foreground text-sm">Estruturação de dados oficiais B2B e relatórios VIP.</p>
          </div>
        </div>

        {progress && (
          <div className="p-4 border border-primary/20 bg-primary/5 text-primary rounded-lg flex items-center gap-3 animate-pulse">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm font-medium">{progress}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { id: "b2b", name: "Relatório Principal (B2B)", file: files.b2b },
            { id: "tmr", name: "VIP - TMR Médio", file: files.tmr },
            { id: "prazo", name: "VIP - SLA Prazo", file: files.prazo },
            { id: "repetida", name: "VIP - Repetidas", file: files.repetida },
          ].map((item) => (
            <Card key={item.id} className={item.file ? "border-green-500/20 bg-green-500/5" : ""}>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Database className="h-4 w-4 text-primary" />
                  {item.name}
                  {item.file && <CheckCircle2 className="ml-auto text-green-500 h-4 w-4" />}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <Input type="file" accept=".xlsx,.csv" onChange={handleFileChange(item.id as any)} disabled={loading} className="text-xs" />
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-4 pt-4 border-t">
          <Button className="flex-1" size="lg" onClick={handleUploadAll} disabled={loading || !files.b2b || !files.tmr || !files.prazo || !files.repetida}>
            <Upload className="mr-2 h-5 w-5" /> 1. Carregar Planilhas
          </Button>
          <Button className="flex-1" variant="secondary" size="lg" onClick={handleProcessETL} disabled={loading}>
            <Play className="mr-2 h-5 w-5" /> 2. Consolidar BI Nativo
          </Button>
          <Button variant="ghost" size="lg" onClick={handleClearRaw} disabled={loading}>
            <Trash2 className="h-5 w-5 text-destructive" />
          </Button>
        </div>
        
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-700 dark:text-amber-400 flex gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <div className="text-xs space-y-1">
            <p className="font-bold uppercase">Aviso de Performance:</p>
            <p>Se as planilhas forem muito grandes (mais de 20.000 linhas), o navegador pode ficar lento. Para melhor performance, certifique-se de que não há abas extras ou fórmulas pesadas nos arquivos.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Loader2(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
    )
}
