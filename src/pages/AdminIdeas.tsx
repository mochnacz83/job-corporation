import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAccessTracking } from "@/hooks/useAccessTracking";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Lightbulb, Plus, Trash2, Edit, Loader2, Sparkles, MessageSquare } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Idea {
    id: string;
    module_name: string;
    idea_type: string;
    status: string;
    title: string;
    description: string;
    created_at: string;
}

const AVAILABLE_MODULES = [
    "Geral",
    "Administração",
    "Dashboard / Power BI",
    "Reagendamento",
    "Material Coleta",
    "Vistoria de Campo",
    "Inventário",
];

const IDEA_TYPES = ["Ideia Nova", "Ajuste"];
const STATUSES = ["Em análise", "Coletando mais informações", "Concluído"];

export default function AdminIdeas() {
    const { isAdmin, profile, loading: authLoading } = useAuth();
    const navigate = useNavigate();
    useAccessTracking("/admin/ideias");

    const [ideas, setIdeas] = useState<Idea[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterModule, setFilterModule] = useState<string>("Todos");
    
    // Dialog state
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingIdea, setEditingIdea] = useState<Idea | null>(null);
    const [submitting, setSubmitting] = useState(false);

    // Form state
    const [formData, setFormData] = useState({
        module_name: "Geral",
        idea_type: "Ideia Nova",
        status: "Em análise",
        title: "",
        description: "",
    });

    useEffect(() => {
        if (!authLoading && !isAdmin) {
            navigate("/dashboard");
        }
    }, [authLoading, isAdmin, navigate]);

    useEffect(() => {
        if (!authLoading && isAdmin) {
            loadIdeas();
        }
    }, [authLoading, isAdmin]);

    const loadIdeas = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from("module_ideas")
                .select("*")
                .order("created_at", { ascending: false });

            if (error) throw error;
            setIdeas((data as Idea[]) || []);
        } catch (error: any) {
            console.error("Error loading ideas:", error);
            toast.error("Erro ao carregar as ideias. Verifique a conexão.");
        } finally {
            setLoading(false);
        }
    };

    const handleOpenDialog = (idea?: Idea) => {
        if (idea) {
            setEditingIdea(idea);
            setFormData({
                module_name: idea.module_name,
                idea_type: idea.idea_type,
                status: idea.status,
                title: idea.title,
                description: idea.description || "",
            });
        } else {
            setEditingIdea(null);
            setFormData({
                module_name: "Geral",
                idea_type: "Ideia Nova",
                status: "Em análise",
                title: "",
                description: "",
            });
        }
        setIsDialogOpen(true);
    };

    const handleSave = async () => {
        if (!formData.title.trim() || !formData.module_name) {
            toast.error("Preencha o título e selecione o módulo.");
            return;
        }

        setSubmitting(true);
        try {
            if (editingIdea) {
                const { error } = await supabase
                    .from("module_ideas")
                    .update({
                        module_name: formData.module_name,
                        idea_type: formData.idea_type,
                        status: formData.status,
                        title: formData.title,
                        description: formData.description,
                    })
                    .eq("id", editingIdea.id);
                if (error) throw error;
                toast.success("Ideia atualizada com sucesso!");
            } else {
                const { error } = await supabase
                    .from("module_ideas")
                    .insert([{
                        module_name: formData.module_name,
                        idea_type: formData.idea_type,
                        status: formData.status,
                        title: formData.title,
                        description: formData.description,
                        created_by: profile?.user_id
                    }]);
                if (error) throw error;
                toast.success("Ideia adicionada com sucesso!");
            }
            setIsDialogOpen(false);
            loadIdeas();
        } catch (error: any) {
            console.error("Error saving idea:", error);
            toast.error(error.message || "Erro ao salvar a ideia.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!window.confirm("Tem certeza que deseja excluir esta anotação?")) return;
        
        try {
            const { error } = await supabase.from("module_ideas").delete().eq("id", id);
            if (error) throw error;
            toast.success("Anotação excluída.");
            setIdeas(prev => prev.filter(i => i.id !== id));
        } catch (error: any) {
            console.error("Error deleting idea:", error);
            toast.error("Erro ao excluir.");
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case "Concluído": return "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30";
            case "Em análise": return "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30";
            case "Coletando mais informações": return "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30";
            default: return "bg-gray-500/15 text-gray-700 border-gray-500/30";
        }
    };

    const filteredIdeas = ideas.filter(i => filterModule === "Todos" || i.module_name === filterModule);

    if (authLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background flex flex-col">
            <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-40">
                <div className="container mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
                            <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
                        </Button>
                        <div className="flex items-center gap-2">
                            <Lightbulb className="w-5 h-5 text-amber-500" />
                            <h1 className="text-lg font-bold">Ideias e Ajustes</h1>
                        </div>
                    </div>
                    <Button onClick={() => handleOpenDialog()} className="gap-2">
                        <Plus className="w-4 h-4" /> Nova Anotação
                    </Button>
                </div>
            </header>

            <main className="flex-1 container mx-auto px-4 py-8">
                {/* Filters */}
                <div className="mb-6 flex items-center gap-4 flex-wrap">
                    <div className="w-48">
                        <Select value={filterModule} onValueChange={setFilterModule}>
                            <SelectTrigger>
                                <SelectValue placeholder="Filtrar por Módulo" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Todos">Todos os Módulos</SelectItem>
                                {AVAILABLE_MODULES.map(m => (
                                    <SelectItem key={m} value={m}>{m}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {loading ? (
                    <div className="flex justify-center p-12">
                        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                    </div>
                ) : filteredIdeas.length === 0 ? (
                    <div className="text-center p-12 border rounded-xl bg-card border-dashed">
                        <Lightbulb className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                        <h3 className="text-lg font-medium">Nenhuma anotação encontrada</h3>
                        <p className="text-muted-foreground text-sm mt-1 mb-4">
                            Você ainda não tem ideias ou ajustes registrados para este filtro.
                        </p>
                        <Button variant="outline" onClick={() => handleOpenDialog()}>
                            Criar primeira anotação
                        </Button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredIdeas.map(idea => (
                            <Card 
                                key={idea.id} 
                                className="cursor-pointer hover:border-primary/50 transition-colors flex flex-col h-full group"
                                onClick={() => handleOpenDialog(idea)}
                            >
                                <CardHeader className="pb-3 flex-none relative pr-10">
                                    <div className="flex gap-2 mb-2 flex-wrap">
                                        <Badge variant="outline" className="text-[10px] uppercase font-semibold">
                                            {idea.module_name}
                                        </Badge>
                                        <Badge variant="secondary" className="text-[10px] uppercase font-semibold gap-1">
                                            {idea.idea_type === "Ideia Nova" ? <Sparkles className="w-3 h-3 text-amber-500" /> : <Edit className="w-3 h-3 text-blue-500" />}
                                            {idea.idea_type}
                                        </Badge>
                                    </div>
                                    <CardTitle className="text-base line-clamp-2 leading-tight">
                                        {idea.title}
                                    </CardTitle>
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-8 w-8 absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:bg-destructive/10"
                                        onClick={(e) => handleDelete(idea.id, e)}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </CardHeader>
                                <CardContent className="flex-1 flex flex-col pt-0">
                                    <div className="flex-1 text-sm text-muted-foreground line-clamp-3 mb-4">
                                        {idea.description || <span className="italic opacity-50">Sem descrição...</span>}
                                    </div>
                                    
                                    <div className="mt-auto flex items-center justify-between border-t pt-3 h-[40px]">
                                        <span className="text-[11px] text-muted-foreground shrink-0">
                                            {format(new Date(idea.created_at), "dd/MM/yyyy", { locale: ptBR })}
                                        </span>
                                        <Badge variant="outline" className={`text-xs ml-2 truncate border ${getStatusColor(idea.status)}`}>
                                            {idea.status}
                                        </Badge>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </main>

            {/* Form Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            {editingIdea ? "Editar Anotação" : "Nova Anotação"}
                        </DialogTitle>
                    </DialogHeader>
                    
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Módulo Afetado</label>
                                <Select value={formData.module_name} onValueChange={(val) => setFormData({...formData, module_name: val})}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecione o módulo" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {AVAILABLE_MODULES.map(m => (
                                            <SelectItem key={m} value={m}>{m}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Tipo</label>
                                <Select value={formData.idea_type} onValueChange={(val) => setFormData({...formData, idea_type: val})}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecione o tipo" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {IDEA_TYPES.map(t => (
                                            <SelectItem key={t} value={t}>
                                                <div className="flex items-center gap-2">
                                                    {t === "Ideia Nova" ? <Sparkles className="w-3 h-3 text-amber-500" /> : <Edit className="w-3 h-3 text-blue-500" />}
                                                    {t}
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">Status da Anotação</label>
                            <Select value={formData.status} onValueChange={(val) => setFormData({...formData, status: val})}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Status atual" />
                                </SelectTrigger>
                                <SelectContent>
                                    {STATUSES.map(s => (
                                        <SelectItem key={s} value={s}>
                                            <div className="flex items-center gap-2">
                                                <div className={`w-2 h-2 rounded-full ${s === 'Concluído' ? 'bg-green-500' : s === 'Em análise' ? 'bg-blue-500' : 'bg-amber-500'}`} />
                                                {s}
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">Título da Ideia / Ajuste</label>
                            <Input 
                                placeholder="Ex: Adicionar filtro por cidade" 
                                value={formData.title}
                                onChange={(e) => setFormData({...formData, title: e.target.value})}
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">Descrição (Opcional)</label>
                            <Textarea 
                                placeholder="Detalhes de como deve funcionar, problemas que resolve, etc."
                                className="min-h-[100px] resize-none"
                                value={formData.description}
                                onChange={(e) => setFormData({...formData, description: e.target.value})}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSave} disabled={submitting}>
                            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Salvar Anotação
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
