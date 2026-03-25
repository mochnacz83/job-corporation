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
  re: string;
  tt: string;
  nome: string;
  supervisor: string;
  eficacia: string;
  produtividade: string;
  dias_trabalhados: string;
  repetida: string;
  infancia: string;
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

  const fileInputSupervisor = useRef<HTMLInputElement>(null);
  const fileInputEquipamentos = useRef<HTMLInputElement>(null);
  const fileInputExecucao = useRef<HTMLInputElement>(null);

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

  // Load all indicadores
  const loadIndicadores = useCallback(async () => {
    setLoadingIndicadores(true);
    try {
      const { data, error } = await supabase
        .from("tecnicos_indicadores" as any)
        .select("*")
        .order("nome");
      if (error) throw error;
      setAllIndicadores((data as any[]) || []);
    } catch (err: any) {
      console.error("Error loading indicadores:", err);
    } finally {
      setLoadingIndicadores(false);
    }
  }, []);

  useEffect(() => {
    loadIndicadores();
  }, [loadIndicadores]);

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
      const { data: indData } = await supabase
        .from("tecnicos_indicadores" as any)
        .select("*")
        .eq("re", val.toUpperCase())
        .maybeSingle();

      if (indData) {
        setIndicadores(indData as unknown as TecnicoIndicadores);
        return;
      }

      const { data: tecData } = await supabase
        .from("tecnicos_cadastro")
        .select("*")
        .or(`tr.eq.${val.toUpperCase()},tt.eq.${val.toUpperCase()}`)
        .maybeSingle();

      if (tecData) {
        setIndicadores({
          re: val.toUpperCase(),
          tt: tecData.tt || "",
          nome: tecData.nome_tecnico,
          supervisor: tecData.supervisor || "",
          eficacia: "-",
          produtividade: "-",
          dias_trabalhados: "-",
          repetida: "-",
          infancia: "-"
        });
      }
    } catch (err) {
      console.error("Error looking up RE:", err);
    }
  };

  // Canvas Helpers
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

    y += 15;

    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    const splitPhrase = doc.splitTextToSize(FRASE_COMPROMISSO, pageW - 2 * margin);
    doc.text(splitPhrase, margin, y);
    y += (splitPhrase.length * 5) + 5;

    if (data.observacoes) {
      doc.setFont("helvetica", "bold");
      doc.text("OBSERVAÇÕES:", margin, y);
      y += 5;
      doc.setFont("helvetica", "normal");
      const splitObs = doc.splitTextToSize(data.observacoes, pageW - 2 * margin);
      doc.text(splitObs, margin, y);
      y += (splitObs.length * 5) + 10;
    }

    const photoSize = 50;
    let photoX = margin;
    const checkSpace = (h: number) => { if (y + h > 280) { doc.addPage(); y = 20; } };

    const photos = [
      { label: "Supervisor c/ Técnico", url: data.fotoSupervisor },
      { label: "Equipamentos", url: data.fotoEquipamentos },
      { label: "Execução", url: data.fotoExecucao }
    ].filter(p => p.url);

    if (photos.length > 0) {
      checkSpace(photoSize + 10);
      doc.setFont("helvetica", "bold");
      doc.text("EVIDÊNCIAS FOTOGRÁFICAS:", margin, y);
      y += 5;

      photos.forEach((p) => {
        try {
          doc.addImage(p.url, "JPEG", photoX, y, photoSize, photoSize);
          doc.setFontSize(7);
          doc.text(p.label, photoX + photoSize / 2, y + photoSize + 4, { align: "center" });
          photoX += photoSize + 10;
          if (photoX + photoSize > pageW - margin) {
            photoX = margin;
            y += photoSize + 15;
            checkSpace(photoSize + 10);
          }
        } catch { }
      });
      if (photoX !== margin) y += photoSize + 15;
    }

    y = Math.max(y, 250);
    doc.setLineWidth(0.2);
    doc.setDrawColor(0);

    doc.line(margin, y, margin + 70, y);
    doc.setFontSize(8);
    doc.text("Assinatura do Supervisor", margin + 35, y + 5, { align: "center" });
    if (data.sigSupervisor) {
      doc.addImage(data.sigSupervisor, "PNG", margin + 10, y - 15, 50, 15);
    }

    doc.line(pageW - margin - 70, y, pageW - margin, y);
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
        assinatura_supervisor: sigSupervisor,
        assinatura_tecnico: sigTecnico
      });

      if (error) throw error;

      toast.success("Vistoria salva com sucesso!");
      trackAction("salvar_vistoria");

      generatePDF({
        ...indicadores,
        observacoes,
        fotoSupervisor: fotoSupervisor.preview,
        fotoEquipamentos: fotoEquipamentos.preview,
        fotoExecucao: fotoExecucao.preview,
        sigSupervisor,
        sigTecnico
      });

      setRe("");
      setIndicadores(null);
      setObservacoes("");
      setFotoSupervisor({ preview: null, file: null });
      setFotoEquipamentos({ preview: null, file: null });
      setFotoExecucao({ preview: null, file: null });
      clearCanvas(sigSupervisorCanvasRef.current);
      clearCanvas(sigTecnicoCanvasRef.current);
    } catch (err: any) {
      toast.error("Erro ao salvar vistoria: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Import indicadores - replace matching RE/TT/Nome, insert new
  const handleImportIndicadores = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws);

      let createdCount = 0;
      let updatedCount = 0;
      const loteId = new Date().toISOString();

      for (const r of rows) {
        const reVal = String(r.RE || r.re || "").trim().toUpperCase();
        if (!reVal) continue;

        const payload = {
          re: reVal,
          tt: String(r.TT || r.tt || "").trim(),
          nome: String(r["Nome"] || r.nome || r["Nome Técnico"] || "").trim(),
          supervisor: String(r.Supervisor || r.supervisor || "").trim(),
          eficacia: String(r.Eficácia || r.eficacia || r["Eficacia"] || "-").trim(),
          produtividade: String(r.Produtividade || r.produtividade || "-").trim(),
          dias_trabalhados: String(r["Dias Trabalhados"] || r.dias_trabalhados || r["Dias Trab."] || "-").trim(),
          repetida: String(r.Repetida || r.repetida || "-").trim(),
          infancia: String(r.Infância || r.infancia || r["Infancia"] || "-").trim(),
          lote_importacao: loteId,
          uploaded_by: user.id,
          updated_at: new Date().toISOString()
        };

        // Check existing by RE
        const { data: existing } = await supabase
          .from("tecnicos_indicadores" as any)
          .select("id")
          .eq("re", reVal)
          .maybeSingle();

        if (existing) {
          await supabase.from("tecnicos_indicadores" as any).update(payload).eq("re", reVal);
          updatedCount++;
        } else {
          await supabase.from("tecnicos_indicadores" as any).insert(payload);
          createdCount++;
        }
      }

      toast.success(`Importação concluída! ${createdCount} novos, ${updatedCount} atualizados.`);
      trackAction("importar_indicadores");
      loadIndicadores();
    } catch (err: any) {
      toast.error("Erro ao importar: " + err.message);
    }
    e.target.value = "";
  };

  const downloadTemplateIndicadores = () => {
    const ws = XLSX.utils.aoa_to_sheet([["RE", "TT", "Nome", "Supervisor", "Eficácia", "Produtividade", "Dias Trabalhados", "Repetida", "Infância"]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Indicadores");
    XLSX.writeFile(wb, "modelo_indicadores_vistoria.xlsx");
  };

  // Edit individual indicador
  const handleStartEdit = (ind: TecnicoIndicadores) => {
    setEditingIndicador(ind);
    setEditForm({ ...ind });
  };

  const handleSaveEdit = async () => {
    if (!editForm || !editingIndicador) return;
    try {
      const { error } = await supabase
        .from("tecnicos_indicadores" as any)
        .update({
          tt: editForm.tt,
          nome: editForm.nome,
          supervisor: editForm.supervisor,
          eficacia: editForm.eficacia,
          produtividade: editForm.produtividade,
          dias_trabalhados: editForm.dias_trabalhados,
          repetida: editForm.repetida,
          infancia: editForm.infancia,
          updated_at: new Date().toISOString()
        })
        .eq("re", editingIndicador.re);

      if (error) throw error;
      toast.success("Indicador atualizado!");
      setEditingIndicador(null);
      setEditForm(null);
      loadIndicadores();
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    }
  };

  const handleDeleteIndicador = async (reVal: string) => {
    if (!confirm("Deseja excluir este registro?")) return;
    try {
      const { error } = await supabase.from("tecnicos_indicadores" as any).delete().eq("re", reVal);
      if (error) throw error;
      toast.success("Registro excluído!");
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

      // Update indicadores with new values
      await supabase.from("tecnicos_indicadores" as any).update({
        eficacia: novaEvolucao.eficacia_atual || evolucaoTecnico.eficacia,
        produtividade: novaEvolucao.produtividade_atual || evolucaoTecnico.produtividade,
        repetida: novaEvolucao.repetida_atual || evolucaoTecnico.repetida,
        infancia: novaEvolucao.infancia_atual || evolucaoTecnico.infancia,
        updated_at: new Date().toISOString()
      }).eq("re", evolucaoTecnico.re);

      toast.success("Evolução registrada com sucesso!");
      loadEvolucao(evolucaoTecnico.re);
      loadIndicadores();
      setNovaEvolucao({ eficacia_atual: "", produtividade_atual: "", repetida_atual: "", infancia_atual: "", observacoes: "" });
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    }
  };

  const filteredIndicadores = allIndicadores.filter(ind => {
    if (!filterIndicadores) return true;
    const q = filterIndicadores.toLowerCase();
    return ind.re?.toLowerCase().includes(q) || ind.nome?.toLowerCase().includes(q) || ind.tt?.toLowerCase().includes(q) || ind.supervisor?.toLowerCase().includes(q);
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

            {/* Section: Quality Phrase */}
            <Card className="bg-primary/10 border-primary/30 border-l-4 border-l-primary">
              <CardContent className="py-5">
                <p className="text-base text-foreground font-semibold italic leading-relaxed text-center">
                  "{FRASE_COMPROMISSO}"
                </p>
              </CardContent>
            </Card>

            {/* Section: Photos */}
            <Card className="glass-card">
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-lg flex items-center gap-2 text-primary">
                  <Camera className="w-5 h-5" /> Evidências da Vistoria
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  {[
                    { label: "Supervisor com Técnico", state: fotoSupervisor, setter: setFotoSupervisor, ref: fileInputSupervisor, icon: <Camera className="w-8 h-8 text-muted-foreground mb-2" /> },
                    { label: "Equipamentos e Ferramentas", state: fotoEquipamentos, setter: setFotoEquipamentos, ref: fileInputEquipamentos, icon: <ImageIcon className="w-8 h-8 text-muted-foreground mb-2" /> },
                    { label: "Execução do Serviço", state: fotoExecucao, setter: setFotoExecucao, ref: fileInputExecucao, icon: <CheckCircle2 className="w-8 h-8 text-muted-foreground mb-2" /> }
                  ].map((photo, idx) => (
                    <div key={idx} className="space-y-2">
                      <Label className="text-sm font-semibold">{photo.label}</Label>
                      <div className="relative group">
                        <div
                          onClick={() => photo.ref.current?.click()}
                          className={`aspect-video rounded-lg border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all ${photo.state.preview ? 'border-primary/50 bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/50 hover:bg-primary/5'}`}
                        >
                          {photo.state.preview ? (
                            <img src={photo.state.preview} className="w-full h-full object-cover rounded-md" alt="Preview" />
                          ) : (
                            <>
                              {photo.icon}
                              <span className="text-xs text-muted-foreground">Clique para capturar</span>
                            </>
                          )}
                        </div>
                        {photo.state.preview && (
                          <Button
                            variant="destructive"
                            size="icon"
                            className="absolute -top-2 -right-2 h-6 w-6 rounded-full shadow-lg"
                            onClick={() => photo.setter({ preview: null, file: null })}
                          >
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
            <Card className="glass-card">
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
            {/* Import Section */}
            <Card className="glass-card">
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-lg flex items-center gap-2 text-primary">
                  <Upload className="w-5 h-5" /> Importação de Indicadores
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                <div className="p-4 bg-primary/5 border border-dashed border-primary/20 rounded-xl space-y-3">
                  <div className="text-sm space-y-1">
                    <p className="font-bold text-foreground">Instruções:</p>
                    <ul className="list-disc list-inside text-muted-foreground space-y-1 text-xs">
                      <li>Use o modelo Excel disponível abaixo.</li>
                      <li>A coluna <strong>RE</strong> é obrigatória para identificação.</li>
                      <li>Ao importar, registros com mesma RE serão atualizados; novos serão incluídos.</li>
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

            {/* Indicadores Table */}
            <Card className="glass-card">
              <CardHeader className="pb-3 border-b">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <CardTitle className="text-lg flex items-center gap-2 text-primary">
                    <FileText className="w-5 h-5" /> Colaboradores Cadastrados ({allIndicadores.length})
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Filtrar por nome, RE, TT..."
                      value={filterIndicadores}
                      onChange={(e) => setFilterIndicadores(e.target.value)}
                      className="w-[250px] h-9 text-sm"
                    />
                    <Button variant="ghost" size="icon" onClick={loadIndicadores} title="Recarregar">
                      <RefreshCw className={`w-4 h-4 ${loadingIndicadores ? 'animate-spin' : ''}`} />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="overflow-x-auto rounded-lg border max-h-[500px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-primary/5">
                        <TableHead className="font-bold text-foreground text-xs">RE</TableHead>
                        <TableHead className="font-bold text-foreground text-xs">TT</TableHead>
                        <TableHead className="font-bold text-foreground text-xs">Nome</TableHead>
                        <TableHead className="font-bold text-foreground text-xs">Supervisor</TableHead>
                        <TableHead className="text-center font-bold text-foreground text-xs">Eficácia</TableHead>
                        <TableHead className="text-center font-bold text-foreground text-xs">Produt.</TableHead>
                        <TableHead className="text-center font-bold text-foreground text-xs">Dias Trab.</TableHead>
                        <TableHead className="text-center font-bold text-foreground text-xs">Repetida</TableHead>
                        <TableHead className="text-center font-bold text-foreground text-xs">Infância</TableHead>
                        <TableHead className="text-center font-bold text-foreground text-xs w-[100px]">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredIndicadores.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                            {loadingIndicadores ? "Carregando..." : "Nenhum indicador cadastrado. Importe uma planilha acima."}
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredIndicadores.map((ind) => (
                          <TableRow key={ind.re} className="hover:bg-muted/30">
                            {editingIndicador?.re === ind.re ? (
                              <>
                                <TableCell className="text-xs font-mono">{ind.re}</TableCell>
                                <TableCell><Input value={editForm?.tt || ""} onChange={(e) => setEditForm(f => f ? { ...f, tt: e.target.value } : f)} className="h-7 text-xs" /></TableCell>
                                <TableCell><Input value={editForm?.nome || ""} onChange={(e) => setEditForm(f => f ? { ...f, nome: e.target.value } : f)} className="h-7 text-xs" /></TableCell>
                                <TableCell><Input value={editForm?.supervisor || ""} onChange={(e) => setEditForm(f => f ? { ...f, supervisor: e.target.value } : f)} className="h-7 text-xs" /></TableCell>
                                <TableCell><Input value={editForm?.eficacia || ""} onChange={(e) => setEditForm(f => f ? { ...f, eficacia: e.target.value } : f)} className="h-7 text-xs text-center" /></TableCell>
                                <TableCell><Input value={editForm?.produtividade || ""} onChange={(e) => setEditForm(f => f ? { ...f, produtividade: e.target.value } : f)} className="h-7 text-xs text-center" /></TableCell>
                                <TableCell><Input value={editForm?.dias_trabalhados || ""} onChange={(e) => setEditForm(f => f ? { ...f, dias_trabalhados: e.target.value } : f)} className="h-7 text-xs text-center" /></TableCell>
                                <TableCell><Input value={editForm?.repetida || ""} onChange={(e) => setEditForm(f => f ? { ...f, repetida: e.target.value } : f)} className="h-7 text-xs text-center" /></TableCell>
                                <TableCell><Input value={editForm?.infancia || ""} onChange={(e) => setEditForm(f => f ? { ...f, infancia: e.target.value } : f)} className="h-7 text-xs text-center" /></TableCell>
                                <TableCell className="text-center">
                                  <div className="flex items-center justify-center gap-1">
                                    <Button size="icon" variant="ghost" onClick={handleSaveEdit} className="h-7 w-7 text-primary"><Save className="w-3.5 h-3.5" /></Button>
                                    <Button size="icon" variant="ghost" onClick={() => { setEditingIndicador(null); setEditForm(null); }} className="h-7 w-7"><X className="w-3.5 h-3.5" /></Button>
                                  </div>
                                </TableCell>
                              </>
                            ) : (
                              <>
                                <TableCell className="text-xs font-mono">{ind.re}</TableCell>
                                <TableCell className="text-xs">{ind.tt}</TableCell>
                                <TableCell className="text-xs font-medium">{ind.nome}</TableCell>
                                <TableCell className="text-xs">{ind.supervisor}</TableCell>
                                <TableCell className="text-center text-xs">{ind.eficacia}</TableCell>
                                <TableCell className="text-center text-xs">{ind.produtividade}</TableCell>
                                <TableCell className="text-center text-xs">{ind.dias_trabalhados}</TableCell>
                                <TableCell className="text-center text-xs">{ind.repetida}</TableCell>
                                <TableCell className="text-center text-xs">{ind.infancia}</TableCell>
                                <TableCell className="text-center">
                                  <div className="flex items-center justify-center gap-1">
                                    <Button size="icon" variant="ghost" onClick={() => handleStartEdit(ind)} className="h-7 w-7" title="Editar">
                                      <Pencil className="w-3.5 h-3.5" />
                                    </Button>
                                    <Button size="icon" variant="ghost" onClick={() => openEvolucao(ind)} className="h-7 w-7 text-primary" title="Evolução">
                                      <TrendingUp className="w-3.5 h-3.5" />
                                    </Button>
                                    {isAdmin && (
                                      <Button size="icon" variant="ghost" onClick={() => handleDeleteIndicador(ind.re)} className="h-7 w-7 text-destructive" title="Excluir">
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
