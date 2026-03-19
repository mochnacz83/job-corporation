import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAccessTracking } from "@/hooks/useAccessTracking";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Activity, Users, Circle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

interface AccessLog {
  id: string;
  user_id: string;
  action: string;
  page: string | null;
  created_at: string;
}

interface Presence {
  user_id: string;
  last_seen_at: string;
  current_page: string | null;
}

interface ProfileMap {
  [userId: string]: { nome: string; matricula: string; area: string | null };
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

const AdminAnalytics = () => {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<Presence[]>([]);
  const [profileMap, setProfileMap] = useState<ProfileMap>({});
  const [chartData, setChartData] = useState<{ date: string; acessos: number }[]>([]);
  const [areaDistData, setAreaDistData] = useState<{ name: string; value: number }[]>([]);
  const [areaAccessData, setAreaAccessData] = useState<{ name: string; acessos: number }[]>([]);

  useAccessTracking("/admin/analytics");

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  const loadData = async () => {
    // Check admin
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user!.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      navigate("/dashboard");
      return;
    }

    // Fetch all in parallel
    const [logsRes, presenceRes, profilesRes] = await Promise.all([
      supabase.from("access_logs").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("user_presence").select("*"),
      supabase.from("profiles").select("user_id, nome, matricula, area"),
    ]);

    const logsData = logsRes.data || [];
    const presenceData = presenceRes.data || [];
    const profilesData = profilesRes.data || [];

    // Build profile map
    const pMap: ProfileMap = {};
    const areaCounts: { [key: string]: number } = {};

    profilesData.forEach((p: any) => {
      pMap[p.user_id] = { nome: p.nome, matricula: p.matricula, area: p.area };
      if (p.area) {
        areaCounts[p.area] = (areaCounts[p.area] || 0) + 1;
      } else {
        areaCounts["Sem Área"] = (areaCounts["Sem Área"] || 0) + 1;
      }
    });
    setProfileMap(pMap);

    // Area Distribution Data
    setAreaDistData(Object.entries(areaCounts).map(([name, value]) => ({ name, value })));

    setLogs(logsData);

    // Area Access Data
    const areaAccessCounts: { [key: string]: number } = {};
    logsData.forEach((log: any) => {
      const uArea = pMap[log.user_id]?.area || "Sem Área";
      areaAccessCounts[uArea] = (areaAccessCounts[uArea] || 0) + 1;
    });
    setAreaAccessData(Object.entries(areaAccessCounts).map(([name, acessos]) => ({ name, acessos })));

    // Online = last_seen within 2 minutes
    const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    setOnlineUsers(presenceData.filter((p: any) => p.last_seen_at > twoMinAgo));

    // Chart: accesses per day (last 7 days)
    const dayMap: { [key: string]: number } = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      dayMap[key] = 0;
    }
    logsData.forEach((log: any) => {
      const key = new Date(log.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      if (dayMap[key] !== undefined) dayMap[key]++;
    });
    setChartData(Object.entries(dayMap).map(([date, acessos]) => ({ date, acessos })));

    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
          </Button>
          <div className="flex items-center gap-2">
            <div className="p-1 bg-transparent w-10 h-10 flex items-center justify-center overflow-hidden">
              <img src="/ability-logo.png" alt="Ability Tecnologia Logo" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-lg font-bold text-foreground">Monitoramento de Sistema</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-6 text-foreground">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Online Users */}
          <Card className="md:col-span-1">
            <CardHeader className="pb-3 border-b mb-4">
              <div className="flex items-center gap-2">
                <Circle className="w-3 h-3 fill-green-500 text-green-500 animate-pulse" />
                <CardTitle className="text-base font-bold">Usuários Online ({onlineUsers.length})</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="max-h-[300px] overflow-y-auto">
              {onlineUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">Nenhum usuário online no momento.</p>
              ) : (
                <div className="space-y-3">
                  {onlineUsers.map((p) => (
                    <div key={p.user_id} className="flex flex-col border-b border-border pb-2 last:border-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{profileMap[p.user_id]?.nome || "Desconhecido"}</span>
                        <Badge variant="secondary" className="text-[10px] py-0">{profileMap[p.user_id]?.area || "Sem Área"}</Badge>
                      </div>
                      <span className="text-[11px] text-muted-foreground truncate">{p.current_page}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* User Distribution by Area */}
          <Card className="md:col-span-1">
            <CardHeader className="pb-3 border-b mb-4">
              <CardTitle className="text-base font-bold text-slate-800">Distribuição por Área</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={areaDistData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={60}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {areaDistData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '10px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Access Statistics by Area */}
          <Card className="md:col-span-1">
            <CardHeader className="pb-3 border-b mb-4">
              <CardTitle className="text-base font-bold">Volume de Acessos por Área</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={areaAccessData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} className="opacity-20" />
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" width={100} className="text-[10px]" />
                    <Tooltip />
                    <Bar dataKey="acessos" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 10 }} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Access History Chart */}
        <Card>
          <CardHeader className="pb-3 border-b mb-4">
            <CardTitle className="text-base font-bold">Volume Global de Acessos (Últimos 7 Dias)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="opacity-20" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis allowDecimals={false} className="text-xs" />
                  <Tooltip cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
                  <Bar dataKey="acessos" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Access History and Logs Row */}
        <div className="grid grid-cols-1 gap-6">
          {/* Recent Access Logs */}
          <Card>
            <CardHeader className="pb-3 border-b mb-4 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                <CardTitle className="text-base font-bold">Histórico de Acessos Recentes</CardTitle>
              </div>
              <Badge variant="outline" className="font-normal text-[10px]">Exibindo últimos 200 registros</Badge>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="font-bold">Usuário</TableHead>
                      <TableHead className="font-bold">Matrícula</TableHead>
                      <TableHead className="font-bold">Área</TableHead>
                      <TableHead className="font-bold">Página / Ação</TableHead>
                      <TableHead className="font-bold">Data/Hora</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow key={log.id} className="hover:bg-muted/20">
                        <TableCell className="font-medium">{profileMap[log.user_id]?.nome || "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{profileMap[log.user_id]?.matricula || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-[10px] font-normal">
                            {profileMap[log.user_id]?.area || "Sem Área"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium">
                              {log.action?.startsWith("Acessou ") ? log.action : (log.action || log.page || "Vizualização")}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(log.created_at).toLocaleString("pt-BR")}
                        </TableCell>
                      </TableRow>
                    ))}
                    {logs.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-10 italic">
                          Nenhum acesso registrado no histórico.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default AdminAnalytics;
