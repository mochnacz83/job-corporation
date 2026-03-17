import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Upload, CheckCircle2, Play, Trash2, Database } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

type UploadState = {
  b2b: File | null;
  tmr: File | null;
  prazo: File | null;
  repetida: File | null;
};

const CHUNK_SIZE = 500; // Safer chunk size for large payloads

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
      <div className="p-8 text-center">
        Você não tem permissão para acessar esta página.
      </div>
    );
  }

  const handleFileChange = (type: keyof UploadState) => (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFiles(prev => ({ ...prev, [type]: e.target.files![0] }));
    }
  };

  const sanitizeRow = (row: any) => {
    const clean: any = {};
    for (const key in row) {
      if (Object.prototype.hasOwnProperty.call(row, key)) {
        // Only keep properties that are not objects/functions to avoid deep enumeration issues
        const val = row[key];
        if (typeof val !== 'object' && typeof val !== 'function') {
          clean[key] = val;
        }
      }
    }
    return clean;
  };

  const parseExcelAndInsert = async (file: File, tableName: string, mapper: (row: any) => any) => {
    return new Promise<void>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array" });
          const firstSheetName = workbook.SheetNames[0];
          const firstSheet = workbook.Sheets[firstSheetName];
          
          // Optimization: Get JSON but sanitize keys immediately
          const rawJson: any[] = XLSX.utils.sheet_to_json(firstSheet, { defval: null });
          
          if (rawJson.length === 0) {
            reject(new Error(`O arquivo ${file.name} está vazio ou não possui cabeçalhos reconhecíveis.`));
            return;
          }

          // Map data and ensure we only have flat properties
          const mappedData = rawJson.map(row => {
            const sanitized = sanitizeRow(row);
            return mapper(sanitized);
          });
          
          setProgress(`Limpando base antiga: ${tableName}...`);
          const { error: delError } = await (supabase as any).from(tableName).delete().neq("id", "00000000-0000-0000-0000-000000000000");
          if (delError) throw delError;

          setProgress(`Inserindo ${mappedData.length} registros em ${tableName}...`);
          let processed = 0;
          for (let i = 0; i < mappedData.length; i += CHUNK_SIZE) {
            const chunk = mappedData.slice(i, i + CHUNK_SIZE);
            const { error } = await (supabase as any).from(tableName).insert(chunk);
            if (error) throw error;
            processed += chunk.length;
            setProgress(`${processed} / ${mappedData.length} registros inseridos em ${tableName}...`);
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

  const parseDateStr = (dateStr: any) => {
    if (dateStr === null || dateStr === undefined || dateStr === "") return null;
    
    // Handle Excel serial date (number)
    if (typeof dateStr === "number") {
      const epoch = new Date(1899, 11, 30);
      return new Date(epoch.getTime() + dateStr * 86400000).toISOString();
    }
    
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return null;
      return d.toISOString();
    } catch {
      return null;
    }
  };

  const handleUploadAll = async () => {
    if (!files.b2b || !files.tmr || !files.prazo || !files.repetida) {
      toast.error("Por favor, selecione as quatro (4) bases antes de prosseguir.");
      return;
    }

    setLoading(true);
    try {
      // Clear all first or per-file? The parseExcelAndInsert clears its own table.
      
      // 1: Upload B2B
      setProgress("Iniciando B2B...");
      await parseExcelAndInsert(files.b2b, "raw_b2b", (row) => ({
        designacao: row["DESIGNACAO"] || row["Designação"] || row["designacao"],
        protocolo: row["PROTOCOLO"] || row["Protocolo"] || row["protocolo"],
        cliente: row["CLIENTE"] || row["Cliente"] || row["cliente"],
        produto: row["PRODUTO"] || row["Produto"] || row["produto"],
        data_abertura: parseDateStr(row["ABERTURA"] || row["Abertura"] || row["abertura"] || row["DATA_ABERTURA"] || row["Data Abertura"]),
        data_fechamento: parseDateStr(row["FECHAMENTO"] || row["Fechamento"] || row["fechamento"] || row["DATA_FECHAMENTO"] || row["Data Fechamento"]),
        uf: row["UF"] || row["uf"],
        municipio: row["MUNICIPIO"] || row["Municipio"] || row["municipio"],
        tecnologia_acesso: row["TECNOLOGIA_ACESSO"] || row["Tecnologia Acesso"] || row["tecnologia"],
        posto_encerramento: row["POSTO_ENCERRAMENTO"] || row["Posto Encerramento"] || row["posto_encerramento"],
        posto_anterior: row["POSTO_ANTERIOR"] || row["Posto Anterior"] || row["posto_anterior"],
        cldv: parseFloat(row["CLDV"]) || null,
        causa_ofensora_n1: row["CAUSA_OFENSORA_N1"] || row["Causa Ofensora N1"],
        causa_ofensora_n2: row["CAUSA_OFENSORA_N2"] || row["Causa Ofensora N2"],
        causa_ofensora_n3: row["CAUSA_OFENSORA_N3"] || row["Causa Ofensora N3"],
      }));

      // 2: Upload TMR
      setProgress("Iniciando VIP TMR...");
      await parseExcelAndInsert(files.tmr, "raw_vip_tmr", (row) => ({
        circuito: row["CIRCUITO"] || row["Circuito"] || row["circuito"],
        tmr: parseFloat(row["TMR"]) || 0,
        tmr_pend_vtal: parseFloat(row["TMR_PEND_VTAL"]) || 0,
        tmr_pend_oi: parseFloat(row["TMR_PEND_OI"]) || 0,
      }));

      // 3: Upload Prazo
      setProgress("Iniciando VIP Prazo...");
      await parseExcelAndInsert(files.prazo, "raw_vip_prazo", (row) => ({
        circuito: row["CIRCUITO"] || row["Circuito"] || row["circuito"],
        reparo_prazo: row["REPARO_PRAZO"] || row["Reparo Prazo"] || row["reparo_prazo"],
        posto_prazo: row["POSTO_PRAZO"] || row["Posto Prazo"] || row["posto_prazo"],
      }));

      // 4: Upload Repetida
      setProgress("Iniciando VIP Repetida...");
      await parseExcelAndInsert(files.repetida, "raw_vip_repetida", (row) => ({
        circuito: row["CIRCUITO"] || row["Circuito"] || row["circuito"],
        rep: row["REP"] || row["Rep"] || row["rep"],
        retido: row["RETIDO"] || row["Retido"] || row["retido"],
        tempo_repetida: parseFloat(row["TEMPO_REPETIDA"]) || 0,
        faixa_repetida: row["FAIXA_REPETIDA"] || row["Faixa Repetida"] || row["faixa_repetida"],
      }));

      setProgress("Bases carregadas com sucesso! Executando ETL...");
      toast.success("Bases carregadas!");
    } catch (error: any) {
      console.error(error);
      toast.error("Erro ao carregar bases: " + error.message);
    } finally {
      setLoading(false);
      setProgress("");
    }
  };

  const handleProcessETL = async () => {
    setLoading(true);
    setProgress("Cruzando dados (B2B + VIPs) e atualizando Fato Reparos...");
    try {
      const { error } = await (supabase as any).rpc("process_bi_etl");
      if (error) throw error;
      toast.success("ETL Processado com sucesso! Os dashboards já podem ser utilizados.");
    } catch (error: any) {
      console.error("Erro no ETL:", error);
      toast.error("Erro ao processar dados Fato: " + error.message);
    } finally {
      setLoading(false);
      setProgress("");
    }
  };

  const handleClearRaw = async () => {
    if (!window.confirm("Deseja realmente limpar as bases temporárias? Isso não limpa a Fato Resumo.")) return;
    setLoading(true);
    try {
      await (supabase as any).rpc("clear_raw_tables");
      toast.success("Bases temporárias limpas com sucesso.");
    } catch (error: any) {
      console.error(error);
      toast.error("Erro: " + error.message);
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
            <p className="text-muted-foreground">O módulo ETL nativo cruzará as informações preenchendo o Data Warehouse.</p>
          </div>
        </div>

        {progress && (
          <div className="p-4 bg-primary/10 text-primary font-medium rounded-md text-sm">
            {progress}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Base Principal (B2B)</CardTitle>
              <CardDescription>Arquivo contendo todos os reparos e designações.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Input type="file" accept=".xlsx,.csv" onChange={handleFileChange("b2b")} disabled={loading} />
                {files.b2b && <CheckCircle2 className="text-green-500 h-5 w-5" />}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">VIP - TMR</CardTitle>
              <CardDescription>Arquivo com dados de tempo médio (Circuito, TMR).</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Input type="file" accept=".xlsx,.csv" onChange={handleFileChange("tmr")} disabled={loading} />
                {files.tmr && <CheckCircle2 className="text-green-500 h-5 w-5" />}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">VIP - Prazo (ICD03)</CardTitle>
              <CardDescription>Arquivo contendo Posto ofensor de prazo.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Input type="file" accept=".xlsx,.csv" onChange={handleFileChange("prazo")} disabled={loading} />
                {files.prazo && <CheckCircle2 className="text-green-500 h-5 w-5" />}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">VIP - Repetida (ICD02)</CardTitle>
              <CardDescription>Arquivo contendo reincidência de falha.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Input type="file" accept=".xlsx,.csv" onChange={handleFileChange("repetida")} disabled={loading} />
                {files.repetida && <CheckCircle2 className="text-green-500 h-5 w-5" />}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 mt-6">
          <Button 
            className="flex-1" 
            size="lg" 
            onClick={handleUploadAll}
            disabled={loading || !files.b2b || !files.tmr || !files.prazo || !files.repetida}
          >
            <Upload className="mr-2 h-5 w-5" />
            1. Enviar Excel ao Supabase
          </Button>
          <Button 
            className="flex-1" 
            variant="default"
            size="lg" 
            onClick={handleProcessETL}
            disabled={loading}
          >
            <Play className="mr-2 h-5 w-5" />
            2. Processar Dados (Atualizar Fato)
          </Button>
          <Button 
            variant="destructive"
            size="lg" 
            onClick={handleClearRaw}
            disabled={loading}
          >
            <Trash2 className="mr-2 h-5 w-5" />
            Limpar Bruto
          </Button>
        </div>
        
        <div className="p-6 bg-muted/50 rounded-lg mt-8">
          <div className="flex items-center gap-2 mb-2 text-muted-foreground">
            <Database className="h-5 w-5" />
            <h3 className="font-semibold">Como funciona o Relatório Nativo?</h3>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            As quatro planilhas são enviadas diretamente para o banco de dados temporário. Após o envio, clique em "Processar Dados" para que o sistema relacione todas as tabelas através do campo <strong>Designação/Circuito</strong> e empacote as informações em uma única base unificada para renderização instantânea do Dashboard pelo seu computador, sem depender de PowerBI externo.
          </p>
        </div>
      </div>
    </div>
  );
}
