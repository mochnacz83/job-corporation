import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ArrowLeft, ShieldCheck, Save, Loader2, BarChart3, LayoutDashboard } from "lucide-react";
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

const AVAILABLE_MODULES = [
    { id: 'dashboard', label: 'Dashboard Principal', icon: LayoutDashboard },
    { id: 'powerbi', label: 'Relatórios Power BI', icon: BarChart3 },
];

const AdminPermissions = () => {
    const { isAdmin: isSystemAdmin } = useAuth();
    const navigate = useNavigate();
    const { toast } = useToast();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [permissions, setPermissions] = useState<AreaPermission[]>([]);
    const [reports, setReports] = useState<PowerBILink[]>([]);

    useEffect(() => {
        if (!isSystemAdmin && !loading) {
            navigate("/dashboard");
            return;
        }
        loadData();
    }, [isSystemAdmin, loading]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [permRes, reportRes] = await Promise.all([
                supabase.from("area_permissions").select("*"),
                supabase.from("powerbi_links").select("id, titulo").eq("ativo", true)
            ]);

            if (permRes.data) setPermissions(permRes.data as AreaPermission[]);
            if (reportRes.data) setReports(reportRes.data as PowerBILink[]);
        } catch (error) {
            console.error("Error loading permissions:", error);
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
            return { ...p, all_access: value };
        }));
    };

    const savePermissions = async () => {
        setSaving(true);
        try {
            const { error } = await supabase.from("area_permissions").upsert(
                permissions.map(p => ({
                    area: p.area,
                    modules: p.modules,
                    powerbi_report_ids: p.powerbi_report_ids,
                    all_access: p.all_access,
                    updated_at: new Date().toISOString()
                }))
            );

            if (error) throw error;

            toast({
                title: "Sucesso",
                description: "Permissões atualizadas com sucesso."
            });
        } catch (error: any) {
            toast({
                title: "Erro ao salvar",
                description: error.message,
                variant: "destructive"
            });
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <Loader2 className="animate-spin w-8 h-8 text-primary" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background">
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
                    <Button onClick={savePermissions} disabled={saving}>
                        {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                        Salvar Alterações
                    </Button>
                </div>
            </header>

            <main className="container mx-auto px-4 py-8 space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Configuração por Área de Atuação</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[200px]">Área / Perfil</TableHead>
                                    <TableHead>Módulos Permitidos</TableHead>
                                    <TableHead>Relatórios Power BI (Específicos)</TableHead>
                                    <TableHead className="w-[120px] text-center">Acesso Total</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {permissions.map((p) => (
                                    <TableRow key={p.area}>
                                        <TableCell className="font-semibold">{p.area}</TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-2">
                                                {AVAILABLE_MODULES.map(module => (
                                                    <div key={module.id} className="flex items-center space-x-2">
                                                        <Checkbox
                                                            id={`mod-${p.area}-${module.id}`}
                                                            checked={p.all_access || p.modules.includes(module.id)}
                                                            disabled={p.all_access}
                                                            onCheckedChange={() => handleToggleModule(p.area, module.id)}
                                                        />
                                                        <label
                                                            htmlFor={`mod-${p.area}-${module.id}`}
                                                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex items-center gap-1"
                                                        >
                                                            <module.icon className="w-3 h-3" />
                                                            {module.label}
                                                        </label>
                                                    </div>
                                                ))}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-2 max-h-[150px] overflow-y-auto pr-2">
                                                {reports.map(report => (
                                                    <div key={report.id} className="flex items-center space-x-2">
                                                        <Checkbox
                                                            id={`rep-${p.area}-${report.id}`}
                                                            checked={p.all_access || p.powerbi_report_ids.includes(report.id)}
                                                            disabled={p.all_access}
                                                            onCheckedChange={() => handleToggleReport(p.area, report.id)}
                                                        />
                                                        <label
                                                            htmlFor={`rep-${p.area}-${report.id}`}
                                                            className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 truncate max-w-[200px]"
                                                            title={report.titulo}
                                                        >
                                                            {report.titulo}
                                                        </label>
                                                    </div>
                                                ))}
                                                {reports.length === 0 && <span className="text-xs text-muted-foreground italic">Nenhum relatório ativo</span>}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <div className="flex justify-center">
                                                <Switch
                                                    checked={p.all_access}
                                                    onCheckedChange={(val) => handleToggleAllAccess(p.area, val)}
                                                />
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </main>
        </div>
    );
};

export default AdminPermissions;
