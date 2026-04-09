import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import React, { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAccessTracking } from "@/hooks/useAccessTracking";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft, Plus, Trash2, Upload, FileSpreadsheet, Search, 
  ScanBarcode, CheckCircle2, AlertTriangle, AlertCircle, 
  RefreshCw, X, Check, BarChart3, ChevronRight, ClipboardCheck, 
  CornerDownRight, Filter, History, LayoutDashboard, Package, 
  UserCheck, Download, FileText, Save, Lock
} from "lucide-react";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { Html5Qrcode } from "html5-qrcode";

interface InventoryBaseItem {
  id: string;
  serial: string;
  modelo: string | null;
  codigo_material: string | null;
  nome_tecnico: string;
  matricula_tt: string;
  setor: string | null;
  supervisor: string | null;
  coordenador: string | null;
}

interface GroupedCategory {
  codigo: string;
  nome: string;
  items: InventoryBaseItem[];
  total: number;
  validated: number;
}

interface SubmissionItem {
  id?: string;
  serial: string;
  modelo: string | null;
  codigo_material: string | null;
  status: 'presente' | 'falta' | 'extra';
}

const Inventory = () => {
  const { user, profile, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { trackAction } = useAccessTracking("/inventario");
  const [inventoryLocked, setInventoryLocked] = useState<boolean | null>(null);

  useEffect(() => {
    supabase
      .from("app_settings" as any)
      .select("value")
      .eq("key", "inventory_locked")
      .maybeSingle()
      .then(({ data }: any) => {
        setInventoryLocked(data ? data.value === true : false);
      });
  }, []);

  const [activeTab, setActiveTab] = useState("colaborador");
  
  const [tt, setTt] = useState("");
  const [nomeTecnico, setNomeTecnico] = useState("");
  const [supervisor, setSupervisor] = useState("");
  const [coordenador, setCoordenador] = useState("");
  const [baseItems, setBaseItems] = useState<InventoryBaseItem[]>([]);
  const [submissionItems, setSubmissionItems] = useState<Record<string, 'presente' | 'falta' | null>>({});
  const [extraItems, setExtraItems] = useState<SubmissionItem[]>([]);
  const [loadingBase, setLoadingBase] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [existingSubmissionId, setExistingSubmissionId] = useState<string | null>(null);
  
  // Grouping State
  const [selectedCategory, setSelectedCategory] = useState<GroupedCategory | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Admin/Dashboard State
  const [activeAdminTab, setActiveAdminTab] = useState("tracking");
  const [uploading, setUploading] = useState(false);
  const [allSubmissions, setAllSubmissions] = useState<any[]>([]);
  const [allBaseTechnicians, setAllBaseTechnicians] = useState<any[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [basePreview, setBasePreview] = useState<any[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [submissionDetailsOpen, setSubmissionDetailsOpen] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState<any>(null);
  
  // Filters
  const [filterSupervisor, setFilterSupervisor] = useState("todos");
  const [filterCoordenador, setFilterCoordenador] = useState("todos");

  // Scanner & Dialog State
  const [scannerOpen, setScannerOpen] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [scannerContext, setScannerContext] = useState<{modelo: string, codigo: string | null} | null>(null);
  const [pendingSerial, setPendingSerial] = useState<{serial: string, modelo: string, codigo: string | null} | null>(null);

  useEffect(() => {
    trackAction("Acessou o Módulo de Inventário");
  }, []);

  // --- Colaborador Functions ---

  const handleFetchBase = async () => {
    if (!tt) return;
    setLoadingBase(true);
    try {
      const { data: baseData, error: baseError } = await (supabase.from as any)("inventory_base")
        .select("*")
        .eq("matricula_tt", tt.toUpperCase());

      if (baseError) throw baseError;
      
      setBaseItems(baseData || []);
      if (baseData && baseData.length > 0) {
        setNomeTecnico(baseData[0].nome_tecnico);
        setSupervisor(baseData[0].supervisor || "");
        setCoordenador(baseData[0].coordenador || "");
        
        // Check for existing submissions (drafts or finished)
        const { data: subData, error: subError } = await (supabase.from as any)("inventory_submissions")
          .select("*, inventory_submission_items(*)")
          .eq("matricula_tt", tt.toUpperCase())
          .maybeSingle();

        if (subError && subError.code !== 'PGRST116') throw subError; // IGNORE NOT FOUND

        const initial: Record<string, 'presente' | 'falta' | null> = {};
        
        if (subData) {
          if (subData.status === 'finalizado') {
            toast.info("Seu inventário já foi finalizado e submetido. Procure a gerência para reabertura.");
            setBaseItems([]); // Block the view to prevent edits
            return;
          }
          
          setExistingSubmissionId(subData.id);
          const extras: SubmissionItem[] = [];
          
          subData.inventory_submission_items?.forEach((i: any) => {
            if (i.status === 'extra') {
              extras.push({ serial: i.serial, modelo: i.modelo, codigo_material: i.codigo_material, status: 'extra' });
            } else {
              const bItem = baseData.find((b: any) => b.serial === i.serial);
              if (bItem) initial[bItem.id] = i.status as 'presente' | 'falta';
            }
          });
          
          baseData.forEach((item: any) => {
            if (initial[item.id] === undefined) initial[item.id] = null;
          });
          
          setSubmissionItems(initial);
          setExtraItems(extras);
          toast.success("Rascunho recuperado. Você pode continuar a validação.");
        } else {
          setExistingSubmissionId(null);
          setExtraItems([]);
          baseData.forEach((item: any) => { initial[item.id] = null; });
          setSubmissionItems(initial);
        }
      } else {
        toast.info("Nenhum item encontrado para esta matrícula.");
        setNomeTecnico("");
        setSupervisor("");
        setCoordenador("");
      }
    } catch (err: any) {
      toast.error("Erro ao carregar carga: " + err.message);
    } finally {
      setLoadingBase(false);
    }
  };

  const getGroupedItems = (): GroupedCategory[] => {
    const groups: Record<string, GroupedCategory> = {};
    
    baseItems.forEach(item => {
      const key = item.codigo_material || 'S/C';
      if (!groups[key]) {
        groups[key] = {
          codigo: key,
          nome: item.modelo || "Equipamento",
          items: [],
          total: 0,
          validated: 0
        };
      }
      groups[key].items.push(item);
      groups[key].total++;
      if (submissionItems[item.id] !== null) {
        groups[key].validated++;
      }
    });

    return Object.values(groups);
  };

  const handleStatusChange = (id: string, status: 'presente' | 'falta') => {
    setSubmissionItems(prev => ({ ...prev, [id]: status }));
  };

  const handleAddExtra = (serial: string, modelo: string, codigo: string | null = null) => {
    const upperSerial = serial.toUpperCase();
    // Check if it's already in base
    const inBase = baseItems.find(item => item.serial.toUpperCase() === upperSerial);
    if (inBase) {
      toast.warning("Este serial já consta na sua carga original. Marque-o como 'Possuo'.");
      return;
    }
    
    // Check if already in extras
    if (extraItems.find(item => item.serial === upperSerial)) {
      toast.error("Serial já adicionado.");
      return;
    }

    setExtraItems(prev => [...prev, { serial: upperSerial, modelo, codigo_material: codigo, status: 'extra' }]);
    toast.success("Item extra adicionado.");
  };

  const handleRemoveExtra = (index: number) => {
    setExtraItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmitInventory = async (isDraft = false) => {
    // Validate only if finishing
    if (!isDraft) {
      const incomplete = Object.values(submissionItems).some(val => val === null);
      if (incomplete) {
        const pendingCount = Object.values(submissionItems).filter(val => val === null).length;
        toast.error(`Atenção! Faltam ${pendingCount} itens da sua carga para serem validados. Revise todos antes de salvar.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      let subId = existingSubmissionId;

      if (!subId) {
        // Create new
        const { data: subData, error: subError } = await (supabase.from as any)("inventory_submissions")
          .insert({
            matricula_tt: tt.toUpperCase(),
            nome_tecnico: nomeTecnico,
            supervisor: supervisor,
            coordenador: coordenador,
            status: isDraft ? 'em_andamento' : 'finalizado',
            data_fim: isDraft ? null : new Date().toISOString(),
            user_id: user?.id
          })
          .select()
          .single();
        if (subError) throw subError;
        subId = subData.id;
        setExistingSubmissionId(subId);
      } else {
        // Update existing
        const { error: subError } = await (supabase.from as any)("inventory_submissions")
          .update({
             status: isDraft ? 'em_andamento' : 'finalizado',
             data_fim: isDraft ? null : new Date().toISOString(),
          })
          .eq("id", subId);
        if (subError) throw subError;
        
        await (supabase.from as any)("inventory_submission_items").delete().eq("submission_id", subId);
      }

      // Prepare items (we insert all that have a status)
      const finalItems: any[] = [];
      
      baseItems.forEach(item => {
        if (submissionItems[item.id]) {
          finalItems.push({
            submission_id: subId,
            serial: item.serial,
            modelo: item.modelo,
            codigo_material: item.codigo_material,
            status: submissionItems[item.id]
          });
        }
      });

      extraItems.forEach(item => {
        finalItems.push({
          submission_id: subId,
          serial: item.serial,
          modelo: item.modelo,
          codigo_material: item.codigo_material,
          status: 'extra'
        });
      });

      if (finalItems.length > 0) {
        const { error: itemsError } = await (supabase.from as any)("inventory_submission_items")
          .insert(finalItems);
        if (itemsError) throw itemsError;
      }

      if (isDraft) {
        toast.success("Progresso salvo com sucesso!");
      } else {
        toast.success("Inventário finalizado! O Termo de Responsabilidade será impresso.");
        
        setTimeout(() => {
          window.print();
          
          setTimeout(() => {
            setTt("");
            setBaseItems([]);
            setSubmissionItems({});
            setExtraItems([]);
            setNomeTecnico("");
            setSupervisor("");
            setCoordenador("");
            setExistingSubmissionId(null);
            setActiveTab("colaborador");
          }, 1000);
        }, 500);
      }
    } catch (err: any) {
      toast.error("Erro ao salvar: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // --- Admin Functions ---

  const handleReopenInventory = async (subId: string) => {
    if (!window.confirm("Atenção: Reabrir este inventário permitirá que o técnico edite a consolidação atual. Deseja continuar?")) return;
    
    try {
      const { error } = await (supabase.from as any)("inventory_submissions").update({ status: 'em_andamento' }).eq("id", subId);
      if (error) throw error;
      toast.success("Inventário reaberto com sucesso. O técnico já pode editá-lo novamente.");
      fetchDashboardData();
    } catch (err: any) {
      toast.error("Erro ao reabrir inventário: " + err.message);
    }
  };

  const downloadTemplate = () => {
    const templateData = [
      {
        "Serial": "Ex: SN123456",
        "Modelo": "Ex: ONT HG8245H",
        "Código": "Ex: 100200",
        "Nome Técnico": "João da Silva",
        "Matrícula TT": "TT12345",
        "Setor": "Operacional",
        "Supervisor": "Supervisor Exemplo",
        "Coordenador": "Coordenador Exemplo"
      }
    ];
    
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "modelo_importacao_inventario.xlsx");
  };

  const downloadInventoryResults = (format: 'xlsx' | 'csv') => {
    const dataToExport: any[] = [];

    allSubmissions.forEach(sub => {
      const tech = allBaseTechnicians.find(t => t.matricula_tt === sub.matricula_tt);
      const matchCoord = filterCoordenador === "todos" || tech?.coordenador === filterCoordenador;
      const matchSuper = filterSupervisor === "todos" || tech?.supervisor === filterSupervisor;

      if (!matchCoord || !matchSuper) return;

      if (sub.inventory_submission_items && sub.inventory_submission_items.length > 0) {
        sub.inventory_submission_items.forEach((item: any) => {
          dataToExport.push({
            "Data Envio": new Date(sub.data_fim || sub.data_inicio).toLocaleString('pt-BR'),
            "Técnico": sub.nome_tecnico,
            "Matrícula TT": sub.matricula_tt,
            "Supervisor": tech?.supervisor || sub.supervisor || "—",
            "Coordenador": tech?.coordenador || sub.coordenador || "—",
            "Serial": item.serial,
            "Modelo": item.modelo || "—",
            "Código Material": item.codigo_material || "—",
            "Status": item.status === 'presente' ? 'Possuo' : item.status === 'falta' ? 'Faltante' : 'Extra (Incluído)'
          });
        });
      }
    });

    if (dataToExport.length === 0) {
      toast.info("Nenhum dado para exportar com os filtros atuais.");
      return;
    }

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventário Tratado");
    
    const fileName = `resultado_inventario_${new Date().toISOString().split('T')[0]}`;
    
    if (format === 'xlsx') {
      XLSX.writeFile(wb, `${fileName}.xlsx`);
    } else {
      XLSX.writeFile(wb, `${fileName}.csv`, { bookType: 'csv' });
    }
    toast.success("Arquivo gerado com sucesso!");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      // Expected columns: Serial, Modelo, Código, Técnico, TT, Setor, Supervisor, Coordenador
      const mappedData = jsonData.map((row: any) => ({
        serial: String(row.Serial ?? row.serial ?? "").trim(),
        modelo: String(row.Modelo ?? row.modelo ?? "").trim(),
        codigo_material: String(row["Código"] ?? row["Codigo"] ?? row.codigo ?? "").trim(),
        nome_tecnico: String(row["Nome Técnico"] ?? row["Nome Tecnico"] ?? row.tecnico ?? row.Tecnico ?? "").trim(),
        matricula_tt: String(row["Matrícula TT"] ?? row["Matricula TT"] ?? row.tt ?? row.TT ?? "").trim().toUpperCase(),
        setor: String(row.Setor ?? row.setor ?? "").trim(),
        supervisor: String(row.Supervisor ?? row.supervisor ?? "").trim(),
        coordenador: String(row.Coordenador ?? row.coordenador ?? "").trim(),
      })).filter(item => item.serial && item.matricula_tt && item.nome_tecnico);

      if (mappedData.length === 0) {
        throw new Error("Nenhum dado válido encontrado na planilha.");
      }

      const { error: deleteError } = await (supabase.from as any)("inventory_base").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (deleteError) throw new Error("Erro ao limpar base antiga: " + deleteError.message);

      const chunkSize = 500;
      for (let i = 0; i < mappedData.length; i += chunkSize) {
        const chunk = mappedData.slice(i, i + chunkSize);
        const { error } = await (supabase.from as any)("inventory_base").insert(chunk);
        if (error) throw new Error("Falha ao inserir lote: " + error.message);
      }

      toast.success(`${mappedData.length} itens carregados com sucesso!`);
      fetchBasePreview();
    } catch (err: any) {
      toast.error("Erro no upload: " + err.message);
    } finally {
      setUploading(false);
      if (e.target) e.target.value = "";
    }
  };

  const fetchBasePreview = async () => {
    setLoadingPreview(true);
    try {
      const { data, error } = await (supabase.from as any)("inventory_base")
        .select("*")
        .order("nome_tecnico", { ascending: true })
        .limit(1000);
      if (error) throw error;
      setBasePreview(data || []);
    } catch (err: any) {
      toast.error("Erro ao carregar prévia da base: " + err.message);
    } finally {
      setLoadingPreview(false);
    }
  };

  const fetchDashboardData = async () => {
    setLoadingReports(true);
    try {
      const [submissionsRes, baseTechsRes] = await Promise.all([
        (supabase.from as any)("inventory_submissions")
          .select(`
            *,
            inventory_submission_items(*)
          `)
          .order("data_fim", { ascending: false }),
        (supabase.from as any)("inventory_base")
          .select("matricula_tt, nome_tecnico, supervisor, coordenador")
      ]);

      if (submissionsRes.error) throw submissionsRes.error;
      if (baseTechsRes.error) throw baseTechsRes.error;

      setAllSubmissions(submissionsRes.data || []);
      
      // Get unique technicians from base
      const techMap: Record<string, any> = {};
      (baseTechsRes.data || []).forEach((item: any) => {
        if (!techMap[item.matricula_tt]) {
          techMap[item.matricula_tt] = item;
        }
      });
      setAllBaseTechnicians(Object.values(techMap));

    } catch (err: any) {
      toast.error("Erro ao carregar dados do dashboard: " + err.message);
    } finally {
      setLoadingReports(false);
    }
  };

  useEffect(() => {
    if (activeTab === "admin" && (isAdmin || profile?.cargo === "Gerente" || profile?.cargo === "Coordenador" || profile?.cargo === "Supervisor")) {
      fetchDashboardData();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeAdminTab === "upload") {
      fetchBasePreview();
    }
  }, [activeAdminTab]);

  // --- Scanner Logic ---
  
  const startScanner = async (modelo = "ONT", codigo: string | null = null) => {
    setScannerContext({ modelo, codigo });
    setScannerOpen(true);
    setTimeout(async () => {
      try {
        const html5Qr = new Html5Qrcode("inventory-scanner");
        scannerRef.current = html5Qr;
        await html5Qr.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 150 } },
          (decodedText) => {
            stopScanner();
            setPendingSerial({ serial: decodedText, modelo, codigo });
          },
          () => {}
        );
      } catch (err) {
        toast.error("Erro ao acessar câmera.");
        setScannerOpen(false);
      }
    }, 300);
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current = null;
      } catch (_) {}
    }
    setScannerOpen(false);
  };

  // Show locked screen for non-admin users
  if (!isAdmin && inventoryLocked) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 text-center space-y-4">
        <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center">
          <Lock className="w-10 h-10 text-destructive" />
        </div>
        <h2 className="text-2xl font-bold text-foreground">Inventário Bloqueado</h2>
        <p className="text-muted-foreground max-w-md">
          O módulo de inventário está temporariamente fechado. Aguarde a liberação pelo administrador.
        </p>
      </div>
    );
  }

  return (
    <>
    <div className="bg-background print:hidden p-4 md:p-8 space-y-6">
      <div className="w-full space-y-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")} className="rounded-full">
                    <ArrowLeft className="w-5 h-5" />
                  </Button>
                  <h1 className="text-3xl font-bold tracking-tight text-primary">Mini Inventário</h1>
                </div>
                <p className="text-muted-foreground ml-12">Controle e validação de carga de ONTs e DROP</p>
              </div>

              <TabsList className="grid grid-cols-2 w-full md:w-[400px]">
                <TabsTrigger value="colaborador">Colaborador</TabsTrigger>
                <TabsTrigger value="admin" disabled={!isAdmin && profile?.cargo !== "Gerente" && profile?.cargo !== "Coordenador" && profile?.cargo !== "Supervisor"}>Admin</TabsTrigger>
              </TabsList>
            </header>

        <TabsContent value="colaborador" className="m-0 space-y-6">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle>Validar Minha Carga</CardTitle>
              <CardDescription>Informe sua matrícula TT para ver os equipamentos atribuídos a você.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-row gap-3 items-end">
                <div className="space-y-2 flex-1">
                  <Label>Matrícula TT</Label>
                  <Input 
                    placeholder="Ex: TT12345" 
                    value={tt} 
                    onChange={e => setTt(e.target.value.toUpperCase())}
                    onKeyDown={e => e.key === 'Enter' && handleFetchBase()}
                  />
                </div>
                <Button onClick={handleFetchBase} disabled={loadingBase || !tt}>
                  {loadingBase ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
                  Buscar
                </Button>
              </div>

              {nomeTecnico && (
                <div className="p-3 bg-primary/10 rounded-lg flex items-center gap-2 text-primary font-medium">
                  <CheckCircle2 className="w-5 h-5" />
                  Técnico: {nomeTecnico}
                </div>
              )}
            </CardContent>
          </Card>

          {baseItems.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {getGroupedItems().map((cat) => (
                <Card 
                  key={cat.codigo} 
                  className="cursor-pointer hover:border-primary/50 transition-all group"
                  onClick={() => {
                    setSelectedCategory(cat);
                    setIsDetailOpen(true);
                  }}
                >
                  <CardContent className="p-4 space-y-4">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Package className="w-4 h-4 text-primary" />
                          <p className="text-xs text-muted-foreground uppercase font-semibold">Código: {cat.codigo}</p>
                        </div>
                        <p className="text-lg font-bold leading-tight">{cat.nome}</p>
                      </div>
                      <div className={`px-2 py-1 rounded text-xs font-bold ${cat.validated === cat.total ? 'bg-success/20 text-success' : 'bg-primary/10 text-primary'}`}>
                        {cat.validated}/{cat.total}
                      </div>
                    </div>
                    
                    <div className="w-full bg-secondary/30 h-2 rounded-full overflow-hidden">
                      <div 
                        className="bg-primary h-full transition-all duration-500" 
                        style={{ width: `${(cat.validated / cat.total) * 100}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{cat.validated < cat.total ? 'Validação pendente' : 'Tudo validado'}</span>
                      <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {baseItems.length > 0 && (
            <Card className="border-dashed">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div>
                  <CardTitle className="text-md">Itens Extras</CardTitle>
                  <CardDescription>Adicione equipamentos que você possui mas não estão na lista.</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => startScanner("ONT", null)}>
                  <ScanBarcode className="w-4 h-4 mr-2" /> Bipar Serial
                </Button>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {extraItems.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-secondary/20 rounded-md border">
                      <div>
                        <p className="font-mono text-sm">{item.serial}</p>
                        <p className="text-xs text-muted-foreground">{item.modelo}</p>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => handleRemoveExtra(idx)}>
                        <X className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Input id="manual-serial" placeholder="Serial Manual" className="h-9" />
                    <Button onClick={() => {
                      const input = document.getElementById('manual-serial') as HTMLInputElement;
                      if (input.value) {
                        handleAddExtra(input.value, "ONT");
                        input.value = "";
                      }
                    }} size="sm">Adicionar</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {baseItems.length > 0 && (
            <div className="flex flex-col sm:flex-row justify-center gap-4 pt-4">
              <Button size="lg" variant="outline" className="w-full md:w-auto px-8 border-dashed" onClick={() => handleSubmitInventory(true)} disabled={submitting}>
                {submitting ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Salvar Rascunho
              </Button>
              <Button size="lg" className="w-full md:w-auto px-12" onClick={() => handleSubmitInventory(false)} disabled={submitting}>
                {submitting ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                Finalizar e Gerar Termo
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="admin" className="m-0 space-y-6">
          <Tabs value={activeAdminTab} onValueChange={setActiveAdminTab}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
              <TabsList>
                <TabsTrigger value="tracking">Acompanhamento</TabsTrigger>
                <TabsTrigger value="upload">Carga de Base</TabsTrigger>
              </TabsList>
              
              {activeAdminTab === "tracking" && (
                <div className="flex gap-2">
                  <Select value={filterCoordenador} onValueChange={setFilterCoordenador}>
                    <SelectTrigger className="w-[200px] h-9">
                      <Filter className="w-3 h-3 mr-2" />
                      <SelectValue placeholder="Coordenador" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos Coordenadores</SelectItem>
                      {Array.from(new Set(allBaseTechnicians.map(t => t.coordenador).filter(Boolean))).map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={filterSupervisor} onValueChange={setFilterSupervisor}>
                    <SelectTrigger className="w-[200px] h-9">
                      <Filter className="w-3 h-3 mr-2" />
                      <SelectValue placeholder="Supervisor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos Supervisores</SelectItem>
                      {Array.from(new Set(allBaseTechnicians.map(t => t.supervisor).filter(Boolean))).map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                    <Button variant="outline" size="sm" onClick={fetchDashboardData} disabled={loadingReports}>
                      <RefreshCw className={`w-4 h-4 ${loadingReports ? 'animate-spin' : ''}`} />
                    </Button>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="secondary" size="sm" disabled={allSubmissions.length === 0}>
                          <Download className="w-4 h-4 mr-2" /> Exportar
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onClick={() => downloadInventoryResults('xlsx')}>
                          <FileSpreadsheet className="w-4 h-4 mr-2" /> XLSX (Excel)
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => downloadInventoryResults('csv')}>
                          <FileText className="w-4 h-4 mr-2" /> CSV (Texto)
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
              )}
            </div>

            <TabsContent value="tracking" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="glass-card">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Inventários Fechados</p>
                        <h3 className="text-2xl font-bold">{allSubmissions.filter(s => {
                          const tech = allBaseTechnicians.find(t => t.matricula_tt === s.matricula_tt);
                          const matchCoord = filterCoordenador === "todos" || tech?.coordenador === filterCoordenador;
                          const matchSuper = filterSupervisor === "todos" || tech?.supervisor === filterSupervisor;
                          return matchCoord && matchSuper && s.status === 'finalizado';
                        }).length}</h3>
                      </div>
                      <div className="p-2 bg-success/10 rounded-full">
                        <ClipboardCheck className="w-5 h-5 text-success" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="glass-card">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Pendentes</p>
                        <h3 className="text-2xl font-bold">
                          {allBaseTechnicians.filter(t => {
                            const matchCoord = filterCoordenador === "todos" || t?.coordenador === filterCoordenador;
                            const matchSuper = filterSupervisor === "todos" || t?.supervisor === filterSupervisor;
                            const alreadyDone = allSubmissions.some(s => s.matricula_tt === t?.matricula_tt && s.status === 'finalizado');
                            return matchCoord && matchSuper && !alreadyDone;
                          }).length}</h3>
                      </div>
                      <div className="p-2 bg-warning/10 rounded-full">
                        <History className="w-5 h-5 text-warning" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="glass-card">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Itens Faltantes</p>
                        <h3 className="text-2xl font-bold">
                          {allSubmissions.reduce((acc, sub) => {
                            const tech = allBaseTechnicians.find(t => t.matricula_tt === sub.matricula_tt);
                            const matchCoord = filterCoordenador === "todos" || tech?.coordenador === filterCoordenador;
                            const matchSuper = filterSupervisor === "todos" || tech?.supervisor === filterSupervisor;
                            
                            if (matchCoord && matchSuper && sub.status === 'finalizado') {
                              return acc + (sub.inventory_submission_items?.filter((i: any) => i.status === 'falta')?.length || 0);
                            }
                            return acc;
                          }, 0)}
                        </h3>
                      </div>
                      <div className="p-2 bg-destructive/10 rounded-full">
                        <AlertCircle className="w-5 h-5 text-destructive" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="glass-card">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Novos Seriais</p>
                        <h3 className="text-2xl font-bold">
                          {allSubmissions.reduce((acc, sub) => {
                            const tech = allBaseTechnicians.find(t => t.matricula_tt === sub.matricula_tt);
                            const matchCoord = filterCoordenador === "todos" || tech?.coordenador === filterCoordenador;
                            const matchSuper = filterSupervisor === "todos" || tech?.supervisor === filterSupervisor;
                            
                            if (matchCoord && matchSuper && sub.status === 'finalizado') {
                              return acc + (sub.inventory_submission_items?.filter((i: any) => i.status === 'extra')?.length || 0);
                            }
                            return acc;
                          }, 0)}
                        </h3>
                      </div>
                      <div className="p-2 bg-blue-500/10 rounded-full">
                        <Plus className="w-5 h-5 text-blue-500" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Acompanhamento por Técnico</CardTitle>
                  <CardDescription>Status geral do inventário em tempo real.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Técnico</TableHead>
                        <TableHead>Supervisor</TableHead>
                        <TableHead>Coordenador</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Data/Hora</TableHead>
                        <TableHead className="text-right">Ação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allBaseTechnicians
                        .filter(t => {
                          const matchCoord = filterCoordenador === "todos" || t?.coordenador === filterCoordenador;
                          const matchSuper = filterSupervisor === "todos" || t?.supervisor === filterSupervisor;
                          return matchCoord && matchSuper;
                        })
                        .map(tech => {
                          const sub = allSubmissions.find(s => s.matricula_tt === tech?.matricula_tt);
                          return (
                            <TableRow key={tech?.matricula_tt}>
                              <TableCell>
                                <div className="font-medium">{tech?.nome_tecnico}</div>
                                <div className="text-xs text-muted-foreground font-mono">{tech?.matricula_tt}</div>
                              </TableCell>
                              <TableCell className="text-sm">{tech?.supervisor || "—"}</TableCell>
                              <TableCell className="text-sm">{tech?.coordenador || "—"}</TableCell>
                              <TableCell>
                                {sub?.status === 'finalizado' ? (
                                  <Badge className="bg-success text-success-foreground">Finalizado</Badge>
                                ) : sub?.status === 'em_andamento' ? (
                                  <Badge variant="secondary" className="border-warning text-warning">Em Andamento</Badge>
                                ) : (
                                  <Badge variant="outline" className="text-muted-foreground border-dashed">Pendente</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {sub?.status === 'finalizado' ? new Date(sub.data_fim).toLocaleString('pt-BR') : "—"}
                              </TableCell>
                              <TableCell className="text-right">
                                {sub && (
                                  <div className="flex items-center justify-end gap-2">
                                    <Button 
                                      size="sm" 
                                      variant="ghost"
                                      onClick={() => {
                                        setSelectedSubmission(sub);
                                        setSubmissionDetailsOpen(true);
                                      }}
                                    >
                                      Detalhes
                                    </Button>
                                    {sub.status === 'finalizado' && (
                                      <Button 
                                        size="sm" 
                                        variant="destructive" 
                                        className="h-8"
                                        onClick={() => handleReopenInventory(sub.id)}
                                        title="Desfazer e reabrir o inventário deste técnico"
                                      >
                                        Reabrir
                                      </Button>
                                    )}
                                  </div>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="upload" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Carga de Materiais (Administrador)</CardTitle>
                  <CardDescription>Importe a base de equipamentos esperada para cada técnico.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-8 space-y-4 hover:bg-secondary/10 transition-colors">
                    <Upload className="w-10 h-10 text-muted-foreground" />
                    <div className="text-center">
                      <p className="font-medium">Clique para fazer upload</p>
                      <p className="text-xs text-muted-foreground">O banco atual será limpo e substituído. Envie arquivo XLSX completo.</p>
                    </div>
                    <Input 
                      type="file" 
                      accept=".xlsx, .xls" 
                      className="hidden" 
                      id="base-upload" 
                      onChange={handleFileUpload}
                      disabled={uploading}
                    />
                    <div className="flex gap-4">
                      <Button asChild disabled={uploading}>
                        <label htmlFor="base-upload" className="cursor-pointer">
                          {uploading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                          Selecionar Planilha
                        </label>
                      </Button>
                      <Button variant="outline" onClick={downloadTemplate} disabled={uploading}>
                        <FileSpreadsheet className="w-4 h-4 mr-2" />
                        Baixar Modelo
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Base Atual (Visualização)</CardTitle>
                    <CardDescription>Visualizando os 1000 primeiros registros da base importada ativa.</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={fetchBasePreview} disabled={loadingPreview}>
                    <RefreshCw className={`w-4 h-4 mr-2 ${loadingPreview ? 'animate-spin' : ''}`} />
                    Atualizar Tabela
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border h-96 overflow-y-auto">
                    <Table>
                      <TableHeader className="bg-secondary/80 sticky top-0 backdrop-blur-sm shadow-sm">
                        <TableRow>
                          <TableHead>Técnico</TableHead>
                          <TableHead>Serial</TableHead>
                          <TableHead>Modelo</TableHead>
                          <TableHead>Cód. Material</TableHead>
                          <TableHead>Matrícula TT</TableHead>
                          <TableHead>Supervisor</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loadingPreview ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-8">
                              <RefreshCw className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                            </TableCell>
                          </TableRow>
                        ) : basePreview.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                              A base está vazia. Importe uma planilha para preenchê-la.
                            </TableCell>
                          </TableRow>
                        ) : (
                          basePreview.map((item, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="font-medium text-xs">{item.nome_tecnico}</TableCell>
                              <TableCell className="font-mono text-xs">{item.serial}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">{item.modelo || "—"}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">{item.codigo_material || "—"}</TableCell>
                              <TableCell className="text-xs font-mono text-muted-foreground">{item.matricula_tt}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">{item.supervisor || "—"}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>
      </div>

      {/* Dialog for Scanner */}
      <Dialog open={scannerOpen} onOpenChange={setScannerOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Escanear Código de Barras</DialogTitle>
            <DialogDescription>Posicione o serial da ONT dentro do quadro.</DialogDescription>
          </DialogHeader>
          <div id="inventory-scanner" className="w-full aspect-square bg-black rounded-lg overflow-hidden flex items-center justify-center">
            <RefreshCw className="w-10 h-10 animate-spin text-white opacity-20" />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={stopScanner}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog for Category Details (Drill-down) */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-primary" />
              {selectedCategory?.nome}
            </DialogTitle>
            <DialogDescription>
              Valide os seriais deste material (Código: {selectedCategory?.codigo})
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {selectedCategory?.items.map((item) => (
                <div 
                  key={item.id} 
                  className={`p-3 rounded-lg border transition-all flex items-center justify-between ${
                    submissionItems[item.id] === 'presente' ? 'bg-success/10 border-success/30' : 
                    submissionItems[item.id] === 'falta' ? 'bg-destructive/10 border-destructive/30' : 
                    'bg-secondary/20 border-border'
                  }`}
                >
                  <div>
                    <p className="font-mono text-sm font-bold">{item.serial}</p>
                    <p className="text-[10px] text-muted-foreground uppercase">Serial do sistema</p>
                  </div>
                  <div className="flex gap-1">
                    <Button 
                      size="sm" 
                      variant={submissionItems[item.id] === 'presente' ? 'default' : 'outline'}
                      className={`h-8 w-8 p-0 ${submissionItems[item.id] === 'presente' ? 'bg-success hover:bg-success/90' : ''}`}
                      onClick={() => handleStatusChange(item.id, 'presente')}
                    >
                      <Check className="w-4 h-4" />
                    </Button>
                    <Button 
                      size="sm" 
                      variant={submissionItems[item.id] === 'falta' ? 'destructive' : 'outline'}
                      className="h-8 w-8 p-0"
                      onClick={() => handleStatusChange(item.id, 'falta')}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}

              {/* Extras of this category */}
              {extraItems
                .filter(i => i.codigo_material === selectedCategory?.codigo)
                .map((item, idx) => (
                  <div key={`extra-${idx}`} className="p-3 rounded-lg border border-blue-500/30 bg-blue-500/10 flex items-center justify-between">
                    <div>
                      <p className="font-mono text-sm font-bold">{item.serial}</p>
                      <div className="flex items-center gap-1">
                        <Badge variant="outline" className="text-[8px] h-3 px-1 border-blue-500 text-blue-500">INCLUÍDA</Badge>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleRemoveExtra(extraItems.indexOf(item))}>
                      <X className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                ))}
            </div>

            <div className="pt-4 border-t border-dashed">
              <Label className="text-xs text-muted-foreground mb-2 block">Deseja incluir um novo serial neste grupo?</Label>
              <div className="flex gap-2">
                <Button variant="outline" size="icon" title="Escanear com Câmera" onClick={() => startScanner(selectedCategory?.nome || "ONT", selectedCategory?.codigo || null)}>
                  <ScanBarcode className="w-4 h-4" />
                </Button>
                <Input 
                  id="modal-extra-serial" 
                  placeholder="Novo Serial" 
                  className="h-9 font-mono" 
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const input = e.currentTarget;
                      if (input.value) {
                        handleAddExtra(input.value, selectedCategory?.nome || "ONT", selectedCategory?.codigo);
                        input.value = "";
                      }
                    }
                  }}
                />
                <Button size="sm" onClick={() => {
                  const input = document.getElementById('modal-extra-serial') as HTMLInputElement;
                  if (input.value) {
                    handleAddExtra(input.value, selectedCategory?.nome || "ONT", selectedCategory?.codigo);
                    input.value = "";
                  }
                }}>
                  <Plus className="w-4 h-4 mr-1" /> Incluir
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" className="w-full" onClick={() => setIsDetailOpen(false)}>
              Fechar Detalhamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Dialog for Confirming Read Serial */}
      <Dialog open={!!pendingSerial} onOpenChange={(open) => !open && setPendingSerial(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirme o Serial Lido</DialogTitle>
            <DialogDescription>A câmera identificou o seguinte código de barras:</DialogDescription>
          </DialogHeader>
          <div className="py-6 text-center bg-secondary/30 rounded-lg border-2 border-dashed">
            <p className="text-3xl font-mono tracking-widest font-bold text-foreground text-center break-all whitespace-normal px-2">
              {pendingSerial?.serial}
            </p>
          </div>
          <DialogFooter className="flex gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => {
              setPendingSerial(null);
              // optionally reopen scanner
              if (scannerContext) startScanner(scannerContext.modelo, scannerContext.codigo);
            }}>
              <X className="w-4 h-4 mr-1" /> Ler Novamente
            </Button>
            <Button onClick={() => {
              if (pendingSerial) {
                handleAddExtra(pendingSerial.serial, pendingSerial.modelo, pendingSerial.codigo);
                setPendingSerial(null);
                setIsDetailOpen(false); // fechar caso esteja na modal
              }
            }}>
              <Check className="w-4 h-4 mr-1" /> Salvar Serial
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog for Submission Details */}
      <Dialog open={submissionDetailsOpen} onOpenChange={setSubmissionDetailsOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes da Carga Inventariada</DialogTitle>
            <DialogDescription>
              Técnico: {selectedSubmission?.nome_tecnico} | Matrícula: {selectedSubmission?.matricula_tt}
            </DialogDescription>
          </DialogHeader>
          
          {selectedSubmission && (
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-success/10 p-4 rounded-xl border border-success/20 flex flex-col items-center justify-center">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Possui</p>
                  <p className="text-3xl font-black text-success">
                    {selectedSubmission.inventory_submission_items?.filter((i: any) => i.status === 'presente').length || 0}
                  </p>
                </div>
                <div className="bg-destructive/10 p-4 rounded-xl border border-destructive/20 flex flex-col items-center justify-center">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Faltantes</p>
                  <p className="text-3xl font-black text-destructive">
                    {selectedSubmission.inventory_submission_items?.filter((i: any) => i.status === 'falta').length || 0}
                  </p>
                </div>
                <div className="bg-blue-500/10 p-4 rounded-xl border border-blue-500/20 flex flex-col items-center justify-center">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Extras Bipados</p>
                  <p className="text-3xl font-black text-blue-500">
                    {selectedSubmission.inventory_submission_items?.filter((i: any) => i.status === 'extra').length || 0}
                  </p>
                </div>
              </div>

              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader className="bg-secondary/50">
                    <TableRow>
                      <TableHead>Serial</TableHead>
                      <TableHead>Modelo / Código</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedSubmission.inventory_submission_items?.map((item: any, idx: number) => (
                      <TableRow key={idx}>
                        <TableCell className="font-mono text-sm font-semibold">{item.serial}</TableCell>
                        <TableCell>
                          <div className="text-sm font-medium">{item.modelo || "—"}</div>
                          <div className="text-xs text-muted-foreground">Código: {item.codigo_material || "N/A"}</div>
                        </TableCell>
                        <TableCell>
                          {item.status === 'presente' ? <Badge className="bg-success text-success-foreground hover:bg-success">Possuo</Badge> :
                           item.status === 'falta' ? <Badge variant="destructive">Falta</Badge> :
                           <Badge className="bg-blue-500 text-white hover:bg-blue-600">Extra (Incluído)</Badge>}
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!selectedSubmission.inventory_submission_items || selectedSubmission.inventory_submission_items.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center py-6 text-muted-foreground">
                          Nenhum item foi processado nesse inventário.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
          
          
          <DialogFooter>
            <Button variant="outline" className="w-full sm:w-auto mt-2 sm:mt-0" onClick={() => window.print()}>
              <FileText className="w-4 h-4 mr-2" /> Imprimir Recibo
            </Button>
            <Button variant="secondary" className="w-full sm:w-auto" onClick={() => setSubmissionDetailsOpen(false)}>
              Fechar Formato
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>

    {/* Print Layout */}
    <div className="hidden print:block absolute inset-0 bg-white z-[9999] p-8 min-h-screen">
      <div className="max-w-4xl mx-auto space-y-6 text-black">
        {/* Print Header */}
        <div className="flex items-center justify-between border-b-2 border-black pb-4 mb-8">
          <div className="flex items-center gap-4">
            <img src="/ability-logo.png" alt="Ability" className="h-16 object-contain grayscale" />
            <div>
              <h1 className="text-xl font-bold uppercase tracking-widest text-black m-0">Portal Corporativo</h1>
              <p className="text-sm font-semibold uppercase text-black/70 m-0">Termo de Responsabilidade - Inventário</p>
            </div>
          </div>
          <div className="text-right text-xs">
            <p>Gerado em: {new Date().toLocaleString('pt-BR')}</p>
          </div>
        </div>

        {/* Statement */}
        <div className="text-justify text-sm mb-6 leading-relaxed">
          Declaro, para os devidos fins, que realizei a conferência dos equipamentos listados abaixo e assumo a responsabilidade pela guarda, conservação e correto uso dos materiais associados à minha matrícula que se encontram sob minha posse.
        </div>

        {/* User Info */}
        <div className="grid grid-cols-2 gap-4 mb-8 text-sm">
          <div><span className="font-bold">Técnico:</span> {nomeTecnico || selectedSubmission?.nome_tecnico}</div>
          <div><span className="font-bold">Matrícula TT:</span> {tt || selectedSubmission?.matricula_tt}</div>
          <div><span className="font-bold">Supervisor:</span> {supervisor || selectedSubmission?.supervisor || "—"}</div>
          <div><span className="font-bold">Coordenador:</span> {coordenador || selectedSubmission?.coordenador || "—"}</div>
        </div>

        {/* Items Table */}
        <div className="w-full mb-12">
          <h3 className="font-bold text-lg mb-2 border-b border-black">Equipamentos Inventariados</h3>
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-black/50">
                <th className="py-2 px-1">SERIAL</th>
                <th className="py-2 px-1">MODELO</th>
                <th className="py-2 px-1">CÓDIGO MATERIAL</th>
                <th className="py-2 px-1 text-right">STATUS</th>
              </tr>
            </thead>
            <tbody>
              {/* Combine base and extra items dynamically for print based on active state vs selected detail */}
              {(tt && baseItems.length > 0 ? [
                ...baseItems.map(item => ({
                  serial: item.serial,
                  modelo: item.modelo,
                  codigo: item.codigo_material,
                  status: submissionItems[item.id] === 'presente' ? 'Possuo' : submissionItems[item.id] === 'falta' ? 'Faltante' : 'Pendente'
                })).filter(i => i.status !== 'Pendente'), 
                ...extraItems.map(item => ({
                  serial: item.serial,
                  modelo: item.modelo,
                  codigo: item.codigo_material,
                  status: 'Extra (Possuo)'
                }))
              ] : (selectedSubmission?.inventory_submission_items || []).map((i: any) => ({
                  serial: i.serial,
                  modelo: i.modelo,
                  codigo: i.codigo_material,
                  status: i.status === 'presente' ? 'Possuo' : i.status === 'falta' ? 'Faltante' : 'Extra (Possuo)'
              }))).map((row, idx) => (
                <tr key={idx} className="border-b border-black/20">
                  <td className="py-1 px-1 font-mono uppercase">{row.serial}</td>
                  <td className="py-1 px-1 uppercase">{row.modelo || "—"}</td>
                  <td className="py-1 px-1">{row.codigo || "—"}</td>
                  <td className="py-1 px-1 text-right uppercase font-semibold">{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Signatures */}
        <div className="grid grid-cols-2 gap-12 mt-32 pt-8">
          <div className="text-center">
            <div className="border-t border-black w-full pt-2">
              <p className="font-bold uppercase text-sm">{nomeTecnico || selectedSubmission?.nome_tecnico || "Colaborador"}</p>
              <p className="text-xs">Técnico / Colaborador</p>
            </div>
          </div>
          <div className="text-center">
            <div className="border-t border-black w-full pt-2">
              <p className="font-bold uppercase text-sm">{supervisor || selectedSubmission?.supervisor || "Liderança"}</p>
              <p className="text-xs">Supervisor Operacional</p>
            </div>
          </div>
        </div>
      </div>
    </div>
    </>
  );
};

export default Inventory;
