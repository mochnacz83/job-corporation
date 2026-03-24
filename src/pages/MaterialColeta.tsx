import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import React, { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAccessTracking } from "@/hooks/useAccessTracking";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ArrowLeft, Plus, Trash2, Upload, FileSpreadsheet, Search, Download, ImageIcon, FileText, ScanBarcode, Pencil, Eye, RefreshCw, Camera, CheckCircle2, AlertTriangle, AlertCircle, Truck } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import { Html5Qrcode } from "html5-qrcode";

interface MaterialItem {
  id: string;
  codigo_material: string;
  nome_material: string;
  quantidade: number | "";
  unidade: string;
  serial: string;
  seriais: string[];
  askSeriais: boolean;
}

interface Tecnico {
  tr: string;
  tt: string;
  nome_empresa: string;
  nome_tecnico: string;
  supervisor: string;
  coordenador: string;
  telefone: string;
  cidade_residencia: string;
}

interface MaterialCadastro {
  codigo: string;
  nome_material: string;
}

interface ColetaRecord {
  id: string;
  nome_tecnico: string;
  matricula_tt: string | null;
  cidade: string | null;
  sigla_cidade: string | null;
  uf: string | null;
  atividade: string;
  tipo_aplicacao: string;
  circuito: string | null;
  ba: string | null;
  data_execucao: string | null;
  created_at: string;
  pdf_url: string | null;
  foto_url: string | null;
  assinatura_colaborador: string | null;
  assinatura_almoxarifado: string | null;
  almox_edit_done: boolean;
  last_exported_at: string | null;
  material_coleta_items: { codigo_material: string; nome_material: string; quantidade: number | ""; unidade: string; serial: string | null }[];
}

const FRASE_REVERSA = "Declaro que os materiais apresentados neste documento foram devidamente retirados no local da atividade e separados para devolução, conforme registro realizado nesta data. A imagem anexada comprova visualmente os itens coletados, estando todos visíveis para conferência. O colaborador responsável confirma a veracidade das informações registradas e a correta separação dos materiais para encaminhamento ao Almoxarifado/Logística da Ability Tecnologia, ficando sujeitos à validação e conferência no ato da entrega.";

const UF_LIST = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];

const CIDADES_SC = [
  "FLORIANÓPOLIS", "JOINVILLE", "BLUMENAU", "SÃO JOSÉ", "CHAPECÓ", "ITAJAÍ", "CRICIÚMA", "PALHOÇA", "LAGES", "BALNEÁRIO CAMBORIÚ",
  "BRUSQUE", "TUBARÃO", "SÃO BENTO DO SUL", "CAÇADOR", "CONCÓRDIA", "RIO DO SUL", "GASPAR", "ITAUPEMA", "CAMBORIÚ", "NAVEGANTES",
  "SÃO FRANCISCO DO SUL", "IÇARA", "VIDEIRA", "XANXERÊ", "LAGUNA", "TIJUCAS", "TIMBÓ", "FRAIBURGO", "ARARANGUÁ", "BIGUAÇU"
];

const toUpper = (v: string) => v.toUpperCase();

const newMaterial = (): MaterialItem => ({
  id: crypto.randomUUID(),
  codigo_material: "",
  nome_material: "",
  quantidade: 1,
  unidade: "Un",
  serial: "",
  seriais: [],
  askSeriais: false,
});

const MaterialColeta = () => {
  const { user } = useAuth();
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Refs para foco em validação
  const matriculaTtRef = useRef<HTMLInputElement>(null);
  const siglaCidadeRef = useRef<HTMLInputElement>(null);
  const cidadeRef = useRef<HTMLInputElement>(null);
  const baRef = useRef<HTMLInputElement>(null);
  const circuitoRef = useRef<HTMLInputElement>(null);
  const dataExecucaoRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState("formulario");

  // Form state
  const [matriculaTt, setMatriculaTt] = useState("");
  const [nomeTecnico, setNomeTecnico] = useState("");
  const [telefoneTecnico, setTelefoneTecnico] = useState("");
  const [cidade, setCidade] = useState("");
  const [siglaCidade, setSiglaCidade] = useState("");
  const [uf, setUf] = useState("");
  const [atividade, setAtividade] = useState("");
  const [tipoAplicacao, setTipoAplicacao] = useState("");
  const [circuito, setCircuito] = useState("");
  const [ba, setBa] = useState("");
  const [dataExecucao, setDataExecucao] = useState(new Date().toISOString().slice(0, 10));
  const [ttError, setTtError] = useState("");

  const [materiais, setMateriais] = useState<MaterialItem[]>([newMaterial()]);
  const [submitting, setSubmitting] = useState(false);

  // Reversa state
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const sigColabCanvasRef = useRef<HTMLCanvasElement>(null);
  const sigAlmoxCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawingColab, setIsDrawingColab] = useState(false);
  const [isDrawingAlmox, setIsDrawingAlmox] = useState(false);
  const [localRetirada, setLocalRetirada] = useState("");
  const [classificacaoCenario, setClassificacaoCenario] = useState("");
  const [circuitoCompartilhado, setCircuitoCompartilhado] = useState("");
  const [opcoesAdicionais, setOpcoesAdicionais] = useState("");

  // Cadastro lists
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [materiaisCadastro, setMateriaisCadastro] = useState<MaterialCadastro[]>([]);

  // Consultation state
  const [searchBa, setSearchBa] = useState("");
  const [searchCircuito, setSearchCircuito] = useState("");
  const [searchTecnico, setSearchTecnico] = useState("");
  const [allColetas, setAllColetas] = useState<ColetaRecord[]>([]);
  const [coletas, setColetas] = useState<ColetaRecord[]>([]);
  const [searching, setSearching] = useState(false);
  const [coletasLoaded, setColetasLoaded] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewColeta, setViewColeta] = useState<ColetaRecord | null>(null);
  const [gestechExportOpen, setGestechExportOpen] = useState(false);
  const [gestechStartDate, setGestechStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [gestechEndDate, setGestechEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [selectedColetaIds, setSelectedColetaIds] = useState<Set<string>>(new Set());

  // Edit states
  const [editingTecnico, setEditingTecnico] = useState<Tecnico | null>(null);
  const [editingMaterial, setEditingMaterial] = useState<MaterialCadastro | null>(null);
  const [deleteTecnico, setDeleteTecnico] = useState<Tecnico | null>(null);
  const [deleteMaterial, setDeleteMaterial] = useState<MaterialCadastro | null>(null);

  // Individual registration form states
  const emptyTecnicoForm: Tecnico = { tr: "", tt: "", nome_empresa: "", nome_tecnico: "", supervisor: "", coordenador: "", telefone: "", cidade_residencia: "" };
  const emptyMaterialForm: MaterialCadastro = { codigo: "", nome_material: "" };
  const [newTecnicoForm, setNewTecnicoForm] = useState<Tecnico>(emptyTecnicoForm);
  const [newMaterialForm, setNewMaterialForm] = useState<MaterialCadastro>(emptyMaterialForm);

  // Scanner state
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerCallback, setScannerCallback] = useState<((code: string) => void) | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const sigDialogAlmoxCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawingDialogAlmox, setIsDrawingDialogAlmox] = useState(false);
  const [confirmAlmoxSignId, setConfirmAlmoxSignId] = useState<string | null>(null);

  const openScanner = (onScan: (code: string) => void) => {
    setScannerCallback(() => onScan);
    setScannerOpen(true);
  };

  const closeScanner = async () => {
    try {
      if (scannerRef.current) {
        await scannerRef.current.stop();
        scannerRef.current.clear();
        scannerRef.current = null;
      }
    } catch (_) { }
    setScannerOpen(false);
    setScannerCallback(null);
  };

  useEffect(() => {
    if (!scannerOpen) return;
    let cancelled = false;
    const startScanner = async () => {
      try {
        const html5Qr = new Html5Qrcode("barcode-scanner-container");
        scannerRef.current = html5Qr;
        await html5Qr.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 150 } },
          (decodedText) => {
            if (!cancelled && scannerCallback) {
              scannerCallback(decodedText.toUpperCase());
              closeScanner();
            }
          },
          () => { }
        );
      } catch (err) {
        if (!cancelled) {
          toast.error("Não foi possível acessar a câmera. Verifique as permissões.");
          closeScanner();
        }
      }
    };
    // Small delay to ensure the DOM element is mounted
    const timer = setTimeout(startScanner, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [scannerOpen]);

  const isReversa = (atividade === "RETIRADA" || tipoAplicacao === "REVERSA") && tipoAplicacao !== "SEM MATERIAL";
  const isSemMaterial = tipoAplicacao === "SEM MATERIAL";

  // Force REVERSA if activity is RETIRADA and current type is APLICAR/BAIXAR
  useEffect(() => {
    if (atividade === "RETIRADA" && tipoAplicacao === "APLICAR/BAIXAR") {
      setTipoAplicacao("REVERSA");
    }
  }, [atividade, tipoAplicacao]);

  // Load catalogs
  useEffect(() => {
    supabase.from("tecnicos_cadastro").select("tr, tt, nome_empresa, nome_tecnico, supervisor, coordenador, telefone, cidade_residencia").then(({ data }) => {
      if (data) setTecnicos(data.map((t: any) => ({ ...t, telefone: t.telefone || "", cidade_residencia: t.cidade_residencia || "" })));
    });
    supabase.from("materiais_cadastro").select("codigo, nome_material").then(({ data }) => {
      if (data) setMateriaisCadastro(data as MaterialCadastro[]);
    });
  }, []);

  // Auto-fill técnico from TT
  const handleMatriculaTtChange = (value: string) => {
    const upper = toUpper(value);
    setMatriculaTt(upper);
    setTtError("");
    if (upper.length >= 3) {
      const found = tecnicos.find((t) => t.tt?.toUpperCase() === upper);
      if (found) {
        setNomeTecnico(found.nome_tecnico.toUpperCase());
        setTelefoneTecnico(found.telefone || "");
      } else {
        setTtError("TT informado não localizado no cadastro.");
        setNomeTecnico("");
        setTelefoneTecnico("");
      }
    }
  };

  // Signature canvas helpers
  const getCanvasPos = (canvas: HTMLCanvasElement, e: React.TouchEvent | React.MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const initCanvas = (canvas: HTMLCanvasElement | null) => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
  };

  useEffect(() => {
    if (isReversa) {
      setTimeout(() => {
        initCanvas(sigColabCanvasRef.current);
        initCanvas(sigAlmoxCanvasRef.current);
      }, 100);
    }
  }, [isReversa]);

  const startDraw = (canvas: HTMLCanvasElement | null, e: React.TouchEvent | React.MouseEvent, setDrawing: (v: boolean) => void) => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    setDrawing(true);
    const pos = getCanvasPos(canvas, e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (canvas: HTMLCanvasElement | null, e: React.TouchEvent | React.MouseEvent, isDrawing: boolean) => {
    if (!canvas || !isDrawing) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pos = getCanvasPos(canvas, e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const endDraw = (setDrawing: (v: boolean) => void) => setDrawing(false);

  const clearCanvas = (canvas: HTMLCanvasElement | null) => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const getCanvasDataUrl = (canvas: HTMLCanvasElement | null): string => {
    if (!canvas) return "";
    return canvas.toDataURL("image/png");
  };

  const handleCidadeChange = (value: string) => {
    const upper = value.toUpperCase();
    setCidade(upper);
    if (CIDADES_SC.includes(upper)) {
      setUf("SC");
    }
  };

  // Photo handling with compression
  const handleFotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        // Max dimensions
        const MAX_WIDTH = 1200;
        const MAX_HEIGHT = 1200;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);

        // Compress to JPEG with 0.7 quality
        const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.7);
        setFotoPreview(compressedDataUrl);

        // Create a new file from compressed data for upload
        fetch(compressedDataUrl)
          .then(res => res.blob())
          .then(blob => {
            const compressedFile = new File([blob], file.name, { type: "image/jpeg" });
            setFotoFile(compressedFile);
          });
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Upload technician spreadsheet
  const handleTecnicoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws);

      let createdCount = 0;
      let updatedCount = 0;
      let duplicateCount = 0;

      for (const r of rows) {
        const tr = String(r.TR || r.tr || "").trim();
        const tt = String(r.TT || r.tt || "").trim();
        if (!tt && !tr) continue;

        const nome_tecnico = String(r["Nome Técnico"] || r["Nome Tecnico"] || r.nome_tecnico || "").trim();
        const nome_empresa = String(r["Nome Empresa"] || r.nome_empresa || "").trim();
        const supervisor = String(r.Supervisor || r.supervisor || "").trim();
        const coordenador = String(r.Coordenador || r.coordenador || "").trim();
        const telefone = String(r.Telefone || r.telefone || r.Celular || r.celular || "").trim();
        const cidade_residencia = String(r.Cidade || r.cidade || r["Cidade Residência"] || r.cidade_residencia || "").trim();

        const existing = tecnicos.find(t => (tt && t.tt === tt) || (tr && t.tr === tr));

        if (existing) {
          const needsUpdate =
            (!existing.nome_tecnico && nome_tecnico) ||
            (!existing.nome_empresa && nome_empresa) ||
            (!existing.supervisor && supervisor) ||
            (!existing.coordenador && coordenador) ||
            (!existing.telefone && telefone) ||
            (!existing.cidade_residencia && cidade_residencia);

          if (needsUpdate) {
            const { error: upErr } = await supabase.from("tecnicos_cadastro")
              .update({
                nome_tecnico: existing.nome_tecnico || nome_tecnico,
                nome_empresa: existing.nome_empresa || nome_empresa,
                supervisor: existing.supervisor || supervisor,
                coordenador: existing.coordenador || coordenador,
                telefone: existing.telefone || telefone,
                cidade_residencia: existing.cidade_residencia || cidade_residencia
              })
              .match({ tr: tr || existing.tr, tt: tt || existing.tt });

            if (!upErr) updatedCount++;
          } else {
            duplicateCount++;
          }
        } else {
          const { error: insErr } = await supabase.from("tecnicos_cadastro").insert({
            tr, tt, nome_empresa, nome_tecnico, supervisor, coordenador, telefone, cidade_residencia, uploaded_by: user.id
          });
          if (!insErr) createdCount++;
        }
      }

      toast.success(`${createdCount} novos cadastros. ${updatedCount} atualizados. ${duplicateCount} duplicados ignorados.`);

      const { data: newData } = await supabase.from("tecnicos_cadastro").select("tr, tt, nome_empresa, nome_tecnico, supervisor, coordenador, telefone, cidade_residencia");
      if (newData) setTecnicos(newData as any);
    } catch (err: any) {
      toast.error("Erro ao importar: " + err.message);
    }
    e.target.value = "";
  };

  // Upload material spreadsheet
  const handleMaterialUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws);
      const mapped = rows.map((r) => ({
        codigo: String(r.Codigo || r.codigo || r["Código"] || ""),
        nome_material: String(r["Nome Material"] || r.nome_material || r["Nome"] || ""),
        uploaded_by: user.id,
      }));
      const { error } = await supabase.from("materiais_cadastro").insert(mapped as any);
      if (error) throw error;
      toast.success(`${mapped.length} materiais importados com sucesso`);
      setMateriaisCadastro((prev) => [...prev, ...mapped]);
    } catch (err: any) {
      toast.error("Erro ao importar planilha: " + err.message);
    }
    e.target.value = "";
  };

  // Download template spreadsheets
  const downloadTemplateTecnicos = () => {
    const ws = XLSX.utils.aoa_to_sheet([["TR", "TT", "Nome Empresa", "Nome Técnico", "Supervisor", "Coordenador", "Telefone", "Cidade"]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Técnicos");
    XLSX.writeFile(wb, "planilha_modelo_tecnicos.xlsx");
  };

  const downloadTemplateMateriais = () => {
    const ws = XLSX.utils.aoa_to_sheet([["Codigo", "Nome Material"]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Materiais");
    XLSX.writeFile(wb, "planilha_modelo_materiais.xlsx");
  };

  const { trackAction } = useAccessTracking("/material-coleta");

  // Auto-fill material name from code with validation
  const handleCodigoChange = (id: string, codigo: string) => {
    const upper = toUpper(codigo);
    setMateriais((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        const found = materiaisCadastro.find((mc) => mc.codigo.toUpperCase() === upper);
        return { ...m, codigo_material: upper, nome_material: found ? found.nome_material.toUpperCase() : "" };
      })
    );
  };

  const getMaterialError = (mat: MaterialItem): string => {
    if (!mat.codigo_material) return "";
    const found = materiaisCadastro.find((mc) => mc.codigo.toUpperCase() === mat.codigo_material.toUpperCase());
    if (!found) return "Código de equipamento não localizado no cadastro.";
    return "";
  };

  const updateMaterial = (id: string, field: keyof MaterialItem, value: any) => {
    setMateriais((prev) => prev.map((m) => (m.id === id ? { ...m, [field]: value } : m)));
  };

  const handleQuantidadeChange = (id: string, qty: number | "") => {
    setMateriais((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;

        // If it's an empty string, just update the value to allow typing
        if (qty === "") {
          return { ...m, quantidade: "" };
        }

        const numQty = Number(qty);
        if (numQty > 1 && !m.askSeriais) {
          return { ...m, quantidade: numQty, askSeriais: true, seriais: Array(numQty).fill("") };
        }
        if (numQty <= 1) {
          return { ...m, quantidade: numQty, askSeriais: false, seriais: [] };
        }
        // qty changed but already asked
        const newSeriais = Array(numQty).fill("").map((_, i) => m.seriais[i] || "");
        return { ...m, quantidade: numQty, seriais: newSeriais };
      })
    );
  };

  const handleAskSeriaisResponse = (id: string, yes: boolean) => {
    setMateriais((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        if (yes) {
          const qty = typeof m.quantidade === "number" ? m.quantidade : Number(m.quantidade) || 0;
          return { ...m, askSeriais: false, seriais: Array.from({ length: qty }, () => "") };
        }
        return { ...m, askSeriais: false, seriais: [] };
      })
    );
  };

  const updateSerial = (matId: string, index: number, value: string) => {
    setMateriais((prev) =>
      prev.map((m) => {
        if (m.id !== matId) return m;
        const newSeriais = [...m.seriais];
        newSeriais[index] = toUpper(value);
        return { ...m, seriais: newSeriais };
      })
    );
  };

  const addMaterial = () => setMateriais((prev) => [...prev, newMaterial()]);

  const removeMaterial = (id: string) => {
    if (materiais.length <= 1) return;
    setMateriais((prev) => prev.filter((m) => m.id !== id));
  };

  // Generate PDF for Reversa - fit in 1 A4 page
  const generatePDF = (coletaData: {
    matriculaTt: string;
    nomeTecnico: string;
    telefoneTecnico: string;
    cidade: string;
    siglaCidade: string;
    uf: string;
    atividade: string;
    ba: string;
    circuito: string;
    dataExecucao: string;
    materiais: MaterialItem[];
    assinaturaColaborador: string;
    assinaturaAlmoxarifado: string;
    fotoDataUrl: string | null;
    local_retirada?: string;
    classificacao_cenario?: string;
    circuito_compartilhado?: string;
    opcoes_adicionais?: string;
    tipo_aplicacao?: string;
  }) => {
    const doc = new jsPDF("p", "mm", "a4");
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 10;
    let y = 8;

    // Logo
    try {
      const logoImg = new Image();
      logoImg.src = "/ability-logo.png";
      doc.addImage(logoImg, "PNG", margin, y, 20, 10);
    } catch { }

    // Header
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    const pdfTitle = coletaData.tipo_aplicacao === "REVERSA" ? "MATERIAL DE REVERSA" : "MATERIAL DE APLICAÇÃO";
    doc.text(pdfTitle, pageW / 2, y + 7, { align: "center" });
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text(`Data: ${coletaData.dataExecucao ? new Date(coletaData.dataExecucao + "T12:00:00").toLocaleDateString("pt-BR") : "-"}`, pageW - margin, y + 4, { align: "right" });

    y += 14;
    doc.setDrawColor(0, 90, 160);
    doc.setLineWidth(0.4);
    doc.line(margin, y, pageW - margin, y);
    y += 4;

    // Info in 2 columns
    doc.setFontSize(8);
    const leftCol = margin;
    const rightCol = pageW / 2 + 5;
    const infoLeft = [
      ["Matrícula (TT):", coletaData.matriculaTt || "-"],
      ["Técnico:", coletaData.nomeTecnico],
      ["Telefone:", coletaData.telefoneTecnico || "-"],
      ["Cidade:", coletaData.cidade ? `${coletaData.cidade} (${coletaData.siglaCidade || ""}) - ${coletaData.uf || ""}` : "-"],
    ];
    const infoRight = [
      ["Atividade:", coletaData.atividade],
      ["Tipo Aplicação:", coletaData.tipo_aplicacao || "REVERSA"],
      ["BA:", coletaData.ba || "-"],
      ["Circuito:", coletaData.circuito || "-"],
    ];

    if (coletaData.atividade === "RETIRADA") {
      infoLeft.push(["Local Retirada:", coletaData.local_retirada || "-"]);
      infoRight.push(["Cenário:", coletaData.classificacao_cenario || "-"]);
      if (coletaData.circuito_compartilhado) {
        infoRight.push(["Circ. Comp.:", coletaData.circuito_compartilhado]);
      }
    }
    let infoY = y;
    infoLeft.forEach(([label, value]) => {
      doc.setFont("helvetica", "bold");
      doc.text(label, leftCol, infoY);
      doc.setFont("helvetica", "normal");
      doc.text(value, leftCol + 28, infoY);
      infoY += 4;
    });
    infoY = y;
    infoRight.forEach(([label, value]) => {
      doc.setFont("helvetica", "bold");
      doc.text(label, rightCol, infoY);
      doc.setFont("helvetica", "normal");
      doc.text(value, rightCol + 28, infoY);
      infoY += 4;
    });
    y += 18;

    // Materials table - Skip if SEM MATERIAL
    const isSemMaterialPDF = coletaData.tipo_aplicacao === "SEM MATERIAL";

    if (!isSemMaterialPDF) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setFillColor(0, 90, 160);
      doc.setTextColor(255, 255, 255);
      doc.rect(margin, y, pageW - 2 * margin, 5, "F");
      const cols = [margin + 1, margin + 22, margin + 75, margin + 90, margin + 108, margin + 128];
      doc.text("CÓDIGO", cols[0], y + 3.5);
      doc.text("NOME MATERIAL", cols[1], y + 3.5);
      doc.text("QTDE", cols[2], y + 3.5);
      doc.text("UN/METRO", cols[3], y + 3.5);
      doc.text("SERIAL", cols[4], y + 3.5);
      y += 5;

      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);

      // Flatten materials with seriais
      const flatItems: { codigo: string; nome: string; qtde: string; un: string; serial: string }[] = [];
      coletaData.materiais.forEach((m) => {
        if (m.seriais.length > 0) {
          m.seriais.forEach((s, i) => {
            flatItems.push({
              codigo: i === 0 ? m.codigo_material : "",
              nome: i === 0 ? m.nome_material : "",
              qtde: i === 0 ? String(m.quantidade) : "",
              un: i === 0 ? m.unidade : "",
              serial: s || "-",
            });
          });
        } else {
          flatItems.push({
            codigo: m.codigo_material,
            nome: m.nome_material,
            qtde: String(m.quantidade),
            un: m.unidade,
            serial: m.serial || "-",
          });
        }
      });

      flatItems.forEach((item, i) => {
        const bg = i % 2 === 0 ? 245 : 255;
        doc.setFillColor(bg, bg, bg);
        doc.rect(margin, y, pageW - 2 * margin, 4, "F");
        doc.text(item.codigo, cols[0], y + 3);
        doc.text(item.nome.substring(0, 28), cols[1], y + 3);
        doc.text(item.qtde, cols[2], y + 3);
        doc.text(item.un, cols[3], y + 3);
        doc.text(item.serial.substring(0, 20), cols[4], y + 3);
        y += 4;
      });
      y += 3;
    } else {
      // Just a small spacer if no materials
      y += 4;
    }

    // Frase padrão
    doc.setFontSize(6);
    doc.setFont("helvetica", "italic");
    const splitText = doc.splitTextToSize(FRASE_REVERSA, pageW - 2 * margin);
    doc.text(splitText, margin, y);
    y += splitText.length * 2.5 + 3;

    // Photo + Signatures
    const photoW = 80;
    const photoH = 60;
    const photoX = (pageW - photoW) / 2;

    if (coletaData.fotoDataUrl) {
      try {
        doc.addImage(coletaData.fotoDataUrl, "JPEG", photoX, y, photoW, photoH);
        y += photoH + 10;
      } catch { 
        y += 5;
      }
    }

    // Signatures side by side below photo
    const sigW = 75;
    const sigH = 15;
    const sigMargin = 15;
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);

    // Técnico (Left)
    if (coletaData.assinaturaColaborador) {
      doc.text("Assinatura do Colaborador:", sigMargin, y);
      try {
        doc.addImage(coletaData.assinaturaColaborador, "PNG", sigMargin, y + 1, sigW, sigH);
      } catch { }
      doc.line(sigMargin, y + sigH + 2, sigMargin + sigW, y + sigH + 2);
      doc.setFontSize(7);
      doc.text(coletaData.nomeTecnico, sigMargin, y + sigH + 5);
    }

    // Almoxarifado (Right)
    const sigRightX = pageW - sigMargin - sigW;
    if (coletaData.assinaturaAlmoxarifado) {
      doc.setFontSize(8);
      doc.text("Assinatura Almoxarifado/Logística:", sigRightX, y);
      try {
        doc.addImage(coletaData.assinaturaAlmoxarifado, "PNG", sigRightX, y + 1, sigW, sigH);
      } catch { }
      doc.line(sigRightX, y + sigH + 2, sigRightX + sigW, y + sigH + 2);
      doc.setFontSize(7);
      doc.text("Responsável Recebimento", sigRightX, y + sigH + 5);
    }

    // Footer
    doc.setFontSize(6);
    doc.setTextColor(150, 150, 150);
    doc.text("Ability Tecnologia — Documento gerado automaticamente", pageW / 2, 290, { align: "center" });

    // Open PDF
    const pdfOutput = doc.output("bloburl");
    window.open(pdfOutput, "_blank");

    // Log PDF generation action
    trackAction("gerar_pdf");
  };

  // Submit form
  const handleSubmit = async () => {
    if (!user) return;

    // Validate required fields com foco automático no faltante
    if (!matriculaTt) {
      toast.error("Preencha a Matrícula (TT)");
      matriculaTtRef.current?.focus();
      return;
    }
    if (!siglaCidade) {
      toast.error("Preencha a Sigla da Estação");
      siglaCidadeRef.current?.focus();
      return;
    }
    if (!cidade) {
      toast.error("Preencha a Cidade");
      cidadeRef.current?.focus();
      return;
    }
    if (!uf) {
      toast.error("Selecione a UF");
      return;
    }
    if (!atividade) {
      toast.error("Selecione a Atividade");
      return;
    }
    if (!tipoAplicacao) {
      toast.error("Selecione o Tipo de Aplicação");
      return;
    }
    if (!ba) {
      toast.error("Preencha o número do BA");
      baRef.current?.focus();
      return;
    }
    if (!circuito) {
      toast.error("Preencha o Circuito");
      circuitoRef.current?.focus();
      return;
    }
    if (!dataExecucao) {
      toast.error("Preencha a Data de Execução");
      dataExecucaoRef.current?.focus();
      return;
    }

    // Validate TT exists
    const ttExists = tecnicos.find((t) => t.tt?.toUpperCase() === matriculaTt.toUpperCase());
    if (!ttExists) {
      toast.error("TT informado não localizado no cadastro.");
      matriculaTtRef.current?.focus();
      return;
    }

    // Validate materials
    for (const m of materiais) {
      if (!m.codigo_material || !m.nome_material) {
        toast.error("Preencha código e nome de todos os materiais");
        return;
      }
      const matExists = materiaisCadastro.find((mc) => mc.codigo.toUpperCase() === m.codigo_material.toUpperCase());
      if (!matExists) {
        toast.error(`Código de equipamento "${m.codigo_material}" não localizado no cadastro.`);
        return;
      }
      // Validate seriais
      if (m.seriais.length > 0) {
        for (let i = 0; i < m.seriais.length; i++) {
          if (!m.seriais[i]) {
            toast.error(`Informe o serial ${i + 1} do material ${m.codigo_material}`);
            return;
          }
        }
      }
    }

    if (isReversa) {
      const colabSig = getCanvasDataUrl(sigColabCanvasRef.current);
      if (!colabSig || colabSig === "data:,") {
        toast.error("Assinatura do colaborador é obrigatória para Reversa");
        return;
      }
      if (!fotoFile) {
        toast.error("Foto dos materiais é obrigatória para Reversa");
        return;
      }
    }

    setSubmitting(true);
    try {
      let fotoUrl: string | null = null;
      let fotoDataUrl: string | null = fotoPreview;

      if (isReversa && fotoFile) {
        const ext = fotoFile.name.split(".").pop();
        const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadErr } = await supabase.storage.from("material-fotos").upload(path, fotoFile);
        if (uploadErr) throw uploadErr;
        const { data: urlData } = supabase.storage.from("material-fotos").getPublicUrl(path);
        fotoUrl = urlData.publicUrl;
      }

      const colabSig = isReversa ? getCanvasDataUrl(sigColabCanvasRef.current) : null;
      const almoxSig = isReversa ? getCanvasDataUrl(sigAlmoxCanvasRef.current) : null;

      const { data: coleta, error: coletaError } = await supabase
        .from("material_coletas")
        .insert({
          user_id: user.id,
          matricula_tt: matriculaTt || null,
          nome_tecnico: nomeTecnico,
          cidade: cidade || null,
          sigla_cidade: siglaCidade || null,
          uf: uf || null,
          atividade,
          tipo_aplicacao: tipoAplicacao,
          circuito: circuito || null,
          ba: ba || null,
          data_execucao: dataExecucao,
          assinatura_colaborador: colabSig || null,
          assinatura_almoxarifado: almoxSig || null,
          foto_url: fotoUrl,
          local_retirada: localRetirada,
          classificacao_cenario: classificacaoCenario,
          circuito_compartilhado: circuitoCompartilhado,
          opcoes_adicionais: opcoesAdicionais,
        } as any)
        .select("id")
        .single();

      if (coletaError) throw coletaError;

      // Flatten seriais into individual items
      const items: any[] = [];
      if (!isSemMaterial) {
        materiais.forEach((m) => {
          if (m.seriais.length > 0) {
            m.seriais.forEach((s) => {
              items.push({
                coleta_id: (coleta as any).id,
                codigo_material: m.codigo_material,
                nome_material: m.nome_material,
                quantidade: 1,
                unidade: m.unidade,
                serial: s || null,
              });
            });
          } else {
            items.push({
              coleta_id: (coleta as any).id,
              codigo_material: m.codigo_material,
              nome_material: m.nome_material,
              quantidade: m.quantidade,
              unidade: m.unidade,
              serial: m.serial || null,
            });
          }
        });

        if (items.length > 0) {
          const { error: itemsError } = await supabase.from("material_coleta_items").insert(items as any);
          if (itemsError) throw itemsError;
        }
      }

      toast.success("Salvo com sucesso!");
      trackAction(isReversa ? `Cadastrou material de reversa (BA: ${ba})` : `Cadastrou material de aplicação (BA: ${ba})`);

      if (isReversa) {
        generatePDF({
          matriculaTt,
          nomeTecnico,
          telefoneTecnico,
          cidade,
          siglaCidade,
          uf,
          atividade,
          ba,
          circuito,
          dataExecucao,
          materiais,
          assinaturaColaborador: colabSig || "",
          assinaturaAlmoxarifado: almoxSig || "",
          fotoDataUrl,
          local_retirada: localRetirada,
          classificacao_cenario: classificacaoCenario,
          circuito_compartilhado: circuitoCompartilhado,
          opcoes_adicionais: opcoesAdicionais,
          tipo_aplicacao: tipoAplicacao,
        });

        // Upload PDF to storage and save URL
        // The generatePDF function now opens the PDF directly, so we don't need to return blob and upload here.
        // If PDF upload is still desired, it needs to be re-implemented.
        // For now, removing the blob upload part as per instruction's change to generatePDF.
      }

      setColetasLoaded(false); // force reload on next tab visit

      // Reset form
      setMatriculaTt("");
      setNomeTecnico("");
      setTelefoneTecnico("");
      setCidade("");
      setSiglaCidade("");
      setUf("");
      setAtividade("");
      setTipoAplicacao("");
      setCircuito("");
      setBa("");
      setDataExecucao(new Date().toISOString().slice(0, 10));
      setMateriais([newMaterial()]);
      setFotoFile(null);
      setFotoPreview(null);
      setTtError("");
      clearCanvas(sigColabCanvasRef.current);
      clearCanvas(sigAlmoxCanvasRef.current);
    } catch (err: any) {
      toast.error("Erro ao salvar: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Load all coletas
  const loadAllColetas = async () => {
    setSearching(true);
    try {
      const { data, error } = await (supabase
        .from("material_coletas")
        .select("id, matricula_tt, nome_tecnico, cidade, sigla_cidade, uf, atividade, tipo_aplicacao, circuito, ba, data_execucao, created_at, pdf_url, foto_url, assinatura_colaborador, assinatura_almoxarifado, almox_edit_done, last_exported_at, material_coleta_items(codigo_material, nome_material, quantidade, unidade, serial)")
        .order("created_at", { ascending: false })
        .limit(500) as any);
      if (error) throw error;
      const records = (data || []) as unknown as ColetaRecord[];
      setAllColetas(records);
      setColetas(records);
      setColetasLoaded(true);
    } catch (err: any) {
      toast.error("Erro ao carregar coletas: " + err.message);
    } finally {
      setSearching(false);
    }
  };

  // Auto-load when switching to consulta tab
  useEffect(() => {
    if (activeTab === "consulta" && !coletasLoaded) {
      loadAllColetas();
    }
  }, [activeTab, coletasLoaded]);

  useEffect(() => {
    if (viewColeta && !viewColeta.almox_edit_done) {
      setTimeout(() => {
        initCanvas(sigDialogAlmoxCanvasRef.current);
      }, 300);
    }
  }, [viewColeta]);

  // Search / Filter coletas locally
  const handleSearch = () => {
    let filtered = allColetas;
    if (searchBa) filtered = filtered.filter(c => (c.ba || "").toUpperCase().includes(searchBa));
    if (searchCircuito) filtered = filtered.filter(c => (c.circuito || "").toUpperCase().includes(searchCircuito));
    if (searchTecnico) filtered = filtered.filter(c => c.nome_tecnico.toUpperCase().includes(searchTecnico));
    setColetas(filtered);
  };

  const handleClearFilters = () => {
    setSearchBa("");
    setSearchCircuito("");
    setSearchTecnico("");
    setColetas(allColetas);
    setSelectedColetaIds(new Set());
  };

  const toggleSelectAll = () => {
    if (selectedColetaIds.size === coletas.length && coletas.length > 0) {
      setSelectedColetaIds(new Set());
    } else {
      setSelectedColetaIds(new Set(coletas.map(c => c.id)));
    }
  };

  const toggleSelectOne = (id: string) => {
    const newSelected = new Set(selectedColetaIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedColetaIds(newSelected);
  };

  // Cadastro Management Functions
  const handleEditTecnico = (t: Tecnico) => setEditingTecnico({ ...t });
  const handleSaveTecnico = async () => {
    if (!editingTecnico) return;
    const { error } = await supabase.from("tecnicos_cadastro")
      .update(editingTecnico)
      .match({ tt: editingTecnico.tt, tr: editingTecnico.tr });
    if (error) { toast.error("Erro ao salvar técnico"); return; }
    toast.success("Técnico atualizado");
    setTecnicos(prev => prev.map(t => (t.tt === editingTecnico.tt || t.tr === editingTecnico.tr) ? editingTecnico : t));
    setEditingTecnico(null);
  };

  const handleDeleteTecnico = (t: Tecnico) => setDeleteTecnico(t);
  const confirmDeleteTecnico = async () => {
    if (!deleteTecnico) return;
    const { error } = await supabase.from("tecnicos_cadastro").delete().match({ tt: deleteTecnico.tt, tr: deleteTecnico.tr });
    if (error) { toast.error("Erro ao excluir técnico"); return; }
    toast.success("Técnico excluído");
    setTecnicos(prev => prev.filter(t => t.tt !== deleteTecnico.tt && t.tr !== deleteTecnico.tr));
    setDeleteTecnico(null);
  };

  const handleEditMaterial = (m: MaterialCadastro) => setEditingMaterial({ ...m });
  const handleSaveMaterial = async () => {
    if (!editingMaterial) return;
    const { error } = await supabase.from("materiais_cadastro")
      .update({ nome_material: editingMaterial.nome_material })
      .match({ codigo: editingMaterial.codigo });
    if (error) { toast.error("Erro ao salvar material"); return; }
    toast.success("Material atualizado");
    setMateriaisCadastro(prev => prev.map(m => m.codigo === editingMaterial.codigo ? editingMaterial : m));
    setEditingMaterial(null);
  };

  const handleDeleteMaterial = (m: MaterialCadastro) => setDeleteMaterial(m);
  const confirmDeleteMaterial = async () => {
    if (!deleteMaterial) return;
    const { error } = await supabase.from("materiais_cadastro").delete().match({ codigo: deleteMaterial.codigo });
    if (error) { toast.error("Erro ao excluir material"); return; }
    toast.success("Material excluído");
    setMateriaisCadastro(prev => prev.filter(m => m.codigo !== deleteMaterial.codigo));
    setDeleteMaterial(null);
  };

  // Individual registration handlers
  const handleSaveNewTecnico = async () => {
    if (!newTecnicoForm.tt || !newTecnicoForm.nome_tecnico) {
      toast.error("TT e Nome Técnico são obrigatórios");
      return;
    }
    if (!user) return;
    const exists = tecnicos.some(t => t.tt === newTecnicoForm.tt);
    if (exists) {
      toast.error("Técnico com esta TT já está cadastrado");
      return;
    }
    const { error } = await supabase.from("tecnicos_cadastro").insert({
      tr: newTecnicoForm.tr || null,
      tt: newTecnicoForm.tt,
      nome_empresa: newTecnicoForm.nome_empresa || null,
      nome_tecnico: newTecnicoForm.nome_tecnico,
      supervisor: newTecnicoForm.supervisor || null,
      coordenador: newTecnicoForm.coordenador || null,
      telefone: newTecnicoForm.telefone || null,
      cidade_residencia: newTecnicoForm.cidade_residencia || null,
      uploaded_by: user.id,
    });
    if (error) { toast.error("Erro ao cadastrar técnico"); return; }
    toast.success("Técnico cadastrado com sucesso");
    setTecnicos(prev => [...prev, { ...newTecnicoForm }]);
    setNewTecnicoForm({ tr: "", tt: "", nome_empresa: "", nome_tecnico: "", supervisor: "", coordenador: "", telefone: "", cidade_residencia: "" });
  };

  const handleSaveNewMaterial = async () => {
    if (!newMaterialForm.codigo || !newMaterialForm.nome_material) {
      toast.error("Código e Nome Material são obrigatórios");
      return;
    }
    if (!user) return;
    const exists = materiaisCadastro.some(m => m.codigo === newMaterialForm.codigo);
    if (exists) {
      toast.error("Material com este código já está cadastrado");
      return;
    }
    const { error } = await supabase.from("materiais_cadastro").insert({
      codigo: newMaterialForm.codigo,
      nome_material: newMaterialForm.nome_material,
      uploaded_by: user.id,
    });
    if (error) { toast.error("Erro ao cadastrar material"); return; }
    toast.success("Material cadastrado com sucesso");
    setMateriaisCadastro(prev => [...prev, { ...newMaterialForm }]);
    setNewMaterialForm({ codigo: "", nome_material: "" });
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await supabase.from("material_coleta_items").delete().eq("coleta_id", deleteId);
      await supabase.from("material_coletas").delete().eq("id", deleteId);
      setAllColetas((prev) => prev.filter((c) => c.id !== deleteId));
      setColetas((prev) => prev.filter((c) => c.id !== deleteId));
      toast.success("Registro excluído");
    } catch (err: any) {
      toast.error("Erro ao excluir: " + err.message);
    } finally {
      setDeleteId(null);
    }
  };

  const handleRequestAlmoxSignature = (coletaId: string) => {
    const signature = getCanvasDataUrl(sigDialogAlmoxCanvasRef.current);
    if (!signature || signature === "data:,") {
      toast.error("Assinatura obrigatória");
      return;
    }
    setConfirmAlmoxSignId(coletaId);
  };

  const handleConfirmAlmoxSignature = async () => {
    if (!confirmAlmoxSignId) return;
    const coletaId = confirmAlmoxSignId;
    setConfirmAlmoxSignId(null);

    const signature = getCanvasDataUrl(sigDialogAlmoxCanvasRef.current);
    if (!signature || signature === "data:,") {
      toast.error("Assinatura obrigatória");
      return;
    }

    try {
      const { error } = await supabase
        .from("material_coletas")
        .update({
          assinatura_almoxarifado: signature,
          almox_edit_done: true
        } as any)
        .eq("id", coletaId);

      if (error) throw error;

      toast.success("Assinatura salva com sucesso! Documento travado para edição.");
      
      // Update local state
      setAllColetas(prev => prev.map(c => c.id === coletaId ? { ...c, assinatura_almoxarifado: signature, almox_edit_done: true } : c));
      setColetas(prev => prev.map(c => c.id === coletaId ? { ...c, assinatura_almoxarifado: signature, almox_edit_done: true } : c));
      if (viewColeta && viewColeta.id === coletaId) {
        setViewColeta({ ...viewColeta, assinatura_almoxarifado: signature, almox_edit_done: true });
      }
    } catch (err: any) {
      toast.error("Erro ao salvar assinatura: " + err.message);
    }
  };

   // Export Excel
  const handleExport = (format: "xlsx" | "csv") => {
    // Gestech Sync Trigger: 2026-03-11 17:25
    if (coletas.length === 0) { toast.error("Nenhum dado para exportar"); return; }
    
    // Filtrar para excluir Logística Reversa das exportações
    const coletasToExport = coletas.filter(c => !(c.atividade === "RETIRADA" && c.tipo_aplicacao === "REVERSA"));
    
    if (coletasToExport.length === 0) {
      toast.warning("Os registros selecionados são de Logística Reversa e não serão incluídos no relatório.");
      return;
    }

    const rows = coletasToExport.flatMap((c) =>
      c.material_coleta_items.map((item) => ({
        "MATRÍCULA (TT)": c.matricula_tt || "",
        BA: c.ba || "",
        CIRCUITO: c.circuito || "",
        TÉCNICO: c.nome_tecnico,
        CIDADE: c.cidade || "",
        SIGLA: c.sigla_cidade || "",
        UF: c.uf || "",
        ATIVIDADE: c.atividade,
        "TIPO APLICAÇÃO": c.tipo_aplicacao,
        "CÓDIGO MATERIAL": item.codigo_material,
        "NOME MATERIAL": item.nome_material,
        QUANTIDADE: item.quantidade,
        UNIDADE: item.unidade,
        SERIAL: item.serial || "",
        "DATA EXECUÇÃO": c.data_execucao ? new Date(c.data_execucao + "T12:00:00").toLocaleDateString("pt-BR") : "",
        "DATA REGISTRO": new Date(c.created_at).toLocaleDateString("pt-BR"),
      }))
    );
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Coletas");
    const filename = `coleta_materiais_${new Date().toISOString().slice(0, 10)}`;
    if (format === "csv") {
      XLSX.writeFile(wb, `${filename}.csv`, { bookType: "csv" });
    } else {
      XLSX.writeFile(wb, `${filename}.xlsx`);
    }

    // Log Excel export action
    trackAction("exportar_excel");
  };

  // Export Gestech
  const handleGestechExport = async () => {
    if (!gestechStartDate || !gestechEndDate) {
      toast.error("Por favor, selecione as datas de início e fim.");
      return;
    }

    // Filtrar pela faixa de data de execução, atividades permitidas e não exportados
    // Se houver itens selecionados, prioriza eles
    let filteredColetas = [];
    
    if (selectedColetaIds.size > 0) {
      filteredColetas = allColetas.filter(c => selectedColetaIds.has(c.id));
      
      // Validar se os selecionados atendem aos critérios básicos do Gestech
      const invalidItems = filteredColetas.filter(c => !["ATIVAÇÃO", "REPARO", "PREVENTIVA"].includes(c.atividade?.toUpperCase()));
      if (invalidItems.length > 0) {
        toast.warning(`${invalidItems.length} item(s) selecionado(s) não possuem atividade compatível com Gestech e serão ignorados.`);
        filteredColetas = filteredColetas.filter(c => ["ATIVAÇÃO", "REPARO", "PREVENTIVA"].includes(c.atividade?.toUpperCase()));
      }
    } else {
      filteredColetas = allColetas.filter(c => {
        if (!c.data_execucao) return false;
        
        // Excluir explicitamente Logística Reversa
        const isLogReversa = c.atividade === "RETIRADA" && c.tipo_aplicacao === "REVERSA";
        if (isLogReversa) return false;

        const dataExec = c.data_execucao;
        return (
          dataExec >= gestechStartDate &&
          dataExec <= gestechEndDate &&
          ["ATIVAÇÃO", "REPARO", "PREVENTIVA"].includes(c.atividade?.toUpperCase()) &&
          !c.last_exported_at // Somente os não exportados
        );
      });
    }

    // Deduplica por BA — mantém apenas o primeiro registro de cada BA
    const seenBAs = new Set<string>();
    const uniqueColetas = filteredColetas.filter(c => {
      const ba = (c.ba || "").trim().toUpperCase();
      if (!ba || seenBAs.has(ba)) return false;
      seenBAs.add(ba);
      return true;
    });

    if (uniqueColetas.length === 0) {
      toast.error("Nenhum registro encontrado para essa data com as atividades válidas.");
      return;
    }

    const agora = new Date();
    const dataAtual = agora.toLocaleDateString("pt-BR");
    const horaAtual = agora.getHours();
    const turno = horaAtual < 12 ? "MANHÃ" : "TARDE";

    // Map 1 row per Coleta (BA único)
    const rows = uniqueColetas.map(c => {
      const isAtivacao = c.atividade.toUpperCase() === "ATIVAÇÃO";
      const isReparo = c.atividade.toUpperCase() === "REPARO";
      const isPreventiva = c.atividade.toUpperCase() === "PREVENTIVA";

      let servico = "";
      if (isAtivacao) servico = "INSTDADOS";
      else if (isReparo) servico = "REPDADOS";
      else if (isPreventiva) servico = "PREVDADOS";

      const cctoClean = (c.circuito || "").replace(/\s/g, "");
      const ttClean = (c.matricula_tt || "").replace(/\s/g, "");
      const baClean = (c.ba || "").replace(/\s/g, "");
      const nrba = [ttClean, cctoClean, baClean].filter(Boolean).join("-");

      return {
        "EMPRESA": "ABILITY",
        "NRBA": nrba,
        "DATACRIACAO": dataAtual,
        "DATAAGENDAMENTO": dataAtual,
        "MATRICULATECNICO": c.matricula_tt || "",
        "TECNICO": c.nome_tecnico || "",
        "SERVICO": servico,
        "MACROATIVIDADE": servico,
        "ATIVIDADE": servico,
        "CPF": "",
        "NOMECLIENTE": "",
        "EXCLUIDO": "",
        "INCLUIDO": "",
        "ESTACAO": c.sigla_cidade || "",
        "ENDERECO": c.sigla_cidade || "",
        "RECLAMACAO": "",
        "RESIDENCIA": "",
        "HORARIO": turno,
        "OBS": servico,
        "NUMPEDIDOREPARO": "",
        "STATUS": "",
        "NOTASSTATUS": "",
        "PENDENCIAS": "",
        "CRITICA": "",
        "SETOR": "",
        "COMPANYID": "VTAL",
        "SUBSCRIBERID": ""
      };
    });

    try {
      // Atualizar no banco que foram exportados
      const idsToUpdate = uniqueColetas.map(c => c.id);
      const { error } = await supabase
        .from("material_coletas")
        .update({ last_exported_at: agora.toISOString() } as any)
        .in("id", idsToUpdate);

      if (error) throw error;

      // Gerar arquivo
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Gestech");
      const filename = `gestech_export_${turno}_${new Date().toISOString().slice(0, 10)}`;
      XLSX.writeFile(wb, `${filename}.xlsx`);

      toast.success(`${uniqueColetas.length} registros exportados e marcados no sistema.`);
      setGestechExportOpen(false);
      
      // Refresh local coletas state
      setAllColetas(prev => prev.map(c => 
        idsToUpdate.includes(c.id) ? { ...c, last_exported_at: agora.toISOString() } : c
      ));
      setColetas(prev => prev.map(c => 
        idsToUpdate.includes(c.id) ? { ...c, last_exported_at: agora.toISOString() } : c
      ));

      trackAction("exportar_gestech");
    } catch (err: any) {
      toast.error("Erro ao atualizar registros: " + err.message);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="w-full max-w-[1600px] mx-auto px-4 h-14 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="p-1 bg-transparent w-9 h-9 flex items-center justify-center overflow-hidden">
            <img src="/ability-logo.png" alt="Logo" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-base font-bold text-foreground">Formulário de Controle Materiais Dados</h1>
        </div>
      </header>

      <main className="flex-1 w-full max-w-[1600px] mx-auto px-4 py-4 overflow-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="formulario">Formulário</TabsTrigger>
            <TabsTrigger value="cadastros">Cadastros</TabsTrigger>
            <TabsTrigger value="consulta">Consulta / Exportar</TabsTrigger>
          </TabsList>

          {/* ── TAB: FORMULÁRIO ── */}
          <TabsContent value="formulario" className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Dados da Coleta</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Row: Matrícula + Nome + Telefone */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label>Matrícula (TT) *</Label>
                    <Input
                      ref={matriculaTtRef}
                      value={matriculaTt}
                      onChange={(e) => handleMatriculaTtChange(e.target.value)}
                      placeholder="EX: TT12345"
                      list="tt-list"
                      className="uppercase"
                    />
                    <datalist id="tt-list">
                      {tecnicos.filter((t) => t.tt).map((t, i) => (
                        <option key={i} value={t.tt}>{t.nome_tecnico}</option>
                      ))}
                    </datalist>
                    {ttError && <p className="text-xs text-destructive font-medium">{ttError}</p>}
                    {tecnicos.length === 0 && (
                      <p className="text-xs text-muted-foreground">Importe a planilha de técnicos na aba "Cadastros"</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Nome do Técnico *</Label>
                    <Input value={nomeTecnico} readOnly placeholder="Preenchido automaticamente pela TT" className="bg-muted/50 uppercase" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Telefone do Técnico</Label>
                    <Input value={telefoneTecnico} readOnly placeholder="Preenchido automaticamente" className="bg-muted/50" />
                  </div>
                </div>

                {/* Row: Cidade + Sigla + UF */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label>Sigla da Estação *</Label>
                    <Input 
                      ref={siglaCidadeRef}
                      value={siglaCidade} 
                      onChange={(e) => setSiglaCidade(toUpper(e.target.value).slice(0, 4))} 
                      placeholder="MÁX 4 CARACTERES" 
                      maxLength={4} 
                      className="uppercase" 
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Cidade *</Label>
                    <Input
                      ref={cidadeRef}
                      value={cidade}
                      onChange={(e) => handleCidadeChange(e.target.value)}
                      placeholder="NOME DA CIDADE"
                      className="uppercase"
                      list="cidades-sc"
                    />
                    <datalist id="cidades-sc">
                      {CIDADES_SC.map(c => <option key={c} value={c} />)}
                    </datalist>
                  </div>
                  <div className="space-y-1.5">
                    <Label>UF *</Label>
                    <Select value={uf} onValueChange={setUf}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {UF_LIST.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Row: Atividade + Tipo Aplicação + Data Execução */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label>Atividade *</Label>
                    <Select value={atividade} onValueChange={setAtividade}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ATIVAÇÃO">ATIVAÇÃO</SelectItem>
                        <SelectItem value="RETIRADA">RETIRADA</SelectItem>
                        <SelectItem value="REPARO">REPARO</SelectItem>
                        <SelectItem value="PREVENTIVA">PREVENTIVA</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Tipo Aplicação *</Label>
                    <Select value={tipoAplicacao} onValueChange={setTipoAplicacao}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {atividade === "RETIRADA" ? (
                          <>
                            <SelectItem value="REVERSA">REVERSA</SelectItem>
                            <SelectItem value="SEM MATERIAL">SEM MATERIAL</SelectItem>
                          </>
                        ) : (
                          <>
                            <SelectItem value="APLICAR/BAIXAR">APLICAR/BAIXAR</SelectItem>
                            <SelectItem value="REVERSA">REVERSA</SelectItem>
                            <SelectItem value="SEM MATERIAL">SEM MATERIAL</SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Data de Execução *</Label>
                    <Input ref={dataExecucaoRef} type="date" value={dataExecucao} onChange={(e) => setDataExecucao(e.target.value)} />
                  </div>
                </div>

                {/* Row: BA + Circuito */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>BA *</Label>
                    <Input ref={baRef} value={ba} onChange={(e) => setBa(toUpper(e.target.value))} placeholder="NÚMERO DO BA" className="uppercase" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Circuito *</Label>
                    <Input ref={circuitoRef} value={circuito} onChange={(e) => setCircuito(toUpper(e.target.value))} placeholder="CIRCUITO" className="uppercase" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* RETIRADA/REVERSA Checkpoints */}
            {isReversa && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base text-primary">Checkpoints - Local de Retirada</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Local de retirada do material *</Label>
                    <Select value={localRetirada} onValueChange={setLocalRetirada}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ESTACAO E CLIENTE">ESTAÇÃO E CLIENTE</SelectItem>
                        <SelectItem value="SO CLIENTE">SÓ CLIENTE</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {localRetirada === "SO CLIENTE" && (
                    <div className="space-y-1.5">
                      <Label>Classificação do Cenário *</Label>
                      <Select value={classificacaoCenario} onValueChange={setClassificacaoCenario}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="SEM MATERIAL ESTAÇÃO">SEM MATERIAL ESTAÇÃO</SelectItem>
                          <SelectItem value="CLIENTE COMPARTILHADO">CLIENTE COMPARTILHADO</SelectItem>
                          <SelectItem value="ESTAÇÃO COMPARTILHADO">ESTAÇÃO COMPARTILHADO</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {(classificacaoCenario === "CLIENTE COMPARTILHADO" || classificacaoCenario === "ESTAÇÃO COMPARTILHADO") && (
                    <div className="space-y-1.5">
                      <Label>Circuito Compartilhado *</Label>
                      <Input
                        value={circuitoCompartilhado}
                        onChange={(e) => setCircuitoCompartilhado(toUpper(e.target.value))}
                        placeholder="IDENTIFIQUE O CIRCUITO"
                        className="uppercase"
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Materials - Hide if SEM MATERIAL */}
            {!isSemMaterial && (
              <Card>
                <CardHeader className="pb-3 flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Materiais Aplicados</CardTitle>
                  <Button size="sm" variant="outline" onClick={addMaterial}>
                    <Plus className="w-4 h-4 mr-1" /> Adicionar
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  {materiais.map((mat, idx) => {
                    const matError = getMaterialError(mat);
                    return (
                      <div key={mat.id} className="border rounded-lg p-3 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-muted-foreground">Material {idx + 1}</span>
                          {materiais.length > 1 && (
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeMaterial(mat.id)}>
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">Código *</Label>
                            <Input
                              value={mat.codigo_material}
                              onChange={(e) => handleCodigoChange(mat.id, e.target.value)}
                              placeholder="CÓDIGO"
                              list={`materiais-list-${mat.id}`}
                              className="uppercase"
                            />
                            <datalist id={`materiais-list-${mat.id}`}>
                              {materiaisCadastro.map((mc) => (
                                <option key={mc.codigo} value={mc.codigo}>{mc.nome_material}</option>
                              ))}
                            </datalist>
                            {matError && <p className="text-xs text-destructive font-medium">{matError}</p>}
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Nome Material *</Label>
                            <Input
                              value={mat.nome_material}
                              readOnly
                              placeholder="PREENCHIDO AUTOMATICAMENTE"
                              className="bg-muted/50 uppercase"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Qtde *</Label>
                            <Input
                              type="number"
                              min={1}
                              value={mat.quantidade}
                              onChange={(e) => handleQuantidadeChange(mat.id, e.target.value === "" ? "" : Number(e.target.value))}
                              onBlur={(e) => {
                                if (e.target.value === "" || Number(e.target.value) < 1) {
                                  handleQuantidadeChange(mat.id, 1);
                                }
                              }}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Un/Metro *</Label>
                            <Select value={mat.unidade} onValueChange={(v) => updateMaterial(mat.id, "unidade", v)}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Un">Un</SelectItem>
                                <SelectItem value="Metro">Metro</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          {mat.seriais.length === 0 && (
                            <div className="space-y-1">
                              <Label className="text-xs">Serial</Label>
                              <div className="flex gap-1">
                                <Input
                                  value={mat.serial}
                                  onChange={(e) => updateMaterial(mat.id, "serial", toUpper(e.target.value))}
                                  placeholder="SERIAL"
                                  className="flex-1 uppercase"
                                />
                                <Button size="icon" variant="outline" className="h-10 w-10 shrink-0" title="Ler código de barras / QR Code" onClick={() => openScanner((code) => updateMaterial(mat.id, "serial", code))}>
                                  <ScanBarcode className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Ask seriais dialog inline */}
                        {mat.askSeriais && Number(mat.quantidade) > 1 && (
                          <div className="border border-primary/30 rounded-md p-3 bg-primary/5 space-y-2">
                            <p className="text-sm font-medium">Necessita informar serial para cada equipamento? (Qtde: {mat.quantidade})</p>
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => handleAskSeriaisResponse(mat.id, true)}>Sim</Button>
                              <Button size="sm" variant="outline" onClick={() => handleAskSeriaisResponse(mat.id, false)}>Não</Button>
                            </div>
                          </div>
                        )}

                        {/* Multiple serial fields */}
                        {mat.seriais.length > 0 && !mat.askSeriais && (
                          <div className="space-y-2 border-t pt-2">
                            <Label className="text-xs font-medium">Seriais individuais ({mat.seriais.length})</Label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                              {mat.seriais.map((s, i) => (
                                <div key={i} className="flex gap-1">
                                  <Input
                                    value={s}
                                    onChange={(e) => updateSerial(mat.id, i, e.target.value)}
                                    placeholder={`SERIAL ${i + 1} *`}
                                    className="flex-1 uppercase"
                                  />
                                  <Button size="icon" variant="outline" className="h-10 w-10 shrink-0" title="Ler código" onClick={() => openScanner((code) => updateSerial(mat.id, i, code))}>
                                    <ScanBarcode className="w-4 h-4" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {/* ── REVERSA: Photo, Signatures, Frase ── */}
            {isReversa && (
              <>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                       <ImageIcon className="w-5 h-5 text-primary" /> Registro Fotográfico dos Materiais *
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-col gap-3">
                      <p className="text-sm text-muted-foreground">Selecione uma foto contendo todos os materiais visíveis para conferência.</p>
                      <div className="flex flex-wrap gap-2">
                        <Button className="gap-2 shrink-0" onClick={() => {
                          toast.warning("IMPORTANTE: Certifique-se de que a imagem esteja DATADA e de preferência com GEOLOCALIZAÇÃO.", {
                            duration: 8000,
                          });
                          galleryInputRef.current?.click();
                        }}>
                          <ImageIcon className="w-4 h-4" /> Carregar Foto
                        </Button>
                      </div>

                      <input 
                        id="gallery-select-input"
                        ref={galleryInputRef}
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={handleFotoChange} 
                      />

                      {fotoPreview && (
                        <div className="relative mt-2 inline-block">
                          <img src={fotoPreview} alt="Foto materiais" className="max-w-xs rounded border" />
                          <Button 
                            variant="destructive" 
                            size="icon" 
                            className="absolute -top-2 -right-2 h-6 w-6 rounded-full shadow-md"
                            onClick={() => { setFotoPreview(null); setFotoFile(null); }}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground italic leading-relaxed">{FRASE_REVERSA}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Assinatura do Colaborador *</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="border rounded-md bg-white" style={{ touchAction: "none" }}>
                      <canvas
                        ref={sigColabCanvasRef}
                        className="w-full cursor-crosshair"
                        style={{ height: 120 }}
                        onMouseDown={(e) => startDraw(sigColabCanvasRef.current, e, setIsDrawingColab)}
                        onMouseMove={(e) => draw(sigColabCanvasRef.current, e, isDrawingColab)}
                        onMouseUp={() => endDraw(setIsDrawingColab)}
                        onMouseLeave={() => endDraw(setIsDrawingColab)}
                        onTouchStart={(e) => { e.preventDefault(); startDraw(sigColabCanvasRef.current, e, setIsDrawingColab); }}
                        onTouchMove={(e) => { e.preventDefault(); draw(sigColabCanvasRef.current, e, isDrawingColab); }}
                        onTouchEnd={() => endDraw(setIsDrawingColab)}
                      />
                    </div>
                    <Button size="sm" variant="outline" onClick={() => clearCanvas(sigColabCanvasRef.current)}>Limpar Assinatura</Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Assinatura Almoxarifado/Logística <span className="text-xs text-muted-foreground font-normal">(opcional)</span></CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="border rounded-md bg-white" style={{ touchAction: "none" }}>
                      <canvas
                        ref={sigAlmoxCanvasRef}
                        className="w-full cursor-crosshair"
                        style={{ height: 120 }}
                        onMouseDown={(e) => startDraw(sigAlmoxCanvasRef.current, e, setIsDrawingAlmox)}
                        onMouseMove={(e) => draw(sigAlmoxCanvasRef.current, e, isDrawingAlmox)}
                        onMouseUp={() => endDraw(setIsDrawingAlmox)}
                        onMouseLeave={() => endDraw(setIsDrawingAlmox)}
                        onTouchStart={(e) => { e.preventDefault(); startDraw(sigAlmoxCanvasRef.current, e, setIsDrawingAlmox); }}
                        onTouchMove={(e) => { e.preventDefault(); draw(sigAlmoxCanvasRef.current, e, isDrawingAlmox); }}
                        onTouchEnd={() => endDraw(setIsDrawingAlmox)}
                      />
                    </div>
                    <Button size="sm" variant="outline" onClick={() => clearCanvas(sigAlmoxCanvasRef.current)}>Limpar Assinatura</Button>
                  </CardContent>
                </Card>
              </>
            )}

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Opções Adicionais</CardTitle>
              </CardHeader>
              <CardContent>
                <textarea
                  className="w-full min-h-[100px] p-3 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Observações complementares da atividade..."
                  value={opcoesAdicionais}
                  onChange={(e) => setOpcoesAdicionais(e.target.value)}
                />
              </CardContent>
            </Card>

            <div className="flex gap-3 flex-wrap">
              <Button onClick={handleSubmit} disabled={submitting} className="w-full md:w-auto">
                {submitting ? "Salvando..." : "Salvar"}
              </Button>
              {isReversa && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <FileText className="w-4 h-4" />
                  <span>O PDF será gerado automaticamente após salvar</span>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ── TAB: CADASTROS ── */}
          <TabsContent value="cadastros" className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5" /> Cadastro Técnicos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Tabs defaultValue="individual" className="w-full">
                  <TabsList className="mb-3">
                    <TabsTrigger value="individual">Cadastro Individual</TabsTrigger>
                    <TabsTrigger value="massivo">Importação em Massa</TabsTrigger>
                  </TabsList>
                  <TabsContent value="individual" className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">TR</Label>
                        <Input placeholder="TR" value={newTecnicoForm.tr} onChange={(e) => setNewTecnicoForm(f => ({ ...f, tr: toUpper(e.target.value) }))} className="uppercase" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">TT *</Label>
                        <Input placeholder="TT" value={newTecnicoForm.tt} onChange={(e) => setNewTecnicoForm(f => ({ ...f, tt: toUpper(e.target.value) }))} className="uppercase" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Nome Empresa</Label>
                        <Input placeholder="Empresa" value={newTecnicoForm.nome_empresa} onChange={(e) => setNewTecnicoForm(f => ({ ...f, nome_empresa: toUpper(e.target.value) }))} className="uppercase" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Nome Técnico *</Label>
                        <Input placeholder="Nome" value={newTecnicoForm.nome_tecnico} onChange={(e) => setNewTecnicoForm(f => ({ ...f, nome_tecnico: toUpper(e.target.value) }))} className="uppercase" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Supervisor</Label>
                        <Input placeholder="Supervisor" value={newTecnicoForm.supervisor} onChange={(e) => setNewTecnicoForm(f => ({ ...f, supervisor: toUpper(e.target.value) }))} className="uppercase" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Coordenador</Label>
                        <Input placeholder="Coordenador" value={newTecnicoForm.coordenador} onChange={(e) => setNewTecnicoForm(f => ({ ...f, coordenador: toUpper(e.target.value) }))} className="uppercase" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Telefone</Label>
                        <Input placeholder="Telefone" value={newTecnicoForm.telefone} onChange={(e) => setNewTecnicoForm(f => ({ ...f, telefone: e.target.value }))} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Cidade</Label>
                        <Input placeholder="Cidade" value={newTecnicoForm.cidade_residencia} onChange={(e) => setNewTecnicoForm(f => ({ ...f, cidade_residencia: toUpper(e.target.value) }))} className="uppercase" />
                      </div>
                    </div>
                    <Button size="sm" onClick={handleSaveNewTecnico} className="gap-1">
                      <Plus className="w-4 h-4" /> Cadastrar Técnico
                    </Button>
                  </TabsContent>
                  <TabsContent value="massivo" className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Colunas esperadas: <strong>TR, TT, Nome Empresa, Nome Técnico, Supervisor, Coordenador, Telefone, Cidade</strong>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <label className="inline-flex items-center gap-2 cursor-pointer px-4 py-2 border rounded-md text-sm hover:bg-accent transition-colors">
                        <Upload className="w-4 h-4" /> Importar Planilha
                        <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleTecnicoUpload} />
                      </label>
                      <Button variant="outline" size="sm" onClick={downloadTemplateTecnicos}>
                        <Download className="w-4 h-4 mr-1" /> Baixar Modelo
                      </Button>
                    </div>
                  </TabsContent>
                </Tabs>
                <div className="max-h-48 overflow-auto border rounded">
                  {tecnicos.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">TR</TableHead>
                          <TableHead className="text-xs">TT</TableHead>
                          <TableHead className="text-xs">Empresa</TableHead>
                          <TableHead className="text-xs">Técnico</TableHead>
                          <TableHead className="text-xs">Supervisor</TableHead>
                          <TableHead className="text-xs">Coordenador</TableHead>
                          <TableHead className="text-xs">Telefone</TableHead>
                          <TableHead className="text-xs">Cidade</TableHead>
                          <TableHead className="text-xs">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tecnicos.slice(0, 50).map((t, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs">{t.tr}</TableCell>
                            <TableCell className="text-xs">{t.tt}</TableCell>
                            <TableCell className="text-xs">{t.nome_empresa}</TableCell>
                            <TableCell className="text-xs">{t.nome_tecnico}</TableCell>
                            <TableCell className="text-xs">{t.supervisor}</TableCell>
                            <TableCell className="text-xs">{t.coordenador}</TableCell>
                            <TableCell className="text-xs">{t.telefone}</TableCell>
                            <TableCell className="text-xs">{t.cidade_residencia}</TableCell>
                            <TableCell className="text-xs">
                              <div className="flex gap-1">
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleEditTecnico(t)} title="Editar">
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDeleteTecnico(t)} title="Excluir">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="text-sm text-muted-foreground italic py-4 text-center">Nenhum técnico cadastrado.</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5" /> Cadastro Materiais
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Tabs defaultValue="individual" className="w-full">
                  <TabsList className="mb-3">
                    <TabsTrigger value="individual">Cadastro Individual</TabsTrigger>
                    <TabsTrigger value="massivo">Importação em Massa</TabsTrigger>
                  </TabsList>
                  <TabsContent value="individual" className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Código *</Label>
                        <Input placeholder="Código do material" value={newMaterialForm.codigo} onChange={(e) => setNewMaterialForm(f => ({ ...f, codigo: toUpper(e.target.value) }))} className="uppercase" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Nome Material *</Label>
                        <Input placeholder="Nome do material" value={newMaterialForm.nome_material} onChange={(e) => setNewMaterialForm(f => ({ ...f, nome_material: toUpper(e.target.value) }))} className="uppercase" />
                      </div>
                    </div>
                    <Button size="sm" onClick={handleSaveNewMaterial} className="gap-1">
                      <Plus className="w-4 h-4" /> Cadastrar Material
                    </Button>
                  </TabsContent>
                  <TabsContent value="massivo" className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Colunas esperadas: <strong>Codigo, Nome Material</strong>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <label className="inline-flex items-center gap-2 cursor-pointer px-4 py-2 border rounded-md text-sm hover:bg-accent transition-colors">
                        <Upload className="w-4 h-4" /> Importar Planilha
                        <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleMaterialUpload} />
                      </label>
                      <Button variant="outline" size="sm" onClick={downloadTemplateMateriais}>
                        <Download className="w-4 h-4 mr-1" /> Baixar Modelo
                      </Button>
                    </div>
                  </TabsContent>
                </Tabs>
                <div className="max-h-48 overflow-auto border rounded">
                  {materiaisCadastro.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Código</TableHead>
                          <TableHead className="text-xs">Nome Material</TableHead>
                          <TableHead className="text-xs">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {materiaisCadastro.slice(0, 50).map((m, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs">{m.codigo}</TableCell>
                            <TableCell className="text-xs">{m.nome_material}</TableCell>
                            <TableCell className="text-xs">
                              <div className="flex gap-1">
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleEditMaterial(m)} title="Editar">
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDeleteMaterial(m)} title="Excluir">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="text-sm text-muted-foreground italic py-4 text-center">Nenhum material cadastrado.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── TAB: CONSULTA ── */}
          <TabsContent value="consulta" className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Consultar Coletas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">BA</Label>
                    <Input value={searchBa} onChange={(e) => setSearchBa(toUpper(e.target.value))} placeholder="FILTRAR BA" className="uppercase" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Circuito</Label>
                    <Input value={searchCircuito} onChange={(e) => setSearchCircuito(toUpper(e.target.value))} placeholder="FILTRAR CIRCUITO" className="uppercase" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Técnico</Label>
                    <Input value={searchTecnico} onChange={(e) => setSearchTecnico(toUpper(e.target.value))} placeholder="FILTRAR TÉCNICO" className="uppercase" />
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button onClick={handleSearch} disabled={searching}>
                    <Search className="w-4 h-4 mr-1" /> {searching ? "Carregando..." : "Filtrar"}
                  </Button>
                  <Button variant="ghost" onClick={handleClearFilters}>
                    Limpar Filtros
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => loadAllColetas()} title="Recarregar">
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="icon" title="Exportar">
                        <FileSpreadsheet className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => setGestechExportOpen(true)}>
                        Exportar para Aplicação Gestech
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleExport("xlsx")}>
                        Exportar Excel
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleExport("csv")}>
                        Exportar CSV
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <p className="text-xs text-muted-foreground">
                  {coletas.length} registro(s) {searchBa || searchCircuito || searchTecnico ? "(filtrado)" : ""}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-0">
                <div className="overflow-auto max-h-[60vh]">
                  {searching ? (
                    <p className="text-sm text-muted-foreground text-center py-8">Carregando coletas...</p>
                  ) : coletas.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[40px]">
                            <Checkbox 
                              checked={selectedColetaIds.size === coletas.length && coletas.length > 0} 
                              onCheckedChange={toggleSelectAll}
                            />
                          </TableHead>
                          <TableHead className="text-xs">Data Execução</TableHead>
                          <TableHead className="text-xs">BA</TableHead>
                          <TableHead className="text-xs">Circuito</TableHead>
                          <TableHead className="text-xs">Técnico</TableHead>
                          <TableHead className="text-xs">Atividade</TableHead>
                          <TableHead className="text-xs">Tipo</TableHead>
                          <TableHead className="text-xs">Materiais</TableHead>
                          <TableHead className="text-xs text-center">Status</TableHead>
                          <TableHead className="text-xs text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {coletas.map((c) => (
                          <TableRow key={c.id}>
                            <TableCell>
                              <Checkbox 
                                checked={selectedColetaIds.has(c.id)} 
                                onCheckedChange={() => toggleSelectOne(c.id)}
                              />
                            </TableCell>
                            <TableCell className="text-xs">
                              {c.data_execucao ? new Date(c.data_execucao + "T12:00:00").toLocaleDateString("pt-BR") : new Date(c.created_at).toLocaleDateString("pt-BR")}
                            </TableCell>
                            <TableCell className="text-xs">{c.ba || "-"}</TableCell>
                            <TableCell className="text-xs">{c.circuito || "-"}</TableCell>
                            <TableCell className="text-xs">{c.nome_tecnico}</TableCell>
                            <TableCell className="text-xs">{c.atividade}</TableCell>
                            <TableCell className="text-xs">{c.tipo_aplicacao}</TableCell>
                            <TableCell className="text-xs">
                              {c.material_coleta_items.map((item, i) => (
                                <div key={i}>{item.codigo_material} - {item.nome_material} (x{item.quantidade})</div>
                              ))}
                            </TableCell>
                            <TableCell className="text-center">
                              {c.atividade === "RETIRADA" && c.tipo_aplicacao === "REVERSA" ? (
                                <Truck className="w-5 h-5 text-primary mx-auto" />
                              ) : c.last_exported_at ? (
                                <CheckCircle2 className="w-5 h-5 text-success mx-auto" />
                              ) : (
                                (() => {
                                  const sevenDaysAgo = new Date();
                                  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
                                  const createdAt = new Date(c.created_at);
                                  if (createdAt < sevenDaysAgo) {
                                    return <AlertCircle className="w-5 h-5 text-destructive mx-auto" />;
                                  }
                                  return <AlertTriangle className="w-5 h-5 text-warning mx-auto" />;
                                })()
                              )}
                            </TableCell>
                            <TableCell className="text-xs">
                              <div className="flex gap-1">
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setViewColeta(c)} title="Visualizar">
                                  <Eye className="w-3.5 h-3.5" />
                                </Button>
                                {c.pdf_url && (
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-primary" onClick={() => window.open(c.pdf_url!, "_blank")} title="Doc Logística (PDF)">
                                    <FileText className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(c.id)} title="Excluir">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">Nenhuma coleta encontrada.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Delete confirmation (Coleta) */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir registro?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita. O registro e todos os materiais associados serão removidos.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation (Técnico) */}
      <AlertDialog open={!!deleteTecnico} onOpenChange={() => setDeleteTecnico(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Técnico?</AlertDialogTitle>
            <AlertDialogDescription>Deseja remover {deleteTecnico?.nome_tecnico} da base?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteTecnico} className="bg-destructive text-destructive-foreground">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation (Material) */}
      <AlertDialog open={!!deleteMaterial} onOpenChange={() => setDeleteMaterial(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Material?</AlertDialogTitle>
            <AlertDialogDescription>Deseja remover o material {deleteMaterial?.nome_material} da base?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteMaterial} className="bg-destructive text-destructive-foreground">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Técnico Dialog */}
      <Dialog open={!!editingTecnico} onOpenChange={() => setEditingTecnico(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Editar Técnico</DialogTitle></DialogHeader>
          {editingTecnico && (
            <div className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1"><Label>TT</Label><Input value={editingTecnico.tt} readOnly className="bg-muted" /></div>
                <div className="space-y-1"><Label>TR</Label><Input value={editingTecnico.tr} readOnly className="bg-muted" /></div>
              </div>
              <div className="space-y-1"><Label>Nome Técnico</Label><Input value={editingTecnico.nome_tecnico} onChange={e => setEditingTecnico({ ...editingTecnico, nome_tecnico: e.target.value.toUpperCase() })} /></div>
              <div className="space-y-1"><Label>Empresa</Label><Input value={editingTecnico.nome_empresa} onChange={e => setEditingTecnico({ ...editingTecnico, nome_empresa: e.target.value.toUpperCase() })} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1"><Label>Supervisor</Label><Input value={editingTecnico.supervisor} onChange={e => setEditingTecnico({ ...editingTecnico, supervisor: e.target.value.toUpperCase() })} /></div>
                <div className="space-y-1"><Label>Coordenador</Label><Input value={editingTecnico.coordenador} onChange={e => setEditingTecnico({ ...editingTecnico, coordenador: e.target.value.toUpperCase() })} /></div>
              </div>
              <Button onClick={handleSaveTecnico} className="w-full">Salvar</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Gestech Export Dialog */}
      <Dialog open={gestechExportOpen} onOpenChange={setGestechExportOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Exportar para Gestech</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <p className="text-sm text-muted-foreground">
              Selecione o período para gerar o relatório Gestech. Apenas registros não exportados de ATIVAÇÃO, REPARO e PREVENTIVA serão incluídos.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Início *</Label>
                <Input
                  type="date"
                  value={gestechStartDate}
                  onChange={(e) => setGestechStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Fim *</Label>
                <Input
                  type="date"
                  value={gestechEndDate}
                  onChange={(e) => setGestechEndDate(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setGestechExportOpen(false)}>Cancelar</Button>
              <Button onClick={handleGestechExport}>Exportar Gestech</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Material Dialog */}
      < Dialog open={!!editingMaterial} onOpenChange={() => setEditingMaterial(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Editar Material</DialogTitle></DialogHeader>
          {editingMaterial && (
            <div className="space-y-4 pt-4">
              <div className="space-y-1"><Label>Código</Label><Input value={editingMaterial.codigo} readOnly className="bg-muted" /></div>
              <div className="space-y-1"><Label>Nome do Material</Label><Input value={editingMaterial.nome_material} onChange={e => setEditingMaterial({ ...editingMaterial, nome_material: e.target.value.toUpperCase() })} /></div>
              <DialogFooter><Button onClick={handleSaveMaterial}>Salvar Alterações</Button></DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog >

      {/* View detail dialog */}
      < Dialog open={!!viewColeta} onOpenChange={() => setViewColeta(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Detalhes da Coleta</DialogTitle>
            <DialogDescription>Registro completo da coleta de materiais</DialogDescription>
          </DialogHeader>
          {viewColeta && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><strong>TT:</strong> {viewColeta.matricula_tt || "-"}</div>
                <div><strong>Técnico:</strong> {viewColeta.nome_tecnico}</div>
                <div><strong>Cidade:</strong> {viewColeta.cidade || "-"} ({viewColeta.sigla_cidade || ""}) - {viewColeta.uf || ""}</div>
                <div><strong>BA:</strong> {viewColeta.ba || "-"}</div>
                <div><strong>Circuito:</strong> {viewColeta.circuito || "-"}</div>
                <div><strong>Atividade:</strong> {viewColeta.atividade}</div>
                <div><strong>Tipo:</strong> {viewColeta.tipo_aplicacao}</div>
                <div><strong>Data:</strong> {viewColeta.data_execucao ? new Date(viewColeta.data_execucao + "T12:00:00").toLocaleDateString("pt-BR") : "-"}</div>
              </div>
              <div>
                <strong>Materiais:</strong>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Código</TableHead>
                      <TableHead className="text-xs">Nome</TableHead>
                      <TableHead className="text-xs">Qtde</TableHead>
                      <TableHead>Activity</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {viewColeta.material_coleta_items.map((item, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs">{item.codigo_material}</TableCell>
                        <TableCell className="text-xs">{item.nome_material}</TableCell>
                        <TableCell className="text-xs">{item.quantidade}</TableCell>
                        <TableCell className="text-xs">{item.unidade}</TableCell>
                        <TableCell className="text-xs">{item.serial || "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {((viewColeta.tipo_aplicacao === "REVERSA" || viewColeta.atividade === "RETIRADA") && !viewColeta.almox_edit_done) && (
                <div className="space-y-2 border-t pt-3">
                  <Label className="text-sm font-semibold text-primary">Assinatura de Recebimento (Almoxarifado)</Label>
                  <p className="text-xs text-muted-foreground">O Almoxarifado pode assinar o recebimento apenas uma vez.</p>
                  <div className="border rounded-md bg-white" style={{ touchAction: "none" }}>
                    <canvas
                      ref={sigDialogAlmoxCanvasRef}
                      className="w-full cursor-crosshair"
                      style={{ height: 100 }}
                      onMouseDown={(e) => startDraw(sigDialogAlmoxCanvasRef.current, e, setIsDrawingDialogAlmox)}
                      onMouseMove={(e) => draw(sigDialogAlmoxCanvasRef.current, e, isDrawingDialogAlmox)}
                      onMouseUp={() => endDraw(setIsDrawingDialogAlmox)}
                      onMouseLeave={() => endDraw(setIsDrawingDialogAlmox)}
                      onTouchStart={(e) => { e.preventDefault(); startDraw(sigDialogAlmoxCanvasRef.current, e, setIsDrawingDialogAlmox); }}
                      onTouchMove={(e) => { e.preventDefault(); draw(sigDialogAlmoxCanvasRef.current, e, isDrawingDialogAlmox); }}
                      onTouchEnd={() => endDraw(setIsDrawingDialogAlmox)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => clearCanvas(sigDialogAlmoxCanvasRef.current)}>Limpar</Button>
                    <Button size="sm" onClick={() => handleRequestAlmoxSignature(viewColeta.id)}>Salvar Assinatura Recebimento</Button>
                  </div>
                </div>
              )}

              {viewColeta.almox_edit_done && viewColeta.assinatura_almoxarifado && (
                <div className="space-y-1 border-t pt-3">
                  <Label className="text-xs font-medium">Assinatura Almoxarifado (Recebido)</Label>
                  <div className="h-16 border rounded bg-white flex items-center justify-center p-1">
                    <img src={viewColeta.assinatura_almoxarifado} alt="Assinatura Almox" className="h-full object-contain" />
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-3 border-t">
                {viewColeta.pdf_url && (
                  <Button size="sm" variant="outline" onClick={() => window.open(viewColeta.pdf_url!, "_blank")}>
                    <FileText className="w-4 h-4 mr-1" /> Doc Logística (PDF)
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => {
                  // Regenerate PDF from coleta data
                  const items: MaterialItem[] = viewColeta.material_coleta_items.map((item, i) => ({
                    id: String(i),
                    codigo_material: item.codigo_material,
                    nome_material: item.nome_material,
                    quantidade: item.quantidade,
                    unidade: item.unidade,
                    serial: item.serial || "",
                    seriais: [],
                    askSeriais: false,
                  }));
                  generatePDF({
                    matriculaTt: viewColeta.matricula_tt || "",
                    nomeTecnico: viewColeta.nome_tecnico,
                    telefoneTecnico: "",
                    cidade: viewColeta.cidade || "",
                    siglaCidade: viewColeta.sigla_cidade || "",
                    uf: viewColeta.uf || "",
                    atividade: viewColeta.atividade,
                    ba: viewColeta.ba || "",
                    circuito: viewColeta.circuito || "",
                    dataExecucao: viewColeta.data_execucao || "",
                    materiais: items,
                    assinaturaColaborador: viewColeta.assinatura_colaborador || "",
                    assinaturaAlmoxarifado: viewColeta.assinatura_almoxarifado || "",
                    fotoDataUrl: viewColeta.foto_url || null,
                    tipo_aplicacao: viewColeta.tipo_aplicacao,
                  });
                }}>
                  <Download className="w-4 h-4 mr-1" /> Gerar PDF
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog >

      {/* Scanner Dialog */}
      <Dialog open={scannerOpen} onOpenChange={(open) => { if (!open) closeScanner(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Leitor de Código</DialogTitle>
            <DialogDescription>Aponte a câmera para o código de barras ou QR Code</DialogDescription>
          </DialogHeader>
          <div id="barcode-scanner-container" className="w-full min-h-[300px] rounded-md overflow-hidden" />
          <DialogFooter>
            <Button variant="outline" onClick={closeScanner}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div >
  );
};

// Final update for form adjustments and branding removal - 2026-03-11
export default MaterialColeta;
