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
  UserCheck, Download, FileText, Save, Lock, BookOpen
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

interface CatalogItem {
  id: string;
  codigo: string;
  nome_material: string;
  segmento: string;
}

// Materials that REQUIRE serial number
const SERIAL_REQUIRED_KEYWORDS = ['ONT', 'DROP', 'EDD', 'TRANSCEIVER'];

const requiresSerial = (nomeMaterial: string): boolean => {
  const upper = nomeMaterial.toUpperCase();
  return SERIAL_REQUIRED_KEYWORDS.some(kw => upper.includes(kw));
};

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

  // Catalog State
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogUploadLoading, setCatalogUploadLoading] = useState(false);
  const [catalogPreview, setCatalogPreview] = useState<CatalogItem[]>([]);

  // Add Extra via Catalog Dialog
  const [addExtraDialogOpen, setAddExtraDialogOpen] = useState(false);
  const [catalogSegmentoFilter, setCatalogSegmentoFilter] = useState("todos");
  const [catalogSearchQuery, setCatalogSearchQuery] = useState("");
  const [selectedCatalogItem, setSelectedCatalogItem] = useState<CatalogItem | null>(null);
  const [extraSerial, setExtraSerial] = useState("");
  const [addExtraContext, setAddExtraContext] = useState<{ fromCategory?: GroupedCategory } | null>(null);
  const [extraQuantity, setExtraQuantity] = useState(1);
  const [extraSerials, setExtraSerials] = useState<string[]>([]);

  // Dashboard card filter
  const [dashboardFilter, setDashboardFilter] = useState<'todos' | 'fechados' | 'andamento' | 'base' | 'pendentes'>('todos');

  useEffect(() => {
    trackAction("Acessou o Módulo de Inventário");
  }, []);

  // Fetch catalog on mount
  useEffect(() => {
    fetchCatalog();
  }, []);

  const fetchCatalog = async () => {
    try {
      const { data, error } = await (supabase.from as any)("materiais_inventario")
        .select("*")
        .order("segmento", { ascending: true });
      if (error) throw error;
      setCatalogItems(data || []);
    } catch (err: any) {
      console.error("Erro ao carregar catálogo:", err.message);
    }
  };

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
        
        const { data: subData, error: subError } = await (supabase.from as any)("inventory_submissions")
          .select("*, inventory_submission_items(*)")
          .eq("matricula_tt", tt.toUpperCase())
          .maybeSingle();

        if (subError && subError.code !== 'PGRST116') throw subError;

        const initial: Record<string, 'presente' | 'falta' | null> = {};
        
        if (subData) {
          if (subData.status === 'finalizado') {
            toast.info("Seu inventário já foi finalizado e submetido. Procure a gerência para reabertura.");
            setBaseItems([]);
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
    const inBase = baseItems.find(item => item.serial.toUpperCase() === upperSerial);
    if (inBase) {
      toast.warning("Este serial já consta na sua carga original. Marque-o como 'Possuo'.");
      return;
    }
    
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

  // Add extra via catalog selection
  const handleAddExtraFromCatalog = () => {
    if (!selectedCatalogItem) {
      toast.error("Selecione um material do catálogo.");
      return;
    }

    const needsSerial = requiresSerial(selectedCatalogItem.nome_material);
    const qty = Math.max(1, extraQuantity);

    if (needsSerial) {
      // Validate all serials are filled
      const serials = extraSerials.slice(0, qty);
      const emptyIdx = serials.findIndex(s => !s.trim());
      if (emptyIdx !== -1 || serials.length < qty) {
        toast.error(`Preencha todos os ${qty} seriais obrigatórios antes de incluir.`);
        return;
      }

      // Check duplicates
      for (const s of serials) {
        const upper = s.trim().toUpperCase();
        if (baseItems.find(item => item.serial.toUpperCase() === upper)) {
          toast.warning(`Serial ${upper} já consta na carga original.`);
          return;
        }
        if (extraItems.find(item => item.serial === upper)) {
          toast.error(`Serial ${upper} já foi adicionado.`);
          return;
        }
      }

      // Check for duplicates within the batch
      const upperSerials = serials.map(s => s.trim().toUpperCase());
      const uniqueSet = new Set(upperSerials);
      if (uniqueSet.size !== upperSerials.length) {
        toast.error("Há seriais duplicados na lista. Corrija antes de incluir.");
        return;
      }

      // Add all items
      const newItems: SubmissionItem[] = upperSerials.map(s => ({
        serial: s,
        modelo: selectedCatalogItem.nome_material,
        codigo_material: selectedCatalogItem.codigo,
        status: 'extra' as const
      }));
      setExtraItems(prev => [...prev, ...newItems]);
    } else {
      // No serial required - add qty items
      const newItems: SubmissionItem[] = [];
      for (let i = 0; i < qty; i++) {
        newItems.push({
          serial: `SEM-SERIAL-${Date.now()}-${i}`,
          modelo: selectedCatalogItem.nome_material,
          codigo_material: selectedCatalogItem.codigo,
          status: 'extra'
        });
      }
      setExtraItems(prev => [...prev, ...newItems]);
    }

    toast.success(`${qty} item(ns) incluído(s) com sucesso!`);
    setSelectedCatalogItem(null);
    setExtraSerial("");
    setExtraSerials([]);
    setExtraQuantity(1);
    setCatalogSearchQuery("");
    setAddExtraDialogOpen(false);
  };

  const openAddExtraDialog = (fromCategory?: GroupedCategory) => {
    setAddExtraContext(fromCategory ? { fromCategory } : null);
    setSelectedCatalogItem(null);
    setExtraSerial("");
    setExtraSerials([]);
    setExtraQuantity(1);
    setCatalogSearchQuery("");
    setCatalogSegmentoFilter("todos");
    setAddExtraDialogOpen(true);
  };

  const handleSubmitInventory = async (isDraft = false) => {
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
        const { error: subError } = await (supabase.from as any)("inventory_submissions")
          .update({
             status: isDraft ? 'em_andamento' : 'finalizado',
             data_fim: isDraft ? null : new Date().toISOString(),
          })
          .eq("id", subId);
        if (subError) throw subError;
        
        await (supabase.from as any)("inventory_submission_items").delete().eq("submission_id", subId);
      }

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

  const downloadCatalogTemplate = () => {
    const templateData = [
      { "Código": "100200", "Material": "ONT HG8245H", "Segmento": "Fibra" },
      { "Código": "100300", "Material": "Cabo Drop 1FO", "Segmento": "Cabos" },
    ];
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Catálogo");
    XLSX.writeFile(wb, "modelo_catalogo_materiais.xlsx");
  };

  const handleCatalogUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCatalogUploadLoading(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      const mapped = jsonData.map((row: any) => ({
        codigo: String(row["Código"] ?? row["Codigo"] ?? row.codigo ?? row.CodMaterial ?? row.codmaterial ?? "").trim(),
        nome_material: String(row["Material"] ?? row["Nome Material"] ?? row.material ?? row.nome_material ?? row.Nome ?? row.nome ?? "").trim(),
        segmento: String(row["Segmento"] ?? row.segmento ?? row.Segmento ?? "").trim(),
      })).filter((item: any) => item.codigo && item.nome_material);

      if (mapped.length === 0) {
        throw new Error("Nenhum dado válido. Verifique as colunas: Código, Material, Segmento.");
      }

      // Clear existing catalog
      await (supabase.from as any)("materiais_inventario").delete().neq("id", "00000000-0000-0000-0000-000000000000");

      // Insert in chunks
      const chunkSize = 500;
      for (let i = 0; i < mapped.length; i += chunkSize) {
        const chunk = mapped.slice(i, i + chunkSize);
        const { error } = await (supabase.from as any)("materiais_inventario").insert(chunk);
        if (error) throw error;
      }

      toast.success(`${mapped.length} materiais carregados no catálogo!`);
      fetchCatalog();
      fetchCatalogPreview();
    } catch (err: any) {
      toast.error("Erro no upload do catálogo: " + err.message);
    } finally {
      setCatalogUploadLoading(false);
      if (e.target) e.target.value = "";
    }
  };

  const fetchCatalogPreview = async () => {
    setCatalogLoading(true);
    try {
      const { data, error } = await (supabase.from as any)("materiais_inventario")
        .select("*")
        .order("segmento", { ascending: true })
        .limit(1000);
      if (error) throw error;
      setCatalogPreview(data || []);
    } catch (err: any) {
      toast.error("Erro ao carregar catálogo: " + err.message);
    } finally {
      setCatalogLoading(false);
    }
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

      const { data: finalizedSubs, error: subError } = await (supabase.from as any)("inventory_submissions")
        .select("matricula_tt")
        .eq("status", "finalizado");
      
      if (subError) throw new Error("Erro ao verificar inventários finalizados: " + subError.message);
      
      const protectedMatriculas = new Set((finalizedSubs || []).map((s: any) => s.matricula_tt));
      
      const newDataForProtected = mappedData.filter(item => protectedMatriculas.has(item.matricula_tt));
      const newDataForUnprotected = mappedData.filter(item => !protectedMatriculas.has(item.matricula_tt));

      if (protectedMatriculas.size > 0) {
        const { data: allBase } = await (supabase.from as any)("inventory_base")
          .select("id, matricula_tt");
        
        const idsToDelete = (allBase || [])
          .filter((item: any) => !protectedMatriculas.has(item.matricula_tt))
          .map((item: any) => item.id);
        
        if (idsToDelete.length > 0) {
          const chunkSize = 500;
          for (let i = 0; i < idsToDelete.length; i += chunkSize) {
            const chunk = idsToDelete.slice(i, i + chunkSize);
            await (supabase.from as any)("inventory_base").delete().in("id", chunk);
          }
        }
      } else {
        const { error: deleteError } = await (supabase.from as any)("inventory_base").delete().neq("id", "00000000-0000-0000-0000-000000000000");
        if (deleteError) throw new Error("Erro ao limpar base antiga: " + deleteError.message);
      }

      const dataToInsert = newDataForUnprotected;
      
      const chunkSize = 500;
      for (let i = 0; i < dataToInsert.length; i += chunkSize) {
        const chunk = dataToInsert.slice(i, i + chunkSize);
        const { error } = await (supabase.from as any)("inventory_base").insert(chunk);
        if (error) throw new Error("Falha ao inserir lote: " + error.message);
      }

      const skippedCount = newDataForProtected.length;
      const insertedCount = dataToInsert.length;
      
      if (skippedCount > 0) {
        toast.success(`${insertedCount} itens carregados. ${skippedCount} itens de técnicos já inventariados foram preservados.`);
      } else {
        toast.success(`${insertedCount} itens carregados com sucesso!`);
      }
      
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
          .select(`*, inventory_submission_items(*)`)
          .order("data_fim", { ascending: false }),
        (supabase.from as any)("inventory_base")
          .select("matricula_tt, nome_tecnico, supervisor, coordenador")
      ]);

      if (submissionsRes.error) throw submissionsRes.error;
      if (baseTechsRes.error) throw baseTechsRes.error;

      setAllSubmissions(submissionsRes.data || []);
      
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
    if (activeAdminTab === "catalogo") {
      fetchCatalogPreview();
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

  // Catalog filtering
  const catalogSegmentos = Array.from(new Set(catalogItems.map(c => c.segmento).filter(Boolean)));
  
  const filteredCatalog = catalogItems.filter(item => {
    const matchSeg = catalogSegmentoFilter === "todos" || item.segmento === catalogSegmentoFilter;
    const query = catalogSearchQuery.toLowerCase();
    const matchSearch = !query || item.codigo.toLowerCase().includes(query) || item.nome_material.toLowerCase().includes(query);
    return matchSeg && matchSearch;
  });

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
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")} className="rounded-full">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-foreground">Inventário de Materiais</h1>
                  <p className="text-sm text-muted-foreground">Conferência e validação de equipamentos</p>
                </div>
              </div>

              <TabsList className="grid grid-cols-2 w-full md:w-[320px]">
                <TabsTrigger value="colaborador">Minha Carga</TabsTrigger>
                <TabsTrigger value="admin" disabled={!isAdmin && profile?.cargo !== "Gerente" && profile?.cargo !== "Coordenador" && profile?.cargo !== "Supervisor"}>Gestão</TabsTrigger>
              </TabsList>
            </header>

        <TabsContent value="colaborador" className="m-0 space-y-6">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="flex flex-row gap-3 items-end">
                <div className="space-y-2 flex-1">
                  <Label className="text-sm font-medium">Matrícula TT</Label>
                  <Input 
                    placeholder="Digite sua matrícula (ex: TT12345)" 
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
                <div className="p-3 bg-primary/10 rounded-lg flex items-center gap-2 text-primary font-medium text-sm">
                  <UserCheck className="w-4 h-4" />
                  {nomeTecnico} {supervisor && <span className="text-muted-foreground font-normal">• Sup: {supervisor}</span>}
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
                  <CardDescription>Equipamentos que você possui mas não estão na sua carga.</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => openAddExtraDialog()}>
                    <BookOpen className="w-4 h-4 mr-2" /> Incluir do Catálogo
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => startScanner("ONT", null)}>
                    <ScanBarcode className="w-4 h-4 mr-2" /> Bipar Serial
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {extraItems.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-secondary/20 rounded-md border">
                      <div>
                        <p className="font-mono text-sm">{item.serial.startsWith('SEM-SERIAL-') ? '(Sem Serial)' : item.serial}</p>
                        <p className="text-xs text-muted-foreground">{item.modelo} {item.codigo_material && `• ${item.codigo_material}`}</p>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => handleRemoveExtra(idx)}>
                        <X className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                  {extraItems.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">Nenhum item extra adicionado.</p>
                  )}
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
                {isAdmin && <TabsTrigger value="catalogo">Catálogo Materiais</TabsTrigger>}
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
                        <p className="text-sm font-medium text-muted-foreground">Em Andamento</p>
                        <h3 className="text-2xl font-bold">{allSubmissions.filter(s => {
                          const tech = allBaseTechnicians.find(t => t.matricula_tt === s.matricula_tt);
                          const matchCoord = filterCoordenador === "todos" || tech?.coordenador === filterCoordenador;
                          const matchSuper = filterSupervisor === "todos" || tech?.supervisor === filterSupervisor;
                          return matchCoord && matchSuper && s.status === 'em_andamento';
                        }).length}</h3>
                      </div>
                      <div className="p-2 bg-primary/10 rounded-full">
                        <History className="w-5 h-5 text-primary" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="glass-card">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Técnicos na Base</p>
                        <h3 className="text-2xl font-bold">{
                          allBaseTechnicians.filter(t => {
                            const matchCoord = filterCoordenador === "todos" || t.coordenador === filterCoordenador;
                            const matchSuper = filterSupervisor === "todos" || t.supervisor === filterSupervisor;
                            return matchCoord && matchSuper;
                          }).length
                        }</h3>
                      </div>
                      <div className="p-2 bg-secondary rounded-full">
                        <UserCheck className="w-5 h-5 text-secondary-foreground" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="glass-card">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Pendentes</p>
                        <h3 className="text-2xl font-bold">{(() => {
                          const filteredTechs = allBaseTechnicians.filter(t => {
                            const matchCoord = filterCoordenador === "todos" || t.coordenador === filterCoordenador;
                            const matchSuper = filterSupervisor === "todos" || t.supervisor === filterSupervisor;
                            return matchCoord && matchSuper;
                          });
                          const submittedMatriculas = new Set(allSubmissions.map(s => s.matricula_tt));
                          return filteredTechs.filter(t => !submittedMatriculas.has(t.matricula_tt)).length;
                        })()}</h3>
                      </div>
                      <div className="p-2 bg-destructive/10 rounded-full">
                        <AlertCircle className="w-5 h-5 text-destructive" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Inventários Submetidos</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border h-96 overflow-y-auto">
                    <Table>
                      <TableHeader className="bg-secondary/80 sticky top-0 backdrop-blur-sm shadow-sm">
                        <TableRow>
                          <TableHead>Técnico</TableHead>
                          <TableHead>Matrícula TT</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Data</TableHead>
                          <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {allSubmissions
                          .filter(s => {
                            const tech = allBaseTechnicians.find(t => t.matricula_tt === s.matricula_tt);
                            const matchCoord = filterCoordenador === "todos" || tech?.coordenador === filterCoordenador;
                            const matchSuper = filterSupervisor === "todos" || tech?.supervisor === filterSupervisor;
                            return matchCoord && matchSuper;
                          })
                          .map((sub) => (
                            <TableRow key={sub.id}>
                              <TableCell className="font-medium text-sm">{sub.nome_tecnico}</TableCell>
                              <TableCell className="font-mono text-xs">{sub.matricula_tt}</TableCell>
                              <TableCell>
                                {sub.status === 'finalizado' ? (
                                  <Badge className="bg-success text-success-foreground hover:bg-success">Finalizado</Badge>
                                ) : (
                                  <Badge variant="outline" className="text-primary border-primary">Em Andamento</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {new Date(sub.data_fim || sub.data_inicio).toLocaleString('pt-BR')}
                              </TableCell>
                              <TableCell className="text-right space-x-2">
                                <Button variant="ghost" size="sm" onClick={() => {
                                  setSelectedSubmission(sub);
                                  setSubmissionDetailsOpen(true);
                                }}>
                                  <Search className="w-4 h-4 mr-1" /> Detalhes
                                </Button>
                                {isAdmin && sub.status === 'finalizado' && (
                                  <Button variant="outline" size="sm" onClick={() => handleReopenInventory(sub.id)}>
                                    <RefreshCw className="w-4 h-4 mr-1" /> Reabrir
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
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

            {/* Catalog Admin Tab */}
            {isAdmin && (
              <TabsContent value="catalogo" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Catálogo de Materiais Disponíveis</CardTitle>
                    <CardDescription>Importe a lista de materiais disponíveis para inclusão no inventário (Código, Material, Segmento).</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-8 space-y-4 hover:bg-secondary/10 transition-colors">
                      <BookOpen className="w-10 h-10 text-muted-foreground" />
                      <div className="text-center">
                        <p className="font-medium">Fazer upload do catálogo</p>
                        <p className="text-xs text-muted-foreground">Colunas esperadas: Código, Material, Segmento. O catálogo anterior será substituído.</p>
                      </div>
                      <Input 
                        type="file" 
                        accept=".xlsx, .xls" 
                        className="hidden" 
                        id="catalog-upload" 
                        onChange={handleCatalogUpload}
                        disabled={catalogUploadLoading}
                      />
                      <div className="flex gap-4">
                        <Button asChild disabled={catalogUploadLoading}>
                          <label htmlFor="catalog-upload" className="cursor-pointer">
                            {catalogUploadLoading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                            Selecionar Planilha
                          </label>
                        </Button>
                        <Button variant="outline" onClick={downloadCatalogTemplate}>
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
                      <CardTitle>Catálogo Atual</CardTitle>
                      <CardDescription>{catalogPreview.length} materiais cadastrados</CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={fetchCatalogPreview} disabled={catalogLoading}>
                      <RefreshCw className={`w-4 h-4 mr-2 ${catalogLoading ? 'animate-spin' : ''}`} />
                      Atualizar
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-md border h-96 overflow-y-auto">
                      <Table>
                        <TableHeader className="bg-secondary/80 sticky top-0 backdrop-blur-sm shadow-sm">
                          <TableRow>
                            <TableHead>Código</TableHead>
                            <TableHead>Material</TableHead>
                            <TableHead>Segmento</TableHead>
                            <TableHead>Serial Obrig.</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {catalogLoading ? (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center py-8">
                                <RefreshCw className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                              </TableCell>
                            </TableRow>
                          ) : catalogPreview.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                                Nenhum material no catálogo. Importe uma planilha.
                              </TableCell>
                            </TableRow>
                          ) : (
                            catalogPreview.map((item, idx) => (
                              <TableRow key={idx}>
                                <TableCell className="font-mono text-xs">{item.codigo}</TableCell>
                                <TableCell className="text-xs font-medium">{item.nome_material}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">{item.segmento || "—"}</TableCell>
                                <TableCell>
                                  {requiresSerial(item.nome_material) ? (
                                    <Badge variant="destructive" className="text-[10px]">Sim</Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-[10px]">Não</Badge>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            )}
          </Tabs>
        </TabsContent>
      </Tabs>
      </div>

      {/* Dialog for Scanner */}
      <Dialog open={scannerOpen} onOpenChange={setScannerOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Escanear Código de Barras</DialogTitle>
            <DialogDescription>Posicione o serial dentro do quadro.</DialogDescription>
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
                      <p className="font-mono text-sm font-bold">{item.serial.startsWith('SEM-SERIAL-') ? '(Sem Serial)' : item.serial}</p>
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
              <Label className="text-xs text-muted-foreground mb-2 block">Incluir material neste grupo ou do catálogo:</Label>
              <div className="flex gap-2">
                <Button variant="outline" size="icon" title="Escanear com Câmera" onClick={() => startScanner(selectedCategory?.nome || "ONT", selectedCategory?.codigo || null)}>
                  <ScanBarcode className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => { setIsDetailOpen(false); openAddExtraDialog(selectedCategory || undefined); }}>
                  <BookOpen className="w-4 h-4 mr-1" /> Incluir do Catálogo
                </Button>
                <Input 
                  id="modal-extra-serial" 
                  placeholder="Serial avulso" 
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
                  <Plus className="w-4 h-4" />
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

      {/* Dialog for Adding Extra via Catalog */}
      <Dialog open={addExtraDialogOpen} onOpenChange={setAddExtraDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary" />
              Incluir Material do Catálogo
            </DialogTitle>
            <DialogDescription>
              Selecione o segmento para filtrar, depois busque pelo código ou nome do material.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            {/* Step 1: Segment filter */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Segmento</Label>
              <Select value={catalogSegmentoFilter} onValueChange={(v) => { setCatalogSegmentoFilter(v); setSelectedCatalogItem(null); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o segmento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os Segmentos</SelectItem>
                  {catalogSegmentos.map(seg => (
                    <SelectItem key={seg} value={seg}>{seg}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Step 2: Search */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Buscar Material</Label>
              <Input 
                placeholder="Digite o código ou nome do material..." 
                value={catalogSearchQuery}
                onChange={e => { setCatalogSearchQuery(e.target.value); setSelectedCatalogItem(null); }}
              />
            </div>

            {/* Step 3: Results */}
            <div className="rounded-md border max-h-48 overflow-y-auto">
              {filteredCatalog.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {catalogItems.length === 0 ? "Catálogo vazio. Peça ao administrador para importar." : "Nenhum material encontrado."}
                </p>
              ) : (
                <Table>
                  <TableHeader className="bg-secondary/50 sticky top-0">
                    <TableRow>
                      <TableHead className="text-xs">Código</TableHead>
                      <TableHead className="text-xs">Material</TableHead>
                      <TableHead className="text-xs">Segmento</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCatalog.slice(0, 50).map(item => (
                      <TableRow 
                        key={item.id} 
                        className={`cursor-pointer transition-colors ${selectedCatalogItem?.id === item.id ? 'bg-primary/10' : 'hover:bg-secondary/30'}`}
                        onClick={() => { setSelectedCatalogItem(item); setExtraSerial(""); }}
                      >
                        <TableCell className="font-mono text-xs py-2">{item.codigo}</TableCell>
                        <TableCell className="text-xs py-2 font-medium">{item.nome_material}</TableCell>
                        <TableCell className="text-xs py-2 text-muted-foreground">{item.segmento}</TableCell>
                      </TableRow>
                    ))}
                    {filteredCatalog.length > 50 && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-xs text-muted-foreground py-2">
                          Mostrando 50 de {filteredCatalog.length}. Refine sua busca.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </div>

            {/* Step 4: Selected item + Serial */}
            {selectedCatalogItem && (
              <div className="space-y-3 p-3 bg-primary/5 rounded-lg border border-primary/20">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold">{selectedCatalogItem.nome_material}</p>
                    <p className="text-xs text-muted-foreground">Código: {selectedCatalogItem.codigo} • {selectedCatalogItem.segmento}</p>
                  </div>
                  {requiresSerial(selectedCatalogItem.nome_material) && (
                    <Badge variant="destructive" className="text-[10px]">Serial Obrigatório</Badge>
                  )}
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-medium">
                    Serial {requiresSerial(selectedCatalogItem.nome_material) ? "(Obrigatório)" : "(Opcional)"}
                  </Label>
                  <div className="flex gap-2">
                    <Input 
                      placeholder={requiresSerial(selectedCatalogItem.nome_material) ? "Informe o serial obrigatoriamente" : "Deixe vazio se não tiver serial"}
                      value={extraSerial}
                      onChange={e => setExtraSerial(e.target.value.toUpperCase())}
                      className="font-mono h-9"
                    />
                    <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" title="Bipar Serial" onClick={() => {
                      setAddExtraDialogOpen(false);
                      startScanner(selectedCatalogItem.nome_material, selectedCatalogItem.codigo);
                    }}>
                      <ScanBarcode className="w-4 h-4" />
                    </Button>
                  </div>
                  {requiresSerial(selectedCatalogItem.nome_material) && (
                    <p className="text-[10px] text-destructive">Materiais do tipo ONT, DROP, EDD e Transceiver exigem serial.</p>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setAddExtraDialogOpen(false)}>Cancelar</Button>
            <Button 
              onClick={handleAddExtraFromCatalog} 
              disabled={!selectedCatalogItem || (requiresSerial(selectedCatalogItem?.nome_material || "") && !extraSerial.trim())}
            >
              <Plus className="w-4 h-4 mr-1" /> Incluir Material
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
              if (scannerContext) startScanner(scannerContext.modelo, scannerContext.codigo);
            }}>
              <X className="w-4 h-4 mr-1" /> Ler Novamente
            </Button>
            <Button onClick={() => {
              if (pendingSerial) {
                // If we came from the catalog dialog with a selected item, use it as extra serial
                if (selectedCatalogItem) {
                  setExtraSerial(pendingSerial.serial);
                  setPendingSerial(null);
                  setAddExtraDialogOpen(true);
                } else {
                  handleAddExtra(pendingSerial.serial, pendingSerial.modelo, pendingSerial.codigo);
                  setPendingSerial(null);
                  setIsDetailOpen(false);
                }
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
                        <TableCell className="font-mono text-sm font-semibold">{item.serial.startsWith('SEM-SERIAL-') ? '(Sem Serial)' : item.serial}</TableCell>
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
        <div className="w-full mb-6">
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
              {(tt && baseItems.length > 0 ? [
                ...baseItems.map(item => ({
                  serial: item.serial,
                  modelo: item.modelo,
                  codigo: item.codigo_material,
                  status: submissionItems[item.id] === 'presente' ? 'Possuo' : submissionItems[item.id] === 'falta' ? 'Faltante' : 'Pendente'
                })).filter(i => i.status !== 'Pendente'), 
                ...extraItems.map(item => ({
                  serial: item.serial.startsWith('SEM-SERIAL-') ? '(Sem Serial)' : item.serial,
                  modelo: item.modelo,
                  codigo: item.codigo_material,
                  status: 'Extra (Possuo)'
                }))
              ] : (selectedSubmission?.inventory_submission_items || []).map((i: any) => ({
                  serial: i.serial.startsWith('SEM-SERIAL-') ? '(Sem Serial)' : i.serial,
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

        {/* Closing Message */}
        <div className="text-justify text-[10px] leading-snug border border-black/30 rounded p-3 mb-8">
          <p className="font-bold mb-1">OBSERVAÇÃO IMPORTANTE:</p>
          <p>
            O material que consta neste inventário é exclusivamente o que foi apresentado fisicamente pelo colaborador no ato da conferência. 
            Materiais não apresentados e/ou identificados em relatórios anteriores como equipamentos fora do sistema devem ser informados 
            e incluídos em inventário posterior. Uma vez que os materiais são disponibilizados pela empresa, os mesmos devem ser devolvidos 
            ao término da necessidade, sendo a guarda e conservação de responsabilidade direta do colaborador ao qual foram atribuídos.
          </p>
        </div>

        {/* Signatures - fixed at bottom of page */}
        <div className="fixed bottom-0 left-0 right-0 print:fixed print:bottom-8 print:left-8 print:right-8">
          <div className="max-w-4xl mx-auto flex justify-between items-end px-8 pb-8">
            <div className="text-center w-64">
              <div className="border-t border-black w-full pt-2">
                <p className="font-bold uppercase text-sm">{nomeTecnico || selectedSubmission?.nome_tecnico || "Colaborador"}</p>
                <p className="text-xs">Técnico / Colaborador</p>
              </div>
            </div>
            <div className="text-center w-64">
              <div className="border-t border-black w-full pt-2">
                <p className="font-bold uppercase text-sm">{supervisor || selectedSubmission?.supervisor || "Liderança"}</p>
                <p className="text-xs">Supervisor Operacional</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    </>
  );
};

export default Inventory;
