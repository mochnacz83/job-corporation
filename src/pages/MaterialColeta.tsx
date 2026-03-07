import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ArrowLeft, Plus, Trash2, Upload, FileSpreadsheet, Search, Download, ImageIcon, FileText, ScanBarcode, Pencil, Eye } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";

interface MaterialItem {
  id: string;
  codigo_material: string;
  nome_material: string;
  quantidade: number;
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
  material_coleta_items: { codigo_material: string; nome_material: string; quantidade: number; unidade: string; serial: string | null }[];
}

const FRASE_REVERSA = "Declaro que os materiais apresentados neste documento foram devidamente retirados no local da atividade e separados para devolução, conforme registro realizado nesta data. A imagem anexada comprova visualmente os itens coletados, estando todos visíveis para conferência. O colaborador responsável confirma a veracidade das informações registradas e a correta separação dos materiais para encaminhamento ao Almoxarifado/Logística da Ability Tecnologia, ficando sujeitos à validação e conferência no ato da entrega.";

const UF_LIST = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

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
  const navigate = useNavigate();
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

  // Cadastro lists
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [materiaisCadastro, setMateriaisCadastro] = useState<MaterialCadastro[]>([]);

  // Consultation state
  const [searchBa, setSearchBa] = useState("");
  const [searchCircuito, setSearchCircuito] = useState("");
  const [searchTecnico, setSearchTecnico] = useState("");
  const [coletas, setColetas] = useState<ColetaRecord[]>([]);
  const [searching, setSearching] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewColeta, setViewColeta] = useState<ColetaRecord | null>(null);

  const isReversa = tipoAplicacao === "REVERSA";

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
        if (found.cidade_residencia) setCidade(found.cidade_residencia.toUpperCase());
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

  // Photo handling
  const handleFotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFotoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setFotoPreview(ev.target?.result as string);
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
      const mapped = rows.map((r) => ({
        tr: String(r.TR || r.tr || ""),
        tt: String(r.TT || r.tt || ""),
        nome_empresa: String(r["Nome Empresa"] || r.nome_empresa || ""),
        nome_tecnico: String(r["Nome Técnico"] || r["Nome Tecnico"] || r.nome_tecnico || ""),
        supervisor: String(r.Supervisor || r.supervisor || ""),
        coordenador: String(r.Coordenador || r.coordenador || ""),
        telefone: String(r.Telefone || r.telefone || r.Celular || r.celular || ""),
        cidade_residencia: String(r.Cidade || r.cidade || r["Cidade Residência"] || r.cidade_residencia || ""),
        uploaded_by: user.id,
      }));
      const { error } = await supabase.from("tecnicos_cadastro").insert(mapped as any);
      if (error) throw error;
      toast.success(`${mapped.length} técnicos importados com sucesso`);
      setTecnicos((prev) => [...prev, ...mapped]);
    } catch (err: any) {
      toast.error("Erro ao importar planilha: " + err.message);
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

  const handleQuantidadeChange = (id: string, qty: number) => {
    setMateriais((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        if (qty > 1 && !m.askSeriais) {
          return { ...m, quantidade: qty, askSeriais: true, seriais: Array(qty).fill("") };
        }
        if (qty <= 1) {
          return { ...m, quantidade: qty, askSeriais: false, seriais: [] };
        }
        // qty changed but already asked
        const newSeriais = Array(qty).fill("").map((_, i) => m.seriais[i] || "");
        return { ...m, quantidade: qty, seriais: newSeriais };
      })
    );
  };

  const handleAskSeriaisResponse = (id: string, yes: boolean) => {
    setMateriais((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        if (yes) {
          return { ...m, askSeriais: false, seriais: Array(m.quantidade).fill("") };
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
    } catch {}

    // Header
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("MATERIAL DE REVERSA", pageW / 2, y + 7, { align: "center" });
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
      ["Tipo Aplicação:", "REVERSA"],
      ["BA:", coletaData.ba || "-"],
      ["Circuito:", coletaData.circuito || "-"],
    ];
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

    // Materials table
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

    // Frase padrão
    doc.setFontSize(6);
    doc.setFont("helvetica", "italic");
    const splitText = doc.splitTextToSize(FRASE_REVERSA, pageW - 2 * margin);
    doc.text(splitText, margin, y);
    y += splitText.length * 2.5 + 3;

    // Photo + Signatures side by side
    const sigStartY = y;
    const photoW = 45;
    const photoH = 35;

    if (coletaData.fotoDataUrl) {
      try {
        doc.addImage(coletaData.fotoDataUrl, "JPEG", margin, y, photoW, photoH);
      } catch {}
    }

    // Signatures on the right side
    const sigX = margin + photoW + 10;
    const sigW = 45;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);

    if (coletaData.assinaturaColaborador) {
      doc.text("Assinatura Colaborador:", sigX, y + 2);
      try {
        doc.addImage(coletaData.assinaturaColaborador, "PNG", sigX, y + 3, sigW, 14);
      } catch {}
      doc.line(sigX, y + 18, sigX + sigW, y + 18);
      doc.setFontSize(6);
      doc.text(coletaData.nomeTecnico, sigX, y + 21);
    }

    if (coletaData.assinaturaAlmoxarifado) {
      const almoxY = y + 24;
      doc.setFontSize(7);
      doc.text("Assinatura Almox/Logística:", sigX, almoxY);
      try {
        doc.addImage(coletaData.assinaturaAlmoxarifado, "PNG", sigX, almoxY + 1, sigW, 14);
      } catch {}
      doc.line(sigX, almoxY + 16, sigX + sigW, almoxY + 16);
      doc.setFontSize(6);
      doc.text("Almoxarifado/Logística", sigX, almoxY + 19);
    }

    // Footer
    doc.setFontSize(6);
    doc.setTextColor(150, 150, 150);
    doc.text("Ability Tecnologia — Documento gerado automaticamente", pageW / 2, 290, { align: "center" });

    doc.save(`material_reversa_${coletaData.ba || "sem_ba"}_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  // Submit form
  const handleSubmit = async () => {
    if (!user) return;

    // Validate required fields
    if (!matriculaTt || !nomeTecnico || !atividade || !tipoAplicacao || !ba || !circuito || !dataExecucao || !cidade || !siglaCidade || !uf) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    // Validate TT exists
    if (ttError) {
      toast.error("TT informado não localizado no cadastro.");
      return;
    }
    const ttExists = tecnicos.find((t) => t.tt?.toUpperCase() === matriculaTt.toUpperCase());
    if (!ttExists) {
      toast.error("TT informado não localizado no cadastro.");
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
        } as any)
        .select("id")
        .single();

      if (coletaError) throw coletaError;

      // Flatten seriais into individual items
      const items: any[] = [];
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

      const { error: itemsError } = await supabase.from("material_coleta_items").insert(items as any);
      if (itemsError) throw itemsError;

      toast.success("Salvo com sucesso!");

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
        });
      }

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

  // Search / Consultation
  const handleSearch = async () => {
    setSearching(true);
    try {
      let query = supabase.from("material_coletas").select("id, matricula_tt, nome_tecnico, cidade, sigla_cidade, uf, atividade, tipo_aplicacao, circuito, ba, data_execucao, created_at, material_coleta_items(codigo_material, nome_material, quantidade, unidade, serial)") as any;
      if (searchBa) query = query.ilike("ba", `%${searchBa}%`);
      if (searchCircuito) query = query.ilike("circuito", `%${searchCircuito}%`);
      if (searchTecnico) query = query.ilike("nome_tecnico", `%${searchTecnico}%`);
      const { data, error } = await query.order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      setColetas((data || []) as ColetaRecord[]);
    } catch (err: any) {
      toast.error("Erro na consulta: " + err.message);
    } finally {
      setSearching(false);
    }
  };

  // Delete
  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await supabase.from("material_coleta_items").delete().eq("coleta_id", deleteId);
      await supabase.from("material_coletas").delete().eq("id", deleteId);
      setColetas((prev) => prev.filter((c) => c.id !== deleteId));
      toast.success("Registro excluído");
    } catch (err: any) {
      toast.error("Erro ao excluir: " + err.message);
    } finally {
      setDeleteId(null);
    }
  };

  // Export Excel
  const handleExport = (format: "xlsx" | "csv") => {
    if (coletas.length === 0) { toast.error("Nenhum dado para exportar"); return; }
    const rows = coletas.flatMap((c) =>
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
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 h-14 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="p-1 bg-transparent w-9 h-9 flex items-center justify-center overflow-hidden">
            <img src="/ability-logo.png" alt="Logo" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-base font-bold text-foreground">Formulário de Coleta Material Dados</h1>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-4 overflow-auto">
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
                    <Label>Cidade *</Label>
                    <Input value={cidade} onChange={(e) => setCidade(toUpper(e.target.value))} placeholder="NOME DA CIDADE" className="uppercase" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Sigla da Cidade *</Label>
                    <Input value={siglaCidade} onChange={(e) => setSiglaCidade(toUpper(e.target.value).slice(0, 4))} placeholder="MÁX 4 CARACTERES" maxLength={4} className="uppercase" />
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
                        <SelectItem value="APLICAR/BAIXAR">APLICAR/BAIXAR</SelectItem>
                        <SelectItem value="REVERSA">REVERSA</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Data de Execução *</Label>
                    <Input type="date" value={dataExecucao} onChange={(e) => setDataExecucao(e.target.value)} />
                  </div>
                </div>

                {/* Row: BA + Circuito */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>BA *</Label>
                    <Input value={ba} onChange={(e) => setBa(toUpper(e.target.value))} placeholder="NÚMERO DO BA" className="uppercase" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Circuito *</Label>
                    <Input value={circuito} onChange={(e) => setCircuito(toUpper(e.target.value))} placeholder="CIRCUITO" className="uppercase" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Materials */}
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
                            onChange={(e) => handleQuantidadeChange(mat.id, Math.max(1, Number(e.target.value)))}
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
                              <Button size="icon" variant="outline" className="h-10 w-10 shrink-0" title="Ler código de barras / QR Code">
                                <ScanBarcode className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Ask seriais dialog inline */}
                      {mat.askSeriais && mat.quantidade > 1 && (
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
                                <Button size="icon" variant="outline" className="h-10 w-10 shrink-0" title="Ler código">
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

            {/* ── REVERSA: Photo, Signatures, Frase ── */}
            {isReversa && (
              <>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <ImageIcon className="w-5 h-5" /> Registro Fotográfico dos Materiais *
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">Tire uma foto contendo todos os materiais visíveis para conferência.</p>
                    <label className="inline-flex items-center gap-2 cursor-pointer px-4 py-2 border rounded-md text-sm hover:bg-accent transition-colors">
                      <ImageIcon className="w-4 h-4" /> Capturar / Selecionar Foto
                      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFotoChange} />
                    </label>
                    {fotoPreview && (
                      <div className="mt-2">
                        <img src={fotoPreview} alt="Foto materiais" className="max-w-xs rounded border" />
                      </div>
                    )}
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
                  <FileSpreadsheet className="w-5 h-5" /> Planilha de Técnicos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
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
                {tecnicos.length > 0 && (
                  <div className="max-h-48 overflow-auto border rounded">
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
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5" /> Planilha de Materiais
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
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
                {materiaisCadastro.length > 0 && (
                  <div className="max-h-48 overflow-auto border rounded">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Código</TableHead>
                          <TableHead className="text-xs">Nome Material</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {materiaisCadastro.slice(0, 50).map((m, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs">{m.codigo}</TableCell>
                            <TableCell className="text-xs">{m.nome_material}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
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
                    <Input value={searchBa} onChange={(e) => setSearchBa(toUpper(e.target.value))} placeholder="BUSCAR BA" className="uppercase" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Circuito</Label>
                    <Input value={searchCircuito} onChange={(e) => setSearchCircuito(toUpper(e.target.value))} placeholder="BUSCAR CIRCUITO" className="uppercase" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Técnico</Label>
                    <Input value={searchTecnico} onChange={(e) => setSearchTecnico(toUpper(e.target.value))} placeholder="BUSCAR TÉCNICO" className="uppercase" />
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button onClick={handleSearch} disabled={searching}>
                    <Search className="w-4 h-4 mr-1" /> {searching ? "Buscando..." : "Consultar"}
                  </Button>
                  <Button variant="outline" onClick={() => handleExport("xlsx")}>
                    <Download className="w-4 h-4 mr-1" /> Exportar Excel
                  </Button>
                  <Button variant="outline" onClick={() => handleExport("csv")}>
                    <Download className="w-4 h-4 mr-1" /> Exportar CSV
                  </Button>
                </div>
              </CardContent>
            </Card>

            {coletas.length > 0 && (
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-auto max-h-[60vh]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Data Execução</TableHead>
                          <TableHead className="text-xs">BA</TableHead>
                          <TableHead className="text-xs">Circuito</TableHead>
                          <TableHead className="text-xs">Técnico</TableHead>
                          <TableHead className="text-xs">Atividade</TableHead>
                          <TableHead className="text-xs">Tipo</TableHead>
                          <TableHead className="text-xs">Materiais</TableHead>
                          <TableHead className="text-xs">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {coletas.map((c) => (
                          <TableRow key={c.id}>
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
                            <TableCell className="text-xs">
                              <div className="flex gap-1">
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setViewColeta(c)} title="Visualizar">
                                  <Eye className="w-3.5 h-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(c.id)} title="Excluir">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* Delete confirmation */}
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

      {/* View detail dialog */}
      <Dialog open={!!viewColeta} onOpenChange={() => setViewColeta(null)}>
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
                      <TableHead className="text-xs">Un</TableHead>
                      <TableHead className="text-xs">Serial</TableHead>
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
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MaterialColeta;
