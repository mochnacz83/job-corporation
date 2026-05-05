import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAccessTracking } from "@/hooks/useAccessTracking";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  FileSpreadsheet, Plus, Pencil, Trash2, ExternalLink, Loader2, Sparkles,
} from "lucide-react";

type PlanilhaLink = {
  id: string;
  titulo: string;
  url: string;
  descricao: string | null;
  ordem: number;
  ativo: boolean;
};

const Planilhas = () => {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  useAccessTracking("/planilhas", true, "Planilhas Online");

  const [links, setLinks] = useState<PlanilhaLink[]>([]);
  const [loading, setLoading] = useState(true);

  // Editor state (admin)
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<PlanilhaLink | null>(null);
  const [form, setForm] = useState({
    titulo: "",
    url: "",
    descricao: "",
    ordem: 0,
    ativo: true,
  });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("planilhas_links")
      .select("id, titulo, url, descricao, ordem, ativo")
      .order("ordem", { ascending: true })
      .order("titulo", { ascending: true });
    if (error) {
      toast({ title: "Erro ao carregar planilhas", description: error.message, variant: "destructive" });
    }
    const list = (data || []) as PlanilhaLink[];
    setLinks(list);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleLinks = useMemo(
    () => (isAdmin ? links : links.filter((l) => l.ativo)),
    [links, isAdmin],
  );

  const openNew = () => {
    setEditing(null);
    setForm({ titulo: "", url: "", descricao: "", ordem: links.length, ativo: true });
    setEditorOpen(true);
  };

  const openEdit = (l: PlanilhaLink) => {
    setEditing(l);
    setForm({
      titulo: l.titulo,
      url: l.url,
      descricao: l.descricao || "",
      ordem: l.ordem,
      ativo: l.ativo,
    });
    setEditorOpen(true);
  };

  const validateUrl = (u: string) => {
    try {
      const parsed = new URL(u.trim());
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  };

  const save = async () => {
    const titulo = form.titulo.trim();
    const url = form.url.trim();
    if (!titulo) {
      toast({ title: "Informe um nome para o link", variant: "destructive" });
      return;
    }
    if (titulo.length > 120) {
      toast({ title: "Nome muito longo (máx. 120 caracteres)", variant: "destructive" });
      return;
    }
    if (!validateUrl(url)) {
      toast({ title: "URL inválida", description: "Use https:// ou http://", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      titulo,
      url,
      descricao: form.descricao.trim() || null,
      ordem: Number.isFinite(form.ordem) ? form.ordem : 0,
      ativo: form.ativo,
    };
    const op = editing
      ? supabase.from("planilhas_links").update(payload).eq("id", editing.id)
      : supabase.from("planilhas_links").insert(payload);
    const { error } = await op;
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editing ? "Link atualizado" : "Link adicionado" });
    setEditorOpen(false);
    await load();
  };

  const remove = async (l: PlanilhaLink) => {
    if (!confirm(`Remover "${l.titulo}"?`)) return;
    const { error } = await supabase.from("planilhas_links").delete().eq("id", l.id);
    if (error) {
      toast({ title: "Erro ao remover", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Link removido" });
    await load();
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Cabeçalho */}
      <div className="border-b bg-card/60 backdrop-blur-sm">
        <div className="flex items-center gap-2 px-4 py-3 flex-wrap">
          <FileSpreadsheet className="w-5 h-5 text-primary" />
          <div>
            <h1 className="text-base font-bold leading-tight">Planilhas Online</h1>
            <p className="text-[11px] text-muted-foreground">Acesse rapidamente suas planilhas favoritas</p>
          </div>
          {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground ml-2" />}
          <div className="ml-auto flex items-center gap-2">
            {isAdmin && (
              <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="h-8 text-xs gap-1" onClick={openNew}>
                    <Plus className="w-3.5 h-3.5" />
                    Adicionar
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[520px]">
                  <DialogHeader>
                    <DialogTitle>{editing ? "Editar planilha" : "Nova planilha"}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs">Nome (favorito)</Label>
                      <Input
                        value={form.titulo}
                        onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
                        maxLength={120}
                        placeholder="Ex.: Controle de Atividades — Maio"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">URL da planilha</Label>
                      <Input
                        value={form.url}
                        onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                        placeholder="https://docs.google.com/spreadsheets/..."
                      />
                      <p className="text-[10px] text-muted-foreground mt-1">
                        O link será aberto em nova aba ao clicar no ícone.
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs">Descrição (opcional)</Label>
                      <Textarea
                        value={form.descricao}
                        onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
                        rows={2}
                        maxLength={300}
                      />
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <Label className="text-xs">Ordem</Label>
                        <Input
                          type="number"
                          value={form.ordem}
                          onChange={(e) => setForm((f) => ({ ...f, ordem: Number(e.target.value) }))}
                        />
                      </div>
                      <div className="flex items-center gap-2 mt-5">
                        <Switch
                          checked={form.ativo}
                          onCheckedChange={(v) => setForm((f) => ({ ...f, ativo: v }))}
                        />
                        <span className="text-xs">Ativo</span>
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="ghost" onClick={() => setEditorOpen(false)}>Cancelar</Button>
                    <Button onClick={save} disabled={saving}>
                      {saving && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                      Salvar
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>
      </div>

      {/* Grade de ícones */}
      <div className="flex-1 overflow-auto p-6 bg-gradient-to-br from-background via-background to-primary/5">
        {!loading && visibleLinks.length === 0 && (
          <div className="h-full flex items-center justify-center">
            <Card className="max-w-md">
              <CardHeader>
                <CardTitle className="text-sm">Nenhuma planilha cadastrada</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  {isAdmin
                    ? "Clique em Adicionar para cadastrar a primeira planilha."
                    : "Nenhuma planilha disponível no momento."}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {visibleLinks.length > 0 && (
          <div className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))] auto-rows-max">
            {visibleLinks.map((l) => (
              <div
                key={l.id}
                className="group relative"
              >
                <button
                  onClick={() => window.open(l.url, "_blank", "noopener,noreferrer")}
                  title={l.descricao || l.url}
                  className={`relative w-full aspect-square rounded-2xl overflow-hidden
                    border border-primary/20 bg-card/70 backdrop-blur-md
                    shadow-[0_4px_20px_-6px_hsl(var(--primary)/0.25)]
                    transition-all duration-300 ease-out
                    hover:-translate-y-1 hover:scale-[1.03]
                    hover:border-primary/60 hover:shadow-[0_10px_40px_-8px_hsl(var(--primary)/0.5)]
                    focus:outline-none focus:ring-2 focus:ring-primary
                    ${!l.ativo ? "opacity-50" : ""}`}
                >
                  {/* glow */}
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="absolute -inset-px rounded-2xl bg-[conic-gradient(from_var(--g,0deg),hsl(var(--primary)/0.4),transparent_30%,transparent_70%,hsl(var(--primary)/0.4))] opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-md" />
                  {/* grid lines */}
                  <div
                    className="absolute inset-0 opacity-[0.07] group-hover:opacity-20 transition-opacity"
                    style={{
                      backgroundImage:
                        "linear-gradient(hsl(var(--primary)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--primary)) 1px, transparent 1px)",
                      backgroundSize: "20px 20px",
                    }}
                  />
                  {/* content */}
                  <div className="relative h-full flex flex-col items-center justify-center p-4 text-center">
                    <div className="relative mb-3">
                      <div className="absolute inset-0 rounded-xl bg-primary/30 blur-xl group-hover:bg-primary/60 transition-all duration-500" />
                      <div className="relative w-14 h-14 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg group-hover:rotate-6 transition-transform duration-300">
                        <FileSpreadsheet className="w-7 h-7 text-primary-foreground" />
                      </div>
                      <Sparkles className="absolute -top-1 -right-1 w-3.5 h-3.5 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <span className="text-xs font-semibold leading-tight line-clamp-2 text-foreground">
                      {l.titulo}
                    </span>
                    {l.descricao && (
                      <span className="mt-1 text-[10px] text-muted-foreground line-clamp-2">
                        {l.descricao}
                      </span>
                    )}
                    {!l.ativo && (
                      <Badge variant="secondary" className="mt-2 text-[9px] px-1.5 py-0">inativo</Badge>
                    )}
                    <div className="mt-2 flex items-center gap-1 text-[10px] text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                      <ExternalLink className="w-3 h-3" /> Abrir
                    </div>
                  </div>
                </button>
                {isAdmin && (
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-6 w-6 shadow"
                      title="Editar"
                      onClick={(e) => { e.stopPropagation(); openEdit(l); }}
                    >
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="destructive"
                      className="h-6 w-6 shadow"
                      title="Remover"
                      onClick={(e) => { e.stopPropagation(); remove(l); }}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Planilhas;