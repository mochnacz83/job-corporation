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
  FileSpreadsheet, Plus, Pencil, Trash2, ExternalLink, ArrowLeft, Loader2, Star,
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
  const [active, setActive] = useState<PlanilhaLink | null>(null);

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
    // mantém seleção ou seleciona primeira ativa
    if (active) {
      const found = list.find((l) => l.id === active.id);
      setActive(found || list.find((l) => l.ativo) || null);
    } else {
      setActive(list.find((l) => l.ativo) || null);
    }
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
    if (active?.id === l.id) setActive(null);
    toast({ title: "Link removido" });
    await load();
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Cabeçalho com a barra de "favoritos" */}
      <div className="border-b bg-card/60 backdrop-blur-sm">
        <div className="flex items-center gap-2 px-3 py-2 flex-wrap">
          <FileSpreadsheet className="w-5 h-5 text-primary" />
          <h1 className="text-base font-bold mr-2">Planilhas Online</h1>

          {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}

          {!loading && visibleLinks.length === 0 && (
            <span className="text-xs text-muted-foreground">
              Nenhuma planilha cadastrada{isAdmin ? " — clique em Adicionar" : "."}
            </span>
          )}

          <div className="flex items-center gap-1 flex-wrap">
            {visibleLinks.map((l) => {
              const isActive = active?.id === l.id;
              return (
                <div key={l.id} className="flex items-center">
                  <Button
                    size="sm"
                    variant={isActive ? "default" : "outline"}
                    className={`h-7 text-xs gap-1 ${!l.ativo ? "opacity-60" : ""}`}
                    onClick={() => setActive(l)}
                    title={l.descricao || l.url}
                  >
                    <Star className="w-3 h-3" />
                    <span className="truncate max-w-[180px]">{l.titulo}</span>
                    {!l.ativo && <Badge variant="secondary" className="ml-1 text-[9px] px-1 py-0">off</Badge>}
                  </Button>
                  {isAdmin && (
                    <div className="flex items-center -ml-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        title="Editar"
                        onClick={() => openEdit(l)}
                      >
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        title="Remover"
                        onClick={() => remove(l)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="ml-auto flex items-center gap-2">
            {active && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1"
                onClick={() => window.open(active.url, "_blank", "noopener,noreferrer")}
              >
                <ExternalLink className="w-3 h-3" />
                Abrir em nova aba
              </Button>
            )}
            {isAdmin && (
              <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="h-7 text-xs gap-1" onClick={openNew}>
                    <Plus className="w-3 h-3" />
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
                        Para Google Sheets, use o link com /pubhtml ou compartilhamento público para que abra dentro do site.
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

      {/* Conteúdo: planilha embutida */}
      <div className="flex-1 bg-muted/30">
        {!active && !loading && (
          <div className="h-full flex items-center justify-center">
            <Card className="max-w-md">
              <CardHeader>
                <CardTitle className="text-sm">Selecione uma planilha</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  {isAdmin
                    ? "Adicione um link no botão acima para começar."
                    : "Nenhuma planilha disponível no momento."}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {active && (
          <iframe
            key={active.id}
            src={active.url}
            title={active.titulo}
            className="w-full h-full border-0"
            allow="clipboard-read; clipboard-write; fullscreen"
          />
        )}
      </div>
    </div>
  );
};

export default Planilhas;