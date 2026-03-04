import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Upload, MessageSquare, FileSpreadsheet, Download, Trash2, Send, Copy, FileOutput, CheckSquare, Square, Info, X, GripHorizontal } from "lucide-react";
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
    dataOriginalFormatada?: string;
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
    const [isDragging, setIsDragging] = useState(false);
    const [showInfo, setShowInfo] = useState(false);
    const [infoPosition, setInfoPosition] = useState({ x: 20, y: 80 });
    const [isDraggingInfo, setIsDraggingInfo] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
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

    const formatDate = (dateValue: any): string => {
        if (!dateValue) return "";

        let val = dateValue;
        // Check if string is a numeric excel serial
        if (typeof val === 'string' && /^\d{5}$/.test(val)) {
            val = Number(val);
        }

        // Se já estiver no formato DD/MM/AAAA, retorna
        if (typeof val === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(val)) {
            return val;
        }

        try {
            let date: Date;
            if (typeof val === 'number') {
                // Serial do Excel
                date = new Date((val - 25569) * 86400 * 1000);
            } else {
                date = new Date(val);
            }

            if (!isNaN(date.getTime())) {
                const day = String(date.getUTCDate()).padStart(2, '0');
                const month = String(date.getUTCMonth() + 1).padStart(2, '0');
                const year = date.getUTCFullYear();
                return `${day}/${month}/${year}`;
            }
        } catch (e) {
            console.error("Erro ao formatar data:", e);
        }

        return String(dateValue);
    };

    const processJsonData = (jsonData: any[]) => {
        const newEntries: ReagendaData[] = jsonData.map((row) => {
            const rawData = row["DATA DE AGENDAMENTO"] || row["Data de Agendamento"] || row["DATA"] || "";
            const formattedDate = formatDate(rawData);

            return {
                id: crypto.randomUUID(),
                sa: String(row["SA"] || row["sa"] || row["S.A"] || "").trim(),
                setor: String(row["SETOR"] || row["Setor"] || row["setor"] || "").trim(),
                nome: row["NOME"] || row["Nome"] || "",
                contato: String(row["CONTATO"] || row["Contato"] || "").replace(/\D/g, ""),
                operadora: row["OPERADORA"] || row["Operadora"] || "",
                tipoAtividade: row["TIPO DE ATIVIDADE"] || row["Tipo de Atividade"] || row["ATIVIDADE"] || "",
                dataAgendamento: formattedDate,
                dataOriginalFormatada: formattedDate,
                status: "Pendente",
                decisao: "Pendente",
                periodo: "",
                horario: "",
                selecionado: false,
            };
        });

        const validNewEntries = newEntries.filter(item => item.nome && item.contato);

        const uniqueNewEntries: ReagendaData[] = [];
        let duplicatesCount = 0;

        for (const newItem of validNewEntries) {
            // Check if it already exists in the previous database state
            const inData = data.some(existingItem =>
                (newItem.sa && existingItem.sa && newItem.sa === existingItem.sa) ||
                (newItem.contato === existingItem.contato)
            );

            // Check if we already processed it in this exact upload batch
            const inBatch = uniqueNewEntries.some(addedItem =>
                (newItem.sa && addedItem.sa && newItem.sa === addedItem.sa) ||
                (newItem.contato === addedItem.contato)
            );

            if (inData || inBatch) {
                duplicatesCount++;
            } else {
                uniqueNewEntries.push(newItem);
            }
        }

        if (uniqueNewEntries.length > 0) {
            setData(prev => [...prev, ...uniqueNewEntries]);
            toast({
                title: "Planilha carregada",
                description: `${uniqueNewEntries.length} novos registros adicionados. ${duplicatesCount > 0 ? `${duplicatesCount} duplicados excluídos.` : ""}`,
            });
        } else if (duplicatesCount > 0) {
            toast({
                title: "Nenhum registro novo",
                description: `${duplicatesCount} registros duplicados foram ignorados/excluídos.`,
                variant: "destructive"
            });
        }
    };

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

                processJsonData(jsonData);
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

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file && (file.name.endsWith(".xlsx") || file.name.endsWith(".xls") || file.name.endsWith(".csv"))) {
            const reader = new FileReader();
            setLoading(true);
            reader.onload = (event) => {
                try {
                    const bstr = event.target?.result;
                    const workbook = XLSX.read(bstr, { type: "binary" });
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];
                    processJsonData(jsonData);
                } catch (error) {
                    toast({ title: "Erro", description: "Falha ao processar arquivo.", variant: "destructive" });
                } finally {
                    setLoading(false);
                }
            };
            reader.readAsBinaryString(file);
        } else {
            toast({ title: "Arquivo inválido", description: "Por favor, use arquivos .xlsx, .xls ou .csv", variant: "destructive" });
        }
    };

    const handleMouseDownInfo = (e: React.MouseEvent) => {
        setIsDraggingInfo(true);
        setDragStart({
            x: e.clientX - infoPosition.x,
            y: e.clientY - infoPosition.y
        });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isDraggingInfo) {
            setInfoPosition({
                x: e.clientX - dragStart.x,
                y: e.clientY - dragStart.y
            });
        }
    };

    const handleMouseUp = () => {
        setIsDraggingInfo(false);
    };

    const getMessageTemplate = (item: ReagendaData) => {
        const dataSafelyFormatted = formatDate(item.dataAgendamento);
        return `Olá, ${item.nome}! Tudo bem?

Aqui é da equipe de agendamento da ${item.operadora}.

Identificamos aqui no sistema que você possui uma solicitação de ${item.tipoAtividade} para sua internet ${item.operadora}, agendada originalmente para o dia ${dataSafelyFormatted}.

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
                "DATA DE AGENDAMENTO": new Date(2026, 2, 10)
            },
            {
                "SA": "654321",
                "SETOR": "Setor B",
                "NOME": "Maria da Silva",
                "CONTATO": "11988888888",
                "OPERADORA": "Claro",
                "TIPO DE ATIVIDADE": "Reparo",
                "DATA DE AGENDAMENTO": new Date(2026, 2, 12)
            }
        ];
        // Usar cellDates para formatar como data nativa no Excel e dateNF para definir o formato DD/MM/AAAA
        const ws = XLSX.utils.json_to_sheet(sampleData, { cellDates: true, dateNF: "dd/mm/yyyy" });

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
            <div className="min-h-screen bg-background p-4 relative" onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}>
                {showInfo && (
                    <Card
                        className="fixed z-50 w-80 shadow-2xl border-primary/20 glass-card animate-in fade-in zoom-in duration-200"
                        style={{ left: `${infoPosition.x}px`, top: `${infoPosition.y}px` }}
                    >
                        <CardHeader className="p-3 bg-primary/10 flex flex-row items-center justify-between cursor-move" onMouseDown={handleMouseDownInfo}>
                            <div className="flex items-center gap-2">
                                <GripHorizontal className="w-4 h-4 text-muted-foreground" />
                                <CardTitle className="text-sm font-bold flex items-center gap-2">
                                    <Info className="w-4 h-4 text-primary" /> Ajuda & Informações
                                </CardTitle>
                            </div>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowInfo(false)}>
                                <X className="w-4 h-4" />
                            </Button>
                        </CardHeader>
                        <CardContent className="p-4 space-y-3 text-xs leading-relaxed max-h-[70vh] overflow-y-auto">
                            <div className="space-y-2">
                                <p className="font-semibold text-primary">📝 Upload Drag & Drop:</p>
                                <p>Arraste arquivos <code>.xlsx</code> ou <code>.csv</code> diretamente no painel pontilhado para iniciar o processamento. Você também pode clicar nele para abrir as pastas do sistema.</p>
                            </div>
                            <div className="space-y-2">
                                <p className="font-semibold text-primary">🛡️ Deduplicação Flexível Inteligente:</p>
                                <p>O sistema escaneia a sua planilha <strong>linha a linha</strong> para procurar duplicados de número de Contato ou número de SA. Ele também compara o que você está enviando agora com o que <strong>já existe cadastrado</strong>. Qualquer item repetido é sumariamente ignorado e mantemos apenas os indivíduos únicos.</p>
                            </div>
                            <div className="space-y-2">
                                <p className="font-semibold text-primary">📅 Tabela e Formatação de Data:</p>
                                <p>A coluna Data na tabela modelo baixada agora possui o formato nativo de data no sistema DD/MM/AAAA. Ao subir uma planilha nossa engine extrai essas datas do Excel com sucesso.</p>
                            </div>
                            <div className="space-y-2">
                                <p className="font-semibold text-primary">💬 Mensagem via Chat:</p>
                                <p>O ícone de enviar WhatsApp copia as informações do cliente baseadas na operadora e preenche o convite de reagendamento direto no WebApp.</p>
                            </div>
                            <div className="pt-2 border-t text-[10px] text-muted-foreground italic text-center">
                                Você pode arrastar este painel tranquilamente pelo cabeçalho cinza!
                            </div>
                        </CardContent>
                    </Card>
                )}

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
                                <Button variant="outline" size="sm" onClick={() => setShowInfo(!showInfo)} className="flex items-center gap-2">
                                    <Info className="w-4 h-4" /> Guia
                                </Button>
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
                            <div
                                className={`flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-6 transition-all bg-card/50 ${isDragging ? "border-primary bg-primary/5 scale-[1.01]" : "border-muted-foreground/25 hover:border-primary/50"
                                    }`}
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                            >
                                <Upload className={`w-8 h-8 mb-4 transition-colors ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
                                <Input id="file-upload" type="file" accept=".xlsx, .xls, .csv" onChange={handleFileUpload} className="hidden" />
                                <Button size="sm" onClick={() => document.getElementById("file-upload")?.click()} disabled={loading}>
                                    {loading ? "Processando..." : "Carregar Planilha"}
                                </Button>
                                <p className="text-[10px] text-muted-foreground mt-2">ou arraste o arquivo aqui</p>
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
                                                <TableHead>Data Orig.</TableHead>
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
                                                        <span className="text-xs font-mono">{formatDate(item.dataAgendamento)}</span>
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
