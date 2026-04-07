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
  UserCheck, Download, FileText, Save
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
  
  // Colaborador State
  const [tt, setTt] = useState("");
  const [nomeTecnico, setNomeTecnico] = useState("");
  const [supervisor, setSupervisor] = useState("");
  const [coordenador, setCoordenador] = useState("");
  const [baseItems, setBaseItems] = useState<InventoryBaseItem[]>([]);
  const [submissionItems, setSubmissionItems] = useState<Record<string, 'presente' | 'falta' | null>>({});
  const [extraItems, setExtraItems] = useState<SubmissionItem[]>([]);
  const [loadingBase, setLoadingBase] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Grouping State
  const [selectedCategory, setSelectedCategory] = useState<GroupedCategory | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Admin/Dashboard State
  const [activeAdminTab, setActiveAdminTab] = useState("tracking");
  const [uploading, setUploading] = useState(false);
  const [allSubmissions, setAllSubmissions] = useState<any[]>([]);
  const [allBaseTechnicians, setAllBaseTechnicians] = useState<any[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);
  
  // Filters
  const [filterSupervisor, setFilterSupervisor] = useState("todos");
  const [filterCoordenador, setFilterCoordenador] = useState("todos");

  // Scanner State
  const [scannerOpen, setScannerOpen] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    trackAction("Acessou o Módulo de Inventário");
  }, []);

  // --- Colaborador Functions ---

  const handleFetchBase = async () => {
    if (!tt) return;
    setLoadingBase(true);
    try {
      const { data, error } = await (supabase.from as any)("inventory_base")
        .select("*")
        .eq("matricula_tt", tt.toUpperCase());

      if (error) throw error;
      
      setBaseItems(data || []);
      if (data && data.length > 0) {
        setNomeTecnico(data[0].nome_tecnico);
        setSupervisor(data[0].supervisor || "");
        setCoordenador(data[0].coordenador || "");
        // Initialize submission items
        const initial: Record<string, 'presente' | 'falta' | null> = {};
        data.forEach((item: any) => {
          initial[item.id] = null;
        });
        setSubmissionItems(initial);
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

  const handleSubmitInventory = async () => {
    // Validate: all base items must have a status
    const incomplete = Object.values(submissionItems).some(val => val === null);
    if (incomplete) {
      toast.error("Por favor, valide todos os itens da sua carga antes de finalizar.");
      return;
    }

    setSubmitting(true);
    try {
      // 1. Create submission record
      const { data: subData, error: subError } = await (supabase.from as any)("inventory_submissions")
        .insert({
          matricula_tt: tt.toUpperCase(),
          nome_tecnico: nomeTecnico,
          supervisor: supervisor,
          coordenador: coordenador,
          status: 'finalizado',
          data_fim: new Date().toISOString(),
          user_id: user?.id
        })
        .select()
        .single();

      if (subError) throw subError;

      // 2. Prepare all items
      const finalItems = [
        ...baseItems.map(item => ({
          submission_id: subData.id,
          serial: item.serial,
          modelo: item.modelo,
          codigo_material: item.codigo_material,
          status: submissionItems[item.id] as string
        })),
        ...extraItems.map(item => ({
          submission_id: subData.id,
          serial: item.serial,
          modelo: item.modelo,
          codigo_material: item.codigo_material,
          status: 'extra'
        }))
      ];

      // 3. Bulk insert
      const { error: itemsError } = await (supabase.from as any)("inventory_submission_items")
        .insert(finalItems);

      if (itemsError) throw itemsError;

      toast.success("Inventário finalizado com sucesso!");
      // Reset state
      setTt("");
      setBaseItems([]);
      setSubmissionItems({});
      setExtraItems([]);
      setNomeTecnico("");
      setSupervisor("");
      setCoordenador("");
      setActiveTab("colaborador");
    } catch (err: any) {
      toast.error("Erro ao salvar inventário: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // --- Admin Functions ---

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
            "Data Envio": new Date(sub.created_at).toLocaleString('pt-BR'),
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
        serial: String(row.Serial || row.serial || "").trim(),
        modelo: String(row.Modelo || row.modelo || "").trim(),
        codigo_material: String(row["Código"] || row["Codigo"] || row.codigo || "").trim(),
        nome_tecnico: String(row["Nome Técnico"] || row["Nome Tecnico"] || row.tecnico || "").trim(),
        matricula_tt: String(row["Matrícula TT"] || row["Matricula TT"] || row.tt || "").trim().toUpperCase(),
        setor: String(row.Setor || row.setor || "").trim(),
        supervisor: String(row.Supervisor || row.supervisor || "").trim(),
        coordenador: String(row.Coordenador || row.coordenador || "").trim(),
      })).filter(item => item.serial && item.matricula_tt);

      if (mappedData.length === 0) {
        throw new Error("Nenhum dado válido encontrado na planilha.");
      }

      // Optional: Clear old base? 
      // const { error: deleteError = await (supabase.from as any)("inventory_base").delete().neq("id", "00000000-0000-0000-0000-000000000000");

      const { error } = await (supabase.from as any)("inventory_base").insert(mappedData);
      if (error) throw error;

      toast.success(`${mappedData.length} itens carregados com sucesso!`);
    } catch (err: any) {
      toast.error("Erro no upload: " + err.message);
    } finally {
      setUploading(false);
      if (e.target) e.target.value = "";
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
          .order("created_at", { ascending: false }),
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

  // --- Scanner Logic ---
  
  const startScanner = async () => {
    setScannerOpen(true);
    setTimeout(async () => {
      try {
        const html5Qr = new Html5Qrcode("inventory-scanner");
        scannerRef.current = html5Qr;
        await html5Qr.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 150 } },
          (decodedText) => {
            handleAddExtra(decodedText, "ONT"); // Default model
            stopScanner();
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

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 space-y-6">
      <div className="max-w-7xl mx-auto space-y-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")} className="rounded-full">
                    <ArrowLeft className="w-5 h-5" />
                  </Button>
                  <h1 className="text-3xl font-bold tracking-tight text-primary">Mini Inventário</h1>
                </div>
                <p className="text-muted-foreground ml-12">Controle e validação de carga de ONTs</p>
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
                <Button variant="outline" size="sm" onClick={startScanner}>
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
            <div className="flex justify-center pt-4">
              <Button size="lg" className="w-full md:w-auto px-12" onClick={handleSubmitInventory} disabled={submitting}>
                {submitting ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                Finalizar Inventário
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
                          return matchCoord && matchSuper;
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
                            const alreadyDone = allSubmissions.some(s => s.matricula_tt === t?.matricula_tt);
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
                            
                            if (matchCoord && matchSuper) {
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
                            
                            if (matchCoord && matchSuper) {
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
                                {sub ? (
                                  <Badge className="bg-success text-success-foreground">Finalizado</Badge>
                                ) : (
                                  <Badge variant="outline" className="text-muted-foreground border-dashed">Pendente</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {sub ? new Date(sub.data_fim).toLocaleString('pt-BR') : "—"}
                              </TableCell>
                              <TableCell className="text-right">
                                {sub && (
                                  <Button size="sm" variant="ghost">Ver Detalhes</Button>
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
                      <p className="text-xs text-muted-foreground">XLSX com Serial, Modelo, Código, TT, Técnico, Supervisor, etc.</p>
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
                        Baixar Modelo (.xlsx)
                      </Button>
                    </div>
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
    </div>
  );
};

export default Inventory;
