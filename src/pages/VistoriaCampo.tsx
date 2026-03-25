import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import React, { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAccessTracking } from "@/hooks/useAccessTracking";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Trash2, ImageIcon, FileText, Download, Camera, CheckCircle2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import jsPDF from "jspdf";
import * as XLSX from "xlsx";

interface TecnicoIndicadores {
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

const FRASE_COMPROMISSO = "O acompanhamento é no intuito de verificar e reafirmar o compromisso com a qualidade, reorientando e organizando processos, visando a melhoria contínua.";

const VistoriaCampo = () => {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { trackAction } = useAccessTracking("/vistoria-campo");

  // Tabs State
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
      // Search in indicators table first
      const { data: indData } = await supabase
        .from("tecnicos_indicadores" as any)
        .select("*")
        .eq("re", val.toUpperCase())
        .maybeSingle();

      if (indData) {
        setIndicadores(indData as unknown as TecnicoIndicadores);
        return;
      }

      // If not in indicators, try basic info from tecnicos_cadastro
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

  // Photo Handling
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

    // Header
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

    // Section 1: Técnico
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

    // Section 2: Indicadores Table
    doc.setFont("helvetica", "bold");
    doc.text("INDICADORES DE DESEMPENHO", margin, y);
    y += 4;
    
    const tableY = y;
    const colW = (pageW - 2 * margin) / 5;
    doc.setLineWidth(0.1);
    doc.setDrawColor(200);
    
    // Header Row
    doc.setFillColor(240, 240, 240);
    doc.rect(margin, y, pageW - 2 * margin, 7, "F");
    doc.rect(margin, y, pageW - 2 * margin, 7, "S");
    
    const headers = ["Eficácia", "Produtividade", "Dias Trab.", "Repetida", "Infância"];
    headers.forEach((h, i) => {
      doc.text(h, margin + i * colW + colW / 2, y + 5, { align: "center" });
    });
    
    y += 7;
    // Data Row
    doc.rect(margin, y, pageW - 2 * margin, 8, "S");
    const values = [data.eficacia, data.produtividade, data.dias_trabalhados, data.repetida, data.infancia];
    values.forEach((v, i) => {
      doc.setFont("helvetica", "normal");
      doc.text(String(v), margin + i * colW + colW / 2, y + 5.5, { align: "center" });
      // Vertical lines
      if (i > 0) doc.line(margin + i * colW, tableY, margin + i * colW, y + 8);
    });

    y += 15;

    // Section 3: Compromisso
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    const splitPhrase = doc.splitTextToSize(FRASE_COMPROMISSO, pageW - 2 * margin);
    doc.text(splitPhrase, margin, y);
    y += (splitPhrase.length * 5) + 5;

    // Section 4: Observações
    if (data.observacoes) {
      doc.setFont("helvetica", "bold");
      doc.text("OBSERVAÇÕES:", margin, y);
      y += 5;
      doc.setFont("helvetica", "normal");
      const splitObs = doc.splitTextToSize(data.observacoes, pageW - 2 * margin);
      doc.text(splitObs, margin, y);
      y += (splitObs.length * 5) + 10;
    }

    // Photos (if any)
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
      
      photos.forEach((p, i) => {
        try {
          doc.addImage(p.url, "JPEG", photoX, y, photoSize, photoSize);
          doc.setFontSize(7);
          doc.text(p.label, photoX + photoSize/2, y + photoSize + 4, { align: "center" });
          photoX += photoSize + 10;
          if (photoX + photoSize > pageW - margin) {
            photoX = margin;
            y += photoSize + 15;
            checkSpace(photoSize + 10);
          }
        } catch {}
      });
      if (photoX !== margin) y += photoSize + 15;
    }

    // Signatures
    y = Math.max(y, 250);
    doc.setLineWidth(0.2);
    doc.setDrawColor(0);
    
    // Supervisor Sig
    doc.line(margin, y, margin + 70, y);
    doc.setFontSize(8);
    doc.text("Assinatura do Supervisor", margin + 35, y + 5, { align: "center" });
    if (data.sigSupervisor) {
      doc.addImage(data.sigSupervisor, "PNG", margin + 10, y - 15, 50, 15);
    }

    // Tecnico Sig
    doc.line(pageW - margin - 70, y, pageW - margin, y);
    doc.text("Assinatura do Técnico", pageW - margin - 35, y + 5, { align: "center" });
    if (data.sigTecnico) {
      doc.addImage(data.sigTecnico, "PNG", pageW - margin - 60, y - 15, 50, 15);
    }

    window.open(doc.output("bloburl"), "_blank");
  };

  const handleSubmit = async () => {
    if (!indicadores) { toast.error("Informe a RE do técnico"); return; }
    if (isCanvasEmpty(sigSupervisorCanvasRef.current)) { toast.error("Assinatura do Supervisor é obrigatória"); return; }
    if (isCanvasEmpty(sigTecnicoCanvasRef.current)) { toast.error("Assinatura do Técnico é obrigatória"); return; }

    setSubmitting(true);
    try {
      const sigSupervisor = getCanvasDataUrl(sigSupervisorCanvasRef.current);
      const sigTecnico = getCanvasDataUrl(sigTecnicoCanvasRef.current);

      // Upload photos to storage
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

      // Generate PDF
      generatePDF({
        ...indicadores,
        observacoes,
        fotoSupervisor: fotoSupervisor.preview,
        fotoEquipamentos: fotoEquipamentos.preview,
        fotoExecucao: fotoExecucao.preview,
        sigSupervisor,
        sigTecnico
      });

      // Clear Form
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

      for (const r of rows) {
        const re = String(r.RE || r.re || "").trim().toUpperCase();
        if (!re) continue;

        const { data: existing } = await supabase.from("tecnicos_indicadores" as any).select("re").eq("re", re).maybeSingle();

        const payload = {
          re,
          tt: String(r.TT || r.tt || "").trim(),
          nome: String(r["Nome"] || r.nome || r["Nome Técnico"] || "").trim(),
          supervisor: String(r.Supervisor || r.supervisor || "").trim(),
          eficacia: String(r.Eficácia || r.eficacia || "").trim(),
          produtividade: String(r.Produtividade || r.produtividade || "").trim(),
          dias_trabalhados: String(r["Dias Trabalhados"] || r.dias_trabalhados || "").trim(),
          repetida: String(r.Repetida || r.repetida || "").trim(),
          infancia: String(r.Infância || r.infancia || "").trim(),
          updated_at: new Date().toISOString()
        };

        if (existing) {
          await supabase.from("tecnicos_indicadores" as any).update(payload).eq("re", re);
          updatedCount++;
        } else {
          await supabase.from("tecnicos_indicadores" as any).insert(payload);
          createdCount++;
        }
      }

      toast.success(`${createdCount} novos indicadores. ${updatedCount} atualizados.`);
      trackAction("importar_indicadores");
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
            {isAdmin && <TabsTrigger value="importacao">Importar Indicadores</TabsTrigger>}
          </TabsList>

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
                    <Input
                      value={indicadores?.tt || ""}
                      readOnly
                      placeholder="Preenchido pela RE"
                      className="bg-muted/30 h-10"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-semibold text-foreground">Nome Técnico</Label>
                    <Input
                      value={indicadores?.nome || ""}
                      readOnly
                      placeholder="Preenchido pela RE"
                      className="bg-muted/30 h-10"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-semibold text-foreground">Supervisor</Label>
                    <Input
                      value={indicadores?.supervisor || ""}
                      readOnly
                      placeholder="Preenchido pela RE"
                      className="bg-muted/30 h-10"
                    />
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
            <Card className="bg-primary/10 border-primary/20 border-l-4">
              <CardContent className="py-4">
                <p className="text-sm text-primary-foreground font-medium italic leading-relaxed text-center">
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
                  {/* Photo 1: Supervisor/Tecnico */}
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Supervisor com Técnico</Label>
                    <div className="relative group">
                      <div 
                        onClick={() => fileInputSupervisor.current?.click()}
                        className={`aspect-video rounded-lg border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all ${fotoSupervisor.preview ? 'border-primary/50 bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/50 hover:bg-primary/5'}`}
                      >
                        {fotoSupervisor.preview ? (
                          <img src={fotoSupervisor.preview} className="w-full h-full object-cover rounded-md" alt="Preview" />
                        ) : (
                          <>
                            <Camera className="w-8 h-8 text-muted-foreground mb-2" />
                            <span className="text-xs text-muted-foreground">Clique para capturar</span>
                          </>
                        )}
                      </div>
                      {fotoSupervisor.preview && (
                        <Button 
                          variant="destructive" 
                          size="icon" 
                          className="absolute -top-2 -right-2 h-6 w-6 rounded-full shadow-lg"
                          onClick={() => setFotoSupervisor({ preview: null, file: null })}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                      <input ref={fileInputSupervisor} type="file" accept="image/*" className="hidden" onChange={(e) => handlePhotoChange(e, setFotoSupervisor)} />
                    </div>
                  </div>

                  {/* Photo 2: Equipamentos */}
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Equipamentos e Ferramentas</Label>
                    <div className="relative group">
                      <div 
                        onClick={() => fileInputEquipamentos.current?.click()}
                        className={`aspect-video rounded-lg border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all ${fotoEquipamentos.preview ? 'border-primary/50 bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/50 hover:bg-primary/5'}`}
                      >
                        {fotoEquipamentos.preview ? (
                          <img src={fotoEquipamentos.preview} className="w-full h-full object-cover rounded-md" alt="Preview" />
                        ) : (
                          <>
                            <ImageIcon className="w-8 h-8 text-muted-foreground mb-2" />
                            <span className="text-xs text-muted-foreground">Clique para capturar</span>
                          </>
                        )}
                      </div>
                      {fotoEquipamentos.preview && (
                        <Button 
                          variant="destructive" 
                          size="icon" 
                          className="absolute -top-2 -right-2 h-6 w-6 rounded-full shadow-lg"
                          onClick={() => setFotoEquipamentos({ preview: null, file: null })}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                      <input ref={fileInputEquipamentos} type="file" accept="image/*" className="hidden" onChange={(e) => handlePhotoChange(e, setFotoEquipamentos)} />
                    </div>
                  </div>

                  {/* Photo 3: Execucao */}
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Execução do Serviço</Label>
                    <div className="relative group">
                      <div 
                        onClick={() => fileInputExecucao.current?.click()}
                        className={`aspect-video rounded-lg border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all ${fotoExecucao.preview ? 'border-primary/50 bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/50 hover:bg-primary/5'}`}
                      >
                        {fotoExecucao.preview ? (
                          <img src={fotoExecucao.preview} className="w-full h-full object-cover rounded-md" alt="Preview" />
                        ) : (
                          <>
                            <CheckCircle2 className="w-8 h-8 text-muted-foreground mb-2" />
                            <span className="text-xs text-muted-foreground">Clique para capturar</span>
                          </>
                        )}
                      </div>
                      {fotoExecucao.preview && (
                        <Button 
                          variant="destructive" 
                          size="icon" 
                          className="absolute -top-2 -right-2 h-6 w-6 rounded-full shadow-lg"
                          onClick={() => setFotoExecucao({ preview: null, file: null })}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                      <input ref={fileInputExecucao} type="file" accept="image/*" className="hidden" onChange={(e) => handlePhotoChange(e, setFotoExecucao)} />
                    </div>
                  </div>
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
              <Card className="glass-card">
                <CardHeader className="pb-3 border-b">
                  <CardTitle className="text-base font-bold text-primary pb-1 border-b">Assinatura do Supervisor *</CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  <div className="border shadow-inner rounded-lg bg-white overflow-hidden" style={{ touchAction: "none" }}>
                    <canvas
                      ref={sigSupervisorCanvasRef}
                      className="w-full cursor-crosshair h-[140px]"
                      onMouseDown={(e) => startDraw(sigSupervisorCanvasRef.current, e, setIsDrawingSupervisor)}
                      onMouseMove={(e) => draw(sigSupervisorCanvasRef.current, e, isDrawingSupervisor)}
                      onMouseUp={() => endDraw(setIsDrawingSupervisor)}
                      onMouseLeave={() => endDraw(setIsDrawingSupervisor)}
                      onTouchStart={(e) => { e.preventDefault(); startDraw(sigSupervisorCanvasRef.current, e, setIsDrawingSupervisor); }}
                      onTouchMove={(e) => { e.preventDefault(); draw(sigSupervisorCanvasRef.current, e, isDrawingSupervisor); }}
                      onTouchEnd={() => endDraw(setIsDrawingSupervisor)}
                    />
                  </div>
                  <Button size="sm" variant="outline" onClick={() => clearCanvas(sigSupervisorCanvasRef.current)} className="w-full hover:bg-accent/50">
                    Limpar Assinatura
                  </Button>
                </CardContent>
              </Card>

              <Card className="glass-card">
                <CardHeader className="pb-3 border-b">
                  <CardTitle className="text-base font-bold text-primary pb-1 border-b">Assinatura do Técnico *</CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  <div className="border shadow-inner rounded-lg bg-white overflow-hidden" style={{ touchAction: "none" }}>
                    <canvas
                      ref={sigTecnicoCanvasRef}
                      className="w-full cursor-crosshair h-[140px]"
                      onMouseDown={(e) => startDraw(sigTecnicoCanvasRef.current, e, setIsDrawingTecnico)}
                      onMouseMove={(e) => draw(sigTecnicoCanvasRef.current, e, isDrawingTecnico)}
                      onMouseUp={() => endDraw(setIsDrawingTecnico)}
                      onMouseLeave={() => endDraw(setIsDrawingTecnico)}
                      onTouchStart={(e) => { e.preventDefault(); startDraw(sigTecnicoCanvasRef.current, e, setIsDrawingTecnico); }}
                      onTouchMove={(e) => { e.preventDefault(); draw(sigTecnicoCanvasRef.current, e, isDrawingTecnico); }}
                      onTouchEnd={() => endDraw(setIsDrawingTecnico)}
                    />
                  </div>
                  <Button size="sm" variant="outline" onClick={() => clearCanvas(sigTecnicoCanvasRef.current)} className="w-full hover:bg-accent/50">
                    Limpar Assinatura
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Submit Actions */}
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
              <Button 
                variant="outline" 
                onClick={() => navigate("/dashboard")}
                className="h-12 px-8"
              >
                Cancelar
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="importacao" className="space-y-6">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-primary">
                  <Download className="w-5 h-5" /> Importação de Indicadores
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="p-6 bg-primary/5 border border-dashed border-primary/20 rounded-xl space-y-4">
                  <div className="text-sm space-y-2">
                    <p className="font-bold text-foreground">Instruções:</p>
                    <ul className="list-disc list-inside text-muted-foreground space-y-1">
                      <li>Use o modelo Excel disponível abaixo.</li>
                      <li>A coluna <strong>RE</strong> é obrigatória para identificação.</li>
                      <li>Os indicadores importados aparecerão automaticamente no formulário ao digitar a RE correspondente.</li>
                    </ul>
                  </div>
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg cursor-pointer hover:bg-primary/90 transition-all shadow-md">
                      <ImageIcon className="w-5 h-5" /> Selecionar Planilha Excel
                      <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportIndicadores} />
                    </label>
                    <Button variant="outline" onClick={downloadTemplateIndicadores} className="h-auto py-3">
                      <Download className="w-5 h-5 mr-2" /> Baixar Planilha Modelo
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default VistoriaCampo;
