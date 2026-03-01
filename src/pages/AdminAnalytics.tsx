import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Activity, Users, Circle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

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
  [userId: string]: { nome: string; matricula: string };
}

const AdminAnalytics = () => {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<Presence[]>([]);
  const [profileMap, setProfileMap] = useState<ProfileMap>({});
  const [chartData, setChartData] = useState<{ date: string; acessos: number }[]>([]);

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
      supabase.from("access_logs").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("user_presence").select("*"),
      supabase.from("profiles").select("user_id, nome, matricula"),
    ]);

    const logsData = logsRes.data || [];
    const presenceData = presenceRes.data || [];
    const profilesData = profilesRes.data || [];

    // Build profile map
    const pMap: ProfileMap = {};
    profilesData.forEach((p: any) => {
      pMap[p.user_id] = { nome: p.nome, matricula: p.matricula };
    });
    setProfileMap(pMap);

    setLogs(logsData);

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
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
          </Button>
          <div className="flex items-center gap-2">
            <div className="p-1 bg-transparent w-10 h-10 flex items-center justify-center overflow-hidden">
              <img src="/ability-logo.png" alt="Ability Tecnologia Logo" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-lg font-bold text-foreground">Monitoramento de Acessos</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-6">
        {/* Online Users */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Circle className="w-3 h-3 fill-green-500 text-green-500" />
              <CardTitle className="text-base">Usuários Online ({onlineUsers.length})</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {onlineUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum usuário online no momento.</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {onlineUsers.map((p) => (
                  <div key={p.user_id} className="flex items-center gap-2 bg-secondary/50 rounded-lg px-3 py-2">
                    <Circle className="w-2 h-2 fill-green-500 text-green-500" />
                    <span className="text-sm font-medium">{profileMap[p.user_id]?.nome || "Desconhecido"}</span>
                    <span className="text-xs text-muted-foreground">{p.current_page}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Access Chart */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Acessos nos Últimos 7 Dias</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis allowDecimals={false} className="text-xs" />
                  <Tooltip />
                  <Bar dataKey="acessos" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Recent Access Logs */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              <CardTitle className="text-base">Últimos Acessos</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Matrícula</TableHead>
                  <TableHead>Página</TableHead>
                  <TableHead>Data/Hora</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>{profileMap[log.user_id]?.nome || "—"}</TableCell>
                    <TableCell className="font-mono text-sm">{profileMap[log.user_id]?.matricula || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{log.page || log.action}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(log.created_at).toLocaleString("pt-BR")}
                    </TableCell>
                  </TableRow>
                ))}
                {logs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      Nenhum acesso registrado.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default AdminAnalytics;
