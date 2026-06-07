import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/use-toast";
import { Loader2, Send, Trash2, Plus, RefreshCw } from "lucide-react";

type Config = { id: string; enabled: boolean; cooldown_minutes: number };
type Recipient = { id: string; chat_id: string; label: string | null; active: boolean };
type Threshold = { id: string; cidade: string; limite: number; active: boolean };
type LogRow = {
  id: string;
  cidade: string | null;
  total_reparos: number | null;
  novos_ultima_hora: number | null;
  recipients_count: number | null;
  success: boolean;
  error_message: string | null;
  triggered_by: string | null;
  sent_at: string;
};

export default function TelegramAlertsTab({ isAdmin }: { isAdmin: boolean }) {
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<Config | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [thresholds, setThresholds] = useState<Threshold[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [newChat, setNewChat] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newCidade, setNewCidade] = useState("");
  const [newLimite, setNewLimite] = useState<number>(20);
  const [sending, setSending] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    const [c, r, t, l] = await Promise.all([
      supabase.from("telegram_alert_config").select("*").limit(1).maybeSingle(),
      supabase.from("telegram_alert_recipients").select("*").order("created_at"),
      supabase.from("telegram_alert_thresholds").select("*").order("cidade"),
      supabase.from("telegram_alert_log").select("*").order("sent_at", { ascending: false }).limit(20),
    ]);
    setConfig((c.data as Config) || null);
    setRecipients((r.data as Recipient[]) || []);
    setThresholds((t.data as Threshold[]) || []);
    setLogs((l.data as LogRow[]) || []);
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  const toggleEnabled = async (v: boolean) => {
    if (!config) return;
    const { error } = await supabase.from("telegram_alert_config").update({ enabled: v }).eq("id", config.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    setConfig({ ...config, enabled: v });
    toast({ title: v ? "Alertas ativados" : "Alertas desativados" });
  };

  const setCooldown = async (n: number) => {
    if (!config) return;
    const { error } = await supabase.from("telegram_alert_config").update({ cooldown_minutes: n }).eq("id", config.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    setConfig({ ...config, cooldown_minutes: n });
  };

  const addRecipient = async () => {
    // Sanitiza: mantém apenas dígitos e o sinal de menos inicial (grupos).
    const raw = newChat.trim();
    const negative = raw.startsWith("-");
    const digits = raw.replace(/[^0-9]/g, "");
    const chat = digits ? (negative ? `-${digits}` : digits) : "";
    if (!chat) {
      toast({ title: "Chat ID inválido", description: "Use apenas números (ex.: 157607005) ou -100... para grupos.", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("telegram_alert_recipients").insert({ chat_id: chat, label: newLabel.trim() || null });
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    setNewChat(""); setNewLabel("");
    loadAll();
  };

  const removeRecipient = async (id: string) => {
    const { error } = await supabase.from("telegram_alert_recipients").delete().eq("id", id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    loadAll();
  };

  const toggleRecipient = async (id: string, active: boolean) => {
    await supabase.from("telegram_alert_recipients").update({ active }).eq("id", id);
    loadAll();
  };

  const addThreshold = async () => {
    const c = newCidade.trim().toUpperCase();
    if (!c) { toast({ title: "Informe a cidade", variant: "destructive" }); return; }
    const { error } = await supabase.from("telegram_alert_thresholds").insert({ cidade: c, limite: newLimite });
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    setNewCidade(""); setNewLimite(20);
    loadAll();
  };

  const updateThreshold = async (id: string, patch: Partial<Threshold>) => {
    await supabase.from("telegram_alert_thresholds").update(patch).eq("id", id);
    loadAll();
  };

  const removeThreshold = async (id: string) => {
    await supabase.from("telegram_alert_thresholds").delete().eq("id", id);
    loadAll();
  };

  const sendTest = async () => {
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("telegram-send-alert", {
        body: {}, headers: { "x-trigger": "manual-test" },
      } as any);
      // fallback to direct fetch with query param if invoke ignores it
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const sess = (await supabase.auth.getSession()).data.session;
      const resp = await fetch(`https://${projectId}.supabase.co/functions/v1/telegram-send-alert?test=true`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sess?.access_token || ""}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          "Content-Type": "application/json",
        },
      });
      const j = await resp.json();
      if (!resp.ok || !j.ok) {
        toast({ title: "Erro no envio", description: j.error || "Falha", variant: "destructive" });
      } else {
        toast({ title: "Teste enviado", description: `Enviado para ${recipients.filter(r => r.active).length} destinatário(s).` });
      }
      // suppress unused
      void data; void error;
    } catch (e) {
      toast({ title: "Erro", description: String(e), variant: "destructive" });
    } finally {
      setSending(false);
      loadAll();
    }
  };

  if (!isAdmin) {
    return <div className="p-6 text-sm text-muted-foreground">Acesso restrito a administradores.</div>;
  }
  if (loading) {
    return <div className="flex items-center gap-2 p-6 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</div>;
  }

  return (
    <div className="space-y-4 p-1 text-sm">
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm flex items-center justify-between">
            <span>Configuração Geral</span>
            <div className="flex items-center gap-3">
              <Button size="sm" variant="outline" onClick={loadAll}><RefreshCw className="h-3 w-3 mr-1" />Atualizar</Button>
              <Button size="sm" onClick={sendTest} disabled={sending || recipients.filter(r=>r.active).length===0}>
                {sending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Send className="h-3 w-3 mr-1" />}
                Enviar teste agora
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch checked={config?.enabled || false} onCheckedChange={toggleEnabled} />
              <span>{config?.enabled ? "Alertas automáticos ATIVOS" : "Alertas automáticos DESATIVADOS"}</span>
            </div>
            <div className="flex items-center gap-2">
              <span>Cooldown (min):</span>
              <Input type="number" className="w-24 h-8" value={config?.cooldown_minutes || 60}
                onChange={(e) => config && setConfig({ ...config, cooldown_minutes: Number(e.target.value) })}
                onBlur={(e) => setCooldown(Number(e.target.value))} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Quando ativo, o sistema verifica a cada hora se alguma cidade ultrapassou o limite e envia mensagem para todos os destinatários ativos.
            Como obter o Chat ID: o destinatário envia <code>/start</code> ao bot, depois acesse <code>https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</code> e copie o <code>chat.id</code>.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="py-3"><CardTitle className="text-sm">Destinatários ({recipients.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="flex gap-2">
              <Input placeholder="Chat ID (ex: 123456789 ou -1001234567890)" value={newChat} onChange={(e)=>setNewChat(e.target.value)} className="h-8" />
              <Input placeholder="Rótulo (opcional)" value={newLabel} onChange={(e)=>setNewLabel(e.target.value)} className="h-8 max-w-[200px]" />
              <Button size="sm" onClick={addRecipient}><Plus className="h-3 w-3" /></Button>
            </div>
            <div className="space-y-1 max-h-[260px] overflow-auto">
              {recipients.length === 0 && <p className="text-xs text-muted-foreground">Nenhum destinatário cadastrado.</p>}
              {recipients.map(r => (
                <div key={r.id} className="flex items-center gap-2 border rounded px-2 py-1">
                  <Switch checked={r.active} onCheckedChange={(v)=>toggleRecipient(r.id, v)} />
                  <span className="font-mono text-xs">{r.chat_id}</span>
                  <span className="text-xs text-muted-foreground flex-1 truncate">{r.label || "—"}</span>
                  <Button size="sm" variant="ghost" onClick={()=>removeRecipient(r.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3"><CardTitle className="text-sm">Limites por Cidade ({thresholds.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="flex gap-2">
              <Input placeholder="Cidade (ex: ITAJAI)" value={newCidade} onChange={(e)=>setNewCidade(e.target.value)} className="h-8" />
              <Input type="number" placeholder="Limite" value={newLimite} onChange={(e)=>setNewLimite(Number(e.target.value))} className="h-8 w-24" />
              <Button size="sm" onClick={addThreshold}><Plus className="h-3 w-3" /></Button>
            </div>
            <div className="space-y-1 max-h-[260px] overflow-auto">
              {thresholds.map(t => (
                <div key={t.id} className="flex items-center gap-2 border rounded px-2 py-1">
                  <Switch checked={t.active} onCheckedChange={(v)=>updateThreshold(t.id, { active: v })} />
                  <span className="font-semibold w-40 truncate">{t.cidade}</span>
                  <span className="text-xs text-muted-foreground">acima de</span>
                  <Input type="number" value={t.limite}
                    onChange={(e)=>setThresholds(prev=>prev.map(x=>x.id===t.id?{...x, limite:Number(e.target.value)}:x))}
                    onBlur={(e)=>updateThreshold(t.id, { limite: Number(e.target.value) })}
                    className="h-7 w-20" />
                  <Button size="sm" variant="ghost" onClick={()=>removeThreshold(t.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="py-3"><CardTitle className="text-sm">Histórico (últimos 20)</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-1 max-h-[300px] overflow-auto text-xs">
            {logs.length === 0 && <p className="text-muted-foreground">Nenhum envio ainda.</p>}
            {logs.map(l => (
              <div key={l.id} className="flex items-center gap-2 border rounded px-2 py-1">
                <Badge variant={l.success ? "default" : "destructive"} className="text-[10px]">{l.success ? "OK" : "ERRO"}</Badge>
                <span className="font-mono">{new Date(l.sent_at).toLocaleString("pt-BR")}</span>
                <span className="text-muted-foreground">{l.triggered_by || "—"}</span>
                <span className="flex-1 truncate">{l.cidade || "—"} {l.total_reparos != null ? `(${l.total_reparos} abertos${l.novos_ultima_hora ? `, +${l.novos_ultima_hora}` : ""})` : ""}</span>
                <span className="text-muted-foreground">{l.recipients_count ?? 0} dest.</span>
                {l.error_message && <span className="text-destructive truncate max-w-[300px]" title={l.error_message}>{l.error_message}</span>}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}