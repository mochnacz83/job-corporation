import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Upload, CheckCircle2, Play, Trash2, Database } from "lucide-react";
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
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array" });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          
          // Use header: 1 to get array of arrays (more memory efficient)
          const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as any[][];
          if (rows.length < 2) {
            reject(new Error(`O arquivo ${file.name} não possui dados ou cabeçalhos.`));
            return;
          }

          const fileHeaders = (rows[0] || []).map(h => h?.toString().toUpperCase().trim());
          const dataRows = rows.slice(1);

          // Build index map
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

          const mappedData = dataRows.map(row => {
            const obj: any = {};
            for (const [key, idx] of Object.entries(idxMap)) {
              let val = row[idx];
              if (key === 'data_abertura' || key === 'data_fechamento') {
                obj[key] = parseDate(val);
              } else if (key === 'tmr' || key === 'tmr_pend_vtal' || key === 'tmr_pend_oi' || key === 'cldv' || key === 'tempo_repetida') {
                obj[key] = parseFloat(val) || 0;
              } else {
                obj[key] = val?.toString() || null;
              }
            }
            return obj;
          });

          setProgress(`Limpando base antiga: ${tableName}...`);
          const { error: delError } = await (supabase as any).from(tableName).delete().neq("id", "00000000-0000-0000-0000-000000000000");
          if (delError) throw delError;

          setProgress(`Inserindo ${mappedData.length} registros em ${tableName}...`);
          for (let i = 0; i < mappedData.length; i += CHUNK_SIZE) {
            const chunk = mappedData.slice(i, i + CHUNK_SIZE);
            const { error } = await (supabase as any).from(tableName).insert(chunk);
            if (error) throw error;
            setProgress(`${Math.min(i + CHUNK_SIZE, mappedData.length)} / ${mappedData.length} em ${tableName}...`);
          }

          resolve();
        } catch (error) {
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
      setProgress("Iniciando B2B...");
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

      setProgress("Iniciando VIP TMR...");
      await parseExcelAndInsert(files.tmr, "raw_vip_tmr", {
        circuito: ["CIRCUITO", "Circuito", "Designação"],
        tmr: ["TMR"],
        tmr_pend_vtal: ["TMR_PEND_VTAL", "Pendência Vtal"],
        tmr_pend_oi: ["TMR_PEND_OI", "Pendência Oi"],
      });

      setProgress("Iniciando VIP Prazo...");
      await parseExcelAndInsert(files.prazo, "raw_vip_prazo", {
        circuito: ["CIRCUITO", "Circuito", "Designação"],
        reparo_prazo: ["REPARO_PRAZO", "Reparo Prazo", "SLA"],
        posto_prazo: ["POSTO_PRAZO", "Posto Prazo", "Posto Ofensor"],
      });

      setProgress("Iniciando VIP Repetida...");
      await parseExcelAndInsert(files.repetida, "raw_vip_repetida", {
        circuito: ["CIRCUITO", "Circuito", "Designação"],
        rep: ["REP"],
        retido: ["RETIDO"],
        tempo_repetida: ["TEMPO_REPETIDA", "Tempo Rep"],
        faixa_repetida: ["FAIXA_REPETIDA", "Faixa"],
      });

      toast.success("Todas as bases foram carregadas na área temporária!");
    } catch (error: any) {
      console.error(error);
      toast.error(`Erro: ${error.message || "Falha desconhecida"}`);
    } finally {
      setLoading(false);
      setProgress("");
    }
  };

  const handleProcessETL = async () => {
    setLoading(true);
    setProgress("Cruzando dados e gerando Fato...");
    try {
      const { error } = await (supabase as any).rpc("process_bi_etl");
      if (error) throw error;
      toast.success("BI atualizado com sucesso!");
    } catch (error: any) {
      console.error(error);
      toast.error("Erro no processamento: " + error.message);
    } finally {
      setLoading(false);
      setProgress("");
    }
  };

  const handleClearRaw = async () => {
    if (!window.confirm("Limpar bases brutas?")) return;
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
            <p className="text-muted-foreground text-sm">Integração nativa entre bases B2B e relatórios VIP.</p>
          </div>
        </div>

        {progress && (
          <div className="p-3 bg-primary/10 text-primary font-medium rounded-md text-sm animate-pulse">
            {progress}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { id: "b2b", name: "Principal (B2B)", file: files.b2b },
            { id: "tmr", name: "VIP - TMR", file: files.tmr },
            { id: "prazo", name: "VIP - Prazo", file: files.prazo },
            { id: "repetida", name: "VIP - Repetida", file: files.repetida },
          ].map((item) => (
            <Card key={item.id}>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  {item.name}
                  {item.file && <CheckCircle2 className="text-green-500 h-4 w-4" />}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <Input type="file" accept=".xlsx,.csv" onChange={handleFileChange(item.id as any)} disabled={loading} className="text-xs" />
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <Button className="flex-1" onClick={handleUploadAll} disabled={loading}>
            <Upload className="mr-2 h-4 w-4" /> 1. Carregar Planilhas
          </Button>
          <Button className="flex-1" onClick={handleProcessETL} disabled={loading}>
            <Play className="mr-2 h-4 w-4" /> 2. Consolidar BI
          </Button>
          <Button variant="outline" onClick={handleClearRaw} disabled={loading}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="p-4 bg-muted/30 rounded-lg text-xs text-muted-foreground flex items-center gap-3">
          <Database className="h-4 w-4 shrink-0" />
          <p>
            O sistema utiliza o campo <strong>Designação/Circuito</strong> para cruzar as planilhas VIP com a B2B oficial, ignorando registros duplicados através de uma chave composta (Protocolo + Data).
          </p>
        </div>
      </div>
    </div>
  );
}
