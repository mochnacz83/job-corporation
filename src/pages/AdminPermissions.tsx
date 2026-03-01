import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ShieldCheck, Save, Loader2, BarChart3, LayoutDashboard, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PowerBILink {
    id: string;
    titulo: string;
}

interface AreaPermission {
    area: string;
    modules: string[];
    powerbi_report_ids: string[];
    all_access: boolean;
}

const DEFAULT_AREAS: AreaPermission[] = [
    { area: "Comunicação de Dados", modules: [], powerbi_report_ids: [], all_access: false },
    { area: "Home Connect", modules: [], powerbi_report_ids: [], all_access: false },
    { area: "Gerencia", modules: ["dashboard", "powerbi"], powerbi_report_ids: [], all_access: true },
    { area: "Suporte CL", modules: [], powerbi_report_ids: [], all_access: false },
];

const AVAILABLE_MODULES = [
    { id: "dashboard", label: "Dashboard Principal", icon: LayoutDashboard },
    { id: "powerbi", label: "Relatórios Power BI", icon: BarChart3 },
];

const AdminPermissions = () => {
    const { isAdmin: isSystemAdmin, loading: authLoading } = useAuth();
    const navigate = useNavigate();
    const { toast } = useToast();
    const hasFetched = useRef(false);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [tableExists, setTableExists] = useState(true);
    const [permissions, setPermissions] = useState<AreaPermission[]>([]);
    const [reports, setReports] = useState<PowerBILink[]>([]);

    // Guard: only redirect when auth is done loading and user is not admin
    useEffect(() => {
        if (!authLoading && !isSystemAdmin) {
            navigate("/dashboard");
        }
    }, [authLoading, isSystemAdmin, navigate]);

    // Load data once when admin is confirmed
    useEffect(() => {
        if (!authLoading && isSystemAdmin && !hasFetched.current) {
            hasFetched.current = true;
            loadData();
        }
    }, [authLoading, isSystemAdmin]);

    const loadData = async () => {
        setLoading(true);
        try {
            // Load Power BI reports
            const { data: reportData } = await supabase
                .from("powerbi_links")
                .select("id, titulo")
                .order("ordem");
            setReports((reportData || []) as PowerBILink[]);

            // Load area permissions
            const { data: permData, error: permError } = await supabase
                .from("area_permissions" as any)
                .select("*")
                .order("area");

            if (permError) {
                console.error("Error fetching area_permissions:", permError);
                // Table probably doesn't exist yet — use defaults
                setTableExists(false);
                setPermissions(DEFAULT_AREAS);
                toast({
                    title: "Aviso",
                    description: "A tabela de permissões ainda não foi criada no banco de dados. Use os padrões abaixo e salve para criá-la.",
                });
                return;
            }

            if (!permData || permData.length === 0) {
                // Table exists but is empty — seed with defaults
                setPermissions(DEFAULT_AREAS);
            } else {
                // Merge DB data with defaults to ensure all 4 areas exist
                const dbAreas = permData as unknown as AreaPermission[];
                const merged = DEFAULT_AREAS.map(def => {
                    const found = dbAreas.find(a => a.area === def.area);
                    return found ? {
                        ...def,
                        ...found,
                        modules: found.modules || [],
                        powerbi_report_ids: found.powerbi_report_ids || [],
                    } : def;
                });
                setPermissions(merged);
            }
        } catch (err: any) {
            console.error("Unexpected error:", err);
            setPermissions(DEFAULT_AREAS);
            toast({
                title: "Erro ao carregar",
                description: err.message || "Verifique se a migração do banco foi aplicada.",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const handleToggleModule = (area: string, moduleId: string) => {
        setPermissions(prev => prev.map(p => {
            if (p.area !== area) return p;
            const modules = p.modules.includes(moduleId)
                ? p.modules.filter(m => m !== moduleId)
                : [...p.modules, moduleId];
            return { ...p, modules };
        }));
    };

    const handleToggleReport = (area: string, reportId: string) => {
        setPermissions(prev => prev.map(p => {
            if (p.area !== area) return p;
            const powerbi_report_ids = p.powerbi_report_ids.includes(reportId)
                ? p.powerbi_report_ids.filter(id => id !== reportId)
                : [...p.powerbi_report_ids, reportId];
            return { ...p, powerbi_report_ids };
        }));
    };

    const handleToggleAllAccess = (area: string, value: boolean) => {
        setPermissions(prev => prev.map(p => {
            if (p.area !== area) return p;
            // When enabling all_access, also enable all modules
            const modules = value ? AVAILABLE_MODULES.map(m => m.id) : p.modules;
            return { ...p, all_access: value, modules };
        }));
    };

    const savePermissions = async () => {
        setSaving(true);
        try {
            const rows = permissions.map(p => ({
                area: p.area,
                modules: p.modules,
                powerbi_report_ids: p.powerbi_report_ids,
                all_access: p.all_access,
                updated_at: new Date().toISOString(),
            }));

            const { error } = await (supabase.from("area_permissions" as any) as any)
                .upsert(rows, { onConflict: "area" });

            if (error) {
                throw new Error(error.message || JSON.stringify(error));
            }

            setTableExists(true);
            toast({
                title: "✅ Permissões salvas!",
                description: "As configurações de acesso por área foram atualizadas.",
            });
        } catch (error: any) {
            toast({
                title: "Erro ao salvar",
                description: error.message || "Verifique se a tabela area_permissions existe no banco.",
                variant: "destructive",
            });
        } finally {
            setSaving(false);
        }
    };

    if (authLoading || loading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-3">
                <Loader2 className="animate-spin w-8 h-8 text-primary" />
                <p className="text-muted-foreground text-sm">Carregando permissões...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
            <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
                <div className="container mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Button variant="ghost" size="sm" onClick={() => navigate("/admin/usuarios")}>
                            <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
                        </Button>
                        <div className="flex items-center gap-2">
                            <ShieldCheck className="w-5 h-5 text-primary" />
                            <h1 className="text-lg font-bold text-foreground">Gerenciar Perfis e Permissões</h1>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => { hasFetched.current = false; loadData(); }}>
                            <RefreshCw className="w-4 h-4 mr-1" /> Recarregar
                        </Button>
                        <Button onClick={savePermissions} disabled={saving}>
                            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                            Salvar Alterações
                        </Button>
                    </div>
                </div>
            </header>

            <main className="container mx-auto px-4 py-8">
                {!tableExists && (
                    <div className="mb-6 p-4 border border-yellow-500/40 bg-yellow-500/10 rounded-lg text-yellow-700 dark:text-yellow-400 text-sm">
                        ⚠️ A tabela <code>area_permissions</code> ainda não foi criada em seu banco Supabase. Clique em <strong>Salvar Alterações</strong> para tentar criá-la ou aplique a migração manualmente.
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {permissions.map(p => (
                        <Card key={p.area} className={`glass-card ${p.all_access ? "border-primary/40" : ""}`}>
                            <CardHeader className="pb-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <CardTitle className="text-base flex items-center gap-2">
                                            <ShieldCheck className={`w-4 h-4 ${p.all_access ? "text-primary" : "text-muted-foreground"}`} />
                                            {p.area}
                                        </CardTitle>
                                        <CardDescription className="mt-0.5">Área de atuação</CardDescription>
                                    </div>
                                    <div className="flex flex-col items-end gap-1">
                                        <span className="text-xs text-muted-foreground">Acesso Total</span>
                                        <div className="flex items-center gap-2">
                                            <Switch
                                                checked={p.all_access}
                                                onCheckedChange={(val) => handleToggleAllAccess(p.area, val)}
                                            />
                                            {p.all_access && <Badge variant="default" className="text-xs">ALL</Badge>}
                                        </div>
                                    </div>
                                </div>
                            </CardHeader>

                            <CardContent className="space-y-4">
                                {/* Modules */}
                                <div>
                                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                                        Módulos do Painel
                                    </p>
                                    <div className="space-y-2">
                                        {AVAILABLE_MODULES.map(mod => (
                                            <div key={mod.id} className="flex items-center space-x-2">
                                                <Checkbox
                                                    id={`mod-${p.area}-${mod.id}`}
                                                    checked={p.all_access || p.modules.includes(mod.id)}
                                                    disabled={p.all_access}
                                                    onCheckedChange={() => handleToggleModule(p.area, mod.id)}
                                                />
                                                <label
                                                    htmlFor={`mod-${p.area}-${mod.id}`}
                                                    className="text-sm font-medium leading-none flex items-center gap-1.5 peer-disabled:opacity-70"
                                                >
                                                    <mod.icon className="w-3.5 h-3.5 text-muted-foreground" />
                                                    {mod.label}
                                                </label>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Reports */}
                                {reports.length > 0 && (
                                    <div>
                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                                            Relatórios Power BI
                                        </p>
                                        <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                                            {reports.map(rep => (
                                                <div key={rep.id} className="flex items-center space-x-2">
                                                    <Checkbox
                                                        id={`rep-${p.area}-${rep.id}`}
                                                        checked={p.all_access || p.powerbi_report_ids.includes(rep.id)}
                                                        disabled={p.all_access}
                                                        onCheckedChange={() => handleToggleReport(p.area, rep.id)}
                                                    />
                                                    <label
                                                        htmlFor={`rep-${p.area}-${rep.id}`}
                                                        className="text-xs font-medium leading-none peer-disabled:opacity-70 truncate"
                                                        title={rep.titulo}
                                                    >
                                                        <BarChart3 className="w-3 h-3 text-muted-foreground inline mr-1" />
                                                        {rep.titulo}
                                                    </label>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {reports.length === 0 && (
                                    <p className="text-xs text-muted-foreground italic">
                                        Nenhum relatório Power BI cadastrado ainda.
                                    </p>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </main>
        </div>
    );
};

export default AdminPermissions;
