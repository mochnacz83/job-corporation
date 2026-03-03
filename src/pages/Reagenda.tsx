import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Upload, MessageSquare, FileSpreadsheet, Download, Trash2, Send, Copy, FileOutput, CheckSquare, Square } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import * as XLSX from "xlsx";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";

interface ReagendaData {
    id: string;
    sa: string;
    setor: string;
    nome: string;
    contato: string;
    operadora: string;
    tipoAtividade: string;
    dataAgendamento: string;
    status: "Pendente" | "Contatado" | "Aguardando retorno" | "Sem Contato";
    decisao: string;
    periodo: string;
    horario: string;
    selecionado: boolean;
}

const Reagenda = () => {
    const { isAdmin, areaPermissions, loading: authLoading } = useAuth();
    const [data, setData] = useState<ReagendaData[]>([]);
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const { toast } = useToast();

    // Permission guard
    useEffect(() => {
        if (!authLoading) {
            const hasAccess = isAdmin ||
                areaPermissions?.all_access ||
                areaPermissions?.modules?.includes("reagenda");

            if (!hasAccess) {
                navigate("/dashboard");
                toast({
                    title: "Acesso restrito",
                    description: "Sua área não possui permissão para acessar o Sistema de Reagendamento.",
                    variant: "destructive"
                });
            }
        }
    }, [isAdmin, areaPermissions, authLoading, navigate, toast]);

    useEffect(() => {
        const savedData = localStorage.getItem("reagenda_history_v3");
        if (savedData) {
            try {
                setData(JSON.parse(savedData));
            } catch (e) {
                console.error("Erro ao carregar histórico:", e);
            }
        }
    }, []);

    useEffect(() => {
        localStorage.setItem("reagenda_history_v3", JSON.stringify(data));
    }, [data]);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setLoading(true);
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const bstr = event.target?.result;
                const workbook = XLSX.read(bstr, { type: "binary" });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

                const newEntries: ReagendaData[] = jsonData.map((row) => ({
                    id: crypto.randomUUID(),
                    sa: String(row["SA"] || row["sa"] || row["S.A"] || "").trim(),
                    setor: String(row["SETOR"] || row["Setor"] || row["setor"] || "").trim(),
                    nome: row["NOME"] || row["Nome"] || "",
                    contato: String(row["CONTATO"] || row["Contato"] || "").replace(/\D/g, ""),
                    operadora: row["OPERADORA"] || row["Operadora"] || "",
                    tipoAtividade: row["TIPO DE ATIVIDADE"] || row["Tipo de Atividade"] || row["ATIVIDADE"] || "",
                    dataAgendamento: row["DATA DE AGENDAMENTO"] || row["Data de Agendamento"] || row["DATA"] || "",
                    status: "Pendente",
                    decisao: "Pendente",
                    periodo: "",
                    horario: "",
                    selecionado: false,
                }));

                const validNewEntries = newEntries.filter(item => item.nome && item.contato);
                setData(prev => [...prev, ...validNewEntries]);

                toast({
                    title: "Planilha carregada",
                    description: `${validNewEntries.length} novos registros adicionados.`,
                });
            } catch (error) {
                console.error("Erro ao ler planilha:", error);
                toast({
                    title: "Erro ao ler planilha",
                    description: "Verifique o formato do arquivo.",
                    variant: "destructive",
                });
            } finally {
                setLoading(false);
                if (e.target) e.target.value = "";
            }
        };
        reader.readAsBinaryString(file);
    };

    const getMessageTemplate = (item: ReagendaData) => {
        return `Olá, ${item.nome}! Tudo bem?

Aqui é da equipe de agendamento da ${item.operadora}.

Identificamos aqui no sistema que você possui uma solicitação de ${item.tipoAtividade} para sua internet ${item.operadora}, agendada originalmente para o dia ${item.dataAgendamento}.

Estou entrando em contato pois conseguimos uma abertura em nossa agenda e podemos antecipar o seu atendimento! 🚀

Você teria interesse em realizar esse serviço antes do prazo?

Se sim, por favor, me confirme qual Data, período (manhã ou tarde) e horário você teria disponibilidade para nos receber.

Fico no aguardo!`;
    };

    const openWhatsApp = (item: ReagendaData) => {
        const message = getMessageTemplate(item);
        const encodedMessage = encodeURIComponent(message);
        window.open(`https://api.whatsapp.com/send?phone=55${item.contato}&text=${encodedMessage}`, "_blank");
        updateStatus(item.id, "Contatado");
    };

    const openTelegram = (item: ReagendaData) => {
        const message = getMessageTemplate(item);
        const encodedMessage = encodeURIComponent(message);
        window.open(`https://t.me/share/url?url=&text=${encodedMessage}`, "_blank");
        updateStatus(item.id, "Contatado");
    };

    const copyToClipboard = (item: ReagendaData) => {
        navigator.clipboard.writeText(getMessageTemplate(item)).then(() => {
            toast({ title: "Copiado!" });
            updateStatus(item.id, "Contatado");
        });
    };

    const updateStatus = (id: string, newStatus: ReagendaData["status"]) => {
        setData(prev => prev.map(item => item.id === id ? { ...item, status: newStatus } : item));
    };

    const updateField = (id: string, field: keyof ReagendaData, value: any) => {
        setData(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
    };

    const toggleSelection = (id: string) => {
        setData(prev => prev.map(item => item.id === id ? { ...item, selecionado: !item.selecionado } : item));
    };

    const toggleAll = () => {
        const allSelected = data.every(item => item.selecionado);
        setData(prev => prev.map(item => ({ ...item, selecionado: !allSelected })));
    };

    const deleteEntry = (id: string) => {
        setData(prev => prev.filter(item => item.id !== id));
    };

    const clearHistory = () => {
        if (confirm("Apagar histórico?")) setData([]);
    };

    const downloadSample = () => {
        const sampleData = [
            {
                "SA": "123456",
                "SETOR": "Setor A",
                "NOME": "Nome do Cliente",
                "CONTATO": "11999999999",
                "OPERADORA": "Vivo",
                "TIPO DE ATIVIDADE": "Instalação",
                "DATA DE AGENDAMENTO": "10/03/2026"
            }
        ];
        const ws = XLSX.utils.json_to_sheet(sampleData);

        ws['!cols'] = [
            { wch: 10 }, // SA
            { wch: 15 }, // Setor
            { wch: 30 }, // Nome
            { wch: 15 }, // Contato
            { wch: 15 }, // Operadora
            { wch: 20 }, // Atividade
            { wch: 20 }, // Data
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Modelo");
        XLSX.writeFile(wb, "modelo_reagendamento_completo.xlsx");
    };

    const exportResults = () => {
        const exportData = data.filter(item => item.selecionado).map(item => ({
            "SA": item.sa,
            "Setor": item.setor,
            "Nome": item.nome,
            "Contato": item.contato,
            "Operadora": item.operadora,
            "Atividade": item.tipoAtividade,
            "Data Original": item.dataAgendamento,
            "Status": item.status,
            "Decisão": item.decisao,
            "Período": item.periodo,
            "Horário": item.horario
        }));

        if (exportData.length === 0) {
            toast({ title: "Atenção", description: "Selecione ao menos um contato para exportar.", variant: "destructive" });
            return;
        }

        const ws = XLSX.utils.json_to_sheet(exportData);
        ws['!cols'] = [
            { wch: 10 }, { wch: 15 }, { wch: 30 }, { wch: 15 }, { wch: 15 },
            { wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 15 }
        ];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Resultados");
        XLSX.writeFile(wb, "resultados_reagendamento.xlsx");
    };

    return (
        <TooltipProvider>
            <div className="min-h-screen bg-background p-4">
                <header className="container mx-auto max-w-7xl mb-6 flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-4">
                        <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
                            <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
                        </Button>
                        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
                            <FileSpreadsheet className="w-6 h-6 text-primary" />
                            Sistema de Reagendamento
                        </h1>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={downloadSample} className="flex items-center gap-2">
                            <Download className="w-4 h-4" /> Baixar Modelo
                        </Button>
                        {data.length > 0 && (
                            <>
                                <Button variant="default" size="sm" onClick={exportResults} className="bg-primary hover:bg-primary/90">
                                    <FileOutput className="w-4 h-4 mr-2" /> Exportar Selecionados (Dinamicas)
                                </Button>
                                <Button variant="destructive" size="sm" onClick={clearHistory}>
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            </>
                        )}
                    </div>
                </header>

                <main className="container mx-auto max-w-7xl space-y-6">
                    <Card className="glass-card">
                        <CardHeader>
                            <CardTitle className="text-lg">Painel de Importação</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-col items-center justify-center border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 hover:border-primary/50 transition-colors bg-card/50">
                                <Upload className="w-8 h-8 text-muted-foreground mb-4" />
                                <Input id="file-upload" type="file" accept=".xlsx, .xls, .csv" onChange={handleFileUpload} className="hidden" />
                                <Button size="sm" onClick={() => document.getElementById("file-upload")?.click()} disabled={loading}>
                                    {loading ? "Processando..." : "Carregar Planilha"}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {data.length > 0 && (
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between pb-2">
                                <CardTitle className="text-lg font-semibold">Base de Contatos ({data.length})</CardTitle>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Checkbox checked={data.every(i => i.selecionado)} onCheckedChange={toggleAll} />
                                    <span>Selecionar p/ Painel</span>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="rounded-md border overflow-x-auto">
                                    <Table>
                                        <TableHeader className="bg-muted/50">
                                            <TableRow>
                                                <TableHead className="w-10"></TableHead>
                                                <TableHead className="w-[140px]">Status</TableHead>
                                                <TableHead>SA / Setor</TableHead>
                                                <TableHead>Nome / Contato</TableHead>
                                                <TableHead className="w-[180px]">Decisão</TableHead>
                                                <TableHead className="w-[120px]">Período</TableHead>
                                                <TableHead className="w-[100px]">Horário</TableHead>
                                                <TableHead className="text-center w-[160px]">Ações</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {[...data].reverse().map((item) => (
                                                <TableRow key={item.id} className={`${item.selecionado ? "bg-primary/5" : ""} ${item.status === "Contatado" ? "opacity-90" : ""}`}>
                                                    <TableCell>
                                                        <Checkbox checked={item.selecionado} onCheckedChange={() => toggleSelection(item.id)} />
                                                    </TableCell>
                                                    <TableCell>
                                                        <Select value={item.status} onValueChange={(v: any) => updateStatus(item.id, v)}>
                                                            <SelectTrigger className="h-8 text-[11px] font-bold uppercase">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="Pendente">Pendente</SelectItem>
                                                                <SelectItem value="Contatado">Contatado</SelectItem>
                                                                <SelectItem value="Aguardando retorno">Aguardando</SelectItem>
                                                                <SelectItem value="Sem Contato">Sem Contato</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex flex-col">
                                                            <span className="text-sm font-medium">{item.sa || "-"}</span>
                                                            <span className="text-[11px] text-muted-foreground uppercase">{item.setor || "-"}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex flex-col">
                                                            <span className="text-sm font-medium">{item.nome}</span>
                                                            <span className="text-[11px] text-muted-foreground">{item.contato} • {item.operadora}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Select value={item.decisao} onValueChange={(v) => updateField(item.id, "decisao", v)}>
                                                            <SelectTrigger className="h-8 text-xs">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="Pendente">Aguardando Decisão</SelectItem>
                                                                <SelectItem value="Confirmada">Antecipação Confirmada</SelectItem>
                                                                <SelectItem value="Recusou">Cliente Recusou</SelectItem>
                                                                <SelectItem value="Mantida">Data Original Mantida</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Select
                                                            disabled={item.decisao !== "Confirmada"}
                                                            value={item.periodo}
                                                            onValueChange={(v) => updateField(item.id, "periodo", v)}
                                                        >
                                                            <SelectTrigger className="h-8 text-xs">
                                                                <SelectValue placeholder="-" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="Manhã">Manhã</SelectItem>
                                                                <SelectItem value="Tarde">Tarde</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Input
                                                            placeholder="00:00"
                                                            className="h-8 text-xs"
                                                            disabled={item.decisao !== "Confirmada"}
                                                            value={item.horario}
                                                            onChange={(e) => updateField(item.id, "horario", e.target.value)}
                                                        />
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex justify-center gap-1">
                                                            <Tooltip><TooltipTrigger asChild>
                                                                <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600" onClick={() => openWhatsApp(item)}><MessageSquare className="w-4 h-4" /></Button>
                                                            </TooltipTrigger><TooltipContent>WhatsApp</TooltipContent></Tooltip>

                                                            <Tooltip><TooltipTrigger asChild>
                                                                <Button size="icon" variant="ghost" className="h-7 w-7 text-blue-500" onClick={() => openTelegram(item)}><Send className="w-4 h-4" /></Button>
                                                            </TooltipTrigger><TooltipContent>Telegram</TooltipContent></Tooltip>

                                                            <Tooltip><TooltipTrigger asChild>
                                                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copyToClipboard(item)}><Copy className="w-4 h-4" /></Button>
                                                            </TooltipTrigger><TooltipContent>Copiar</TooltipContent></Tooltip>

                                                            <Tooltip><TooltipTrigger asChild>
                                                                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteEntry(item.id)}><Trash2 className="w-4 h-4" /></Button>
                                                            </TooltipTrigger><TooltipContent>Excluir</TooltipContent></Tooltip>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </main>
            </div>
        </TooltipProvider>
    );
};

export default Reagenda;
