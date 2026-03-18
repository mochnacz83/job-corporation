import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export default function RelatorioGerencial() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState({
    entrantes: 0,
    repetidos: 0,
    vencidos: 0,
    tmrMedio: 0
  });
  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch Entrantes (Total)
      const { count: countEntrantes } = await (supabase as any)
        .from("fato_reparos")
        .select("*", { count: "exact", head: true });

      // Fetch Repetidos (REP = SIM)
      const { count: countRepetidos } = await (supabase as any)
        .from("fato_reparos")
        .select("*", { count: "exact", head: true })
        .eq("rep", "SIM");

      // Fetch Vencidos (SLA)
      const { count: countVencidos } = await (supabase as any)
        .from("fato_reparos")
        .select("*", { count: "exact", head: true })
        .eq("reparo_prazo", "FORA DO PRAZO");

      // Fetch average TMR
      const { data: tmrData } = await (supabase as any)
        .from("fato_reparos")
        .select("tmr_real")
        .not("tmr_real", "is", null);

      let avgTmr = 0;
      if (tmrData && tmrData.length > 0) {
        const sum = tmrData.reduce((acc, curr) => acc + (Number(curr.tmr_real) || 0), 0);
        avgTmr = sum / tmrData.length;
      }

      setKpis({
        entrantes: countEntrantes || 0,
        repetidos: countRepetidos || 0,
        vencidos: countVencidos || 0,
        tmrMedio: avgTmr
      });

      // Fetch basic chart data (grouped by rep)
      const { data: chartGrouping } = await (supabase as any)
        .from("fato_reparos")
        .select("rep");
      
      const repCount = chartGrouping?.filter((r: any) => r.rep === "SIM").length || 0;
      const naoRepCount = chartGrouping?.filter((r: any) => r.rep !== "SIM").length || 0;

      setChartData([
        { name: "Repetido", total: repCount },
        { name: "Não Repetido", total: naoRepCount }
      ]);


    } catch (error) {
      console.error("Error fetching BI data:", error);
    } finally {
      setLoading(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Acesso restrito a administradores.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="w-full max-w-[1600px] mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-xl font-bold text-foreground">BI Gerencial de Reparos</h1>
          </div>
          <div>
            <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-[1600px] mx-auto px-4 py-8 space-y-6">
        
        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Reparos Entrantes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{loading ? "..." : kpis.entrantes}</div>
              <p className="text-xs text-muted-foreground mt-1">Total de chamados (Base FCT)</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Chamados Repetidos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{loading ? "..." : kpis.repetidos}</div>
              <p className="text-xs text-muted-foreground mt-1">ICD02 (Rep)</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Chamados Vencidos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{loading ? "..." : kpis.vencidos}</div>
              <p className="text-xs text-muted-foreground mt-1">ICD03 (Fora do Prazo)</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">TMR Médio</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{loading ? "..." : kpis.tmrMedio.toFixed(2)}h</div>
              <p className="text-xs text-muted-foreground mt-1">Tempo descontando pendências</p>
            </CardContent>
          </Card>
        </div>

        {/* Dashboards Tabs */}
        <Tabs defaultValue="visao_executiva" className="w-full">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="visao_executiva">Visão Executiva</TabsTrigger>
            <TabsTrigger value="analise_prazo">Análise de Prazo</TabsTrigger>
            <TabsTrigger value="analise_repetida">Repetição de Chamados</TabsTrigger>
            <TabsTrigger value="eficiencia">Eficiência Operacional</TabsTrigger>
            <TabsTrigger value="causa_tecnica">Análise de Causa</TabsTrigger>
          </TabsList>
          
          <TabsContent value="visao_executiva" className="mt-6 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="col-span-1">
                <CardHeader>
                  <CardTitle>Repetidos x Não Repetidos</CardTitle>
                </CardHeader>
                <CardContent className="h-[300px]">
                  {loading ? (
                    <div className="w-full h-full flex items-center justify-center">
                      <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Add more widgets here */}
            </div>
          </TabsContent>

          <TabsContent value="analise_prazo" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Postos Ofensores de Prazo</CardTitle>
              </CardHeader>
              <CardContent className="h-[400px] flex items-center justify-center">
                <p className="text-muted-foreground">Gráfico de ofensores em desenvolvimento...</p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Other Tabs content placeholder */}
        </Tabs>

      </main>
    </div>
  );
}
