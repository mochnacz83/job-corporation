import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, RefreshCw, TrendingUp, Clock, AlertTriangle, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  CartesianGrid, PieChart, Pie, Cell, Legend
} from "recharts";

const COLORS = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#06b6d4", "#f97316", "#84cc16"];

export default function RelatorioGerencial() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState({ total: 0, comTmr: 0, comPrazo: 0, comRep: 0, tmrMedio: 0, tmrRealMedio: 0 });
  const [repChart, setRepChart] = useState<any[]>([]);
  const [prazoChart, setPrazoChart] = useState<any[]>([]);
  const [tmrChart, setTmrChart] = useState<any[]>([]);
  const [causaChart, setCausaChart] = useState<any[]>([]);
  const [postoChart, setPostoChart] = useState<any[]>([]);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // KPIs — count totals
      const { count: total } = await (supabase as any).from("fato_reparos").select("*", { count: "exact", head: true });

      // TMR and repetition data — fetch relevant columns only
      const { data: rawData } = await (supabase as any)
        .from("fato_reparos")
        .select("tmr, tmr_real, rep, reparo_prazo, causa_ofensora_n1, posto_encerramento, posto_prazo");

      if (!rawData || rawData.length === 0) {
        setKpis({ total: total || 0, comTmr: 0, comPrazo: 0, comRep: 0, tmrMedio: 0, tmrRealMedio: 0 });
        setLoading(false);
        return;
      }

      // Compute KPIs dynamically — don't assume any specific string values
      const comTmr = rawData.filter((r: any) => r.tmr_real != null && r.tmr_real > 0).length;
      const comPrazo = rawData.filter((r: any) => r.reparo_prazo != null).length;
      const comRep = rawData.filter((r: any) => r.rep != null).length;

      const tmrValues = rawData.map((r: any) => Number(r.tmr) || 0).filter((v: number) => v > 0);
      const tmrRealValues = rawData.map((r: any) => Number(r.tmr_real) || 0).filter((v: number) => v > 0);
      const tmrMedio = tmrValues.length ? tmrValues.reduce((a: number, b: number) => a + b, 0) / tmrValues.length : 0;
      const tmrRealMedio = tmrRealValues.length ? tmrRealValues.reduce((a: number, b: number) => a + b, 0) / tmrRealValues.length : 0;

      setKpis({ total: total || 0, comTmr, comPrazo, comRep, tmrMedio, tmrRealMedio });

      // REP chart — count by values in rep field
      const repMap: Record<string, number> = {};
      rawData.forEach((r: any) => {
        const key = r.rep?.toString().trim() || "Sem Dado";
        repMap[key] = (repMap[key] || 0) + 1;
      });
      setRepChart(Object.entries(repMap).map(([name, value]) => ({ name, value })));

      // PRAZO chart — count by reparo_prazo values
      const prazoMap: Record<string, number> = {};
      rawData.forEach((r: any) => {
        const key = r.reparo_prazo?.toString().trim() || "Sem Dado VIP";
        prazoMap[key] = (prazoMap[key] || 0) + 1;
      });
      setPrazoChart(Object.entries(prazoMap).slice(0, 8).map(([name, value]) => ({ name, value })));

      // TMR chart — group by posto
      const postoTmrMap: Record<string, { total: number; count: number }> = {};
      rawData.forEach((r: any) => {
        if (!r.posto_encerramento || !r.tmr_real) return;
        const k = r.posto_encerramento.toString().trim();
        if (!postoTmrMap[k]) postoTmrMap[k] = { total: 0, count: 0 };
        postoTmrMap[k].total += Number(r.tmr_real) || 0;
        postoTmrMap[k].count += 1;
      });
      setTmrChart(
        Object.entries(postoTmrMap)
          .map(([posto, { total, count }]) => ({ name: posto, "TMR Real": parseFloat((total / count).toFixed(1)) }))
          .sort((a, b) => b["TMR Real"] - a["TMR Real"])
          .slice(0, 10)
      );

      // CAUSA N1 chart
      const causaMap: Record<string, number> = {};
      rawData.forEach((r: any) => {
        const k = r.causa_ofensora_n1?.toString().trim() || "Sem Causa";
        causaMap[k] = (causaMap[k] || 0) + 1;
      });
      setCausaChart(
        Object.entries(causaMap)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 10)
      );

      // POSTO PRAZO chart
      const postoPrazoMap: Record<string, number> = {};
      rawData.forEach((r: any) => {
        if (!r.posto_prazo) return;
        const k = r.posto_prazo.toString().trim();
        postoPrazoMap[k] = (postoPrazoMap[k] || 0) + 1;
      });
      setPostoChart(
        Object.entries(postoPrazoMap)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 10)
      );

    } catch (err) {
      console.error("BI fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  if (!isAdmin) return <div className="p-8 text-center text-muted-foreground">Acesso restrito.</div>;

  const kpiCards = [
    { label: "Total de Reparos (FCT)", value: kpis.total.toLocaleString("pt-BR"), sub: "Chamados na base B2B", icon: BarChart3, color: "text-indigo-600" },
    { label: "Com Dados VIP (TMR)", value: kpis.comTmr.toLocaleString("pt-BR"), sub: `${kpis.total > 0 ? ((kpis.comTmr / kpis.total) * 100).toFixed(0) : 0}% da base B2B`, icon: Clock, color: "text-blue-600" },
    { label: "Com Dados de Prazo (SLA)", value: kpis.comPrazo.toLocaleString("pt-BR"), sub: `${kpis.total > 0 ? ((kpis.comPrazo / kpis.total) * 100).toFixed(0) : 0}% da base B2B`, icon: AlertTriangle, color: "text-amber-600" },
    { label: "TMR Real Médio", value: `${kpis.tmrRealMedio.toFixed(1)}h`, sub: `TMR Bruto: ${kpis.tmrMedio.toFixed(1)}h`, icon: TrendingUp, color: "text-emerald-600" },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="w-full max-w-[1600px] mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold">BI Gerencial de Reparos</h1>
              <p className="text-xs text-muted-foreground">{kpis.total.toLocaleString("pt-BR")} registros consolidados</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </div>
      </header>

      <main className="flex-1 w-full max-w-[1600px] mx-auto px-4 py-8 space-y-8">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
          </div>
        ) : kpis.total === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
            <BarChart3 className="h-16 w-16 text-muted-foreground opacity-30" />
            <p className="text-xl font-bold text-muted-foreground">Sem dados consolidados</p>
            <p className="text-sm text-muted-foreground max-w-md">Carregue as bases no módulo de Carga de Bases e clique em "Consolidar Dashboard".</p>
            <Button onClick={() => navigate("/upload-bi")}>Ir para Carga de Bases →</Button>
          </div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {kpiCards.map((k) => (
                <Card key={k.label}>
                  <CardContent className="p-5 flex items-center gap-4">
                    <div className={`h-12 w-12 rounded-xl flex items-center justify-center bg-muted/50 ${k.color}`}>
                      <k.icon className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground font-medium">{k.label}</p>
                      <p className="text-2xl font-black">{k.value}</p>
                      <p className="text-xs text-muted-foreground">{k.sub}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Tabs */}
            <Tabs defaultValue="visao" className="w-full">
              <TabsList className="flex-wrap h-auto gap-1">
                <TabsTrigger value="visao">Visão Executiva</TabsTrigger>
                <TabsTrigger value="prazo">Análise de Prazo</TabsTrigger>
                <TabsTrigger value="repetida">Repetição (ICD02)</TabsTrigger>
                <TabsTrigger value="tmr">Eficiência / TMR</TabsTrigger>
                <TabsTrigger value="causa">Causa Técnica</TabsTrigger>
              </TabsList>

              <TabsContent value="visao" className="mt-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader><CardTitle className="text-sm">Classificação de Prazo</CardTitle><CardDescription>Distribuição por status de SLA</CardDescription></CardHeader>
                    <CardContent className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={prazoChart} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}>
                            {prazoChart.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader><CardTitle className="text-sm">Status de Repetição (ICD02)</CardTitle><CardDescription>Distribuição do campo REP</CardDescription></CardHeader>
                    <CardContent className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={repChart} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}>
                            {repChart.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="prazo" className="mt-6">
                <Card>
                  <CardHeader><CardTitle className="text-sm">Postos Ofensores de Prazo (VIP)</CardTitle><CardDescription>Frequência por posto responsável</CardDescription></CardHeader>
                  <CardContent className="h-96">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={postoChart} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Bar dataKey="value" name="Ocorrências" fill="#6366f1" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="repetida" className="mt-6">
                <Card>
                  <CardHeader><CardTitle className="text-sm">Distribuição de Chamados Repetidos</CardTitle><CardDescription>Valores do campo REP por categoria</CardDescription></CardHeader>
                  <CardContent className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={repChart}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="value" name="Chamados" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="tmr" className="mt-6">
                <Card>
                  <CardHeader><CardTitle className="text-sm">TMR Real Médio por Posto</CardTitle><CardDescription>Tempo efetivo de reparo (descontadas pendências) — Top 10 postos</CardDescription></CardHeader>
                  <CardContent className="h-96">
                    {tmrChart.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={tmrChart} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                          <XAxis type="number" tick={{ fontSize: 11 }} unit="h" />
                          <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 10 }} />
                          <Tooltip formatter={(v) => `${v}h`} />
                          <Bar dataKey="TMR Real" fill="#10b981" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                        Sem dados de TMR. Verifique se a base VIP-TMR foi carregada e o cruzamento ocorreu.
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="causa" className="mt-6">
                <Card>
                  <CardHeader><CardTitle className="text-sm">Top 10 Causas Técnicas (N1)</CardTitle><CardDescription>Principais causas de abertura de tickets</CardDescription></CardHeader>
                  <CardContent className="h-96">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={causaChart} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="name" width={200} tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Bar dataKey="value" name="Chamados" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>
    </div>
  );
}
