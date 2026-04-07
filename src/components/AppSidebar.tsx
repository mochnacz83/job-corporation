import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { NavLink } from "@/components/NavLink";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3, Home, LogOut, User, Shield, Activity, KeyRound,
  CalendarDays, ClipboardList, ClipboardCheck, Boxes, Package,
  Truck, Lock, Unlock, ChevronDown
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const AppSidebar = () => {
  const { profile, isAdmin, signOut, areaPermissions } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const [inventoryLocked, setInventoryLocked] = useState(true);

  useEffect(() => {
    supabase
      .from("app_settings" as any)
      .select("value")
      .eq("key", "inventory_locked")
      .maybeSingle()
      .then(({ data }: any) => {
        if (data) setInventoryLocked(data.value === true);
      });
  }, []);

  const toggleInventoryLock = async () => {
    const newValue = !inventoryLocked;
    await supabase
      .from("app_settings" as any)
      .update({ value: newValue, updated_by: profile?.user_id } as any)
      .eq("key", "inventory_locked");
    setInventoryLocked(newValue);
  };

  const hasModule = (mod: string) =>
    isAdmin || areaPermissions?.all_access || areaPermissions?.modules?.includes(mod);

  const isActive = (path: string) => location.pathname === path;

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const logisticaItems = [
    { show: hasModule("material_coleta"), path: "/material-coleta", icon: ClipboardList, label: "Controle Materiais" },
    { show: hasModule("inventario"), path: "/inventario", icon: Boxes, label: "Mini Inventário", locked: !isAdmin && inventoryLocked },
  ];

  const dashboardItems = [
    { show: hasModule("powerbi"), path: "/powerbi", icon: BarChart3, label: "Relatórios Power BI" },
  ];

  const operacionalItems = [
    { show: hasModule("reagenda"), path: "/reagenda", icon: CalendarDays, label: "Reagendamento" },
    { show: hasModule("vistoria_campo"), path: "/vistoria-campo", icon: ClipboardCheck, label: "Vistoria de Campo" },
  ];

  const adminItems = [
    { path: "/admin/usuarios", icon: Shield, label: "Gerenciar Usuários" },
    { path: "/admin/analytics", icon: Activity, label: "Monitoramento" },
    { path: "/admin/perfis", icon: User, label: "Perfis de Acesso" },
  ];

  const renderMenuGroup = (
    title: string,
    icon: React.ElementType,
    items: { show?: boolean; path: string; icon: React.ElementType; label: string; locked?: boolean }[],
    defaultOpen?: boolean
  ) => {
    const visibleItems = items.filter(i => i.show !== false);
    if (visibleItems.length === 0) return null;
    const groupActive = visibleItems.some(i => isActive(i.path));

    return (
      <Collapsible defaultOpen={defaultOpen || groupActive} className="group/collapsible">
        <SidebarGroup>
          <CollapsibleTrigger className="w-full">
            <SidebarGroupLabel className="flex items-center justify-between cursor-pointer hover:bg-sidebar-accent/10 rounded-md px-2 py-1.5 transition-colors">
              <span className="flex items-center gap-2 text-sidebar-foreground/70">
                {React.createElement(icon, { className: "w-4 h-4" })}
                {!collapsed && <span className="text-xs font-semibold uppercase tracking-wider">{title}</span>}
              </span>
              {!collapsed && <ChevronDown className="w-3 h-3 text-sidebar-foreground/50 transition-transform group-data-[state=open]/collapsible:rotate-180" />}
            </SidebarGroupLabel>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleItems.map(item => (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.path)}
                      className="transition-colors"
                    >
                      {item.locked ? (
                        <div className="flex items-center gap-2 px-2 py-1.5 opacity-50 cursor-not-allowed">
                          <item.icon className="w-4 h-4" />
                          {!collapsed && (
                            <>
                              <span className="flex-1">{item.label}</span>
                              <Lock className="w-3 h-3 text-destructive" />
                            </>
                          )}
                        </div>
                      ) : (
                        <NavLink
                          to={item.path}
                          end
                          className="hover:bg-sidebar-accent/20"
                          activeClassName="bg-sidebar-primary/20 text-sidebar-primary font-medium"
                        >
                          <item.icon className="w-4 h-4 mr-2" />
                          {!collapsed && <span>{item.label}</span>}
                        </NavLink>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </CollapsibleContent>
        </SidebarGroup>
      </Collapsible>
    );
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border bg-sidebar">
      <SidebarHeader className="p-4 border-b border-sidebar-border/30 bg-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 flex items-center justify-center flex-shrink-0">
            <img src="/ability-logo.png" alt="Ability" className="w-full h-full object-contain" />
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-bold text-black truncate">Ability Tecnologia</span>
              <span className="text-[10px] text-black/60 uppercase tracking-wider">Portal Corporativo</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-3">
        {/* Home */}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={isActive("/dashboard")}
            >
              <NavLink
                to="/dashboard"
                end
                className="hover:bg-sidebar-accent/20"
                activeClassName="bg-sidebar-primary/20 text-sidebar-primary font-medium"
              >
                <Home className="w-4 h-4 mr-2" />
                {!collapsed && <span>Início</span>}
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {renderMenuGroup("Dashboards", BarChart3, dashboardItems, true)}
        {renderMenuGroup("Logística", Truck, logisticaItems)}
        {renderMenuGroup("Operacional", CalendarDays, operacionalItems)}
        {isAdmin && renderMenuGroup("Administração", Shield, adminItems.map(i => ({ ...i, show: true })))}

        {/* Inventory lock toggle for admin */}
        {isAdmin && !collapsed && (
          <div className="mt-4 mx-2 p-3 rounded-lg bg-sidebar-accent/10 border border-sidebar-border/20">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs text-sidebar-foreground/70">
                {inventoryLocked ? <Lock className="w-3.5 h-3.5 text-destructive" /> : <Unlock className="w-3.5 h-3.5 text-success" />}
                <span>Inventário</span>
              </div>
              <Switch
                checked={!inventoryLocked}
                onCheckedChange={toggleInventoryLock}
                className="scale-75"
              />
            </div>
            <p className="text-[10px] text-sidebar-foreground/40 mt-1">
              {inventoryLocked ? "Bloqueado para usuários" : "Liberado para todos"}
            </p>
          </div>
        )}
      </SidebarContent>

      <SidebarFooter className="p-3 border-t border-sidebar-border/30">
        {!collapsed ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-2">
              <div className="w-8 h-8 rounded-full bg-sidebar-primary/20 flex items-center justify-center">
                <User className="w-4 h-4 text-sidebar-primary" />
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-xs font-medium text-sidebar-foreground truncate">{profile?.nome?.split(" ")[0]}</span>
                <span className="text-[10px] text-sidebar-foreground/50">{profile?.matricula}</span>
              </div>
            </div>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 text-xs text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/20 h-8"
                onClick={() => navigate("/alterar-senha")}
              >
                <KeyRound className="w-3 h-3 mr-1" /> Senha
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 text-xs text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/20 h-8"
                onClick={handleSignOut}
              >
                <LogOut className="w-3 h-3 mr-1" /> Sair
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-sidebar-foreground/60" onClick={() => navigate("/alterar-senha")}>
              <KeyRound className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-sidebar-foreground/60" onClick={handleSignOut}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
};

export default AppSidebar;
