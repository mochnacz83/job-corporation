import React, { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Search, ScanBarcode, Upload, FileSpreadsheet, Download, 
  RefreshCw, Trash2, ArrowRight, User, Users, Network, 
  CheckCircle2, AlertTriangle, AlertCircle, HelpCircle, 
  Database, Eye, FileText, Layers, Check, Info
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

// Interfaces for our 4 logisitics bases
interface SaldoGestech {
  matricula: string;
  nome_tecnico: string;
  supervisor: string;
  codigo_material: string;
  nome_material: string;
  quantidade: number;
}

interface SaldoSap {
  serial: string;
  codigo_material: string;
  nome_material: string;
  deposito: string;
  status_sap: string;
}

interface CruzamentoSapGestech {
  serial_sap: string;
  serial_gestech: string;
  status_cruzamento: string; // e.g. "Conciliado", "Divergente"
  observacao: string;
}

interface SerialAplicado {
  serial: string;
  codigo_material: string;
  nome_material: string;
  cliente: string;
  gpon: string;
  alias: string;
  data_instalacao: string;
  tecnico_instalador: string;
}

// Default Premium Mock Data
const MOCK_SALDO_GESTECH: SaldoGestech[] = [
  { matricula: "TT10020", nome_tecnico: "Alan Ribeiro Santos", supervisor: "Marcos Souza", codigo_material: "300456", nome_material: "ONT NOKIA G-1425G-A", quantidade: 3 },
  { matricula: "TT10020", nome_tecnico: "Alan Ribeiro Santos", supervisor: "Marcos Souza", codigo_material: "300789", nome_material: "ONT HUAWEI EG8145V5", quantidade: 1 },
  { matricula: "TT10021", nome_tecnico: "Bruno Oliveira Costa", supervisor: "Marcos Souza", codigo_material: "300456", nome_material: "ONT NOKIA G-1425G-A", quantidade: 2 },
  { matricula: "TT10022", nome_tecnico: "Carlos Eduardo Silva", supervisor: "Roberto Alencar", codigo_material: "300789", nome_material: "ONT HUAWEI EG8145V5", quantidade: 4 },
  { matricula: "TT10023", nome_tecnico: "Danilo Moreira Santos", supervisor: "Roberto Alencar", codigo_material: "300456", nome_material: "ONT NOKIA G-1425G-A", quantidade: 1 },
  { matricula: "TT10024", nome_tecnico: "Elton John Ferreira", supervisor: "Carlos Lima", codigo_material: "300456", nome_material: "ONT NOKIA G-1425G-A", quantidade: 2 },
  { matricula: "TT10024", nome_tecnico: "Elton John Ferreira", supervisor: "Carlos Lima", codigo_material: "300789", nome_material: "ONT HUAWEI EG8145V5", quantidade: 2 }
];

const MOCK_SALDO_SAP: SaldoSap[] = [
  { serial: "ALCLB11A22C3", codigo_material: "300456", nome_material: "ONT NOKIA G-1425G-A", deposito: "DEP-ABILITY-SP1", status_sap: "Atribuído" },
  { serial: "ALCLB11A22C4", codigo_material: "300456", nome_material: "ONT NOKIA G-1425G-A", deposito: "DEP-ABILITY-SP1", status_sap: "Atribuído" },
  { serial: "ALCLB11A22C5", codigo_material: "300456", nome_material: "ONT NOKIA G-1425G-A", deposito: "DEP-ABILITY-SP1", status_sap: "Atribuído" },
  { serial: "2102312T0A30456A", codigo_material: "300789", nome_material: "ONT HUAWEI EG8145V5", deposito: "DEP-ABILITY-SP1", status_sap: "Atribuído" },
  { serial: "ALCLB11A33D1", codigo_material: "300456", nome_material: "ONT NOKIA G-1425G-A", deposito: "DEP-ABILITY-SP1", status_sap: "Atribuído" },
  { serial: "ALCLB11A33D2", codigo_material: "300456", nome_material: "ONT NOKIA G-1425G-A", deposito: "DEP-ABILITY-SP1", status_sap: "Atribuído" },
  { serial: "2102312T0A30789B", codigo_material: "300789", nome_material: "ONT HUAWEI EG8145V5", deposito: "DEP-ABILITY-SP1", status_sap: "Atribuído" },
  { serial: "2102312T0A30789C", codigo_material: "300789", nome_material: "ONT HUAWEI EG8145V5", deposito: "DEP-ABILITY-SP1", status_sap: "Atribuído" },
  { serial: "2102312T0A30789D", codigo_material: "300789", nome_material: "ONT HUAWEI EG8145V5", deposito: "DEP-ABILITY-SP1", status_sap: "Atribuído" },
  { serial: "2102312T0A30789E", codigo_material: "300789", nome_material: "ONT HUAWEI EG8145V5", deposito: "DEP-ABILITY-SP1", status_sap: "Atribuído" },
  { serial: "ALCLB11A44E1", codigo_material: "300456", nome_material: "ONT NOKIA G-1425G-A", deposito: "DEP-ABILITY-SP1", status_sap: "Atribuído" },
  { serial: "ALCLB11A44E2", codigo_material: "300456", nome_material: "ONT NOKIA G-1425G-A", deposito: "DEP-ABILITY-SP1", status_sap: "Atribuído" },
  { serial: "ALCLB11A99Z9", codigo_material: "300456", nome_material: "ONT NOKIA G-1425G-A", deposito: "DEP-ABILITY-SP1", status_sap: "Disponível" },
  { serial: "2102312T0A30999X", codigo_material: "300789", nome_material: "ONT HUAWEI EG8145V5", deposito: "DEP-ABILITY-SP1", status_sap: "Disponível" }
];

const MOCK_CRUZAMENTO: CruzamentoSapGestech[] = [
  { serial_sap: "ALCLB11A22C3", serial_gestech: "ALCLB11A22C3", status_cruzamento: "Conciliado", observacao: "Confirmado em ambas as bases" },
  { serial_sap: "ALCLB11A22C4", serial_gestech: "ALCLB11A22C4", status_cruzamento: "Conciliado", observacao: "Confirmado em ambas as bases" },
  { serial_sap: "ALCLB11A22C5", serial_gestech: "ALCLB11A22C5", status_cruzamento: "Conciliado", observacao: "Confirmado em ambas as bases" },
  { serial_sap: "2102312T0A30456A", serial_gestech: "2102312T0A30456A", status_cruzamento: "Conciliado", observacao: "Confirmado em ambas as bases" },
  { serial_sap: "ALCLB11A33D1", serial_gestech: "ALCLB11A33D1", status_cruzamento: "Conciliado", observacao: "Confirmado em ambas as bases" },
  { serial_sap: "ALCLB11A33D2", serial_gestech: "ALCLB11A33D2", status_cruzamento: "Conciliado", observacao: "Confirmado em ambas as bases" },
  { serial_sap: "2102312T0A30789B", serial_gestech: "2102312T0A30789B", status_cruzamento: "Conciliado", observacao: "Confirmado em ambas as bases" },
  { serial_sap: "2102312T0A30789C", serial_gestech: "2102312T0A30789C", status_cruzamento: "Conciliado", observacao: "Confirmado em ambas as bases" },
  { serial_sap: "ALCLB11A44E1", serial_gestech: "ALCLB11A44E1", status_cruzamento: "Conciliado", observacao: "Confirmado em ambas as bases" },
  { serial_sap: "ALCLB11A44E2", serial_gestech: "ALCLB11A44E2", status_cruzamento: "Conciliado", observacao: "Confirmado em ambas as bases" }
];

const MOCK_APLICADOS: SerialAplicado[] = [
  { serial: "ALCLB11A22C3", codigo_material: "300456", nome_material: "ONT NOKIA G-1425G-A", cliente: "Maria das Dores Souza", gpon: "OLT-SP-LAPA-01 1/1/2/4", alias: "SP-LAPA-ONT-4562", data_instalacao: "2026-05-10", tecnico_instalador: "Alan Ribeiro Santos" },
  { serial: "ALCLB11A33D1", codigo_material: "300456", nome_material: "ONT NOKIA G-1425G-A", cliente: "Antônio Carlos Silva", gpon: "OLT-SP-LAPA-02 1/2/4/12", alias: "SP-LAPA-ONT-8951", data_instalacao: "2026-05-12", tecnico_instalador: "Bruno Oliveira Costa" },
  { serial: "2102312T0A30789C", codigo_material: "300789", nome_material: "ONT HUAWEI EG8145V5", cliente: "Juliana Santos Lima", gpon: "OLT-SP-PINHEIROS-04 2/1/8/3", alias: "SP-PIN-ONT-9941", data_instalacao: "2026-05-18", tecnico_instalador: "Carlos Eduardo Silva" },
  { serial: "2102312T0A30789D", codigo_material: "300789", nome_material: "ONT HUAWEI EG8145V5", cliente: "Vitor Hugo Pereira", gpon: "OLT-SP-PINHEIROS-04 2/1/8/4", alias: "SP-PIN-ONT-9942", data_instalacao: "2026-05-19", tecnico_instalador: "Carlos Eduardo Silva" }
];

const RastreabilidadeOnt = () => {
  const { isAdmin } = useAuth();
  
  // Storage keys
  const KEY_GESTECH = "ont_rastreabilidade_gestech";
  const KEY_SAP = "ont_rastreabilidade_sap";
  const KEY_CRUZAMENTO = "ont_rastreabilidade_cruzamento";
  const KEY_APLICADOS = "ont_rastreabilidade_aplicados";

  // Data states
  const [saldoGestech, setSaldoGestech] = useState<SaldoGestech[]>([]);
  const [saldoSap, setSaldoSap] = useState<SaldoSap[]>([]);
  const [cruzamento, setCruzamento] = useState<CruzamentoSapGestech[]>([]);
  const [aplicados, setAplicados] = useState<SerialAplicado[]>([]);

  // Search states
  const [searchType, setSearchType] = useState<"matricula" | "nome" | "serial" | "supervisor">("matricula");
  const [searchQuery, setSearchQuery] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [searchResults, setSearchResults] = useState<any>(null);

  // Mass search states
  const [massInput, setMassInput] = useState("");
  const [massResults, setMassResults] = useState<any[]>([]);
  const [massStats, setMassStats] = useState({ total: 0, withTech: 0, applied: 0, notFound: 0 });
  const [searchingMass, setSearchingMass] = useState(false);

  // Base dates upload states
  const [uploadTimestamps, setUploadTimestamps] = useState<Record<string, string>>({});

  // Active Main Tab
  const [activeTab, setActiveTab] = useState("consultas");

  // Load Initial Data from LocalStorage or fall back to mock
  useEffect(() => {
    const cachedGestech = localStorage.getItem(KEY_GESTECH);
    const cachedSap = localStorage.getItem(KEY_SAP);
    const cachedCruzamento = localStorage.getItem(KEY_CRUZAMENTO);
    const cachedAplicados = localStorage.getItem(KEY_APLICADOS);
    const cachedTimestamps = localStorage.getItem("ont_rastreabilidade_timestamps");

    if (cachedGestech) setSaldoGestech(JSON.parse(cachedGestech));
    else setSaldoGestech(MOCK_SALDO_GESTECH);

    if (cachedSap) setSaldoSap(JSON.parse(cachedSap));
    else setSaldoSap(MOCK_SALDO_SAP);

    if (cachedCruzamento) setCruzamento(JSON.parse(cachedCruzamento));
    else setCruzamento(MOCK_CRUZAMENTO);

    if (cachedAplicados) setAplicados(JSON.parse(cachedAplicados));
    else setAplicados(MOCK_APLICADOS);

    if (cachedTimestamps) {
      setUploadTimestamps(JSON.parse(cachedTimestamps));
    } else {
      const now = new Date().toLocaleString("pt-BR");
      const initialTimes = { gestech: now, sap: now, cruzamento: now, aplicados: now };
      setUploadTimestamps(initialTimes);
      localStorage.setItem("ont_rastreabilidade_timestamps", JSON.stringify(initialTimes));
    }
  }, []);

  // Save current bases to localStorage
  const saveBase = (key: string, data: any, type: string) => {
    localStorage.setItem(key, JSON.stringify(data));
    const now = new Date().toLocaleString("pt-BR");
    const updatedTimes = { ...uploadTimestamps, [type]: now };
    setUploadTimestamps(updatedTimes);
    localStorage.setItem("ont_rastreabilidade_timestamps", JSON.stringify(updatedTimes));
  };

  const handleClearBase = (type: string) => {
    if (!window.confirm(`Deseja limpar todos os dados da base ${type.toUpperCase()}?`)) return;

    if (type === "gestech") {
      setSaldoGestech([]);
      localStorage.removeItem(KEY_GESTECH);
    } else if (type === "sap") {
      setSaldoSap([]);
      localStorage.removeItem(KEY_SAP);
    } else if (type === "cruzamento") {
      setCruzamento([]);
      localStorage.removeItem(KEY_CRUZAMENTO);
    } else if (type === "aplicados") {
      setAplicados([]);
      localStorage.removeItem(KEY_APLICADOS);
    }
    toast.success(`Base ${type.toUpperCase()} redefinida com sucesso!`);
  };

  const handleResetAllToMock = () => {
    if (!window.confirm("Isso irá substituir os dados atuais pelos dados padrão (Demo). Continuar?")) return;

    setSaldoGestech(MOCK_SALDO_GESTECH);
    setSaldoSap(MOCK_SALDO_SAP);
    setCruzamento(MOCK_CRUZAMENTO);
    setAplicados(MOCK_APLICADOS);

    localStorage.setItem(KEY_GESTECH, JSON.stringify(MOCK_SALDO_GESTECH));
    localStorage.setItem(KEY_SAP, JSON.stringify(MOCK_SALDO_SAP));
    localStorage.setItem(KEY_CRUZAMENTO, JSON.stringify(MOCK_CRUZAMENTO));
    localStorage.setItem(KEY_APLICADOS, JSON.stringify(MOCK_APLICADOS));

    const now = new Date().toLocaleString("pt-BR");
    const initialTimes = { gestech: now, sap: now, cruzamento: now, aplicados: now };
    setUploadTimestamps(initialTimes);
    localStorage.setItem("ont_rastreabilidade_timestamps", JSON.stringify(initialTimes));

    toast.success("Dados redefinidos com sucesso para a massa demo!");
  };

  // Parser helper for XLSX/CSV
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        if (jsonData.length === 0) {
          toast.error("A planilha está vazia ou no formato inválido.");
          return;
        }

        if (type === "gestech") {
          const parsed = jsonData.map((row: any) => ({
            matricula: String(row["Matrícula"] || row["Matricula"] || row["matricula_tt"] || row["Matrícula TT"] || "").trim().toUpperCase(),
            nome_tecnico: String(row["Nome"] || row["Nome Técnico"] || row["nome_tecnico"] || row["Técnico"] || "").trim(),
            supervisor: String(row["Supervisor"] || row["supervisor"] || "").trim(),
            codigo_material: String(row["Código"] || row["Codigo"] || row["codigo_material"] || "").trim(),
            nome_material: String(row["Material"] || row["Nome Material"] || row["nome_material"] || row["Modelo"] || "").trim(),
            quantidade: Number(row["Quantidade"] || row["Quantia"] || row["Qtd"] || row["quantidade"] || 1),
          })).filter(r => r.matricula && r.codigo_material);
          
          setSaldoGestech(parsed);
          saveBase(KEY_GESTECH, parsed, "gestech");
          toast.success(`${parsed.length} itens importados para Saldo Gestech!`);

        } else if (type === "sap") {
          const parsed = jsonData.map((row: any) => ({
            serial: String(row["Serial"] || row["serial"] || row["Nº Série"] || row["Nº Serie"] || "").trim().toUpperCase(),
            codigo_material: String(row["Código"] || row["Codigo"] || row["codigo_material"] || "").trim(),
            nome_material: String(row["Material"] || row["Nome Material"] || row["nome_material"] || row["Modelo"] || "").trim(),
            deposito: String(row["Depósito"] || row["Deposito"] || row["deposito"] || "").trim(),
            status_sap: String(row["Status"] || row["Status SAP"] || row["status"] || "Disponível").trim(),
          })).filter(r => r.serial);

          setSaldoSap(parsed);
          saveBase(KEY_SAP, parsed, "sap");
          toast.success(`${parsed.length} seriais importados para Saldo SAP!`);

        } else if (type === "cruzamento") {
          const parsed = jsonData.map((row: any) => ({
            serial_sap: String(row["Serial SAP"] || row["serial_sap"] || "").trim().toUpperCase(),
            serial_gestech: String(row["Serial Gestech"] || row["serial_gestech"] || "").trim().toUpperCase(),
            status_cruzamento: String(row["Status Cruzamento"] || row["status_cruzamento"] || row["Status"] || "Conciliado").trim(),
            observacao: String(row["Observação"] || row["Observacao"] || row["observacao"] || "").trim(),
          })).filter(r => r.serial_sap || r.serial_gestech);

          setCruzamento(parsed);
          saveBase(KEY_CRUZAMENTO, parsed, "cruzamento");
          toast.success(`${parsed.length} cruzamentos importados!`);

        } else if (type === "aplicados") {
          const parsed = jsonData.map((row: any) => ({
            serial: String(row["Serial"] || row["serial"] || "").trim().toUpperCase(),
            codigo_material: String(row["Código"] || row["Codigo"] || row["codigo_material"] || "").trim(),
            nome_material: String(row["Material"] || row["Nome Material"] || row["nome_material"] || row["Modelo"] || "").trim(),
            cliente: String(row["Cliente"] || row["cliente"] || "").trim(),
            gpon: String(row["GPON"] || row["gpon"] || row["Porta GPON"] || "").trim(),
            alias: String(row["Alias"] || row["alias"] || "").trim(),
            data_instalacao: String(row["Data Instalação"] || row["Data Instalacao"] || row["data_instalacao"] || "").trim(),
            tecnico_instalador: String(row["Técnico"] || row["Tecnico"] || row["tecnico_instalador"] || "").trim(),
          })).filter(r => r.serial);

          setAplicados(parsed);
          saveBase(KEY_APLICADOS, parsed, "aplicados");
          toast.success(`${parsed.length} seriais aplicados importados!`);
        }
      } catch (err: any) {
        toast.error("Erro ao processar arquivo: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDownloadTemplate = (type: string) => {
    let headers: any[] = [];
    let exampleData: any[] = [];

    if (type === "gestech") {
      headers = ["Matrícula", "Nome Técnico", "Supervisor", "Código", "Material", "Quantidade"];
      exampleData = [
        ["TT10020", "Alan Ribeiro Santos", "Marcos Souza", "300456", "ONT NOKIA G-1425G-A", 3],
        ["TT10021", "Bruno Oliveira Costa", "Marcos Souza", "300789", "ONT HUAWEI EG8145V5", 2]
      ];
    } else if (type === "sap") {
      headers = ["Serial", "Código", "Material", "Depósito", "Status"];
      exampleData = [
        ["ALCLB11A22C3", "300456", "ONT NOKIA G-1425G-A", "DEP-ABILITY-SP1", "Atribuído"],
        ["ALCLB11A99Z9", "300456", "ONT NOKIA G-1425G-A", "DEP-ABILITY-SP1", "Disponível"]
      ];
    } else if (type === "cruzamento") {
      headers = ["Serial SAP", "Serial Gestech", "Status Cruzamento", "Observação"];
      exampleData = [
        ["ALCLB11A22C3", "ALCLB11A22C3", "Conciliado", "Confirmado em ambas as bases"],
        ["ALCLB11A22C4", "", "Divergente", "Serial ativo no SAP, mas sem registro Gestech"]
      ];
    } else if (type === "aplicados") {
      headers = ["Serial", "Código", "Material", "Cliente", "GPON", "Alias", "Data Instalação", "Técnico"];
      exampleData = [
        ["ALCLB11A22C3", "300456", "ONT NOKIA G-1425G-A", "Maria das Dores Souza", "OLT-SP-LAPA-01 1/1/2/4", "SP-LAPA-ONT-4562", "2026-05-10", "Alan Ribeiro Santos"]
      ];
    }

    const wsData = [headers, ...exampleData];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, `modelo_base_${type}.xlsx`);
    toast.success(`Modelo de base ${type.toUpperCase()} baixado!`);
  };

  // --- Dynamic Search Engine ---
  const handleDynamicSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setHasSearched(true);
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      setSearchResults(null);
      return;
    }

    if (searchType === "supervisor") {
      // Find all unique technicians where technician has records with this supervisor
      const techniciansMap: Record<string, { matricula: string; nome: string; supervisor: string; materialsCount: number }> = {};
      
      saldoGestech.forEach(item => {
        if (item.supervisor.toLowerCase().includes(query)) {
          if (!techniciansMap[item.matricula]) {
            techniciansMap[item.matricula] = {
              matricula: item.matricula,
              nome: item.nome_tecnico,
              supervisor: item.supervisor,
              materialsCount: 0
            };
          }
          techniciansMap[item.matricula].materialsCount += item.quantidade;
        }
      });

      const techniciansList = Object.values(techniciansMap);
      setSearchResults({
        type: "supervisor",
        supervisorName: techniciansList[0]?.supervisor || searchQuery,
        technicians: techniciansList
      });

    } else if (searchType === "matricula" || searchType === "nome") {
      // Find technician info
      let techItems = saldoGestech.filter(item => 
        searchType === "matricula" 
          ? item.matricula.toLowerCase() === query
          : item.nome_tecnico.toLowerCase().includes(query)
      );

      if (techItems.length === 0) {
        setSearchResults({ type: "empty", message: `Nenhum técnico localizado com a ${searchType === "matricula" ? "matrícula" : "busca por nome"} informada.` });
        return;
      }

      const matricula = techItems[0].matricula;
      const nomeTecnico = techItems[0].nome_tecnico;
      const supervisor = techItems[0].supervisor;

      // Aggregated materials
      const materialsSummary = techItems.map(item => ({
        codigo: item.codigo_material,
        nome: item.nome_material,
        quantidade: item.quantidade
      }));

      // Cross serials: Find seriais that match the materials and this technician in SAP / Aplicados
      // SAP shows seriais with state "Atribuído". In a real setup, we might have a column matching technician matrícula.
      // For this high fidelity mockup, we associate seriais where the technician is named in the applied bases or we simulate matches:
      // Let's filter the applied seriais for this technician:
      const techAppliedSerials = aplicados.filter(ap => ap.tecnico_instalador.toLowerCase().includes(nomeTecnico.toLowerCase()) || ap.tecnico_instalador.toLowerCase().includes(matricula.toLowerCase()));
      
      // Let's also grab seriais loaded in SAP that might be matched/divergent
      // For mock purposes, we search inside SAP/Cruzamento that reference the technician's materials:
      // We look at the cruzamento table. Any serial where technician has same model
      const associatedSerials: any[] = [];
      
      // Let's find seriais in SAP that match the materials of this technician
      const techMaterialCodes = techItems.map(i => i.codigo_material);
      
      // To simulate physical inventory currently in technician hands (not applied yet), 
      // we take SAP seriais that are "Atribuído" for these materials, but NOT in the "aplicados" base.
      // (This is standard logistics logic: if it's assigned to the warehouse/technician but not in the network, it is physical balance)
      const currentSerials = saldoSap.filter(s => 
        techMaterialCodes.includes(s.codigo_material) && 
        s.status_sap === "Atribuído" &&
        !aplicados.some(ap => ap.serial === s.serial)
      ).map(s => {
        // Find if there is crossing details
        const crossData = cruzamento.find(c => c.serial_sap === s.serial);
        return {
          serial: s.serial,
          codigo: s.codigo_material,
          modelo: s.nome_material,
          status: "Com Técnico (Físico)",
          deposito: s.deposito,
          crossStatus: crossData?.status_cruzamento || "Conciliado",
          obs: crossData?.observacao || "Ok"
        };
      });

      // Add the applied seriais by this technician
      const appliedSerialsMapped = techAppliedSerials.map(ap => ({
        serial: ap.serial,
        codigo: ap.codigo_material,
        modelo: ap.nome_material,
        status: "Aplicado no Cliente",
        deposito: "Rede Cliente",
        crossStatus: "Ativo",
        obs: `Cliente: ${ap.cliente} | GPON: ${ap.gpon}`
      }));

      const allSerialsList = [...currentSerials, ...appliedSerialsMapped];

      setSearchResults({
        type: "technician",
        matricula,
        nome: nomeTecnico,
        supervisor,
        materials: materialsSummary,
        serials: allSerialsList
      });

    } else if (searchType === "serial") {
      const serialQuery = query.toUpperCase();

      // Check if serial is applied
      const appliedItem = aplicados.find(a => a.serial === serialQuery);
      // Check if serial is in SAP
      const sapItem = saldoSap.find(s => s.serial === serialQuery);
      // Check if serial is in Cruzamento
      const crossItem = cruzamento.find(c => c.serial_sap === serialQuery || c.serial_gestech === serialQuery);

      if (!appliedItem && !sapItem && !crossItem) {
        setSearchResults({ type: "empty", message: "Serial não localizado em nenhuma das bases carregadas." });
        return;
      }

      // Determine where it is
      let statusText = "Não Localizado";
      let locationDetails: any = null;

      if (appliedItem) {
        statusText = "Aplicado no Sistema";
        locationDetails = {
          cliente: appliedItem.cliente,
          gpon: appliedItem.gpon,
          alias: appliedItem.alias,
          data_instalacao: appliedItem.data_instalacao,
          tecnico: appliedItem.tecnico_instalador,
          modelo: appliedItem.nome_material,
          codigo: appliedItem.codigo_material
        };
      } else if (sapItem) {
        // Is it assigned to a technician? 
        // We look up the technician's materials in Gestech that match this model
        // To find the technician, we match the applied installer or look up the gestech mock/loaded database
        // Let's check who holds this code/material in Gestech
        const techMatch = saldoGestech.find(t => t.codigo_material === sapItem.codigo_material);
        statusText = "Com Técnico (Físico)";
        locationDetails = {
          tecnico: techMatch?.nome_tecnico || "Técnico Não Definido",
          matricula: techMatch?.matricula || "—",
          supervisor: techMatch?.supervisor || "—",
          deposito: sapItem.deposito,
          statusSap: sapItem.status_sap,
          modelo: sapItem.nome_material,
          codigo: sapItem.codigo_material
        };
      } else if (crossItem) {
        statusText = "Apenas em Cruzamento SAP X Gestech";
        locationDetails = {
          obs: crossItem.observacao,
          statusCruzamento: crossItem.status_cruzamento
        };
      }

      setSearchResults({
        type: "serial",
        serial: serialQuery,
        status: statusText,
        details: locationDetails
      });
    }
  };

  const handleSelectTechnician = (matricula: string) => {
    setSearchType("matricula");
    setSearchQuery(matricula);
    // Execute search immediately
    setHasSearched(true);
    
    // Perform search directly
    const query = matricula.toLowerCase();
    let techItems = saldoGestech.filter(item => item.matricula.toLowerCase() === query);

    if (techItems.length > 0) {
      const matriculaVal = techItems[0].matricula;
      const nomeTecnico = techItems[0].nome_tecnico;
      const supervisor = techItems[0].supervisor;

      const materialsSummary = techItems.map(item => ({
        codigo: item.codigo_material,
        nome: item.nome_material,
        quantidade: item.quantidade
      }));

      const techAppliedSerials = aplicados.filter(ap => ap.tecnico_instalador.toLowerCase().includes(nomeTecnico.toLowerCase()) || ap.tecnico_instalador.toLowerCase().includes(matriculaVal.toLowerCase()));
      const techMaterialCodes = techItems.map(i => i.codigo_material);
      
      const currentSerials = saldoSap.filter(s => 
        techMaterialCodes.includes(s.codigo_material) && 
        s.status_sap === "Atribuído" &&
        !aplicados.some(ap => ap.serial === s.serial)
      ).map(s => {
        const crossData = cruzamento.find(c => c.serial_sap === s.serial);
        return {
          serial: s.serial,
          codigo: s.codigo_material,
          modelo: s.nome_material,
          status: "Com Técnico (Físico)",
          deposito: s.deposito,
          crossStatus: crossData?.status_cruzamento || "Conciliado",
          obs: crossData?.observacao || "Ok"
        };
      });

      const appliedSerialsMapped = techAppliedSerials.map(ap => ({
        serial: ap.serial,
        codigo: ap.codigo_material,
        modelo: ap.nome_material,
        status: "Aplicado no Cliente",
        deposito: "Rede Cliente",
        crossStatus: "Ativo",
        obs: `Cliente: ${ap.cliente} | GPON: ${ap.gpon}`
      }));

      setSearchResults({
        type: "technician",
        matricula: matriculaVal,
        nome: nomeTecnico,
        supervisor,
        materials: materialsSummary,
        serials: [...currentSerials, ...appliedSerialsMapped]
      });
    }
  };

  // --- Mass Search Engine ---
  const handleMassSearch = () => {
    if (!massInput.trim()) {
      toast.warning("Insira ao menos um serial para pesquisar.");
      return;
    }

    setSearchingMass(true);
    
    // Split input by lines, commas, or spaces
    const lines = massInput.split(/[\n,; \t]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
    const uniqueSerials = Array.from(new Set(lines));

    if (uniqueSerials.length === 0) {
      toast.error("Nenhum serial válido detectado.");
      setSearchingMass(false);
      return;
    }

    const results: any[] = [];
    let withTechCount = 0;
    let appliedCount = 0;
    let notFoundCount = 0;

    uniqueSerials.forEach(serial => {
      // 1. Check if applied
      const appliedItem = aplicados.find(a => a.serial === serial);
      if (appliedItem) {
        appliedCount++;
        results.push({
          serial,
          status: "aplicado",
          equipamento: `${appliedItem.nome_material} (${appliedItem.codigo_material})`,
          cliente: appliedItem.cliente,
          gpon: appliedItem.gpon,
          alias: appliedItem.alias,
          detalhes: `Aplicado no Cliente: ${appliedItem.cliente} | GPON: ${appliedItem.gpon} | Alias: ${appliedItem.alias}`
        });
        return;
      }

      // 2. Check if in SAP / With Tech
      const sapItem = saldoSap.find(s => s.serial === serial);
      if (sapItem) {
        withTechCount++;
        // Find which tech might have it
        const techMatch = saldoGestech.find(t => t.codigo_material === sapItem.codigo_material);
        results.push({
          serial,
          status: "tecnico",
          equipamento: `${sapItem.nome_material} (${sapItem.codigo_material})`,
          tecnico: techMatch?.nome_tecnico || "Técnico Não Identificado",
          matricula: techMatch?.matricula || "—",
          supervisor: techMatch?.supervisor || "—",
          detalhes: `Com Técnico: ${techMatch?.nome_tecnico || "Técnico"} | Supervisor: ${techMatch?.supervisor || "—"}`
        });
        return;
      }

      // 3. Check in Cruzamento just in case
      const crossItem = cruzamento.find(c => c.serial_sap === serial || c.serial_gestech === serial);
      if (crossItem) {
        withTechCount++; // treat as tech inventory in this mock crossing
        results.push({
          serial,
          status: "cruzamento",
          equipamento: "Sob consulta no Cruzamento SAP x Gestech",
          detalhes: `Status Cruzamento: ${crossItem.status_cruzamento} | Obs: ${crossItem.observacao}`
        });
        return;
      }

      // 4. Not found
      notFoundCount++;
      results.push({
        serial,
        status: "not_found",
        equipamento: "—",
        detalhes: "Não localizado nas bases ativas"
      });
    });

    setMassResults(results);
    setMassStats({
      total: uniqueSerials.length,
      withTech: withTechCount,
      applied: appliedCount,
      notFound: notFoundCount
    });
    setSearchingMass(false);
    toast.success(`Pesquisa concluída! ${uniqueSerials.length} seriais processados.`);
  };

  const handleExportMassResults = () => {
    if (massResults.length === 0) return;

    const dataToExport = massResults.map(r => ({
      "Número de Série": r.serial,
      "Status Localização": r.status === "aplicado" ? "Aplicado no Sistema" : r.status === "tecnico" ? "Com Técnico (Físico)" : r.status === "cruzamento" ? "No Cruzamento (Não Conciliado)" : "Não Encontrado",
      "Equipamento / Modelo": r.equipamento,
      "Informações de Rastreabilidade": r.detalhes
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rastreabilidade Massa");
    XLSX.writeFile(wb, `resultado_rastreabilidade_massa_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success("Excel gerado com sucesso!");
  };

  return (
    <div className="flex flex-col h-full bg-slate-50/50 p-6 overflow-y-auto">
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-sky-50 text-sky-600 rounded-xl">
              <ScanBarcode className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">Rastreabilidade de ONT</h1>
              <p className="text-xs text-slate-500 mt-0.5">Gestão cruzada, carga de técnicos e rastreamento em massa de números de série</p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="text-xs text-slate-600 border-slate-200 hover:bg-slate-50"
            onClick={handleResetAllToMock}
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5 text-sky-500 animate-hover" />
            Redefinir Massa Demo
          </Button>
          
          <Badge variant="secondary" className="px-3 py-1 bg-sky-50 text-sky-700 hover:bg-sky-50/80 font-medium text-xs rounded-full">
            <Database className="w-3 h-3 mr-1.5" />
            Local Cache Ativo
          </Badge>
        </div>
      </div>

      {/* Main Tabs Container */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-6">
        <TabsList className="bg-slate-100/80 p-1 rounded-xl border border-slate-200/50 w-full md:w-auto flex md:inline-flex">
          <TabsTrigger value="consultas" className="flex-1 md:flex-none rounded-lg text-xs py-2 px-4 transition-all">
            <Search className="w-3.5 h-3.5 mr-2" />
            Consultas Dinâmicas
          </TabsTrigger>
          <TabsTrigger value="massa" className="flex-1 md:flex-none rounded-lg text-xs py-2 px-4 transition-all">
            <Layers className="w-3.5 h-3.5 mr-2" />
            Busca de Serial em Massa
          </TabsTrigger>
          <TabsTrigger value="bases" className="flex-1 md:flex-none rounded-lg text-xs py-2 px-4 transition-all">
            <Database className="w-3.5 h-3.5 mr-2" />
            Gerenciamento de Bases
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: DYNAMIC QUERIES */}
        <TabsContent value="consultas" className="space-y-6 outline-none">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left Column: Search Panel */}
            <Card className="lg:col-span-1 border-slate-100 shadow-sm bg-white rounded-xl">
              <CardHeader className="pb-4">
                <CardTitle className="text-sm font-semibold text-slate-800">Filtro de Consulta</CardTitle>
                <CardDescription className="text-xs">Escolha o tipo de consulta para filtrar as bases logísticas</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleDynamicSearch} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-600">Consultar por:</label>
                    <Select 
                      value={searchType} 
                      onValueChange={(val: any) => {
                        setSearchType(val);
                        setSearchQuery("");
                        setHasSearched(false);
                        setSearchResults(null);
                      }}
                    >
                      <SelectTrigger className="w-full bg-slate-50 border-slate-200 text-xs">
                        <SelectValue placeholder="Selecione o filtro..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="matricula" className="text-xs">Matrícula do Técnico</SelectItem>
                        <SelectItem value="nome" className="text-xs">Nome do Técnico</SelectItem>
                        <SelectItem value="serial" className="text-xs">Número de Série (ONT)</SelectItem>
                        <SelectItem value="supervisor" className="text-xs">Nome do Supervisor</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-600">Termo de Busca:</label>
                    <div className="relative">
                      <Input
                        type="text"
                        placeholder={
                          searchType === "matricula" ? "Ex: TT10020" :
                          searchType === "nome" ? "Ex: Alan Ribeiro" :
                          searchType === "serial" ? "Ex: ALCLB11A22C3" :
                          "Ex: Marcos Souza"
                        }
                        className="bg-slate-50 border-slate-200 text-xs pr-10"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                      <Search className="absolute right-3.5 top-3 w-4 h-4 text-slate-400" />
                    </div>
                  </div>

                  <Button type="submit" className="w-full bg-sky-600 hover:bg-sky-700 text-white text-xs py-2.5 shadow-sm shadow-sky-100 rounded-lg">
                    <Search className="w-3.5 h-3.5 mr-2" />
                    Buscar Rastreabilidade
                  </Button>
                </form>

                <div className="mt-6 pt-5 border-t border-slate-100 space-y-3.5">
                  <h4 className="text-xs font-semibold text-slate-700">Dicas de Teste (Massa Demo):</h4>
                  <div className="space-y-2 text-[11px] text-slate-500">
                    <p className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
                      <strong>Supervisor:</strong> Digite <code className="bg-slate-100 px-1 rounded text-sky-600">Marcos</code>
                    </p>
                    <p className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
                      <strong>Matrícula:</strong> Digite <code className="bg-slate-100 px-1 rounded text-sky-600">TT10020</code>
                    </p>
                    <p className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
                      <strong>Serial Técnico:</strong> <code className="bg-slate-100 px-1 rounded text-sky-600">ALCLB11A22C5</code>
                    </p>
                    <p className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
                      <strong>Serial Aplicado:</strong> <code className="bg-slate-100 px-1 rounded text-sky-600">ALCLB11A22C3</code>
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Right Column: Search Results */}
            <div className="lg:col-span-2 space-y-6">
              
              {!hasSearched ? (
                <div className="h-[300px] bg-white border border-slate-100 rounded-xl flex flex-col items-center justify-center text-slate-400 p-6 shadow-sm">
                  <Search className="w-12 h-12 text-slate-200 mb-3" />
                  <p className="text-sm font-semibold text-slate-600">Pronto para Consulta</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-[320px] text-center">
                    Selecione um filtro de busca no painel esquerdo e digite o termo correspondente para analisar os dados.
                  </p>
                </div>
              ) : !searchResults ? (
                <div className="h-[300px] bg-white border border-slate-100 rounded-xl flex flex-col items-center justify-center text-rose-500 p-6 shadow-sm">
                  <AlertTriangle className="w-12 h-12 text-rose-200 mb-3" />
                  <p className="text-sm font-semibold text-rose-600">Nenhum resultado</p>
                  <p className="text-xs text-slate-400 mt-1">Nenhum registro foi encontrado com os termos de busca digitados.</p>
                </div>
              ) : searchResults.type === "empty" ? (
                <div className="h-[300px] bg-white border border-slate-100 rounded-xl flex flex-col items-center justify-center text-slate-500 p-6 shadow-sm">
                  <AlertCircle className="w-12 h-12 text-amber-200 mb-3 animate-pulse" />
                  <p className="text-sm font-semibold text-amber-600">Nenhum registro localizado</p>
                  <p className="text-xs text-slate-500 mt-1 text-center max-w-[360px]">{searchResults.message}</p>
                </div>
              ) : searchResults.type === "supervisor" ? (
                /* SUPERVISOR SEARCH RESULTS */
                <Card className="border-slate-100 shadow-sm rounded-xl bg-white">
                  <CardHeader className="pb-4 border-b border-slate-100">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Users className="w-5 h-5 text-sky-500" />
                        <div>
                          <CardTitle className="text-sm font-bold text-slate-800">Equipe de Técnicos</CardTitle>
                          <CardDescription className="text-xs">Supervisor(a): <span className="font-semibold text-slate-700">{searchResults.supervisorName}</span></CardDescription>
                        </div>
                      </div>
                      <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-100 rounded-full font-semibold">
                        {searchResults.technicians.length} técnicos relacionados
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {searchResults.technicians.map((tech: any) => (
                        <div 
                          key={tech.matricula} 
                          className="p-4 rounded-xl border border-slate-100 hover:border-sky-200 bg-slate-50/50 hover:bg-white transition-all shadow-sm group cursor-pointer"
                          onClick={() => handleSelectTechnician(tech.matricula)}
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-lg bg-sky-100/80 text-sky-600 flex items-center justify-center font-bold text-xs">
                                {tech.nome.split(" ").slice(0,2).map((n: string) => n[0]).join("")}
                              </div>
                              <div>
                                <h4 className="text-xs font-bold text-slate-800 group-hover:text-sky-600 transition-colors">{tech.nome}</h4>
                                <p className="text-[10px] text-slate-500 mt-0.5">Matrícula: {tech.matricula}</p>
                              </div>
                            </div>
                            <Badge className="bg-slate-200 text-slate-700 hover:bg-slate-200 text-[10px] rounded-full font-medium">
                              {tech.materialsCount} ITENS
                            </Badge>
                          </div>
                          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[10px] text-sky-600 font-semibold">
                            <span>Ver Carga de Equipamentos</span>
                            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ) : searchResults.type === "technician" ? (
                /* TECHNICIAN SEARCH RESULTS */
                <div className="space-y-6">
                  {/* Summary Card */}
                  <Card className="border-slate-100 shadow-sm rounded-xl bg-white">
                    <CardContent className="p-6">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-sky-50 text-sky-600 rounded-xl flex items-center justify-center">
                            <User className="w-6 h-6" />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-slate-800">{searchResults.nome}</h3>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 mt-1">
                              <span>Matrícula: <strong className="text-slate-700">{searchResults.matricula}</strong></span>
                              <span className="text-slate-300">•</span>
                              <span>Supervisor: <strong className="text-slate-700">{searchResults.supervisor}</strong></span>
                            </div>
                          </div>
                        </div>
                        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100 border px-3 py-1 font-semibold rounded-full text-xs self-start md:self-auto">
                          Ativo no Gestech
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Materials Aggregation Table */}
                  <Card className="border-slate-100 shadow-sm rounded-xl bg-white">
                    <CardHeader className="pb-3 border-b border-slate-100">
                      <CardTitle className="text-sm font-bold text-slate-800">Materiais Serializados Atribuídos (Resumo)</CardTitle>
                      <CardDescription className="text-xs">Saldo consolidado de equipamentos na carga física</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader className="bg-slate-50/50">
                          <TableRow className="border-b border-slate-100">
                            <TableHead className="text-xs font-semibold text-slate-600 py-3 pl-6">Código do Material</TableHead>
                            <TableHead className="text-xs font-semibold text-slate-600 py-3">Modelo / Nome do Equipamento</TableHead>
                            <TableHead className="text-xs font-semibold text-slate-600 py-3 text-right pr-6">Quantidade em Carga</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {searchResults.materials.map((mat: any, idx: number) => (
                            <TableRow key={idx} className="border-b border-slate-100 hover:bg-slate-50/20">
                              <TableCell className="text-xs font-semibold text-slate-700 py-3 pl-6">{mat.codigo}</TableCell>
                              <TableCell className="text-xs text-slate-600 py-3">{mat.nome}</TableCell>
                              <TableCell className="text-xs font-bold text-slate-800 py-3 text-right pr-6">
                                <span className="bg-sky-50 text-sky-700 px-2 py-0.5 rounded font-mono text-xs border border-sky-100">
                                  {mat.quantidade}
                                </span>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>

                  {/* Seriais Breakdown */}
                  <Card className="border-slate-100 shadow-sm rounded-xl bg-white">
                    <CardHeader className="pb-3 border-b border-slate-100">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-sm font-bold text-slate-800">Detalhamento Físico de Números de Série</CardTitle>
                          <CardDescription className="text-xs">Histórico e localização atual de cada serial vinculado</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      {searchResults.serials.length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-500">
                          Nenhum número de série correspondente localizado nos cruzamentos SAP/Aplicados.
                        </div>
                      ) : (
                        <Table>
                          <TableHeader className="bg-slate-50/50">
                            <TableRow className="border-b border-slate-100">
                              <TableHead className="text-xs font-semibold text-slate-600 py-3 pl-6">Número de Série</TableHead>
                              <TableHead className="text-xs font-semibold text-slate-600 py-3">Equipamento</TableHead>
                              <TableHead className="text-xs font-semibold text-slate-600 py-3">Status Localização</TableHead>
                              <TableHead className="text-xs font-semibold text-slate-600 py-3">Validação SAP</TableHead>
                              <TableHead className="text-xs font-semibold text-slate-600 py-3 pr-6">Observações Cruzamento</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {searchResults.serials.map((s: any, idx: number) => (
                              <TableRow key={idx} className="border-b border-slate-100 hover:bg-slate-50/20">
                                <TableCell className="text-xs font-bold text-slate-800 py-3 pl-6 font-mono">{s.serial}</TableCell>
                                <TableCell className="text-[11px] text-slate-500 py-3">{s.modelo}</TableCell>
                                <TableCell className="text-xs py-3">
                                  <Badge className={
                                    s.status.includes("Aplicado") 
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-200 border text-[10px] font-semibold"
                                      : "bg-blue-50 text-blue-700 border-blue-200 border text-[10px] font-semibold"
                                  }>
                                    {s.status}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-xs py-3">
                                  <Badge variant="outline" className={
                                    s.crossStatus === "Conciliado" || s.crossStatus === "Ativo"
                                      ? "text-emerald-600 border-emerald-200 bg-emerald-50/20"
                                      : "text-amber-600 border-amber-200 bg-amber-50/20"
                                  }>
                                    {s.crossStatus}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-[11px] text-slate-500 py-3 pr-6">{s.obs}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                </div>
              ) : (
                /* SERIAL INDIVIDUAL RESULTS */
                <Card className="border-slate-100 shadow-sm rounded-xl bg-white">
                  <CardHeader className="pb-4 border-b border-slate-100">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ScanBarcode className="w-5 h-5 text-sky-500" />
                        <div>
                          <CardTitle className="text-sm font-bold text-slate-800">Resultado de Consulta de Serial</CardTitle>
                          <CardDescription className="text-xs">Número de série: <span className="font-mono font-bold text-slate-700 text-xs">{searchResults.serial}</span></CardDescription>
                        </div>
                      </div>
                      <Badge className={
                        searchResults.status === "Aplicado no Sistema"
                          ? "bg-emerald-500 text-white hover:bg-emerald-600 font-semibold"
                          : searchResults.status === "Com Técnico (Físico)"
                          ? "bg-blue-500 text-white hover:bg-blue-600 font-semibold"
                          : "bg-slate-500 text-white hover:bg-slate-600 font-semibold"
                      }>
                        {searchResults.status.toUpperCase()}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-6">
                    {searchResults.status === "Aplicado no Sistema" ? (
                      <div className="space-y-6">
                        {/* Applied info */}
                        <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-100 flex items-start gap-3">
                          <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
                          <div>
                            <h4 className="text-xs font-bold text-emerald-800">Equipamento Instalado e Ativo em Cliente</h4>
                            <p className="text-[11px] text-emerald-700/80 mt-0.5">O serial foi aplicado em campo e está sincronizado com a base de redes ativas.</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="p-4 rounded-xl border border-slate-100 space-y-1">
                            <span className="text-[10px] font-semibold text-slate-500 uppercase">Equipamento</span>
                            <p className="text-xs font-bold text-slate-800">{searchResults.details.modelo}</p>
                            <p className="text-[10px] text-slate-500">Cód: {searchResults.details.codigo}</p>
                          </div>
                          
                          <div className="p-4 rounded-xl border border-slate-100 space-y-1">
                            <span className="text-[10px] font-semibold text-slate-500 uppercase">Cliente</span>
                            <p className="text-xs font-bold text-slate-800">{searchResults.details.cliente}</p>
                            <p className="text-[10px] text-slate-500">Instalação em: {searchResults.details.data_instalacao}</p>
                          </div>

                          <div className="p-4 rounded-xl border border-slate-100 space-y-1">
                            <span className="text-[10px] font-semibold text-slate-500 uppercase">Porta OLT / GPON</span>
                            <p className="text-xs font-bold text-slate-800 font-mono">{searchResults.details.gpon}</p>
                          </div>

                          <div className="p-4 rounded-xl border border-slate-100 space-y-1">
                            <span className="text-[10px] font-semibold text-slate-500 uppercase">Alias Equipamento</span>
                            <p className="text-xs font-bold text-slate-800 font-mono">{searchResults.details.alias}</p>
                          </div>
                        </div>

                        <div className="pt-4 border-t border-slate-100 text-[11px] text-slate-500 flex items-center gap-1">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          <span>Técnico Instalador: <strong>{searchResults.details.tecnico}</strong></span>
                        </div>
                      </div>
                    ) : searchResults.status === "Com Técnico (Físico)" ? (
                      <div className="space-y-6">
                        <div className="bg-sky-50/50 p-4 rounded-xl border border-sky-100 flex items-start gap-3">
                          <Info className="w-5 h-5 text-sky-600 mt-0.5 flex-shrink-0" />
                          <div>
                            <h4 className="text-xs font-bold text-sky-800">Equipamento em Carga com Colaborador</h4>
                            <p className="text-[11px] text-sky-700/80 mt-0.5">O serial consta como atribuído ao depósito pessoal do técnico no SAP e no Gestech.</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="p-4 rounded-xl border border-slate-100 space-y-1">
                            <span className="text-[10px] font-semibold text-slate-500 uppercase">Equipamento</span>
                            <p className="text-xs font-bold text-slate-800">{searchResults.details.modelo}</p>
                            <p className="text-[10px] text-slate-500">Cód: {searchResults.details.codigo}</p>
                          </div>

                          <div className="p-4 rounded-xl border border-slate-100 space-y-1">
                            <span className="text-[10px] font-semibold text-slate-500 uppercase">Colaborador Portador</span>
                            <p className="text-xs font-bold text-slate-800">{searchResults.details.tecnico}</p>
                            <p className="text-[10px] text-slate-500">Matrícula: {searchResults.details.matricula}</p>
                          </div>

                          <div className="p-4 rounded-xl border border-slate-100 space-y-1">
                            <span className="text-[10px] font-semibold text-slate-500 uppercase">Supervisor Responsável</span>
                            <p className="text-xs font-bold text-slate-800">{searchResults.details.supervisor}</p>
                          </div>

                          <div className="p-4 rounded-xl border border-slate-100 space-y-1">
                            <span className="text-[10px] font-semibold text-slate-500 uppercase">Depósito de Origem</span>
                            <p className="text-xs font-bold text-slate-800 font-mono">{searchResults.details.deposito}</p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* CROSS LOGIC ONLY */
                      <div className="space-y-4">
                        <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-100 flex items-start gap-3">
                          <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                          <div>
                            <h4 className="text-xs font-bold text-amber-800">Conformidade SAP X Gestech Pendente</h4>
                            <p className="text-[11px] text-amber-700/80 mt-0.5">Este equipamento não foi ativado nem está em carga atribuída regular.</p>
                          </div>
                        </div>

                        <div className="p-4 rounded-xl border border-slate-100 space-y-2">
                          <span className="text-[10px] font-semibold text-slate-500 uppercase">Logs de Cruzamento</span>
                          <p className="text-xs font-bold text-slate-700">Status Cruzamento: <span className="text-amber-600">{searchResults.details.statusCruzamento}</span></p>
                          <p className="text-xs text-slate-600">Histórico: {searchResults.details.obs}</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

            </div>
          </div>
        </TabsContent>

        {/* TAB 2: MASS SEARCH */}
        <TabsContent value="massa" className="space-y-6 outline-none">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Input Panel */}
            <Card className="lg:col-span-1 border-slate-100 shadow-sm bg-white rounded-xl">
              <CardHeader>
                <CardTitle className="text-sm font-semibold text-slate-800">Busca em Massa</CardTitle>
                <CardDescription className="text-xs">Cole uma lista de números de série para buscar de uma vez só</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600">Insira os Seriais (Um por linha ou separado por vírgula):</label>
                  <Textarea
                    placeholder="Cole os seriais aqui..."
                    rows={8}
                    className="bg-slate-50 border-slate-200 text-xs font-mono"
                    value={massInput}
                    onChange={(e) => setMassInput(e.target.value)}
                  />
                </div>

                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    className="flex-1 text-xs border-slate-200 text-slate-600 hover:bg-slate-50"
                    onClick={() => {
                      setMassInput("");
                      setMassResults([]);
                    }}
                  >
                    Limpar
                  </Button>
                  <Button 
                    className="flex-1 bg-sky-600 hover:bg-sky-700 text-white text-xs"
                    onClick={handleMassSearch}
                    disabled={searchingMass}
                  >
                    {searchingMass ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 mr-2 animate-spin" />
                        Buscando...
                      </>
                    ) : (
                      <>
                        <Layers className="w-3.5 h-3.5 mr-2" />
                        Pesquisar
                      </>
                    )}
                  </Button>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-100">
                  <Button 
                    variant="ghost" 
                    className="w-full text-left text-[11px] text-sky-600 hover:text-sky-700 hover:bg-sky-50 justify-start"
                    onClick={() => {
                      setMassInput("ALCLB11A22C3\nALCLB11A22C5\n2102312T0A30789C\nINVALIDO123\nALCLB11A33D1");
                      toast.info("Seriais de teste colados!");
                    }}
                  >
                    <HelpCircle className="w-3.5 h-3.5 mr-1.5" />
                    Colar lista de teste rápido
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Results Panel */}
            <div className="lg:col-span-2 space-y-6">
              {massResults.length === 0 ? (
                <div className="h-[350px] bg-white border border-slate-100 rounded-xl flex flex-col items-center justify-center text-slate-400 p-6 shadow-sm">
                  <Layers className="w-12 h-12 text-slate-200 mb-3" />
                  <p className="text-sm font-semibold text-slate-600">Resultados da Busca</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-[320px] text-center">
                    Insira uma lista de equipamentos serializados na caixa de texto à esquerda para mapear a localização e status de todos simultaneamente.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Summary Stats Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card className="border-slate-100 shadow-sm rounded-xl bg-white p-4">
                      <span className="text-[10px] font-semibold text-slate-500 uppercase block">Total Pesquisados</span>
                      <p className="text-2xl font-black text-slate-800 mt-1">{massStats.total}</p>
                    </Card>
                    <Card className="border-slate-100 shadow-sm rounded-xl bg-white p-4">
                      <span className="text-[10px] font-semibold text-slate-500 uppercase block">Com Técnico</span>
                      <p className="text-2xl font-black text-blue-600 mt-1">
                        {massStats.withTech}
                        <span className="text-xs font-semibold text-slate-400 ml-1.5">({Math.round((massStats.withTech / massStats.total) * 100)}%)</span>
                      </p>
                    </Card>
                    <Card className="border-slate-100 shadow-sm rounded-xl bg-white p-4">
                      <span className="text-[10px] font-semibold text-slate-500 uppercase block">Aplicado em Rede</span>
                      <p className="text-2xl font-black text-emerald-600 mt-1">
                        {massStats.applied}
                        <span className="text-xs font-semibold text-slate-400 ml-1.5">({Math.round((massStats.applied / massStats.total) * 100)}%)</span>
                      </p>
                    </Card>
                    <Card className="border-slate-100 shadow-sm rounded-xl bg-white p-4">
                      <span className="text-[10px] font-semibold text-slate-500 uppercase block">Não Encontrados</span>
                      <p className="text-2xl font-black text-rose-600 mt-1">
                        {massStats.notFound}
                        <span className="text-xs font-semibold text-slate-400 ml-1.5">({Math.round((massStats.notFound / massStats.total) * 100)}%)</span>
                      </p>
                    </Card>
                  </div>

                  {/* Detailed Results Table */}
                  <Card className="border-slate-100 shadow-sm rounded-xl bg-white">
                    <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
                      <div>
                        <CardTitle className="text-sm font-bold text-slate-800">Resultado Detalhado da Busca</CardTitle>
                        <CardDescription className="text-xs">Lista tratada de localização e cruzamento de dados</CardDescription>
                      </div>
                      <Button 
                        size="sm" 
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                        onClick={handleExportMassResults}
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5 mr-2" />
                        Exportar XLSX
                      </Button>
                    </CardHeader>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader className="bg-slate-50/50">
                          <TableRow className="border-b border-slate-100">
                            <TableHead className="text-xs font-semibold text-slate-600 py-3 pl-6">Serial</TableHead>
                            <TableHead className="text-xs font-semibold text-slate-600 py-3">Equipamento</TableHead>
                            <TableHead className="text-xs font-semibold text-slate-600 py-3">Localização / Status</TableHead>
                            <TableHead className="text-xs font-semibold text-slate-600 py-3 pr-6">Detalhes / Identificação</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {massResults.map((r, idx) => (
                            <TableRow key={idx} className="border-b border-slate-100 hover:bg-slate-50/20">
                              <TableCell className="text-xs font-bold text-slate-800 py-3 pl-6 font-mono">{r.serial}</TableCell>
                              <TableCell className="text-xs text-slate-500 py-3">{r.equipamento}</TableCell>
                              <TableCell className="text-xs py-3">
                                <Badge className={
                                  r.status === "aplicado" 
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200 border text-[10px] font-semibold"
                                    : r.status === "tecnico"
                                    ? "bg-blue-50 text-blue-700 border-blue-200 border text-[10px] font-semibold"
                                    : r.status === "cruzamento"
                                    ? "bg-amber-50 text-amber-700 border-amber-200 border text-[10px] font-semibold"
                                    : "bg-rose-50 text-rose-700 border-rose-200 border text-[10px] font-semibold"
                                }>
                                  {r.status === "aplicado" ? "Aplicado" : r.status === "tecnico" ? "Com Técnico" : r.status === "cruzamento" ? "No Cruzamento" : "Não Localizado"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-[11px] text-slate-600 py-3 pr-6 font-medium">{r.detalhes}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>

          </div>
        </TabsContent>

        {/* TAB 3: BASE MANAGEMENT */}
        <TabsContent value="bases" className="space-y-6 outline-none">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* BASE 1: SALDO GESTECH */}
            <Card className="border-slate-100 shadow-sm bg-white rounded-xl overflow-hidden">
              <CardHeader className="pb-4 border-b border-slate-100 bg-slate-50/50">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-sky-500"></span>
                      1. Saldo Gestech
                    </CardTitle>
                    <CardDescription className="text-xs mt-1">Carga física e quantidade de equipamentos por técnico</CardDescription>
                  </div>
                  <div className="text-right">
                    <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-100">
                      {saldoGestech.length} Linhas
                    </Badge>
                    <p className="text-[9px] text-slate-400 mt-1">Modificado: {uploadTimestamps.gestech || "—"}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                <p className="text-xs text-slate-500 leading-relaxed">
                  Esta base mapeia a matrícula do colaborador técnico, supervisor dele, código do material e a quantidade atribuída no sistema Gestech.
                </p>

                <div className="flex flex-col sm:flex-row gap-2 pt-2">
                  <div className="flex-1 relative">
                    <input 
                      type="file" 
                      accept=".xlsx, .xls, .csv" 
                      className="hidden" 
                      id="upload-gestech" 
                      onChange={(e) => handleFileUpload(e, "gestech")} 
                    />
                    <label htmlFor="upload-gestech">
                      <Button asChild variant="outline" className="w-full text-xs border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer">
                        <span>
                          <Upload className="w-3.5 h-3.5 mr-2" />
                          Importar Planilha
                        </span>
                      </Button>
                    </label>
                  </div>
                  <Button variant="ghost" className="text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-50" onClick={() => handleClearBase("gestech")}>
                    <Trash2 className="w-3.5 h-3.5 mr-1" /> Limpar Base
                  </Button>
                </div>

                <Button variant="link" className="text-xs text-sky-600 h-auto p-0 font-medium" onClick={() => handleDownloadTemplate("gestech")}>
                  <Download className="w-3 h-3 mr-1" /> Baixar Template Estruturado (.xlsx)
                </Button>
              </CardContent>
            </Card>

            {/* BASE 2: SALDO SAP */}
            <Card className="border-slate-100 shadow-sm bg-white rounded-xl overflow-hidden">
              <CardHeader className="pb-4 border-b border-slate-100 bg-slate-50/50">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-violet-500"></span>
                      2. Saldo SAP com Seriais
                    </CardTitle>
                    <CardDescription className="text-xs mt-1">Total de números de série logísticos com o SAP</CardDescription>
                  </div>
                  <div className="text-right">
                    <Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-100">
                      {saldoSap.length} Linhas
                    </Badge>
                    <p className="text-[9px] text-slate-400 mt-1">Modificado: {uploadTimestamps.sap || "—"}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                <p className="text-xs text-slate-500 leading-relaxed">
                  Controle analítico de cada número de série individualizado na base SAP, indicando o depósito logístico atribuído e o status.
                </p>

                <div className="flex flex-col sm:flex-row gap-2 pt-2">
                  <div className="flex-1 relative">
                    <input 
                      type="file" 
                      accept=".xlsx, .xls, .csv" 
                      className="hidden" 
                      id="upload-sap" 
                      onChange={(e) => handleFileUpload(e, "sap")} 
                    />
                    <label htmlFor="upload-sap">
                      <Button asChild variant="outline" className="w-full text-xs border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer">
                        <span>
                          <Upload className="w-3.5 h-3.5 mr-2" />
                          Importar Planilha
                        </span>
                      </Button>
                    </label>
                  </div>
                  <Button variant="ghost" className="text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-50" onClick={() => handleClearBase("sap")}>
                    <Trash2 className="w-3.5 h-3.5 mr-1" /> Limpar Base
                  </Button>
                </div>

                <Button variant="link" className="text-xs text-sky-600 h-auto p-0 font-medium" onClick={() => handleDownloadTemplate("sap")}>
                  <Download className="w-3 h-3 mr-1" /> Baixar Template Estruturado (.xlsx)
                </Button>
              </CardContent>
            </Card>

            {/* BASE 3: SAP X GESTECH CROSS */}
            <Card className="border-slate-100 shadow-sm bg-white rounded-xl overflow-hidden">
              <CardHeader className="pb-4 border-b border-slate-100 bg-slate-50/50">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                      3. Cruzamento SAP x Gestech
                    </CardTitle>
                    <CardDescription className="text-xs mt-1">Divergências e conciliações de seriais logísticos</CardDescription>
                  </div>
                  <div className="text-right">
                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-100">
                      {cruzamento.length} Linhas
                    </Badge>
                    <p className="text-[9px] text-slate-400 mt-1">Modificado: {uploadTimestamps.cruzamento || "—"}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                <p className="text-xs text-slate-500 leading-relaxed">
                  Análise pré-processada contendo a conciliação ou divergência encontrada cruzando o Serial SAP e o Serial Gestech.
                </p>

                <div className="flex flex-col sm:flex-row gap-2 pt-2">
                  <div className="flex-1 relative">
                    <input 
                      type="file" 
                      accept=".xlsx, .xls, .csv" 
                      className="hidden" 
                      id="upload-cruzamento" 
                      onChange={(e) => handleFileUpload(e, "cruzamento")} 
                    />
                    <label htmlFor="upload-cruzamento">
                      <Button asChild variant="outline" className="w-full text-xs border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer">
                        <span>
                          <Upload className="w-3.5 h-3.5 mr-2" />
                          Importar Planilha
                        </span>
                      </Button>
                    </label>
                  </div>
                  <Button variant="ghost" className="text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-50" onClick={() => handleClearBase("cruzamento")}>
                    <Trash2 className="w-3.5 h-3.5 mr-1" /> Limpar Base
                  </Button>
                </div>

                <Button variant="link" className="text-xs text-sky-600 h-auto p-0 font-medium" onClick={() => handleDownloadTemplate("cruzamento")}>
                  <Download className="w-3 h-3 mr-1" /> Baixar Template Estruturado (.xlsx)
                </Button>
              </CardContent>
            </Card>

            {/* BASE 4: SERIAIS APLICADOS */}
            <Card className="border-slate-100 shadow-sm bg-white rounded-xl overflow-hidden">
              <CardHeader className="pb-4 border-b border-slate-100 bg-slate-50/50">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                      4. Seriais Aplicados no Sistema
                    </CardTitle>
                    <CardDescription className="text-xs mt-1">Equipamentos ativos na rede e vinculados ao assinante</CardDescription>
                  </div>
                  <div className="text-right">
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-100">
                      {aplicados.length} Linhas
                    </Badge>
                    <p className="text-[9px] text-slate-400 mt-1">Modificado: {uploadTimestamps.aplicados || "—"}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                <p className="text-xs text-slate-500 leading-relaxed">
                  Histórico de ativação dos seriais de rede contendo o assinante final (cliente), porta GPON conectada, alias e data de instalação.
                </p>

                <div className="flex flex-col sm:flex-row gap-2 pt-2">
                  <div className="flex-1 relative">
                    <input 
                      type="file" 
                      accept=".xlsx, .xls, .csv" 
                      className="hidden" 
                      id="upload-aplicados" 
                      onChange={(e) => handleFileUpload(e, "aplicados")} 
                    />
                    <label htmlFor="upload-aplicados">
                      <Button asChild variant="outline" className="w-full text-xs border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer">
                        <span>
                          <Upload className="w-3.5 h-3.5 mr-2" />
                          Importar Planilha
                        </span>
                      </Button>
                    </label>
                  </div>
                  <Button variant="ghost" className="text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-50" onClick={() => handleClearBase("aplicados")}>
                    <Trash2 className="w-3.5 h-3.5 mr-1" /> Limpar Base
                  </Button>
                </div>

                <Button variant="link" className="text-xs text-sky-600 h-auto p-0 font-medium" onClick={() => handleDownloadTemplate("aplicados")}>
                  <Download className="w-3 h-3 mr-1" /> Baixar Template Estruturado (.xlsx)
                </Button>
              </CardContent>
            </Card>

          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default RastreabilidadeOnt;
