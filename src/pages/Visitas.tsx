import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, ClipboardCheck, Plus, Pen, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Visita {
  id: string;
  local: string;
  observacoes: string | null;
  data_visita: string;
  assinatura_digital: string | null;
  status: string;
  created_at: string;
}

const Visitas = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [visitas, setVisitas] = useState<Visita[]>([]);
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [dataVisita, setDataVisita] = useState(new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(false);

  // Signature canvas
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const fetchVisitas = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("visitas")
      .select("*")
      .eq("supervisor_id", user.id)
      .order("data_visita", { ascending: false });
    if (data) setVisitas(data);
  };

  useEffect(() => { fetchVisitas(); }, [user]);

  const startDraw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    setIsDrawing(true);
    const rect = canvas.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "hsl(220, 30%, 12%)";
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDraw = () => setIsDrawing(false);

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !local.trim()) return;
    setLoading(true);

    let assinatura: string | null = null;
    const canvas = canvasRef.current;
    if (canvas) {
      assinatura = canvas.toDataURL("image/png");
    }

    try {
      const { error } = await supabase.from("visitas").insert({
        supervisor_id: user.id,
        local: local.trim(),
        observacoes: observacoes.trim() || null,
        data_visita: dataVisita,
        assinatura_digital: assinatura,
        status: "concluída",
      });
      if (error) throw error;
      toast({ title: "Visita registrada!", description: "A visita foi salva com sucesso." });
      setOpen(false);
      setLocal("");
      setObservacoes("");
      clearSignature();
      fetchVisitas();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-accent" />
              <h1 className="text-lg font-bold text-foreground">Visitas de Supervisores</h1>
            </div>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="w-4 h-4 mr-1" /> Nova Visita</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Registrar Visita</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Local</Label>
                  <Input value={local} onChange={(e) => setLocal(e.target.value)} placeholder="Local da visita" required />
                </div>
                <div className="space-y-2">
                  <Label>Data da Visita</Label>
                  <Input type="date" value={dataVisita} onChange={(e) => setDataVisita(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Observações</Label>
                  <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Observações sobre a visita..." rows={3} />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><Pen className="w-4 h-4" /> Assinatura Digital</Label>
                  <div className="border rounded-lg bg-card overflow-hidden">
                    <canvas
                      ref={canvasRef}
                      width={440}
                      height={150}
                      className="w-full cursor-crosshair touch-none"
                      onMouseDown={startDraw}
                      onMouseMove={draw}
                      onMouseUp={stopDraw}
                      onMouseLeave={stopDraw}
                      onTouchStart={startDraw}
                      onTouchMove={draw}
                      onTouchEnd={stopDraw}
                    />
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={clearSignature}>Limpar Assinatura</Button>
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  <Check className="w-4 h-4 mr-1" /> Salvar Visita
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {visitas.length === 0 ? (
          <div className="text-center py-20">
            <ClipboardCheck className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-1">Nenhuma visita registrada</h3>
            <p className="text-muted-foreground text-sm">Clique em "Nova Visita" para registrar uma.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {visitas.map((v) => (
              <Card key={v.id} className="glass-card">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-foreground">{v.local}</h3>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {new Date(v.data_visita + "T00:00:00").toLocaleDateString("pt-BR")}
                      </p>
                      {v.observacoes && <p className="text-sm text-muted-foreground mt-1">{v.observacoes}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-1 rounded-full bg-success/10 text-success font-medium">
                        {v.status}
                      </span>
                      {v.assinatura_digital && (
                        <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-medium">
                          Assinada
                        </span>
                      )}
                    </div>
                  </div>
                  {v.assinatura_digital && (
                    <div className="mt-3 border rounded-lg p-2 bg-muted/50">
                      <img src={v.assinatura_digital} alt="Assinatura" className="h-16 object-contain" />
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Visitas;
