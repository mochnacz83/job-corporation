import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import React, { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAccessTracking } from "@/hooks/useAccessTracking";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Trash2, ImageIcon, FileText, Download, Camera, CheckCircle2, Pencil, Save, X, TrendingUp, RefreshCw, Upload } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import jsPDF from "jspdf";
import * as XLSX from "xlsx";

interface TecnicoIndicadores {
  id?: string;
  re: string; // Pode ser TR ou TT do tecnicos_cadastro (usado no lookup)
  tt: string;
  nome: string;
  supervisor: string;
  // Dimensão (vinda de tecnicos_cadastro)
  empresa?: string;
  coordenador?: string;
  // Indicadores (vinda de tecnicos_indicadores - última carga ou mês)
  mes_referencia?: string;
  eficacia: string;
  produtividade: string;
  dias_trabalhados: string;
  repetida: string; // % calculado/exibido
  infancia: string; // % calculado/exibido
  // Detalhamento
  repetida_entrantes?: number;
  repetida_repetiu?: number;
  infancia_instaladas?: number;
  infancia_chamados_30d?: number;
}

interface ColaboradorRow {
  id: string;
  nome_tecnico: string;
  tr: string | null;
  tt: string | null;
  nome_empresa: string | null;
  supervisor: string | null;
  coordenador: string | null;
  telefone: string | null;
  cidade_residencia: string | null;
}

interface IndicadorFatoRow {
  id: string;
  tt: string;
  mes_referencia: string;
  eficacia: number | null;
  produtividade: number | null;
  dias_trabalhados: number | null;
  repetida_entrantes: number | null;
  repetida_repetiu: number | null;
  repetida_pct: number | null;
  infancia_instaladas: number | null;
  infancia_chamados_30d: number | null;
  infancia_pct: number | null;
  lote_importacao: string | null;
  updated_at: string;
}

interface EvolucaoRecord {
  id: string;
  tecnico_re: string;
  data_revisita: string;
  eficacia_anterior: string;
  eficacia_atual: string;
  produtividade_anterior: string;
  produtividade_atual: string;
  repetida_anterior: string;
  repetida_atual: string;
  infancia_anterior: string;
  infancia_atual: string;
  observacoes: string;
  created_at: string;
}

const FRASE_COMPROMISSO = "O acompanhamento é no intuito de verificar e reafirmar o compromisso com a qualidade, reorientando e organizando processos, visando a melhoria contínua.";

const VistoriaCampo = () => {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { trackAction } = useAccessTracking("/vistoria-campo");

  const [activeTab, setActiveTab] = useState("formulario");

  // Form State
  const [re, setRe] = useState("");
  const [indicadores, setIndicadores] = useState<TecnicoIndicadores | null>(null);
  const [observacoes, setObservacoes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Photos State
  const [fotoSupervisor, setFotoSupervisor] = useState<{ preview: string | null; file: File | null }>({ preview: null, file: null });
  const [fotoEquipamentos, setFotoEquipamentos] = useState<{ preview: string | null; file: File | null }>({ preview: null, file: null });
  const [fotoExecucao, setFotoExecucao] = useState<{ preview: string | null; file: File | null }>({ preview: null, file: null });
  const [fotoUniforme, setFotoUniforme] = useState<{ preview: string | null; file: File | null }>({ preview: null, file: null });

  // Quality Check State
  const [atividadeCorreta, setAtividadeCorreta] = useState<string>("");
  const [obsAtividadeCorreta, setObsAtividadeCorreta] = useState("");
  const [atendimentoCliente, setAtendimentoCliente] = useState<string>("");
  const [obsAtendimentoCliente, setObsAtendimentoCliente] = useState("");
  const [procedimentoSeguranca, setProcedimentoSeguranca] = useState<string>("");
  const [obsProcedimentoSeguranca, setObsProcedimentoSeguranca] = useState("");
  const [dominaTecnicas, setDominaTecnicas] = useState<string>("");
  const [obsDominaTecnicas, setObsDominaTecnicas] = useState("");
  const [comunicacaoCliente, setComunicacaoCliente] = useState<string>("");
  const [obsComunicacaoCliente, setObsComunicacaoCliente] = useState("");

  // Checklists Físicos
  const [ferramentalOk, setFerramentalOk] = useState<string>("");
  const [necessidadesFerramentas, setNecessidadesFerramentas] = useState<{ equipamento: string; quantidade: string }[]>([]);

  const [uniformeOk, setUniformeOk] = useState<string>("");
  const [necessidadesUniforme, setNecessidadesUniforme] = useState<{ 
    calca: boolean; tamanhoCalca: string; qtdCalca: string;
    camisa: boolean; tamanhoCamisa: string; qtdCamisa: string;
    sapato: boolean; tamanhoSapato: string; qtdSapato: string;
  }>({
    calca: false, tamanhoCalca: "", qtdCalca: "",
    camisa: false, tamanhoCamisa: "", qtdCamisa: "",
    sapato: false, tamanhoSapato: "", qtdSapato: ""
  });

  const fileInputSupervisor = useRef<HTMLInputElement>(null);
  const fileInputEquipamentos = useRef<HTMLInputElement>(null);
  const fileInputExecucao = useRef<HTMLInputElement>(null);
  const fileInputUniforme = useRef<HTMLInputElement>(null);

  // Signatures State
  const sigSupervisorCanvasRef = useRef<HTMLCanvasElement>(null);
  const sigTecnicoCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawingSupervisor, setIsDrawingSupervisor] = useState(false);
  const [isDrawingTecnico, setIsDrawingTecnico] = useState(false);

  // Indicadores table state
  const [allIndicadores, setAllIndicadores] = useState<TecnicoIndicadores[]>([]);
  const [loadingIndicadores, setLoadingIndicadores] = useState(false);
  const [editingIndicador, setEditingIndicador] = useState<TecnicoIndicadores | null>(null);
  const [editForm, setEditForm] = useState<TecnicoIndicadores | null>(null);
  const [filterIndicadores, setFilterIndicadores] = useState("");
  const [indicadoresSubTab, setIndicadoresSubTab] = useState<"colaboradores" | "indicadores">("colaboradores");

  // Colaboradores (Dimensão - tecnicos_cadastro)
  const [allColaboradores, setAllColaboradores] = useState<ColaboradorRow[]>([]);
  const [loadingColaboradores, setLoadingColaboradores] = useState(false);
  const [filterColaboradores, setFilterColaboradores] = useState("");
  const [editingColaborador, setEditingColaborador] = useState<ColaboradorRow | null>(null);
  const [editColaboradorForm, setEditColaboradorForm] = useState<ColaboradorRow | null>(null);

  // Histórico state
  const [historicoData, setHistoricoData] = useState<any[]>([]);
  const [loadingHistorico, setLoadingHistorico] = useState(false);

  const loadHistorico = useCallback(async () => {
    setLoadingHistorico(true);
    try {
      const { data, error } = await supabase
        .from("vistorias_campo" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setHistoricoData(data || []);
    } catch (err: any) {
      console.error("Error loading historico:", err);
    } finally {
      setLoadingHistorico(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "historico") {
      loadHistorico();
    }
  }, [activeTab, loadHistorico]);

  // Evolução state
  const [evolucaoRe, setEvolucaoRe] = useState("");
  const [evolucaoData, setEvolucaoData] = useState<EvolucaoRecord[]>([]);
  const [loadingEvolucao, setLoadingEvolucao] = useState(false);
  const [showEvolucaoDialog, setShowEvolucaoDialog] = useState(false);
  const [evolucaoTecnico, setEvolucaoTecnico] = useState<TecnicoIndicadores | null>(null);
  const [novaEvolucao, setNovaEvolucao] = useState({
    eficacia_atual: "",
    produtividade_atual: "",
    repetida_atual: "",
    infancia_atual: "",
    observacoes: ""
  });

  // Load colaboradores (Dimensão)
  const loadColaboradores = useCallback(async () => {
    setLoadingColaboradores(true);
    try {
      const { data, error } = await supabase
        .from("tecnicos_cadastro")
        .select("*")
        .order("nome_tecnico");
      if (error) throw error;
      setAllColaboradores((data as any[]) || []);
    } catch (err: any) {
      console.error("Error loading colaboradores:", err);
    } finally {
      setLoadingColaboradores(false);
    }
  }, []);

  // Load indicadores (Fato) - última carga por TT, com JOIN dos dados do colaborador
  const loadIndicadores = useCallback(async () => {
    setLoadingIndicadores(true);
    try {
      const [indRes, colabRes] = await Promise.all([
        supabase
          .from("tecnicos_indicadores" as any)
          .select("*")
          .order("mes_referencia", { ascending: false }),
        supabase
          .from("tecnicos_cadastro")
          .select("tt,tr,nome_tecnico,supervisor,nome_empresa,coordenador"),
      ]);
      if (indRes.error) throw indRes.error;
      if (colabRes.error) throw colabRes.error;

      const colabMap = new Map<string, any>();
      (colabRes.data || []).forEach((c: any) => {
        if (c.tt) colabMap.set(c.tt.toUpperCase(), c);
      });

      // Mantém só o registro mais recente por TT (já vem ordenado desc)
      const seen = new Set<string>();
      const merged: TecnicoIndicadores[] = [];
      ((indRes.data as any[]) || []).forEach((r: IndicadorFatoRow) => {
        const ttKey = (r.tt || "").toUpperCase();
        if (!ttKey || seen.has(ttKey)) return;
        seen.add(ttKey);
        const colab = colabMap.get(ttKey);
        merged.push({
          id: r.id,
          re: colab?.tr || colab?.tt || ttKey,
          tt: ttKey,
          nome: colab?.nome_tecnico || "(não cadastrado)",
          supervisor: colab?.supervisor || "",
          empresa: colab?.nome_empresa || "",
          coordenador: colab?.coordenador || "",
          mes_referencia: r.mes_referencia,
          eficacia: r.eficacia != null ? String(r.eficacia) : "-",
          produtividade: r.produtividade != null ? String(r.produtividade) : "-",
          dias_trabalhados: r.dias_trabalhados != null ? String(r.dias_trabalhados) : "-",
          repetida: r.repetida_pct != null ? `${r.repetida_pct}%` : "-",
          infancia: r.infancia_pct != null ? `${r.infancia_pct}%` : "-",
          repetida_entrantes: r.repetida_entrantes ?? 0,
          repetida_repetiu: r.repetida_repetiu ?? 0,
          infancia_instaladas: r.infancia_instaladas ?? 0,
          infancia_chamados_30d: r.infancia_chamados_30d ?? 0,
        });
      });
      setAllIndicadores(merged);
    } catch (err: any) {
      console.error("Error loading indicadores:", err);
    } finally {
      setLoadingIndicadores(false);
    }
  }, []);

  useEffect(() => {
    loadIndicadores();
    loadColaboradores();
  }, [loadIndicadores, loadColaboradores]);

  // Auto-fill Logic
  useEffect(() => {
    if (re.length >= 4) {
      const delayDebounceFn = setTimeout(() => {
        handleLookupRE(re);
      }, 500);
      return () => clearTimeout(delayDebounceFn);
    } else {
      setIndicadores(null);
    }
  }, [re]);

  const handleLookupRE = async (val: string) => {
    try {
      const upper = val.toUpperCase();
      // 1) Busca colaborador (Dimensão) por TR ou TT
      const { data: tecData } = await supabase
        .from("tecnicos_cadastro")
        .select("*")
        .or(`tr.eq.${upper},tt.eq.${upper}`)
        .maybeSingle();

      if (!tecData) {
        setIndicadores(null);
        return;
      }

      const ttKey = (tecData.tt || "").toUpperCase();

      // 2) Busca o indicador mais recente para o TT (Fato)
      let indRow: IndicadorFatoRow | null = null;
      if (ttKey) {
        const { data: indList } = await supabase
          .from("tecnicos_indicadores" as any)
          .select("*")
          .eq("tt", ttKey)
          .order("mes_referencia", { ascending: false })
          .limit(1);
        indRow = ((indList as any[]) || [])[0] || null;
      }

      setIndicadores({
        re: tecData.tr || tecData.tt || upper,
        tt: ttKey,
        nome: tecData.nome_tecnico,
        supervisor: tecData.supervisor || "",
        empresa: tecData.nome_empresa || "",
        coordenador: tecData.coordenador || "",
        mes_referencia: indRow?.mes_referencia,
        eficacia: indRow?.eficacia != null ? String(indRow.eficacia) : "-",
        produtividade: indRow?.produtividade != null ? String(indRow.produtividade) : "-",
        dias_trabalhados: indRow?.dias_trabalhados != null ? String(indRow.dias_trabalhados) : "-",
        repetida: indRow?.repetida_pct != null ? `${indRow.repetida_pct}%` : "-",
        infancia: indRow?.infancia_pct != null ? `${indRow.infancia_pct}%` : "-",
        repetida_entrantes: indRow?.repetida_entrantes ?? 0,
        repetida_repetiu: indRow?.repetida_repetiu ?? 0,
        infancia_instaladas: indRow?.infancia_instaladas ?? 0,
        infancia_chamados_30d: indRow?.infancia_chamados_30d ?? 0,
      });
    } catch (err) {
      console.error("Error looking up RE:", err);
    }
  };

  // Canvas Helpers
  const getCanvasPos = (canvas: HTMLCanvasElement, e: React.TouchEvent | React.MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    
    // Fator de escala garante que o traço acompanhe o zoom e os redimensionamentos CSS da tela:
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    return { 
      x: (clientX - rect.left) * scaleX, 
      y: (clientY - rect.top) * scaleY 
    };
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
    const timer = setTimeout(() => {
      initCanvas(sigSupervisorCanvasRef.current);
      initCanvas(sigTecnicoCanvasRef.current);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

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

  const isCanvasEmpty = (canvas: HTMLCanvasElement | null) => {
    if (!canvas) return true;
    const ctx = canvas.getContext('2d');
    if (!ctx) return true;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 0; i < imageData.length; i += 4) {
      if (imageData[i + 3] !== 0) return false;
    }
    return true;
  };

  const getCanvasDataUrl = (canvas: HTMLCanvasElement | null): string => {
    if (!canvas || isCanvasEmpty(canvas)) return "";
    return canvas.toDataURL("image/png");
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>, setter: React.Dispatch<React.SetStateAction<{ preview: string | null; file: File | null }>>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;
        const MAX = 1000;
        if (width > height) { if (width > MAX) { height *= MAX / width; width = MAX; } }
        else { if (height > MAX) { width *= MAX / height; height = MAX; } }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        setter({ preview: dataUrl, file });
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const generateNecessidadesPDF = (data: any) => {
    const doc = new jsPDF("p", "mm", "a4");
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 15;
    let y = 10;

    try {
      const logoImg = new Image();
      logoImg.src = "/ability-logo.png";
      doc.addImage(logoImg, "PNG", margin, y, 25, 12);
    } catch { }

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("SOLICITAÇÃO DE REPOSIÇÃO - MATERIAIS", pageW / 2, y + 8, { align: "center" });
    
    y += 20;
    doc.setDrawColor(0, 80, 150);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageW - margin, y);
    y += 8;

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("INFORMAÇÕES DO COLABORADOR", margin, y);
    y += 6;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Nome: ${data.nome}`, margin, y);
    y += 5;
    doc.text(`Matrícula (RE): ${data.re}`, margin, y);
    doc.text(`Técnico (TT): ${data.tt}`, margin + 90, y);
    y += 10;

    if (data.necessidadesFerramentas && data.necessidadesFerramentas.length > 0) {
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("FERRAMENTAS E EQUIPAMENTOS SOLICITADOS:", margin, y);
      y += 6;
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      data.necessidadesFerramentas.forEach((f: any) => {
        doc.text(`- ${f.equipamento} (Qtd: ${f.quantidade})`, margin + 5, y);
        y += 5;
      });
      y += 5;
    }

    if (data.necessidadesUniforme && (data.necessidadesUniforme.calca || data.necessidadesUniforme.camisa || data.necessidadesUniforme.sapato)) {
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("UNIFORME SOLICITADO:", margin, y);
      y += 6;
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      
      const u = data.necessidadesUniforme;
      if (u.calca) { doc.text(`- Calça (Tamanho: ${u.tamanhoCalca || 'Não inf.'} | Qtd: ${u.qtdCalca || '1'})`, margin + 5, y); y += 5; }
      if (u.camisa) { doc.text(`- Camisa (Tamanho: ${u.tamanhoCamisa || 'Não inf.'} | Qtd: ${u.qtdCamisa || '1'})`, margin + 5, y); y += 5; }
      if (u.sapato) { doc.text(`- Sapato (Tamanho: ${u.tamanhoSapato || 'Não inf.'} | Qtd: ${u.qtdSapato || '1'})`, margin + 5, y); y += 5; }
    }

    y += 15;
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.text("Documento gerado automaticamente pelo sistema de Vistoria de Qualidade.", margin, y);

    const pdfBlob = doc.output("blob");
    const downloadUrl = URL.createObjectURL(pdfBlob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = `Reposicao_${data.nome?.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(downloadUrl);
  };

  const generatePDF = (data: any) => {
    const doc = new jsPDF("p", "mm", "a4");
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 15;
    let y = 10;

    try {
      const logoImg = new Image();
      logoImg.src = "/ability-logo.png";
      doc.addImage(logoImg, "PNG", margin, y, 25, 12);
    } catch { }

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("VISTORIA DE CAMPO", pageW / 2, y + 8, { align: "center" });
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`Data: ${new Date().toLocaleDateString("pt-BR")}`, pageW - margin, y + 6, { align: "right" });

    y += 20;
    doc.setDrawColor(0, 80, 150);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageW - margin, y);
    y += 8;

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("INFORMAÇÕES DO TÉCNICO", margin, y);
    y += 6;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Nome: ${data.nome}`, margin, y);
    doc.text(`Matrícula (RE): ${data.re}`, margin + 90, y);
    y += 5;
    doc.text(`Técnico (TT): ${data.tt}`, margin, y);
    doc.text(`Supervisor: ${data.supervisor}`, margin + 90, y);
    y += 10;

    doc.setFont("helvetica", "bold");
    doc.text("INDICADORES DE DESEMPENHO", margin, y);
    y += 4;

    const tableY = y;
    const colW = (pageW - 2 * margin) / 5;
    doc.setLineWidth(0.1);
    doc.setDrawColor(200);

    doc.setFillColor(240, 240, 240);
    doc.rect(margin, y, pageW - 2 * margin, 7, "F");
    doc.rect(margin, y, pageW - 2 * margin, 7, "S");

    const headers = ["Eficácia", "Produtividade", "Dias Trab.", "Repetida", "Infância"];
    headers.forEach((h, i) => {
      doc.text(h, margin + i * colW + colW / 2, y + 5, { align: "center" });
    });

    y += 7;
    doc.rect(margin, y, pageW - 2 * margin, 8, "S");
    const values = [data.eficacia, data.produtividade, data.dias_trabalhados, data.repetida, data.infancia];
    values.forEach((v: string, i: number) => {
      doc.setFont("helvetica", "normal");
      doc.text(String(v), margin + i * colW + colW / 2, y + 5.5, { align: "center" });
      if (i > 0) doc.line(margin + i * colW, tableY, margin + i * colW, y + 8);
    });

    y += 20; // Aumentado o espaço entre Indicadores e Avaliação
    
    const checkSpace = (h: number) => { if (y + h > 280) { doc.addPage(); y = 20; } };

    // --- Nova Sessao de Qualidade ---
    checkSpace(15);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("AVALIAÇÃO DE QUALIDADE E SEGURANÇA", margin, y);
    y += 6;
    
    // Calcular a Nota
    let score = 0;
    const calcScore = (val: string) => {
      if (val === "Sim" || val === "Excelente" || val === "Boa") return 20;
      if (val === "Média") return 10;
      return 0; // Não, Ruim, Não avaliado
    };
    
    score += calcScore(data.atividadeCorreta);
    score += calcScore(data.atendimentoCliente);
    score += calcScore(data.procedimentoSeguranca);
    score += calcScore(data.dominaTecnicas);
    score += calcScore(data.comunicacaoCliente);

    const tableW = pageW - 2 * margin;

    // Função de Cabeçalho da Tabela
    const drawTableHeader = (titleLeft: string, titleRight: string) => {
      doc.setFillColor(240, 240, 240);
      doc.rect(margin, y, tableW, 7, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(titleLeft, margin + 2, y + 5);
      
      doc.line(margin + tableW * 0.7, y, margin + tableW * 0.7, y + 7);
      doc.text(titleRight, margin + tableW * 0.85, y + 5, { align: "center" });
      y += 7;
    };

    const addQuestion = (q: string, val: string, obs: string, isChecklistFisico = false) => {
      let printedVal = val || "-";
      let observationText = "";

      if (val && val !== "Não avaliado") {
        if (isChecklistFisico && val === "Não") {
           // Checklist Fisico: Falhou
           observationText = "Gerado doc para encaminhar a Logística.";
           const faltantes: string[] = [];
           if (q.includes("Ferramental")) {
             data.necessidadesFerramentas?.forEach((f: any) => faltantes.push(f.equipamento));
           } else if (q.includes("Uniforme")) {
             const u = data.necessidadesUniforme;
             if (u?.calca) faltantes.push("Calça");
             if (u?.camisa) faltantes.push("Camisa");
             if (u?.sapato) faltantes.push("Sapato");
           }
           if (faltantes.length > 0) {
             observationText += ` Faltas: ${faltantes.join(", ")}`;
           }
        } else if (val === "Sim" || val === "Excelente" || val === "Boa") {
          observationText = "Conforme com Processo";
        } else {
          observationText = obs ? `Problema Identificado: ${obs}` : "Problema Identificado.";
        }
      }

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      const splitQ = doc.splitTextToSize(q, tableW * 0.68);
      
      const mainRowH = Math.max(splitQ.length, 1) * 5 + 4;
      
      let obsH = 0;
      let splitObs: string[] = [];
      if (observationText) {
        doc.setFont("helvetica", "italic");
        splitObs = doc.splitTextToSize(observationText, tableW - 4);
        obsH = splitObs.length * 5 + 4;
      }
      
      checkSpace(mainRowH + obsH + 2);
      
      // Linha Principal
      doc.setDrawColor(200);
      doc.setLineWidth(0.1);
      doc.rect(margin, y, tableW, mainRowH, "S");
      
      doc.setFont("helvetica", "normal");
      doc.text(splitQ, margin + 2, y + 5);
      
      // Divisória Vertical da Resposta
      doc.line(margin + tableW * 0.7, y, margin + tableW * 0.7, y + mainRowH);
      
      // Texto Resposta Centralizado
      doc.setFont("helvetica", "bold");
      const textWidth = doc.getTextWidth(printedVal);
      doc.text(printedVal, margin + tableW * 0.85, y + mainRowH / 2 + 1.5, { align: "center", baseline: "middle" });
      
      y += mainRowH;
      
      // Linha Secundária (Observação)
      if (observationText) {
        doc.setFillColor(val === "Sim" || val === "Excelente" || val === "Boa" ? 245 : 255, val === "Sim" || val === "Excelente" || val === "Boa" ? 255 : 240, 245);
        if (val !== "Sim" && val !== "Excelente" && val !== "Boa") {
            doc.setFillColor(255, 245, 245); // Fundo Vermelho
        } else {
            doc.setFillColor(245, 255, 245); // Fundo Verde
        }

        doc.rect(margin, y, tableW, obsH, "FD");
        doc.setFont("helvetica", "italic");
        doc.setFontSize(8);
        doc.text(splitObs, margin + 2, y + 5);
        
        y += obsH;
        doc.setFontSize(9);
      }
    };

    // Imprimir Tabela de Qualidade (Q1 a Q5)
    drawTableHeader("Itens Avaliados", "Resposta");
    addQuestion("1. Técnico executou a atividade correta?", data.atividadeCorreta, data.obsAtividadeCorreta);
    addQuestion("2. Técnico atendeu bem o cliente?", data.atendimentoCliente, data.obsAtendimentoCliente);
    addQuestion("3. Realizou todos os proc. de segurança?", data.procedimentoSeguranca, data.obsProcedimentoSeguranca);
    addQuestion("4. Domina todas as técnicas?", data.dominaTecnicas, data.obsDominaTecnicas);
    addQuestion("5. Avalie a comunicação com o cliente:", data.comunicacaoCliente, data.obsComunicacaoCliente);

    // Desenhar Bloco de Nota Final
    y += 2;
    doc.setFillColor(230, 240, 255);
    doc.rect(margin, y, tableW, 8, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(0, 80, 150);
    doc.text(`NOTA FINAL DE QUALIDADE: ${score}%`, margin + tableW / 2, y + 5.5, { align: "center" });
    doc.setTextColor(0, 0, 0); // Reset color
    
    y += 18; // Ajustado espaço entre Nota de Qualidade e Checklist

    // --- Nova Sessao Ferramental ---
    checkSpace(20);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("CHECKLIST FERRAMENTAL E UNIFORME", margin, y);
    y += 6;
    
    drawTableHeader("Itens Avaliados", "Resposta");
    addQuestion("6. Ferramental OK?", data.ferramentalOk, "", true);
    addQuestion("7. Uniforme OK?", data.uniformeOk, "", true);

    y += 6;

    if (data.observacoes) {
      doc.setFont("helvetica", "bold");
      doc.text("OBSERVAÇÕES:", margin, y);
      y += 5;
      doc.setFont("helvetica", "normal");
      const splitObs = doc.splitTextToSize(data.observacoes, pageW - 2 * margin);
      doc.text(splitObs, margin, y);
      y += (splitObs.length * 5) + 6;
    }

    const photoSize = 68; // Cravar tamanho para garantir 2 páginas finais
    const photoGap = 8;
    const startX = (pageW - (photoSize * 2 + photoGap)) / 2;
    let photoX = startX;

    const photos = [
      { label: "Supervisor c/ Técnico", url: data.fotoSupervisor },
      { label: "Execução do Serviço", url: data.fotoExecucao },
      { label: "Equipamentos e Ferr.", url: data.fotoEquipamentos },
      { label: "Técnico Uniformizado", url: data.fotoUniforme }
    ].filter(p => p.url);

    if (photos.length > 0) {
      checkSpace(photoSize + 10);
      doc.setFont("helvetica", "bold");
      doc.text("EVIDÊNCIAS FOTOGRÁFICAS:", margin, y);
      y += 5;

      photos.forEach((p, idx) => {
        // Se for a última foto de uma lista ímpar, centraliza ela sozinha na linha
        const isSingleRow = (idx === photos.length - 1 && (idx + 1) % 2 !== 0);
        const currentX = isSingleRow ? (pageW - photoSize) / 2 : photoX;

        try {
          doc.addImage(p.url, "JPEG", currentX, y, photoSize, photoSize);
          doc.setFontSize(8);
          doc.text(p.label, currentX + photoSize / 2, y + photoSize + 4, { align: "center" });
          
          photoX += photoSize + photoGap;
          
          if ((idx + 1) % 2 === 0) {
            photoX = startX;
            y += photoSize + 12;
            checkSpace(photoSize + 10);
          }
        } catch { }
      });
      if (photos.length % 2 !== 0) y += photoSize + 12;
    }

    checkSpace(10);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    const splitPhrase = doc.splitTextToSize(FRASE_COMPROMISSO, pageW - 2 * margin);
    doc.text(splitPhrase, margin, y);
    y += (splitPhrase.length * 4) + 4; // Compactado de 5 para 4

    checkSpace(20);
    y += 12;
    
    doc.setLineWidth(0.2);
    doc.setDrawColor(0);

    doc.line(margin, y, margin + 65, y); // Reduzido de 70 para 65
    doc.setFontSize(8);
    doc.text("Assinatura do Supervisor", margin + 32, y + 5, { align: "center" });
    if (data.sigSupervisor) {
      doc.addImage(data.sigSupervisor, "PNG", margin + 7, y - 12, 50, 12);
    }

    doc.line(pageW - margin - 65, y, pageW - margin, y);
    doc.text("Assinatura do Técnico", pageW - margin - 35, y + 5, { align: "center" });
    if (data.sigTecnico) {
      doc.addImage(data.sigTecnico, "PNG", pageW - margin - 60, y - 15, 50, 15);
    }

    const pdfBlob = doc.output("blob");
    const downloadUrl = URL.createObjectURL(pdfBlob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = `Vistoria_${data.nome?.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(downloadUrl);
  };

  const handleSubmit = async () => {
    if (!indicadores) { toast.error("Informe a RE do técnico"); return; }
    if (isCanvasEmpty(sigSupervisorCanvasRef.current)) { toast.error("Assinatura do Supervisor é obrigatória"); return; }
    if (isCanvasEmpty(sigTecnicoCanvasRef.current)) { toast.error("Assinatura do Técnico é obrigatória"); return; }

    setSubmitting(true);
    try {
      const sigSupervisor = getCanvasDataUrl(sigSupervisorCanvasRef.current);
      const sigTecnico = getCanvasDataUrl(sigTecnicoCanvasRef.current);

      const uploadPhoto = async (file: File | null, prefix: string) => {
        if (!file) return null;
        const ext = file.name.split(".").pop();
        const path = `vistorias/${user?.id}/${prefix}_${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("material-fotos").upload(path, file);
        if (error) throw error;
        const { data } = supabase.storage.from("material-fotos").getPublicUrl(path);
        return data.publicUrl;
      };

      const urlSupervisor = await uploadPhoto(fotoSupervisor.file, "sup");
      const urlEquipamentos = await uploadPhoto(fotoEquipamentos.file, "equip");
      const urlExecucao = await uploadPhoto(fotoExecucao.file, "exec");
      const urlUniforme = await uploadPhoto(fotoUniforme.file, "unif");

      const { error } = await supabase.from("vistorias_campo" as any).insert({
        user_id: user?.id,
        tecnico_re: indicadores.re,
        tecnico_tt: indicadores.tt,
        nome_tecnico: indicadores.nome,
        supervisor_tecnico: indicadores.supervisor,
        indicador_eficacia: indicadores.eficacia,
        indicador_produtividade: indicadores.produtividade,
        indicador_dias_trabalhados: indicadores.dias_trabalhados,
        indicador_repetida: indicadores.repetida,
        indicador_infancia: indicadores.infancia,
        observacoes,
        foto_supervisor_url: urlSupervisor,
        foto_equipamentos_url: urlEquipamentos,
        foto_execucao_url: urlExecucao,
        foto_uniforme_url: urlUniforme,
        assinatura_supervisor: sigSupervisor,
        assinatura_tecnico: sigTecnico,
        // Adicionando os novos campos JSONB que foram criados no banco de dados via SQL:
        avaliacao_qualidade: {
           atividadeCorreta, obsAtividadeCorreta,
           atendimentoCliente, obsAtendimentoCliente,
           procedimentoSeguranca, obsProcedimentoSeguranca,
           dominaTecnicas, obsDominaTecnicas,
           comunicacaoCliente, obsComunicacaoCliente,
           ferramentalOk,
           uniformeOk
        },
        ferramentas_faltantes: necessidadesFerramentas,
        uniformes_faltantes: necessidadesUniforme
      });

      if (error) throw error;

      toast.success("Vistoria salva com sucesso!");
      trackAction("salvar_vistoria");

      const vistoriaData = {
        ...indicadores,
        observacoes,
        fotoSupervisor: fotoSupervisor.preview,
        fotoEquipamentos: fotoEquipamentos.preview,
        fotoExecucao: fotoExecucao.preview,
        fotoUniforme: fotoUniforme.preview,
        sigSupervisor,
        sigTecnico,
        atividadeCorreta, obsAtividadeCorreta,
        atendimentoCliente, obsAtendimentoCliente,
        procedimentoSeguranca, obsProcedimentoSeguranca,
        dominaTecnicas, obsDominaTecnicas,
        comunicacaoCliente, obsComunicacaoCliente,
        ferramentalOk,
        uniformeOk,
        necessidadesFerramentas,
        necessidadesUniforme
      };

      // Gerar PDF da Vistoria geral
      generatePDF(vistoriaData);

      // Gerar PDF de Necessidades se ferramentas/uniforme negativados
      if (ferramentalOk === "Não" || uniformeOk === "Não") {
        setTimeout(() => {
          generateNecessidadesPDF(vistoriaData);
        }, 1000); // 1 segundo de folga pro navegador não barrar 2 downloads
      }

      // Reset Form State
      setRe("");
      setIndicadores(null);
      setObservacoes("");
      setFotoSupervisor({ preview: null, file: null });
      setFotoEquipamentos({ preview: null, file: null });
      setFotoExecucao({ preview: null, file: null });
      setFotoUniforme({ preview: null, file: null });
      clearCanvas(sigSupervisorCanvasRef.current);
      clearCanvas(sigTecnicoCanvasRef.current);
      setAtividadeCorreta(""); setObsAtividadeCorreta("");
      setAtendimentoCliente(""); setObsAtendimentoCliente("");
      setProcedimentoSeguranca(""); setObsProcedimentoSeguranca("");
      setDominaTecnicas(""); setObsDominaTecnicas("");
      setComunicacaoCliente(""); setObsComunicacaoCliente("");
      setFerramentalOk(""); setNecessidadesFerramentas([]);
      setUniformeOk(""); setNecessidadesUniforme({ calca: false, tamanhoCalca: "", qtdCalca: "", camisa: false, tamanhoCamisa: "", qtdCamisa: "", sapato: false, tamanhoSapato: "", qtdSapato: "" });
      
    } catch (err: any) {
      toast.error("Erro ao salvar vistoria: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ============= IMPORT: INDICADORES (Fato) por TT + mes_referencia =============
  const parseNum = (v: any): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const s = String(v).replace(",", ".").replace("%", "").trim();
    const n = Number(s);
    return isNaN(n) ? null : n;
  };

  const parseMes = (v: any): string => {
    if (!v) return new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
    if (v instanceof Date) return new Date(v.getFullYear(), v.getMonth(), 1).toISOString().slice(0, 10);
    const s = String(v).trim();
    // Aceita YYYY-MM, YYYY-MM-DD, MM/YYYY, DD/MM/YYYY
    const m1 = s.match(/^(\d{4})-(\d{2})/);
    if (m1) return `${m1[1]}-${m1[2]}-01`;
    const m2 = s.match(/^(\d{2})\/(\d{4})$/);
    if (m2) return `${m2[2]}-${m2[1]}-01`;
    const m3 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m3) return `${m3[3]}-${m3[2]}-01`;
    const d = new Date(s);
    if (!isNaN(d.getTime())) return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
    return new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  };

  const handleImportIndicadores = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws);

      const loteId = new Date().toISOString();
      const payloads = rows
        .map((r) => {
          const tt = String(r.TT || r.tt || "").trim().toUpperCase();
          if (!tt) return null;
          return {
            tt,
            mes_referencia: parseMes(r["Mês Referência"] || r["Mes Referencia"] || r.mes_referencia || r.Mes),
            eficacia: parseNum(r.Eficácia ?? r.Eficacia ?? r.eficacia),
            produtividade: parseNum(r.Produtividade ?? r.produtividade),
            dias_trabalhados: parseNum(r["Dias Trabalhados"] ?? r["Dias Trab."] ?? r.dias_trabalhados),
            repetida_entrantes: parseNum(r["Repetida Entrantes"] ?? r["Entrantes"] ?? r.repetida_entrantes) ?? 0,
            repetida_repetiu: parseNum(r["Repetida Repetiu"] ?? r["Repetiu"] ?? r.repetida_repetiu) ?? 0,
            infancia_instaladas: parseNum(r["Infância Instaladas"] ?? r["Instaladas"] ?? r.infancia_instaladas) ?? 0,
            infancia_chamados_30d: parseNum(r["Infância Chamados 30d"] ?? r["Chamados 30d"] ?? r.infancia_chamados_30d) ?? 0,
            lote_importacao: loteId,
            uploaded_by: user.id,
          };
        })
        .filter(Boolean) as any[];

      if (payloads.length === 0) {
        toast.error("Planilha vazia ou sem coluna TT.");
        return;
      }

      // UPSERT por (tt, mes_referencia) — não duplica
      const { error } = await supabase
        .from("tecnicos_indicadores" as any)
        .upsert(payloads, { onConflict: "tt,mes_referencia" });
      if (error) throw error;

      toast.success(`Importação concluída! ${payloads.length} registros processados.`);
      trackAction("importar_indicadores");
      loadIndicadores();
    } catch (err: any) {
      toast.error("Erro ao importar: " + err.message);
    }
    e.target.value = "";
  };

  const downloadTemplateIndicadores = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      [
        "TT",
        "Mês Referência",
        "Eficácia",
        "Produtividade",
        "Dias Trabalhados",
        "Repetida Entrantes",
        "Repetida Repetiu",
        "Infância Instaladas",
        "Infância Chamados 30d",
      ],
      ["TT123456", "2026-04", 95, 88, 22, 100, 5, 50, 2],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Indicadores");
    XLSX.writeFile(wb, "modelo_indicadores_vistoria.xlsx");
  };

  // ============= IMPORT: COLABORADORES (Dimensão) =============
  const handleImportColaboradores = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws);

      // Carrega existentes por TT e TR para deduplicação
      const { data: existing } = await supabase
        .from("tecnicos_cadastro")
        .select("id,tt,tr,nome_tecnico,supervisor,coordenador,nome_empresa,telefone,cidade_residencia");
      const byTT = new Map<string, any>();
      const byTR = new Map<string, any>();
      (existing || []).forEach((c: any) => {
        if (c.tt) byTT.set(String(c.tt).toUpperCase(), c);
        if (c.tr) byTR.set(String(c.tr).toUpperCase(), c);
      });

      let inserted = 0;
      let updated = 0;
      let skipped = 0;

      for (const r of rows) {
        const tt = String(r.TT || r.tt || "").trim().toUpperCase();
        const tr = String(r.TR || r.tr || r.RE || r.re || "").trim().toUpperCase();
        const nome = String(r["Nome Técnico"] || r["Nome"] || r.nome_tecnico || r.nome || "").trim();
        if (!nome || (!tt && !tr)) continue;

        const payload: any = {
          nome_tecnico: nome,
          tt: tt || null,
          tr: tr || null,
          nome_empresa: String(r["Empresa"] || r.nome_empresa || "").trim() || null,
          supervisor: String(r["Supervisor"] || r.supervisor || "").trim() || null,
          coordenador: String(r["Coordenador"] || r.coordenador || "").trim() || null,
          telefone: String(r["Telefone"] || r.telefone || "").trim() || null,
          cidade_residencia: String(r["Cidade"] || r.cidade_residencia || "").trim() || null,
          uploaded_by: user.id,
        };

        const found = (tt && byTT.get(tt)) || (tr && byTR.get(tr));
        if (found) {
          // Não altera se todos os campos relevantes forem iguais
          const isSame =
            (found.nome_tecnico || "") === payload.nome_tecnico &&
            (found.tt || "") === (payload.tt || "") &&
            (found.tr || "") === (payload.tr || "") &&
            (found.nome_empresa || "") === (payload.nome_empresa || "") &&
            (found.supervisor || "") === (payload.supervisor || "") &&
            (found.coordenador || "") === (payload.coordenador || "") &&
            (found.telefone || "") === (payload.telefone || "") &&
            (found.cidade_residencia || "") === (payload.cidade_residencia || "");
          if (isSame) {
            skipped++;
            continue;
          }
          await supabase.from("tecnicos_cadastro").update(payload).eq("id", found.id);
          updated++;
        } else {
          await supabase.from("tecnicos_cadastro").insert(payload);
          inserted++;
        }
      }

      toast.success(`${inserted} novos, ${updated} atualizados, ${skipped} sem alteração.`);
      trackAction("importar_colaboradores");
      loadColaboradores();
      loadIndicadores();
    } catch (err: any) {
      toast.error("Erro ao importar colaboradores: " + err.message);
    }
    e.target.value = "";
  };

  const downloadTemplateColaboradores = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["TT", "TR", "Nome Técnico", "Empresa", "Supervisor", "Coordenador", "Telefone", "Cidade"],
      ["TT123456", "RE12345", "JOÃO DA SILVA", "ABILITY", "MARIA SOUZA", "PEDRO LIMA", "(48) 99999-9999", "FLORIANÓPOLIS"],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Colaboradores");
    XLSX.writeFile(wb, "modelo_colaboradores_vistoria.xlsx");
  };

  // Edit individual indicador (Fato — opera por id)
  const handleStartEdit = (ind: TecnicoIndicadores) => {
    setEditingIndicador(ind);
    setEditForm({ ...ind });
  };

  const handleSaveEdit = async () => {
    if (!editForm || !editingIndicador?.id) return;
    try {
      const { error } = await supabase
        .from("tecnicos_indicadores" as any)
        .update({
          eficacia: parseNum(editForm.eficacia),
          produtividade: parseNum(editForm.produtividade),
          dias_trabalhados: parseNum(editForm.dias_trabalhados),
          repetida_entrantes: editForm.repetida_entrantes ?? 0,
          repetida_repetiu: editForm.repetida_repetiu ?? 0,
          infancia_instaladas: editForm.infancia_instaladas ?? 0,
          infancia_chamados_30d: editForm.infancia_chamados_30d ?? 0,
        })
        .eq("id", editingIndicador.id);

      if (error) throw error;
      toast.success("Indicador atualizado!");
      setEditingIndicador(null);
      setEditForm(null);
      loadIndicadores();
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    }
  };

  const handleDeleteIndicador = async (idVal?: string) => {
    if (!idVal) return;
    if (!confirm("Deseja excluir este registro?")) return;
    try {
      const { error } = await supabase.from("tecnicos_indicadores" as any).delete().eq("id", idVal);
      if (error) throw error;
      toast.success("Registro excluído!");
      loadIndicadores();
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    }
  };

  // Edit individual colaborador (Dimensão)
  const handleStartEditColab = (c: ColaboradorRow) => {
    setEditingColaborador(c);
    setEditColaboradorForm({ ...c });
  };

  const handleSaveColaborador = async () => {
    if (!editColaboradorForm || !editingColaborador?.id) return;
    try {
      const { error } = await supabase
        .from("tecnicos_cadastro")
        .update({
          nome_tecnico: editColaboradorForm.nome_tecnico,
          tt: editColaboradorForm.tt || null,
          tr: editColaboradorForm.tr || null,
          nome_empresa: editColaboradorForm.nome_empresa || null,
          supervisor: editColaboradorForm.supervisor || null,
          coordenador: editColaboradorForm.coordenador || null,
          telefone: editColaboradorForm.telefone || null,
          cidade_residencia: editColaboradorForm.cidade_residencia || null,
        })
        .eq("id", editingColaborador.id);
      if (error) throw error;
      toast.success("Colaborador atualizado!");
      setEditingColaborador(null);
      setEditColaboradorForm(null);
      loadColaboradores();
      loadIndicadores();
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    }
  };

  const handleDeleteColaborador = async (id: string) => {
    if (!confirm("Deseja excluir este colaborador? Os indicadores históricos do TT permanecem na tabela de Fato.")) return;
    try {
      const { error } = await supabase.from("tecnicos_cadastro").delete().eq("id", id);
      if (error) throw error;
      toast.success("Colaborador excluído!");
      loadColaboradores();
      loadIndicadores();
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    }
  };

  // Evolução
  const loadEvolucao = async (reVal: string) => {
    setLoadingEvolucao(true);
    try {
      const { data, error } = await supabase
        .from("vistoria_evolucao" as any)
        .select("*")
        .eq("tecnico_re", reVal)
        .order("data_revisita", { ascending: false });
      if (error) throw error;
      setEvolucaoData((data as any[]) || []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingEvolucao(false);
    }
  };

  const openEvolucao = (ind: TecnicoIndicadores) => {
    setEvolucaoTecnico(ind);
    setNovaEvolucao({
      eficacia_atual: "",
      produtividade_atual: "",
      repetida_atual: "",
      infancia_atual: "",
      observacoes: ""
    });
    loadEvolucao(ind.re);
    setShowEvolucaoDialog(true);
  };

  const handleSaveEvolucao = async () => {
    if (!evolucaoTecnico || !user) return;
    try {
      const { error } = await supabase.from("vistoria_evolucao" as any).insert({
        tecnico_re: evolucaoTecnico.re,
        user_id: user.id,
        eficacia_anterior: evolucaoTecnico.eficacia,
        eficacia_atual: novaEvolucao.eficacia_atual || evolucaoTecnico.eficacia,
        produtividade_anterior: evolucaoTecnico.produtividade,
        produtividade_atual: novaEvolucao.produtividade_atual || evolucaoTecnico.produtividade,
        repetida_anterior: evolucaoTecnico.repetida,
        repetida_atual: novaEvolucao.repetida_atual || evolucaoTecnico.repetida,
        infancia_anterior: evolucaoTecnico.infancia,
        infancia_atual: novaEvolucao.infancia_atual || evolucaoTecnico.infancia,
        observacoes: novaEvolucao.observacoes
      });
      if (error) throw error;

      toast.success("Evolução registrada com sucesso!");
      loadEvolucao(evolucaoTecnico.re);
      setNovaEvolucao({ eficacia_atual: "", produtividade_atual: "", repetida_atual: "", infancia_atual: "", observacoes: "" });
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    }
  };

  const handleDownloadHistorico = (item: any) => {
    try {
      const mappedData = {
        nome: item.nome_tecnico,
        re: item.tecnico_re,
        tt: item.tecnico_tt,
        supervisor: item.supervisor_tecnico,
        eficacia: item.indicador_eficacia,
        produtividade: item.indicador_produtividade,
        dias_trabalhados: item.indicador_dias_trabalhados,
        repetida: item.indicador_repetida,
        infancia: item.indicador_infancia,
        observacoes: item.observacoes,
        fotoSupervisor: item.foto_supervisor_url,
        fotoEquipamentos: item.foto_equipamentos_url,
        fotoExecucao: item.foto_execucao_url,
        fotoUniforme: item.foto_uniforme_url,
        sigSupervisor: item.assinatura_supervisor,
        sigTecnico: item.assinatura_tecnico,
        // Qualidade
        atividadeCorreta: item.avaliacao_qualidade?.atividadeCorreta || "Não avaliado",
        obsAtividadeCorreta: item.avaliacao_qualidade?.obsAtividadeCorreta || "",
        atendimentoCliente: item.avaliacao_qualidade?.atendimentoCliente || "Não avaliado",
        obsAtendimentoCliente: item.avaliacao_qualidade?.obsAtendimentoCliente || "",
        procedimentoSeguranca: item.avaliacao_qualidade?.procedimentoSeguranca || "Não avaliado",
        obsProcedimentoSeguranca: item.avaliacao_qualidade?.obsProcedimentoSeguranca || "",
        dominaTecnicas: item.avaliacao_qualidade?.dominaTecnicas || "Não avaliado",
        obsDominaTecnicas: item.avaliacao_qualidade?.obsDominaTecnicas || "",
        comunicacaoCliente: item.avaliacao_qualidade?.comunicacaoCliente || "Não avaliado",
        obsComunicacaoCliente: item.avaliacao_qualidade?.obsComunicacaoCliente || "",
        ferramentalOk: item.avaliacao_qualidade?.ferramentalOk || "Não avaliado",
        uniformeOk: item.avaliacao_qualidade?.uniformeOk || "Não avaliado",
        necessidadesFerramentas: item.ferramentas_faltantes || [],
        necessidadesUniforme: item.uniformes_faltantes || {}
      };

      generatePDF(mappedData);
      
      if (mappedData.ferramentalOk === "Não" || mappedData.uniformeOk === "Não") {
        setTimeout(() => {
          generateNecessidadesPDF(mappedData);
        }, 1000);
      }
    } catch (error) {
       toast.error("Erro ao gerar PDF desta vistoria.");
       console.error(error);
    }
  };

  const filteredIndicadores = allIndicadores.filter(ind => {
    if (!filterIndicadores) return true;
    const q = filterIndicadores.toLowerCase();
    return ind.re?.toLowerCase().includes(q) || ind.nome?.toLowerCase().includes(q) || ind.tt?.toLowerCase().includes(q) || ind.supervisor?.toLowerCase().includes(q);
  });

  const filteredColaboradores = allColaboradores.filter((c) => {
    if (!filterColaboradores) return true;
    const q = filterColaboradores.toLowerCase();
    return (
      c.nome_tecnico?.toLowerCase().includes(q) ||
      (c.tt || "").toLowerCase().includes(q) ||
      (c.tr || "").toLowerCase().includes(q) ||
      (c.supervisor || "").toLowerCase().includes(q) ||
      (c.coordenador || "").toLowerCase().includes(q) ||
      (c.nome_empresa || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="w-full max-w-[1200px] mx-auto px-4 h-14 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="p-1 bg-transparent w-9 h-9 flex items-center justify-center overflow-hidden">
            <img src="/ability-logo.png" alt="Logo" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-base font-bold text-foreground">Vistoria de Campo - Qualidade</h1>
        </div>
      </header>

      <main className="flex-1 w-full max-w-[1200px] mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList>
            <TabsTrigger value="formulario">Realizar Vistoria</TabsTrigger>
            <TabsTrigger value="indicadores">Indicadores / Importar</TabsTrigger>
            <TabsTrigger value="evolucao">Evolução</TabsTrigger>
            <TabsTrigger value="historico">Histórico e Acervo</TabsTrigger>
          </TabsList>

          {/* ========== TAB: FORMULÁRIO ========== */}
          <TabsContent value="formulario" className="space-y-6">
            {/* Section: RE Lookup */}
            <Card className="glass-card">
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-lg flex items-center gap-2 text-primary">
                  <FileText className="w-5 h-5" /> Identificação do Técnico
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="re" className="font-semibold text-foreground">RE (Matrícula) *</Label>
                    <Input
                      id="re"
                      value={re}
                      onChange={(e) => setRe(e.target.value.toUpperCase())}
                      placeholder="EX: RE12345"
                      className="bg-background border-primary/20 focus:border-primary uppercase h-10"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-semibold text-foreground">TT</Label>
                    <Input value={indicadores?.tt || ""} readOnly placeholder="Preenchido pela RE" className="bg-muted/30 h-10" />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-semibold text-foreground">Nome Técnico</Label>
                    <Input value={indicadores?.nome || ""} readOnly placeholder="Preenchido pela RE" className="bg-muted/30 h-10" />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-semibold text-foreground">Supervisor</Label>
                    <Input value={indicadores?.supervisor || ""} readOnly placeholder="Preenchido pela RE" className="bg-muted/30 h-10" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Section: Indicators */}
            {indicadores && (
              <Card className="glass-card animate-in fade-in duration-500">
                <CardHeader className="pb-3 border-b">
                  <CardTitle className="text-base font-bold text-primary">Indicadores de Desempenho</CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="overflow-x-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-primary/5">
                          <TableHead className="text-center font-bold text-foreground">Eficácia</TableHead>
                          <TableHead className="text-center font-bold text-foreground">Produtividade</TableHead>
                          <TableHead className="text-center font-bold text-foreground">Dias Trab.</TableHead>
                          <TableHead className="text-center font-bold text-foreground">Repetida</TableHead>
                          <TableHead className="text-center font-bold text-foreground">Infância</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow>
                          <TableCell className="text-center font-medium">{indicadores.eficacia}</TableCell>
                          <TableCell className="text-center font-medium">{indicadores.produtividade}</TableCell>
                          <TableCell className="text-center font-medium">{indicadores.dias_trabalhados}</TableCell>
                          <TableCell className="text-center font-medium">{indicadores.repetida}</TableCell>
                          <TableCell className="text-center font-medium">{indicadores.infancia}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Section: Quality evaluation */}
            <Card className="glass-card mt-2">
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-lg flex items-center gap-2 text-primary">
                  <CheckCircle2 className="w-5 h-5" /> Avaliação de Qualidade
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                
                {/* Atividade Correta */}
                <div className="space-y-3">
                  <Label className="text-sm font-semibold text-foreground">1. Técnico executou a atividade correta?</Label>
                  <div className="flex gap-2">
                    <Button type="button" variant={atividadeCorreta === "Sim" ? "default" : "outline"} onClick={() => setAtividadeCorreta("Sim")} className="flex-1">Sim</Button>
                    <Button type="button" variant={atividadeCorreta === "Não" ? "destructive" : "outline"} onClick={() => setAtividadeCorreta("Não")} className="flex-1">Não</Button>
                  </div>
                  {atividadeCorreta === "Não" && (
                    <div className="mt-2">
                      <Input placeholder="Qual foi o desvio na atividade?" value={obsAtividadeCorreta} onChange={e => setObsAtividadeCorreta(e.target.value)} />
                    </div>
                  )}
                </div>

                {/* Atendimento Cliente */}
                <div className="space-y-3">
                  <Label className="text-sm font-semibold text-foreground">2. Técnico atendeu bem o cliente?</Label>
                  <div className="flex gap-2">
                    <Button type="button" variant={atendimentoCliente === "Sim" ? "default" : "outline"} onClick={() => setAtendimentoCliente("Sim")} className="flex-1">Sim</Button>
                    <Button type="button" variant={atendimentoCliente === "Não" ? "destructive" : "outline"} onClick={() => setAtendimentoCliente("Não")} className="flex-1">Não</Button>
                  </div>
                  {atendimentoCliente === "Não" && (
                    <div className="mt-2">
                      <Input placeholder="O que ocorreu no atendimento?" value={obsAtendimentoCliente} onChange={e => setObsAtendimentoCliente(e.target.value)} />
                    </div>
                  )}
                </div>

                {/* Segurança */}
                <div className="space-y-3">
                  <Label className="text-sm font-semibold text-foreground">3. Realizou todos os procedimentos de segurança?</Label>
                  <div className="flex gap-2">
                    <Button type="button" variant={procedimentoSeguranca === "Sim" ? "default" : "outline"} onClick={() => setProcedimentoSeguranca("Sim")} className="flex-1">Sim</Button>
                    <Button type="button" variant={procedimentoSeguranca === "Não" ? "destructive" : "outline"} onClick={() => setProcedimentoSeguranca("Não")} className="flex-1">Não</Button>
                  </div>
                  {procedimentoSeguranca === "Não" && (
                    <div className="mt-2">
                      <Input placeholder="Quais procedimentos faltaram?" value={obsProcedimentoSeguranca} onChange={e => setObsProcedimentoSeguranca(e.target.value)} />
                    </div>
                  )}
                </div>

                {/* Domina Técnicas */}
                <div className="space-y-3">
                  <Label className="text-sm font-semibold text-foreground">4. Domina todas as técnicas da operação?</Label>
                  <div className="flex gap-2">
                    <Button type="button" variant={dominaTecnicas === "Sim" ? "default" : "outline"} onClick={() => setDominaTecnicas("Sim")} className="flex-1">Sim</Button>
                    <Button type="button" variant={dominaTecnicas === "Não" ? "destructive" : "outline"} onClick={() => setDominaTecnicas("Não")} className="flex-1">Não</Button>
                  </div>
                  {dominaTecnicas === "Não" && (
                    <div className="mt-2">
                      <Input placeholder="Quais técnicas precisam de reforço?" value={obsDominaTecnicas} onChange={e => setObsDominaTecnicas(e.target.value)} />
                    </div>
                  )}
                </div>

                {/* Comunicação */}
                <div className="space-y-3 border-t pt-4">
                  <Label className="text-sm font-semibold text-foreground">5. Avalie a comunicação com o cliente:</Label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {["Excelente", "Boa", "Média", "Ruim"].map(opt => (
                      <Button key={opt} type="button" variant={comunicacaoCliente === opt ? (opt === "Média" || opt === "Ruim" ? "destructive" : "default") : "outline"} onClick={() => setComunicacaoCliente(opt)}>
                        {opt}
                      </Button>
                    ))}
                  </div>
                  {(comunicacaoCliente === "Média" || comunicacaoCliente === "Ruim") && (
                    <div className="mt-2">
                      <Input placeholder="Explique o motivo da nota para a comunicação" value={obsComunicacaoCliente} onChange={e => setObsComunicacaoCliente(e.target.value)} />
                    </div>
                  )}
                </div>

              </CardContent>
            </Card>

            {/* Photos - Qualidade */}
            <Card className="glass-card">
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-base font-bold text-primary flex items-center gap-2">
                   <Camera className="w-4 h-4" /> Qualidade da Execução
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {[
                    { label: "1. Supervisor com Técnico", state: fotoSupervisor, setter: setFotoSupervisor, ref: fileInputSupervisor, icon: <ImageIcon className="w-8 h-8 text-muted-foreground mb-2" /> },
                    { label: "2. Execução do Serviço", state: fotoExecucao, setter: setFotoExecucao, ref: fileInputExecucao, icon: <ImageIcon className="w-8 h-8 text-muted-foreground mb-2" /> }
                  ].map((photo, idx) => (
                    <div key={idx} className="space-y-2">
                      <Label className="text-sm font-semibold text-muted-foreground">{photo.label}</Label>
                      <div className="relative group">
                        <div onClick={() => photo.ref.current?.click()} className={`aspect-video rounded-lg border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all ${photo.state.preview ? 'border-primary/50 bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/50 hover:bg-primary/5'}`}>
                          {photo.state.preview ? (
                            <img src={photo.state.preview} className="w-full h-full object-cover rounded-md" alt="Preview" />
                          ) : (
                            <>{photo.icon}<span className="text-xs text-muted-foreground">Clique para capturar</span></>
                          )}
                        </div>
                        {photo.state.preview && (
                          <Button variant="destructive" size="icon" className="absolute -top-2 -right-2 h-6 w-6 rounded-full shadow-lg" onClick={() => photo.setter({ preview: null, file: null })}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                        <input ref={photo.ref} type="file" accept="image/*" className="hidden" onChange={(e) => handlePhotoChange(e, photo.setter)} />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Section: Materiais e Uniforme */}
            <Card className="glass-card mt-2">
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-lg flex items-center gap-2 text-primary">
                  <FileText className="w-5 h-5" /> Checklist Físico (Ferramentas e Uniforme)
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-8">
                
                {/* Ferramentas */}
                <div className="space-y-3">
                  <Label className="text-sm font-semibold text-foreground">As ferramentas estão OK e completas?</Label>
                  <div className="flex gap-2">
                    <Button type="button" variant={ferramentalOk === "Sim" ? "default" : "outline"} onClick={() => setFerramentalOk("Sim")} className="flex-1">Sim</Button>
                    <Button type="button" variant={ferramentalOk === "Não" ? "destructive" : "outline"} onClick={() => setFerramentalOk("Não")} className="flex-1">Não (Solicitar Reposição)</Button>
                  </div>
                  
                  {ferramentalOk === "Não" && (
                    <div className="bg-destructive/5 p-4 rounded-lg mt-3 space-y-4 border border-destructive/20">
                      <Label className="font-semibold text-destructive">Adicionar ferramentas necessárias:</Label>
                      {necessidadesFerramentas.map((nf, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <Input className="flex-1 bg-white" placeholder="Nome do Equipamento" value={nf.equipamento} onChange={e => {
                            const newNf = [...necessidadesFerramentas];
                            newNf[idx].equipamento = e.target.value;
                            setNecessidadesFerramentas(newNf);
                          }} />
                          <Input className="w-24 bg-white" placeholder="Qtd" type="number" min="1" value={nf.quantidade} onChange={e => {
                            const newNf = [...necessidadesFerramentas];
                            newNf[idx].quantidade = e.target.value;
                            setNecessidadesFerramentas(newNf);
                          }} />
                          <Button size="icon" variant="outline" className="text-destructive border-destructive shrink-0 bg-white" onClick={() => {
                            setNecessidadesFerramentas(necessidadesFerramentas.filter((_, i) => i !== idx));
                          }}><Trash2 className="w-4 h-4" /></Button>
                        </div>
                      ))}
                      <Button type="button" variant="outline" className="w-full border-dashed" onClick={() => setNecessidadesFerramentas([...necessidadesFerramentas, { equipamento: "", quantidade: "1" }])}>
                        + Adicionar Ferramenta
                      </Button>
                    </div>
                  )}
                </div>

                {/* Uniforme */}
                <div className="space-y-3 border-t pt-4">
                  <Label className="text-sm font-semibold text-foreground">O Uniforme está OK e em bom estado?</Label>
                  <div className="flex gap-2">
                    <Button type="button" variant={uniformeOk === "Sim" ? "default" : "outline"} onClick={() => setUniformeOk("Sim")} className="flex-1">Sim</Button>
                    <Button type="button" variant={uniformeOk === "Não" ? "destructive" : "outline"} onClick={() => setUniformeOk("Não")} className="flex-1">Não (Solicitar Peças)</Button>
                  </div>

                  {uniformeOk === "Não" && (
                    <div className="bg-destructive/5 p-4 rounded-lg mt-3 space-y-4 border border-destructive/20">
                      <Label className="font-semibold text-destructive">Selecione as peças para reposição e o tamanho:</Label>
                      
                      {/* Calça */}
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <Button type="button" variant={necessidadesUniforme.calca ? "default" : "outline"} 
                           onClick={() => setNecessidadesUniforme(prev => ({ ...prev, calca: !prev.calca }))} className="w-full sm:w-32">
                           Calça
                        </Button>
                        {necessidadesUniforme.calca && (
                          <>
                            <Input className="flex-1 bg-white" placeholder="Tamanho (Ex: 42)" value={necessidadesUniforme.tamanhoCalca} onChange={e => setNecessidadesUniforme(prev => ({ ...prev, tamanhoCalca: e.target.value }))} />
                            <Input type="number" min="1" className="w-full sm:w-[100px] bg-white" placeholder="Qtd" value={necessidadesUniforme.qtdCalca} onChange={e => setNecessidadesUniforme(prev => ({ ...prev, qtdCalca: e.target.value }))} />
                          </>
                        )}
                      </div>

                      {/* Camisa */}
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <Button type="button" variant={necessidadesUniforme.camisa ? "default" : "outline"} 
                           onClick={() => setNecessidadesUniforme(prev => ({ ...prev, camisa: !prev.camisa }))} className="w-full sm:w-32">
                           Camisa
                        </Button>
                        {necessidadesUniforme.camisa && (
                          <>
                            <Input className="flex-1 bg-white" placeholder="Tamanho (Ex: M, G...)" value={necessidadesUniforme.tamanhoCamisa} onChange={e => setNecessidadesUniforme(prev => ({ ...prev, tamanhoCamisa: e.target.value }))} />
                            <Input type="number" min="1" className="w-full sm:w-[100px] bg-white" placeholder="Qtd" value={necessidadesUniforme.qtdCamisa} onChange={e => setNecessidadesUniforme(prev => ({ ...prev, qtdCamisa: e.target.value }))} />
                          </>
                        )}
                      </div>

                      {/* Sapato */}
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <Button type="button" variant={necessidadesUniforme.sapato ? "default" : "outline"} 
                           onClick={() => setNecessidadesUniforme(prev => ({ ...prev, sapato: !prev.sapato }))} className="w-full sm:w-32">
                           Sapato
                        </Button>
                        {necessidadesUniforme.sapato && (
                          <>
                            <Input className="flex-1 bg-white" placeholder="Tamanho (Ex: 40)" value={necessidadesUniforme.tamanhoSapato} onChange={e => setNecessidadesUniforme(prev => ({ ...prev, tamanhoSapato: e.target.value }))} />
                            <Input type="number" min="1" className="w-full sm:w-[100px] bg-white" placeholder="Qtd" value={necessidadesUniforme.qtdSapato} onChange={e => setNecessidadesUniforme(prev => ({ ...prev, qtdSapato: e.target.value }))} />
                          </>
                        )}
                      </div>

                    </div>
                  )}
                </div>

              </CardContent>
            </Card>

            {/* Photos - Fisicos */}
            <Card className="glass-card">
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-base font-bold text-primary flex items-center gap-2">
                   <Camera className="w-4 h-4" /> Checklist Físico e Uniforme
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {[
                    { label: "1. Equipamentos e Ferramentas", state: fotoEquipamentos, setter: setFotoEquipamentos, ref: fileInputEquipamentos, icon: <ImageIcon className="w-8 h-8 text-muted-foreground mb-2" /> },
                    { label: "2. Técnico com Uniforme", state: fotoUniforme, setter: setFotoUniforme, ref: fileInputUniforme, icon: <ImageIcon className="w-8 h-8 text-muted-foreground mb-2" /> }
                  ].map((photo, idx) => (
                    <div key={idx} className="space-y-2">
                      <Label className="text-sm font-semibold text-muted-foreground">{photo.label}</Label>
                      <div className="relative group">
                        <div onClick={() => photo.ref.current?.click()} className={`aspect-video rounded-lg border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all ${photo.state.preview ? 'border-primary/50 bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/50 hover:bg-primary/5'}`}>
                          {photo.state.preview ? (
                            <img src={photo.state.preview} className="w-full h-full object-cover rounded-md" alt="Preview" />
                          ) : (
                            <>{photo.icon}<span className="text-xs text-muted-foreground">Clique para capturar</span></>
                          )}
                        </div>
                        {photo.state.preview && (
                          <Button variant="destructive" size="icon" className="absolute -top-2 -right-2 h-6 w-6 rounded-full shadow-lg" onClick={() => photo.setter({ preview: null, file: null })}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                        <input ref={photo.ref} type="file" accept="image/*" className="hidden" onChange={(e) => handlePhotoChange(e, photo.setter)} />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Section: Observations */}
            <Card className="glass-card mt-2">
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-base font-bold text-primary">Observações de Campo</CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <textarea
                  className="w-full min-h-[120px] p-4 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all resize-none"
                  placeholder="Descreva aqui o acompanhamento técnico, orientações fornecidas e observações sobre a vistoria..."
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                />
              </CardContent>
            </Card>

            {/* Section: Signatures */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                { label: "Assinatura do Supervisor *", canvasRef: sigSupervisorCanvasRef, isDrawing: isDrawingSupervisor, setDrawing: setIsDrawingSupervisor },
                { label: "Assinatura do Técnico *", canvasRef: sigTecnicoCanvasRef, isDrawing: isDrawingTecnico, setDrawing: setIsDrawingTecnico }
              ].map((sig, idx) => (
                <Card key={idx} className="glass-card">
                  <CardHeader className="pb-3 border-b">
                    <CardTitle className="text-base font-bold text-primary pb-1 border-b">{sig.label}</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-4">
                    <div className="border shadow-inner rounded-lg bg-white overflow-hidden" style={{ touchAction: "none" }}>
                      <canvas
                        ref={sig.canvasRef}
                        className="w-full cursor-crosshair h-[140px]"
                        onMouseDown={(e) => startDraw(sig.canvasRef.current, e, sig.setDrawing)}
                        onMouseMove={(e) => draw(sig.canvasRef.current, e, sig.isDrawing)}
                        onMouseUp={() => endDraw(sig.setDrawing)}
                        onMouseLeave={() => endDraw(sig.setDrawing)}
                        onTouchStart={(e) => { e.preventDefault(); startDraw(sig.canvasRef.current, e, sig.setDrawing); }}
                        onTouchMove={(e) => { e.preventDefault(); draw(sig.canvasRef.current, e, sig.isDrawing); }}
                        onTouchEnd={() => endDraw(sig.setDrawing)}
                      />
                    </div>
                    <Button size="sm" variant="outline" onClick={() => clearCanvas(sig.canvasRef.current)} className="w-full hover:bg-accent/50">
                      Limpar Assinatura
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Submit */}
            <div className="flex flex-col sm:flex-row gap-4 pt-4 pb-8">
              <Button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 h-12 text-lg font-bold shadow-lg shadow-primary/20 transition-all hover:scale-[1.01]"
              >
                {submitting ? (
                  <span className="flex items-center gap-2">
                    <div className="animate-spin w-4 h-4 border-2 border-background border-t-transparent rounded-full" />
                    Salvando Vistoria...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Download className="w-5 h-5" /> Salvar e Gerar Relatório PDF
                  </span>
                )}
              </Button>
              <Button variant="outline" onClick={() => navigate("/dashboard")} className="h-12 px-8">
                Cancelar
              </Button>
            </div>
          </TabsContent>

          {/* ========== TAB: INDICADORES / IMPORTAR ========== */}
          <TabsContent value="indicadores" className="space-y-6">
            <Tabs value={indicadoresSubTab} onValueChange={(v) => setIndicadoresSubTab(v as "colaboradores" | "indicadores")}>
              <TabsList>
                <TabsTrigger value="colaboradores">Colaboradores (Dimensão)</TabsTrigger>
                <TabsTrigger value="indicadores">Indicadores (Fato)</TabsTrigger>
              </TabsList>

              {/* ===== Sub-aba COLABORADORES ===== */}
              <TabsContent value="colaboradores" className="space-y-6 mt-4">
                <Card className="glass-card">
                  <CardHeader className="pb-3 border-b">
                    <CardTitle className="text-lg flex items-center gap-2 text-primary">
                      <Upload className="w-5 h-5" /> Importação de Colaboradores
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6 space-y-4">
                    <div className="p-4 bg-primary/5 border border-dashed border-primary/20 rounded-xl space-y-3">
                      <div className="text-sm space-y-1">
                        <p className="font-bold text-foreground">Instruções:</p>
                        <ul className="list-disc list-inside text-muted-foreground space-y-1 text-xs">
                          <li>Tabela base de colaboradores. Atualize livremente: edite ou inclua via planilha.</li>
                          <li>Chave de deduplicação: <strong>TT</strong> (ou TR). Registros idênticos são ignorados na carga massiva.</li>
                          <li>O TT é a chave que cruza com a tabela de Indicadores (Fato).</li>
                        </ul>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <label className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg cursor-pointer hover:bg-primary/90 transition-all shadow-md text-sm">
                          <Upload className="w-4 h-4" /> Selecionar Planilha
                          <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportColaboradores} />
                        </label>
                        <Button variant="outline" size="sm" onClick={downloadTemplateColaboradores} className="h-auto py-2.5">
                          <Download className="w-4 h-4 mr-2" /> Baixar Modelo
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="glass-card">
                  <CardHeader className="pb-3 border-b">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <CardTitle className="text-lg flex items-center gap-2 text-primary">
                        <FileText className="w-5 h-5" /> Colaboradores ({allColaboradores.length})
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <Input
                          placeholder="Filtrar por nome, TT, TR, supervisor..."
                          value={filterColaboradores}
                          onChange={(e) => setFilterColaboradores(e.target.value)}
                          className="w-[280px] h-9 text-sm"
                        />
                        <Button variant="ghost" size="icon" onClick={loadColaboradores} title="Recarregar">
                          <RefreshCw className={`w-4 h-4 ${loadingColaboradores ? "animate-spin" : ""}`} />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <div className="overflow-x-auto rounded-lg border max-h-[500px] overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-primary/5">
                            <TableHead className="font-bold text-foreground text-xs">TT</TableHead>
                            <TableHead className="font-bold text-foreground text-xs">TR</TableHead>
                            <TableHead className="font-bold text-foreground text-xs">Nome</TableHead>
                            <TableHead className="font-bold text-foreground text-xs">Empresa</TableHead>
                            <TableHead className="font-bold text-foreground text-xs">Supervisor</TableHead>
                            <TableHead className="font-bold text-foreground text-xs">Coordenador</TableHead>
                            <TableHead className="font-bold text-foreground text-xs">Telefone</TableHead>
                            <TableHead className="font-bold text-foreground text-xs">Cidade</TableHead>
                            <TableHead className="text-center font-bold text-foreground text-xs w-[100px]">Ações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredColaboradores.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                                {loadingColaboradores ? "Carregando..." : "Nenhum colaborador cadastrado."}
                              </TableCell>
                            </TableRow>
                          ) : (
                            filteredColaboradores.map((c) => (
                              <TableRow key={c.id} className="hover:bg-muted/30">
                                {editingColaborador?.id === c.id ? (
                                  <>
                                    <TableCell><Input value={editColaboradorForm?.tt || ""} onChange={(e) => setEditColaboradorForm(f => f ? { ...f, tt: e.target.value.toUpperCase() } : f)} className="h-7 text-xs" /></TableCell>
                                    <TableCell><Input value={editColaboradorForm?.tr || ""} onChange={(e) => setEditColaboradorForm(f => f ? { ...f, tr: e.target.value.toUpperCase() } : f)} className="h-7 text-xs" /></TableCell>
                                    <TableCell><Input value={editColaboradorForm?.nome_tecnico || ""} onChange={(e) => setEditColaboradorForm(f => f ? { ...f, nome_tecnico: e.target.value } : f)} className="h-7 text-xs" /></TableCell>
                                    <TableCell><Input value={editColaboradorForm?.nome_empresa || ""} onChange={(e) => setEditColaboradorForm(f => f ? { ...f, nome_empresa: e.target.value } : f)} className="h-7 text-xs" /></TableCell>
                                    <TableCell><Input value={editColaboradorForm?.supervisor || ""} onChange={(e) => setEditColaboradorForm(f => f ? { ...f, supervisor: e.target.value } : f)} className="h-7 text-xs" /></TableCell>
                                    <TableCell><Input value={editColaboradorForm?.coordenador || ""} onChange={(e) => setEditColaboradorForm(f => f ? { ...f, coordenador: e.target.value } : f)} className="h-7 text-xs" /></TableCell>
                                    <TableCell><Input value={editColaboradorForm?.telefone || ""} onChange={(e) => setEditColaboradorForm(f => f ? { ...f, telefone: e.target.value } : f)} className="h-7 text-xs" /></TableCell>
                                    <TableCell><Input value={editColaboradorForm?.cidade_residencia || ""} onChange={(e) => setEditColaboradorForm(f => f ? { ...f, cidade_residencia: e.target.value } : f)} className="h-7 text-xs" /></TableCell>
                                    <TableCell className="text-center">
                                      <div className="flex items-center justify-center gap-1">
                                        <Button size="icon" variant="ghost" onClick={handleSaveColaborador} className="h-7 w-7 text-primary"><Save className="w-3.5 h-3.5" /></Button>
                                        <Button size="icon" variant="ghost" onClick={() => { setEditingColaborador(null); setEditColaboradorForm(null); }} className="h-7 w-7"><X className="w-3.5 h-3.5" /></Button>
                                      </div>
                                    </TableCell>
                                  </>
                                ) : (
                                  <>
                                    <TableCell className="text-xs font-mono">{c.tt || "-"}</TableCell>
                                    <TableCell className="text-xs font-mono">{c.tr || "-"}</TableCell>
                                    <TableCell className="text-xs font-medium">{c.nome_tecnico}</TableCell>
                                    <TableCell className="text-xs">{c.nome_empresa || "-"}</TableCell>
                                    <TableCell className="text-xs">{c.supervisor || "-"}</TableCell>
                                    <TableCell className="text-xs">{c.coordenador || "-"}</TableCell>
                                    <TableCell className="text-xs">{c.telefone || "-"}</TableCell>
                                    <TableCell className="text-xs">{c.cidade_residencia || "-"}</TableCell>
                                    <TableCell className="text-center">
                                      <div className="flex items-center justify-center gap-1">
                                        <Button size="icon" variant="ghost" onClick={() => handleStartEditColab(c)} className="h-7 w-7" title="Editar">
                                          <Pencil className="w-3.5 h-3.5" />
                                        </Button>
                                        {isAdmin && (
                                          <Button size="icon" variant="ghost" onClick={() => handleDeleteColaborador(c.id)} className="h-7 w-7 text-destructive" title="Excluir">
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </Button>
                                        )}
                                      </div>
                                    </TableCell>
                                  </>
                                )}
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ===== Sub-aba INDICADORES (Fato) ===== */}
              <TabsContent value="indicadores" className="space-y-6 mt-4">
                <Card className="glass-card">
                  <CardHeader className="pb-3 border-b">
                    <CardTitle className="text-lg flex items-center gap-2 text-primary">
                      <Upload className="w-5 h-5" /> Importação de Indicadores (Fato)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6 space-y-4">
                    <div className="p-4 bg-primary/5 border border-dashed border-primary/20 rounded-xl space-y-3">
                      <div className="text-sm space-y-1">
                        <p className="font-bold text-foreground">Instruções:</p>
                        <ul className="list-disc list-inside text-muted-foreground space-y-1 text-xs">
                          <li>Tabela de Fato — atualizada constantemente via carga massiva.</li>
                          <li>Chave: <strong>TT + Mês Referência</strong> (cruza com Colaboradores).</li>
                          <li><strong>Repetida</strong>: informe Entrantes e quantos Repetiu — % calculado automaticamente.</li>
                          <li><strong>Infância</strong>: informe Instaladas e Chamados em até 30 dias — % calculado.</li>
                        </ul>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <label className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg cursor-pointer hover:bg-primary/90 transition-all shadow-md text-sm">
                          <Upload className="w-4 h-4" /> Selecionar Planilha
                          <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportIndicadores} />
                        </label>
                        <Button variant="outline" size="sm" onClick={downloadTemplateIndicadores} className="h-auto py-2.5">
                          <Download className="w-4 h-4 mr-2" /> Baixar Modelo
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="glass-card">
                  <CardHeader className="pb-3 border-b">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <CardTitle className="text-lg flex items-center gap-2 text-primary">
                        <FileText className="w-5 h-5" /> Indicadores por TT (última carga) — {allIndicadores.length} registros
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <Input
                          placeholder="Filtrar por nome, TT, RE..."
                          value={filterIndicadores}
                          onChange={(e) => setFilterIndicadores(e.target.value)}
                          className="w-[250px] h-9 text-sm"
                        />
                        <Button variant="ghost" size="icon" onClick={loadIndicadores} title="Recarregar">
                          <RefreshCw className={`w-4 h-4 ${loadingIndicadores ? "animate-spin" : ""}`} />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <div className="overflow-x-auto rounded-lg border max-h-[500px] overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-primary/5">
                            <TableHead className="font-bold text-foreground text-xs">TT</TableHead>
                            <TableHead className="font-bold text-foreground text-xs">Nome</TableHead>
                            <TableHead className="font-bold text-foreground text-xs">Supervisor</TableHead>
                            <TableHead className="text-center font-bold text-foreground text-xs">Mês Ref.</TableHead>
                            <TableHead className="text-center font-bold text-foreground text-xs">Eficácia</TableHead>
                            <TableHead className="text-center font-bold text-foreground text-xs">Produt.</TableHead>
                            <TableHead className="text-center font-bold text-foreground text-xs">Dias Trab.</TableHead>
                            <TableHead className="text-center font-bold text-foreground text-xs">Rep. Entr.</TableHead>
                            <TableHead className="text-center font-bold text-foreground text-xs">Repetiu</TableHead>
                            <TableHead className="text-center font-bold text-foreground text-xs">Repetida %</TableHead>
                            <TableHead className="text-center font-bold text-foreground text-xs">Infân. Instal.</TableHead>
                            <TableHead className="text-center font-bold text-foreground text-xs">Cham. 30d</TableHead>
                            <TableHead className="text-center font-bold text-foreground text-xs">Infância %</TableHead>
                            <TableHead className="text-center font-bold text-foreground text-xs w-[110px]">Ações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredIndicadores.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={14} className="text-center py-8 text-muted-foreground">
                                {loadingIndicadores ? "Carregando..." : "Nenhum indicador cadastrado. Importe uma planilha acima."}
                              </TableCell>
                            </TableRow>
                          ) : (
                            filteredIndicadores.map((ind) => (
                              <TableRow key={ind.id || ind.tt} className="hover:bg-muted/30">
                                {editingIndicador?.id === ind.id ? (
                                  <>
                                    <TableCell className="text-xs font-mono">{ind.tt}</TableCell>
                                    <TableCell className="text-xs">{ind.nome}</TableCell>
                                    <TableCell className="text-xs">{ind.supervisor}</TableCell>
                                    <TableCell className="text-xs text-center">{ind.mes_referencia ? new Date(ind.mes_referencia).toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" }) : "-"}</TableCell>
                                    <TableCell><Input type="number" value={editForm?.eficacia ?? ""} onChange={(e) => setEditForm(f => f ? { ...f, eficacia: e.target.value } : f)} className="h-7 text-xs text-center" /></TableCell>
                                    <TableCell><Input type="number" value={editForm?.produtividade ?? ""} onChange={(e) => setEditForm(f => f ? { ...f, produtividade: e.target.value } : f)} className="h-7 text-xs text-center" /></TableCell>
                                    <TableCell><Input type="number" value={editForm?.dias_trabalhados ?? ""} onChange={(e) => setEditForm(f => f ? { ...f, dias_trabalhados: e.target.value } : f)} className="h-7 text-xs text-center" /></TableCell>
                                    <TableCell><Input type="number" value={editForm?.repetida_entrantes ?? 0} onChange={(e) => setEditForm(f => f ? { ...f, repetida_entrantes: Number(e.target.value) } : f)} className="h-7 text-xs text-center" /></TableCell>
                                    <TableCell><Input type="number" value={editForm?.repetida_repetiu ?? 0} onChange={(e) => setEditForm(f => f ? { ...f, repetida_repetiu: Number(e.target.value) } : f)} className="h-7 text-xs text-center" /></TableCell>
                                    <TableCell className="text-center text-xs text-muted-foreground">auto</TableCell>
                                    <TableCell><Input type="number" value={editForm?.infancia_instaladas ?? 0} onChange={(e) => setEditForm(f => f ? { ...f, infancia_instaladas: Number(e.target.value) } : f)} className="h-7 text-xs text-center" /></TableCell>
                                    <TableCell><Input type="number" value={editForm?.infancia_chamados_30d ?? 0} onChange={(e) => setEditForm(f => f ? { ...f, infancia_chamados_30d: Number(e.target.value) } : f)} className="h-7 text-xs text-center" /></TableCell>
                                    <TableCell className="text-center text-xs text-muted-foreground">auto</TableCell>
                                    <TableCell className="text-center">
                                      <div className="flex items-center justify-center gap-1">
                                        <Button size="icon" variant="ghost" onClick={handleSaveEdit} className="h-7 w-7 text-primary"><Save className="w-3.5 h-3.5" /></Button>
                                        <Button size="icon" variant="ghost" onClick={() => { setEditingIndicador(null); setEditForm(null); }} className="h-7 w-7"><X className="w-3.5 h-3.5" /></Button>
                                      </div>
                                    </TableCell>
                                  </>
                                ) : (
                                  <>
                                    <TableCell className="text-xs font-mono">{ind.tt}</TableCell>
                                    <TableCell className="text-xs font-medium">{ind.nome}</TableCell>
                                    <TableCell className="text-xs">{ind.supervisor}</TableCell>
                                    <TableCell className="text-xs text-center">{ind.mes_referencia ? new Date(ind.mes_referencia).toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" }) : "-"}</TableCell>
                                    <TableCell className="text-center text-xs">{ind.eficacia}</TableCell>
                                    <TableCell className="text-center text-xs">{ind.produtividade}</TableCell>
                                    <TableCell className="text-center text-xs">{ind.dias_trabalhados}</TableCell>
                                    <TableCell className="text-center text-xs">{ind.repetida_entrantes ?? 0}</TableCell>
                                    <TableCell className="text-center text-xs">{ind.repetida_repetiu ?? 0}</TableCell>
                                    <TableCell className="text-center text-xs font-semibold">{ind.repetida}</TableCell>
                                    <TableCell className="text-center text-xs">{ind.infancia_instaladas ?? 0}</TableCell>
                                    <TableCell className="text-center text-xs">{ind.infancia_chamados_30d ?? 0}</TableCell>
                                    <TableCell className="text-center text-xs font-semibold">{ind.infancia}</TableCell>
                                    <TableCell className="text-center">
                                      <div className="flex items-center justify-center gap-1">
                                        <Button size="icon" variant="ghost" onClick={() => handleStartEdit(ind)} className="h-7 w-7" title="Editar">
                                          <Pencil className="w-3.5 h-3.5" />
                                        </Button>
                                        <Button size="icon" variant="ghost" onClick={() => openEvolucao(ind)} className="h-7 w-7 text-primary" title="Evolução">
                                          <TrendingUp className="w-3.5 h-3.5" />
                                        </Button>
                                        {isAdmin && (
                                          <Button size="icon" variant="ghost" onClick={() => handleDeleteIndicador(ind.id)} className="h-7 w-7 text-destructive" title="Excluir">
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </Button>
                                        )}
                                      </div>
                                    </TableCell>
                                  </>
                                )}
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

          {/* ========== TAB: EVOLUÇÃO ========== */}
          <TabsContent value="evolucao" className="space-y-6">
            <Card className="glass-card">
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-lg flex items-center gap-2 text-primary">
                  <TrendingUp className="w-5 h-5" /> Consultar Evolução do Colaborador
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-end gap-4">
                  <div className="space-y-2 flex-1 max-w-xs">
                    <Label className="font-semibold text-foreground">RE do Técnico</Label>
                    <Input
                      value={evolucaoRe}
                      onChange={(e) => setEvolucaoRe(e.target.value.toUpperCase())}
                      placeholder="Digite a RE"
                      className="uppercase h-10"
                    />
                  </div>
                  <Button
                    onClick={() => { if (evolucaoRe) loadEvolucao(evolucaoRe); }}
                    disabled={!evolucaoRe}
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${loadingEvolucao ? 'animate-spin' : ''}`} /> Consultar
                  </Button>
                </div>

                {evolucaoData.length > 0 && (
                  <div className="overflow-x-auto rounded-lg border mt-4">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-primary/5">
                          <TableHead className="font-bold text-foreground text-xs">Data Revisita</TableHead>
                          <TableHead className="text-center font-bold text-foreground text-xs">Eficácia Ant.</TableHead>
                          <TableHead className="text-center font-bold text-foreground text-xs">Eficácia Atual</TableHead>
                          <TableHead className="text-center font-bold text-foreground text-xs">Produt. Ant.</TableHead>
                          <TableHead className="text-center font-bold text-foreground text-xs">Produt. Atual</TableHead>
                          <TableHead className="text-center font-bold text-foreground text-xs">Repet. Ant.</TableHead>
                          <TableHead className="text-center font-bold text-foreground text-xs">Repet. Atual</TableHead>
                          <TableHead className="text-center font-bold text-foreground text-xs">Infân. Ant.</TableHead>
                          <TableHead className="text-center font-bold text-foreground text-xs">Infân. Atual</TableHead>
                          <TableHead className="font-bold text-foreground text-xs">Observações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {evolucaoData.map((ev) => (
                          <TableRow key={ev.id}>
                            <TableCell className="text-xs">{new Date(ev.data_revisita).toLocaleDateString("pt-BR")}</TableCell>
                            <TableCell className="text-center text-xs">{ev.eficacia_anterior}</TableCell>
                            <TableCell className="text-center text-xs font-semibold text-primary">{ev.eficacia_atual}</TableCell>
                            <TableCell className="text-center text-xs">{ev.produtividade_anterior}</TableCell>
                            <TableCell className="text-center text-xs font-semibold text-primary">{ev.produtividade_atual}</TableCell>
                            <TableCell className="text-center text-xs">{ev.repetida_anterior}</TableCell>
                            <TableCell className="text-center text-xs font-semibold text-primary">{ev.repetida_atual}</TableCell>
                            <TableCell className="text-center text-xs">{ev.infancia_anterior}</TableCell>
                            <TableCell className="text-center text-xs font-semibold text-primary">{ev.infancia_atual}</TableCell>
                            <TableCell className="text-xs max-w-[200px] truncate">{ev.observacoes}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {evolucaoRe && evolucaoData.length === 0 && !loadingEvolucao && (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhum registro de evolução encontrado para esta RE.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ========== TAB: HISTÓRICO ========== */}
          <TabsContent value="historico" className="space-y-6">
            <Card className="glass-card">
              <CardHeader className="pb-3 border-b">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2 text-primary">
                    <FileText className="w-5 h-5" /> Acervo de Vistorias Salvas
                  </CardTitle>
                  <Button variant="ghost" size="icon" onClick={loadHistorico} title="Recarregar">
                    <RefreshCw className={`w-4 h-4 ${loadingHistorico ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="overflow-x-auto rounded-lg border max-h-[600px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-primary/5">
                        <TableHead className="font-bold text-foreground text-xs whitespace-nowrap">Data</TableHead>
                        <TableHead className="font-bold text-foreground text-xs">RE / TT</TableHead>
                        <TableHead className="font-bold text-foreground text-xs">Técnico</TableHead>
                        <TableHead className="font-bold text-foreground text-xs">Supervisor</TableHead>
                        <TableHead className="font-bold text-foreground text-xs">EPIs Solicitados?</TableHead>
                        <TableHead className="text-center font-bold text-foreground text-xs w-[120px]">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {historicoData.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                            {loadingHistorico ? "Carregando histórico..." : "Nenhuma vistoria salva encontrada."}
                          </TableCell>
                        </TableRow>
                      ) : (
                        historicoData.map((item) => {
                           const temEpi = item.avaliacao_qualidade?.ferramentalOk === "Não" || item.avaliacao_qualidade?.uniformeOk === "Não";
                           return (
                            <TableRow key={item.id} className="hover:bg-muted/30">
                              <TableCell className="text-xs whitespace-nowrap">{new Date(item.created_at).toLocaleDateString("pt-BR")} {new Date(item.created_at).toLocaleTimeString("pt-BR", {hour: '2-digit', minute:'2-digit'})}</TableCell>
                              <TableCell className="text-xs font-mono">{item.tecnico_re} / {item.tecnico_tt}</TableCell>
                              <TableCell className="text-xs font-medium">{item.nome_tecnico}</TableCell>
                              <TableCell className="text-xs">{item.supervisor_tecnico}</TableCell>
                              <TableCell className="text-xs">
                                {temEpi ? <span className="text-destructive font-semibold">Sim (Reposição)</span> : <span className="text-green-600">Não (Tudo OK)</span>}
                              </TableCell>
                              <TableCell className="text-center">
                                <Button size="sm" variant="outline" className="h-8 gap-1 w-full text-xs" onClick={() => handleDownloadHistorico(item)}>
                                  <Download className="w-3.5 h-3.5" /> PDF {temEpi && '(+ Recibo)'}
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Evolução Dialog (from indicadores table) */}
      <Dialog open={showEvolucaoDialog} onOpenChange={setShowEvolucaoDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-primary flex items-center gap-2">
              <TrendingUp className="w-5 h-5" /> Registrar Evolução - {evolucaoTecnico?.nome}
            </DialogTitle>
          </DialogHeader>

          {evolucaoTecnico && (
            <div className="space-y-4">
              <div className="p-3 bg-muted/30 rounded-lg text-sm">
                <p><strong>RE:</strong> {evolucaoTecnico.re} | <strong>TT:</strong> {evolucaoTecnico.tt} | <strong>Supervisor:</strong> {evolucaoTecnico.supervisor}</p>
                <p className="mt-1 text-xs text-muted-foreground">Indicadores atuais: Eficácia: {evolucaoTecnico.eficacia} | Produt: {evolucaoTecnico.produtividade} | Repetida: {evolucaoTecnico.repetida} | Infância: {evolucaoTecnico.infancia}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Nova Eficácia</Label>
                  <Input value={novaEvolucao.eficacia_atual} onChange={(e) => setNovaEvolucao(f => ({ ...f, eficacia_atual: e.target.value }))} placeholder={evolucaoTecnico.eficacia} className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Nova Produtividade</Label>
                  <Input value={novaEvolucao.produtividade_atual} onChange={(e) => setNovaEvolucao(f => ({ ...f, produtividade_atual: e.target.value }))} placeholder={evolucaoTecnico.produtividade} className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Nova Repetida</Label>
                  <Input value={novaEvolucao.repetida_atual} onChange={(e) => setNovaEvolucao(f => ({ ...f, repetida_atual: e.target.value }))} placeholder={evolucaoTecnico.repetida} className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Nova Infância</Label>
                  <Input value={novaEvolucao.infancia_atual} onChange={(e) => setNovaEvolucao(f => ({ ...f, infancia_atual: e.target.value }))} placeholder={evolucaoTecnico.infancia} className="h-9 text-sm" />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Observações da Revisita</Label>
                <textarea
                  className="w-full min-h-[80px] p-3 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                  placeholder="Descreva as observações sobre a evolução do colaborador..."
                  value={novaEvolucao.observacoes}
                  onChange={(e) => setNovaEvolucao(f => ({ ...f, observacoes: e.target.value }))}
                />
              </div>

              {/* Histórico */}
              {evolucaoData.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-bold text-foreground">Histórico de Evolução</p>
                  <div className="overflow-x-auto rounded border max-h-[200px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead className="text-xs">Data</TableHead>
                          <TableHead className="text-xs text-center">Efic. Ant→Atual</TableHead>
                          <TableHead className="text-xs text-center">Prod. Ant→Atual</TableHead>
                          <TableHead className="text-xs">Obs</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {evolucaoData.map((ev) => (
                          <TableRow key={ev.id}>
                            <TableCell className="text-xs">{new Date(ev.data_revisita).toLocaleDateString("pt-BR")}</TableCell>
                            <TableCell className="text-xs text-center">{ev.eficacia_anterior} → <span className="text-primary font-semibold">{ev.eficacia_atual}</span></TableCell>
                            <TableCell className="text-xs text-center">{ev.produtividade_anterior} → <span className="text-primary font-semibold">{ev.produtividade_atual}</span></TableCell>
                            <TableCell className="text-xs truncate max-w-[120px]">{ev.observacoes}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEvolucaoDialog(false)}>Cancelar</Button>
            <Button onClick={handleSaveEvolucao}>
              <Save className="w-4 h-4 mr-2" /> Salvar Evolução
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VistoriaCampo;
