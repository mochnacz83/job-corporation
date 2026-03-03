import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Upload, MessageSquare, FileSpreadsheet, Download, Trash2, Send, Copy, Info } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
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

interface ReagendaData {
    id: string;
    nome: string;
    contato: string;
    operadora: string;
    tipoAtividade: string;
    dataAgendamento: string;
    status: "Pendente" | "Contatado" | "Aguardando retorno" | "Sem Contato";
}

const Reagenda = () => {
    const [data, setData] = useState<ReagendaData[]>([]);
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const { toast } = useToast();

    // Load data from localStorage on mount
    useEffect(() => {
        const savedData = localStorage.getItem("reagenda_history");
        if (savedData) {
            try {
                setData(JSON.parse(savedData));
            } catch (e) {
                console.error("Erro ao carregar histórico:", e);
            }
        }
    }, []);

    // Sync data to localStorage on change
    useEffect(() => {
        localStorage.setItem("reagenda_history", JSON.stringify(data));
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
                    nome: row["NOME"] || row["Nome"] || "",
                    contato: String(row["CONTATO"] || row["Contato"] || "").replace(/\D/g, ""),
                    operadora: row["OPERADORA"] || row["Operadora"] || "",
                    tipoAtividade: row["TIPO DE ATIVIDADE"] || row["Tipo de Atividade"] || row["ATIVIDADE"] || "",
                    dataAgendamento: row["DATA DE AGENDAMENTO"] || row["Data de Agendamento"] || row["DATA"] || "",
                    status: "Pendente",
                }));

                const validNewEntries = newEntries.filter(item => item.nome && item.contato);

                // Append to existing data
                setData(prev => [...prev, ...validNewEntries]);

                toast({
                    title: "Planilha carregada",
                    description: `${validNewEntries.length} novos registros adicionados ao histórico.`,
                });
            } catch (error) {
                console.error("Erro ao ler planilha:", error);
                toast({
                    title: "Erro ao ler planilha",
                    description: "Verifique se o arquivo está no formato correto.",
                    variant: "destructive",
                });
            } finally {
                setLoading(false);
                if (e.target) e.target.value = ""; // Reset input
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

Se sim, por favor, me confirme qual período (manhã ou tarde) e horário você teria disponibilidade para nos receber.

Fico no aguardo!`;
    };

    const openWhatsApp = (item: ReagendaData, id: string) => {
        const message = getMessageTemplate(item);
        const encodedMessage = encodeURIComponent(message);
        // Using api.whatsapp.com/send as a more direct method
        const url = `https://api.whatsapp.com/send?phone=55${item.contato}&text=${encodedMessage}`;
        window.open(url, "_blank");
        updateStatus(id, "Contatado");
    };

    const openTelegram = (item: ReagendaData, id: string) => {
        const message = getMessageTemplate(item);
        const encodedMessage = encodeURIComponent(message);
        const url = `https://t.me/share/url?url=&text=${encodedMessage}`;
        // For Telegram with specific phone, t.me/+55... is usually for profiles, 
        // but sharing text is more reliable for pre-filled messages.
        // If they have the contact, it opens the chat.
        window.open(url, "_blank");
        updateStatus(id, "Contatado");
    };

    const copyToClipboard = (item: ReagendaData, id: string) => {
        const message = getMessageTemplate(item);
        navigator.clipboard.writeText(message).then(() => {
            toast({
                title: "Mensagem copiada!",
                description: "Pronto para colar no chat do cliente.",
            });
            updateStatus(id, "Contatado");
        });
    };

    const updateStatus = (id: string, newStatus: ReagendaData["status"]) => {
        setData(prev => prev.map(item => item.id === id ? { ...item, status: newStatus } : item));
    };

    const deleteEntry = (id: string) => {
        setData(prev => prev.filter(item => item.id !== id));
        toast({
            title: "Registro removido",
            description: "O contato foi excluído do histórico.",
        });
    };

    const clearHistory = () => {
        if (confirm("Tem certeza que deseja apagar TODO o histórico? Esta ação não pode ser desfeita.")) {
            setData([]);
            localStorage.removeItem("reagenda_history");
            toast({
                title: "Histórico limpo",
            });
        }
    };

    const downloadSample = () => {
        const sampleData = [
            {
                "NOME": "João Silva",
                "CONTATO": "11999999999",
                "OPERADORA": "Vivo",
                "TIPO DE ATIVIDADE": "Instalação",
                "DATA DE AGENDAMENTO": "10/03/2026"
            }
        ];
        const worksheet = XLSX.utils.json_to_sheet(sampleData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Modelo");
        XLSX.writeFile(workbook, "modelo_reagendamento.xlsx");
    };

    const getStatusColor = (status: ReagendaData["status"]) => {
        switch (status) {
            case "Contatado": return "bg-green-100 text-green-800 border-green-200";
            case "Aguardando retorno": return "bg-blue-100 text-blue-800 border-blue-200";
            case "Sem Contato": return "bg-red-100 text-red-800 border-red-200";
            default: return "bg-amber-100 text-amber-800 border-amber-200";
        }
    };

    return (
        <TooltipProvider>
            <div className="min-h-screen bg-background p-4">
                <header className="container mx-auto max-w-6xl mb-6 flex items-center justify-between gap-4 flex-wrap">
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
                            <Download className="w-4 h-4" /> Modelo
                        </Button>
                        {data.length > 0 && (
                            <Button variant="destructive" size="sm" onClick={clearHistory}>
                                <Trash2 className="w-4 h-4 mr-2" /> Limpar Tudo
                            </Button>
                        )}
                    </div>
                </header>

                <main className="container mx-auto max-w-6xl space-y-6">
                    <Card className="glass-card">
                        <CardHeader>
                            <CardTitle>Importar e Acumular Contatos</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-col items-center justify-center border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 hover:border-primary/50 transition-colors bg-card/50">
                                <Upload className="w-10 h-10 text-muted-foreground mb-4" />
                                <p className="text-sm text-muted-foreground mb-4 text-center">
                                    Novas planilhas serão adicionadas ao histórico existente abaixo.
                                </p>
                                <Input
                                    id="file-upload"
                                    type="file"
                                    accept=".xlsx, .xls, .csv"
                                    onChange={handleFileUpload}
                                    className="hidden"
                                />
                                <Button onClick={() => document.getElementById("file-upload")?.click()} disabled={loading}>
                                    {loading ? "Processando..." : "Selecionar Arquivo"}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {data.length > 0 && (
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between">
                                <CardTitle>Histórico de Contatos ({data.length})</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="rounded-md border overflow-hidden">
                                    <Table>
                                        <TableHeader className="bg-muted/50">
                                            <TableRow>
                                                <TableHead className="w-[180px]">Status</TableHead>
                                                <TableHead>Nome</TableHead>
                                                <TableHead>Contato</TableHead>
                                                <TableHead>Atividade</TableHead>
                                                <TableHead className="text-center">Ações</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {[...data].reverse().map((item, index) => (
                                                <TableRow key={item.id} className={item.status === "Contatado" ? "bg-muted/20" : ""}>
                                                    <TableCell>
                                                        <Select
                                                            value={item.status}
                                                            onValueChange={(value: any) => updateStatus(item.id, value)}
                                                        >
                                                            <SelectTrigger className={`h-8 w-full text-xs font-semibold ${getStatusColor(item.status)}`}>
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="Pendente">Pendente</SelectItem>
                                                                <SelectItem value="Contatado">Contatado</SelectItem>
                                                                <SelectItem value="Aguardando retorno">Aguardando retorno</SelectItem>
                                                                <SelectItem value="Sem Contato">Sem Contato</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </TableCell>
                                                    <TableCell className="font-medium whitespace-nowrap text-sm">{item.nome}</TableCell>
                                                    <TableCell className="whitespace-nowrap text-sm">{item.contato}</TableCell>
                                                    <TableCell className="text-xs text-muted-foreground">
                                                        {item.tipoAtividade} ({item.operadora})
                                                    </TableCell>
                                                    <TableCell className="text-right whitespace-nowrap">
                                                        <div className="flex justify-center items-center gap-1">
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => openWhatsApp(item, item.id)}>
                                                                        <MessageSquare className="w-4 h-4" />
                                                                    </Button>
                                                                </TooltipTrigger>
                                                                <TooltipContent>Iniciar contato Whats</TooltipContent>
                                                            </Tooltip>

                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-500 hover:text-blue-600 hover:bg-blue-50" onClick={() => openTelegram(item, item.id)}>
                                                                        <Send className="w-4 h-4" />
                                                                    </Button>
                                                                </TooltipTrigger>
                                                                <TooltipContent>Iniciar contato Telegram</TooltipContent>
                                                            </Tooltip>

                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/5" onClick={() => copyToClipboard(item, item.id)}>
                                                                        <Copy className="w-4 h-4" />
                                                                    </Button>
                                                                </TooltipTrigger>
                                                                <TooltipContent>Copiar mensagem</TooltipContent>
                                                            </Tooltip>

                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => deleteEntry(item.id)}>
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </Button>
                                                                </TooltipTrigger>
                                                                <TooltipContent>Excluir contato</TooltipContent>
                                                            </Tooltip>
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
