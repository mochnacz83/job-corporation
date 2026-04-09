import React, { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useAccessTracking } from "@/hooks/useAccessTracking";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3, CalendarDays, ClipboardList, ClipboardCheck, Boxes,
  TrendingUp, Users, Clock, Package
} from "lucide-react";

const Dashboard = () => {
  const { user, profile, areaPermissions, isAdmin, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && profile?.must_change_password) {
      navigate("/alterar-senha");
    }
  }, [profile, loading, navigate]);
  const { data: stats = { coletas: 0, reagendas: 0, vistorias: 0 } } = useQuery({
    queryKey: ["dashboard_stats"],
    queryFn: async () => {
      const [c, r, v] = await Promise.all([
        supabase.from("material_coletas").select("id", { count: "exact", head: true }),
        supabase.from("reagenda_history").select("id", { count: "exact", head: true }).eq("user_id", user?.id),
        supabase.from("vistorias_campo").select("id", { count: "exact", head: true }),
      ]);
      return {
        coletas: c.count || 0,
        reagendas: r.count || 0,
        vistorias: v.count || 0,
      };
    },
    enabled: !!user,
  });

  useAccessTracking("/dashboard");

  const quickActions = [
    { show: isAdmin || areaPermissions?.all_access || areaPermissions?.modules?.includes("powerbi"), path: "/powerbi", icon: BarChart3, label: "Power BI", color: "bg-primary/10 text-primary" },
    { show: isAdmin || areaPermissions?.all_access || areaPermissions?.modules?.includes("material_coleta"), path: "/material-coleta", icon: Package, label: "Materiais", color: "bg-blue-500/10 text-blue-500" },
    { show: isAdmin || areaPermissions?.all_access || areaPermissions?.modules?.includes("reagenda"), path: "/reagenda", icon: CalendarDays, label: "Reagendamento", color: "bg-success/10 text-success" },
    { show: isAdmin || areaPermissions?.all_access || areaPermissions?.modules?.includes("vistoria_campo"), path: "/vistoria-campo", icon: ClipboardCheck, label: "Vistoria", color: "bg-warning/10 text-warning" },
    { show: isAdmin || areaPermissions?.all_access || areaPermissions?.modules?.includes("inventario"), path: "/inventario", icon: Boxes, label: "Inventário", color: "bg-accent text-accent-foreground" },
  ].filter(a => a.show);

  return (
    <div className="p-4 md:p-8 space-y-8 w-full">
      {/* Welcome Section */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            Olá, {profile?.nome?.split(" ")[0]}! 👋
          </h1>
          <p className="text-muted-foreground mt-1">
            Bem-vindo ao Portal Corporativo da Ability Tecnologia
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            <Clock className="w-3 h-3 mr-1" />
            {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
          </Badge>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="glass-card border-l-4 border-l-primary">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats.coletas}</p>
              <p className="text-xs text-muted-foreground">Coletas Registradas</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card border-l-4 border-l-success">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
              <CalendarDays className="w-5 h-5 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats.reagendas}</p>
              <p className="text-xs text-muted-foreground">Reagendamentos</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card border-l-4 border-l-warning">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
              <ClipboardCheck className="w-5 h-5 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats.vistorias}</p>
              <p className="text-xs text-muted-foreground">Vistorias de Campo</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          Acesso Rápido
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {quickActions.map(action => (
            <Card
              key={action.path}
              className="glass-card hover:shadow-lg transition-all duration-200 cursor-pointer group hover:-translate-y-0.5"
              onClick={() => navigate(action.path)}
            >
              <CardContent className="p-4 flex flex-col items-center text-center gap-3">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${action.color} transition-transform group-hover:scale-110`}>
                  <action.icon className="w-6 h-6" />
                </div>
                <span className="text-sm font-medium text-foreground">{action.label}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
