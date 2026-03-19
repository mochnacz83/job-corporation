import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Upload, MessageSquare, FileSpreadsheet, Download, Trash2, Send, Copy, FileOutput, CheckSquare, Square, Info, X, GripHorizontal, Users, BarChart3, Filter } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useAccessTracking } from "@/hooks/useAccessTracking";
import { supabase } from "@/integrations/supabase/client";
import * as XLSX from "xlsx";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from "@/components/ui/dialog";
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
    dataNova?: string;
    lastContactedAt?: string;
    isManualStatus?: boolean;
    status: "Pendente" | "Contatado" | "Aguardando retorno" | "Sem Contato";
    decisao: string;
    periodo: string;
    horario: string;
    selecionado: boolean;
    user_id?: string;
    deleted_by_user?: boolean;
    user_nome?: string; // Para visão admin
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
    
    // Admin & Metrics state
    const [globalAdminView, setGlobalAdminView] = useState(false);
    const [adminMetrics, setAdminMetrics] = useState({
        total: 0,
        contatado: 0,
        aguardando: 0,
        semContato: 0,
        confirmada: 0,
        usuariosAtivos: 0
    });
    const [exportDialogOpen, setExportDialogOpen] = useState(false);
    
    const navigate = useNavigate();
    const { toast } = useToast();
    const { trackAction } = useAccessTracking("/reagenda");

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
    const loadHistory = async () => {
        try {
            let query = supabase
                .from("reagenda_history" as any)
                .select("*")
                .order("created_at", { ascending: true });

            if (!isAdmin || !globalAdminView) {
                // Usuário comum ou admin na visão pessoal: vê apenas seus próprios e não deletados
                const { data: sessionData } = await supabase.auth.getSession();
                if (sessionData.session?.user.id) {
                    query = query.eq("user_id", sessionData.session.user.id).eq("deleted_by_user", false);
                }
            }

            const { data: historyData, error } = await query;

            if (error) {
                console.error("Erro do banco:", error);
                return;
            }

            if (historyData) {
                const mappedData: ReagendaData[] = historyData.map((row: any) => ({
                    id: row.id,
                    sa: row.sa,
                    setor: row.setor,
                    nome: row.nome,
                    contato: row.contato,
                    operadora: row.operadora,
                    tipoAtividade: row.tipo_atividade,
                    dataAgendamento: row.data_agendamento,
                    dataOriginalFormatada: row.data_original_formatada,
                    dataNova: row.data_nova,
                    lastContactedAt: row.last_contacted_at,
                    isManualStatus: row.is_manual_status || false,
                    status: row.status as ReagendaData["status"],
                    decisao: row.decisao,
                    periodo: row.periodo || "",
                    horario: row.horario || "",
                    selecionado: row.selecionado || false,
                    user_id: row.user_id,
                    deleted_by_user: row.deleted_by_user,
                    user_nome: row.user_nome || "Desconhecido"
                }));
                setData(mappedData);
                
                if (isAdmin) {
                    // Update metrics
                    const metrics = {
                        total: mappedData.length,
                        contatado: mappedData.filter((i: any) => i.status === "Contatado").length,
                        aguardando: mappedData.filter((i: any) => i.status === "Aguardando retorno").length,
                        semContato: mappedData.filter((i: any) => i.status === "Sem Contato").length,
                        confirmada: mappedData.filter((i: any) => i.decisao === "Confirmada").length,
                        usuariosAtivos: new Set(mappedData.map((i: any) => i.user_id)).size
                    };
                    setAdminMetrics(metrics);
                }
            } else {
                setData([]);
                setAdminMetrics({ total: 0, contatado: 0, aguardando: 0, semContato: 0, confirmada: 0, usuariosAtivos: 0 });
            }
        } catch (err) {
            console.error("Error loading history:", err);
            toast({ title: "Erro ao carregar", description: "Falha na sincronização com o banco de dados.", variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadHistory();
    }, [globalAdminView]);

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

    const processJsonData = async (jsonData: any[]) => {
        setLoading(true);
        try {
            const { data: sessionData } = await supabase.auth.getSession();
            const uid = sessionData.session?.user.id;
            
            if (!uid) {
                toast({ title: "Erro de sessão", description: "Não foi possível sincronizar.", variant: "destructive" });
                setLoading(false);
                return;
            }

            // Fetch all existing SA/Contacts for this user to ensure NO DUPLICATES (even hidden ones)
            const { data: existingRecords } = await supabase
                .from("reagenda_history" as any)
                .select("sa, contato")
                .eq("user_id", uid);

            const existingRows = (existingRecords ?? []) as Array<{ sa?: string | null; contato?: string | null }>;
            const existingSAs = new Set(existingRows.map((r) => r.sa).filter((v): v is string => Boolean(v)));
            const existingContacts = new Set(existingRows.map((r) => r.contato).filter((v): v is string => Boolean(v)));

            const newEntries: ReagendaData[] = jsonData.map((row) => {
                const rawData = row["DATA DE AGENDAMENTO"] || row["Data de Agendamento"] || row["DATA"] || "";
                const formattedDate = formatDate(rawData);

                let saValue = String(row["SA"] || row["sa"] || row["S.A"] || "").trim();
                if (saValue && !/^SA-/i.test(saValue)) {
                    saValue = `SA-${saValue}`;
                }

                const operadoraValue = String(row["OPERADORA"] || row["Operadora"] || "").trim().toUpperCase();
                
                // Safe UUID fallback for non-secure contexts
                const generateSafeId = () => {
                    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
                    return 'id-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now().toString(36);
                };

                return {
                    id: generateSafeId(),
                    sa: saValue,
                    setor: String(row["SETOR"] || row["Setor"] || row["setor"] || "").trim(),
                    nome: row["NOME"] || row["Nome"] || "",
                    contato: String(row["CONTATO"] || row["Contato"] || "").replace(/\D/g, ""),
                    operadora: operadoraValue,
                    tipoAtividade: row["TIPO DE ATIVIDADE"] || row["Tipo de Atividade"] || row["ATIVIDADE"] || "",
                    dataAgendamento: formattedDate,
                    dataOriginalFormatada: formattedDate,
                    dataNova: "",
                    lastContactedAt: undefined,
                    isManualStatus: false,
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
                const isDuplicateInDB = (newItem.sa && existingSAs.has(newItem.sa)) || existingContacts.has(newItem.contato);
                const isDuplicateInBatch = uniqueNewEntries.some(addedItem => 
                    (newItem.sa && addedItem.sa && newItem.sa === addedItem.sa) || 
                    (newItem.contato === addedItem.contato)
                );

                if (isDuplicateInDB || isDuplicateInBatch) {
                    duplicatesCount++;
                } else {
                    uniqueNewEntries.push(newItem);
                }
            }

            if (uniqueNewEntries.length > 0) {
                const userHistoryPayload = uniqueNewEntries.map(entry => ({
                    id: entry.id,
                    user_id: uid,
                    sa: entry.sa,
                    setor: entry.setor,
                    nome: entry.nome,
                    contato: entry.contato,
                    operadora: entry.operadora,
                    tipo_atividade: entry.tipoAtividade,
                    data_agendamento: entry.dataAgendamento,
                    data_original_formatada: entry.dataOriginalFormatada,
                    status: entry.status,
                    decisao: entry.decisao,
                    selecionado: entry.selecionado
                }));

                const { error } = await supabase.from("reagenda_history" as any).insert(userHistoryPayload);
                
                if (error) {
                    console.error("Supabase insert error:", error);
                    toast({ title: "Erro ao salvar", description: `Detalhe: ${error.message || "Falha desconhecida no banco de dados."}`, variant: "destructive" });
                } else {
                    setData(prev => [...prev, ...uniqueNewEntries]);
                    trackAction(`Carregou planilha com ${uniqueNewEntries.length} registros`);
                    toast({
                        title: "Planilha carregada",
                        description: `${uniqueNewEntries.length} novos registros adicionados. ${duplicatesCount > 0 ? `${duplicatesCount} duplicados ignorados.` : ""}`,
                    });
                }
            } else if (duplicatesCount > 0) {
                toast({
                    title: "Nenhum registro novo",
                    description: `${duplicatesCount} registros duplicados foram ignorados.`,
                    variant: "destructive"
                });
            }
        } catch (err) {
            console.error(err);
            toast({ title: "Erro", description: "Falha ao processar os dados.", variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setLoading(true);
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const bstr = event.target?.result;
                const workbook = XLSX.read(bstr, { type: "binary" });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

                await processJsonData(jsonData);
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
            reader.onload = async (event) => {
                try {
                    const bstr = event.target?.result;
                    const workbook = XLSX.read(bstr, { type: "binary" });
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];
                    await processJsonData(jsonData);
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

    const startContactTimer = async (id: string, contactStatus: ReagendaData["status"] = "Contatado") => {
        const nowIso = new Date().toISOString();
        setData(prev => prev.map(item => item.id === id ? { ...item, status: contactStatus, lastContactedAt: nowIso, isManualStatus: false } : item));
        try {
            await supabase.from("reagenda_history" as any).update({
                status: contactStatus,
                last_contacted_at: nowIso,
                is_manual_status: false
            }).eq("id", id);
        } catch (e) { console.error(e) }
    };

    const openWhatsApp = (item: ReagendaData) => {
        const message = getMessageTemplate(item);
        const encodedMessage = encodeURIComponent(message);
        window.open(`https://api.whatsapp.com/send?phone=55${item.contato}&text=${encodedMessage}`, "_blank");
        trackAction(`Enviou mensagem via WhatsApp para ${item.nome} (${item.sa || item.contato})`);
        startContactTimer(item.id, "Contatado");
    };

    const openTelegram = (item: ReagendaData) => {
        const message = getMessageTemplate(item);
        const encodedMessage = encodeURIComponent(message);
        window.open(`https://t.me/share/url?url=&text=${encodedMessage}`, "_blank");
        trackAction(`Enviou mensagem via Telegram para ${item.nome} (${item.sa || item.contato})`);
        startContactTimer(item.id, "Contatado");
    };

    const copyToClipboard = (item: ReagendaData) => {
        navigator.clipboard.writeText(getMessageTemplate(item)).then(() => {
            toast({ title: "Copiado!" });
            trackAction(`Copiou mensagem de reagendamento para ${item.nome}`);
            startContactTimer(item.id, "Contatado");
        });
    };

    const updateStatus = async (id: string, newStatus: ReagendaData["status"]) => {
        setData(prev => prev.map(item => item.id === id ? { ...item, status: newStatus, isManualStatus: true } : item));
        try {
            await supabase.from("reagenda_history" as any).update({ status: newStatus, is_manual_status: true }).eq("id", id);
        } catch (e) { }
    };

    const updateField = async (id: string, field: keyof ReagendaData, value: any) => {
        setData(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));

        try {
            // Map frontend fields to database fields if needed
            const dbFieldMap: any = {
                dataNova: "data_nova",
                tipoAtividade: "tipo_atividade"
            };
            const snakeCaseField = dbFieldMap[field] || field;

            await supabase.from("reagenda_history" as any).update({ [snakeCaseField]: value }).eq("id", id);
        } catch (e) { }
    };

    const toggleSelection = async (id: string) => {
        const item = data.find(i => i.id === id);
        if (!item) return;

        setData(prev => prev.map(item => item.id === id ? { ...item, selecionado: !item.selecionado } : item));
        try {
            await supabase.from("reagenda_history" as any).update({ selecionado: !item.selecionado }).eq("id", id);
        } catch (e) { }
    };

    const toggleAll = () => {
        const allSelected = data.every(item => item.selecionado);
        setData(prev => prev.map(item => ({ ...item, selecionado: !allSelected })));

        try {
            supabase.from("reagenda_history" as any).update({ selecionado: !allSelected }).in("id", data.map(d => d.id)).then();
        } catch (e) { }
    };

    const deleteEntry = async (id: string) => {
        setData(prev => prev.filter(item => item.id !== id));
        try {
            // Se for usuario comum, faz soft delete
            if (!isAdmin || !globalAdminView) {
                await supabase.from("reagenda_history" as any).update({ deleted_by_user: true }).eq("id", id);
            } else {
                // Admin na visão global pode deletar fisicamente se quiser, 
                // mas vamos manter o padrão de soft delete para segurança
                await supabase.from("reagenda_history" as any).update({ deleted_by_user: true }).eq("id", id);
            }
        } catch (e) { }
    };

    const clearHistory = async () => {
        const confirmMsg = "Limpar sua base de contatos? (Os dados permanecerão salvos para auditoria da gestão)";
        if (confirm(confirmMsg)) {
            setData([]);
            try {
                const { data: sessionData } = await supabase.auth.getSession();
                if (sessionData.session?.user.id) {
                    await supabase.from("reagenda_history" as any)
                        .update({ deleted_by_user: true })
                        .eq("user_id", sessionData.session.user.id);
                }
                toast({ title: "Histórico limpo", description: "Sua base pessoal foi ocultada." });
            } catch (e) { }
        }
    };

    const clearGlobalHistory = async () => {
        if (!isAdmin) return;
        
        const confirmMsg = "ATENÇÃO: Você está prestes a apagar PERMANENTEMENTE todos os registros de TODOS os usuários. Esta ação é irreversível e afetará métricas e dashboards. Deseja prosseguir?";
        if (confirm(confirmMsg)) {
            setLoading(true);
            try {
                // Força delete físico para limpeza administrativa real
                const { error } = await supabase.from("reagenda_history" as any).delete().not("id", "is", null);
                if (error) throw error;
                
                setData([]);
                setAdminMetrics({ total: 0, contatado: 0, aguardando: 0, semContato: 0, confirmada: 0, usuariosAtivos: 0 });
                toast({ title: "Limpeza Global Concluída", description: "Todos os registros foram removidos do sistema." });
            } catch (e) {
                console.error(e);
                toast({ title: "Erro ao limpar", variant: "destructive" });
            } finally {
                setLoading(false);
            }
        }
    };

    // Auto Timer Loop for 5-minute Status Progression
    useEffect(() => {
        const interval = setInterval(() => {
            if (data.length === 0) return;
            const now = new Date().getTime();
            let hasChanges = false;

            const updatedData = data.map(item => {
                if (item.isManualStatus || !item.lastContactedAt || item.status === "Sem Contato" || item.status === "Pendente") {
                    return item; // Do not touch manual overrides, finished, or virgin items
                }

                const contactedTime = new Date(item.lastContactedAt).getTime();
                const diffMinutes = (now - contactedTime) / (1000 * 60);

                let newStatus: ReagendaData["status"] = item.status;
                if (item.status === "Contatado" && diffMinutes >= 5) {
                    newStatus = "Aguardando retorno";
                    hasChanges = true;
                } else if (item.status === "Aguardando retorno" && diffMinutes >= 10) {
                    newStatus = "Sem Contato";
                    hasChanges = true;
                }

                if (newStatus !== item.status) {
                    // Fire-and-forget DB update
                    supabase.from("reagenda_history" as any).update({ status: newStatus }).eq("id", item.id).then();
                    return { ...item, status: newStatus };
                }
                return item;
            });

            if (hasChanges) {
                setData(updatedData);
            }
        }, 15000); // Check every 15 seconds

        return () => clearInterval(interval);
    }, [data]);

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
            "Data Nova": item.dataNova || "",
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
            { wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 20 }, { wch: 15 },
            { wch: 15 }, { wch: 15 }
        ];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Resultados");
        XLSX.writeFile(wb, "resultados_reagendamento.xlsx");
    };

    return (
        <TooltipProvider>
            <div className="h-screen bg-background p-2 sm:p-4 relative flex flex-col overflow-hidden" onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}>
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
                                <p className="font-semibold text-primary">👥 Bases Individuais:</p>
                                <p>Cada usuário agora possui sua própria base. Os registros que você carrega são visíveis apenas para você e para os Administradores.</p>
                            </div>
                            <div className="space-y-2">
                                <p className="font-semibold text-primary">🔒 Soft Delete (Lixeira):</p>
                                <p>Quando você exclui um registro ou limpa sua base, os dados são apenas ocultados do seu painel, mas permanecem seguros no banco de dados para fins de métricas e auditoria da gestão.</p>
                            </div>
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
                                <div className="space-y-2">
                                    <p className="font-semibold text-primary">⏱️ Temporizador de Status:</p>
                                    <p>Ao clicar no <strong>WhatsApp</strong> ou <strong>Telegram</strong>, o sistema inicia automaticamente o cronômetro. Após 5 min → Aguardando retorno. Após 10 min → Sem Contato. Se você mudar o status manualmente, o temporizador para.</p>
                                </div>
                                <div className="space-y-2">
                                    <p className="font-semibold text-primary">🎨 Cores de Status:</p>
                                    <p><span className="bg-blue-100 px-1 rounded">Contatado</span> = Azul &nbsp; <span className="bg-amber-100 px-1 rounded">Aguardando</span> = Laranja &nbsp; <span className="bg-red-100 px-1 rounded opacity-75">Sem Contato</span> = Vermelho</p>
                                </div>
                                <div className="space-y-2">
                                    <p className="font-semibold text-primary">💬 Mensagem via Chat:</p>
                                    <p>O ícone de enviar WhatsApp copia as informações do cliente baseadas na operadora e preenche o convite de reagendamento direto no WebApp.</p>
                                </div>
                            </div>
                            <div className="pt-2 border-t text-[10px] text-muted-foreground italic text-center">
                                Você pode arrastar este painel tranquilamente pelo cabeçalho cinza!
                            </div>
                        </CardContent>
                    </Card>
                )}

                <header className="w-full max-w-[1600px] mx-auto mb-2 sm:mb-4 flex items-center justify-between gap-2 sm:gap-4 flex-wrap shrink-0 px-1">
                    <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                        <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")} className="shrink-0">
                            <ArrowLeft className="w-4 h-4 mr-1 sm:mr-2" /> <span className="hidden sm:inline">Voltar</span>
                        </Button>
                        <h1 className="text-base sm:text-xl md:text-2xl font-bold flex items-center gap-2 truncate">
                            <FileSpreadsheet className="w-5 h-5 sm:w-6 sm:h-6 text-primary shrink-0" />
                            <span className="truncate">Reserva / Antecipação</span>
                        </h1>
                    </div>
                    <div className="flex gap-2">
                        {isAdmin && (
                            <Button 
                                variant={globalAdminView ? "default" : "outline"} 
                                size="sm" 
                                onClick={() => setGlobalAdminView(!globalAdminView)}
                                className="flex items-center gap-2 border-primary"
                            >
                                <Users className="w-4 h-4" /> {globalAdminView ? "Sair da Visão Global" : "Visão Global Admin"}
                            </Button>
                        )}
                        <Button variant="outline" size="sm" onClick={downloadSample} className="flex items-center gap-2">
                            <Download className="w-4 h-4" /> Baixar Modelo
                        </Button>
                        {isAdmin && globalAdminView && (
                            <Button variant="destructive" size="sm" onClick={clearGlobalHistory} className="bg-red-600 hover:bg-red-700">
                                <Trash2 className="w-4 h-4 mr-1" /> Limpar Base Global
                            </Button>
                        )}
                        {data.length > 0 && (
                            <>
                                <Button variant="outline" size="sm" onClick={() => setShowInfo(!showInfo)} className="flex items-center gap-2">
                                    <Info className="w-4 h-4" /> Guia
                                </Button>
                                <Button variant="default" size="sm" onClick={() => setExportDialogOpen(true)} className="bg-primary hover:bg-primary/90">
                                    <FileOutput className="w-4 h-4 mr-2" /> Exportar Selecionados
                                </Button>
                                <Button variant="destructive" size="sm" onClick={clearHistory}>
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            </>
                        )}
                    </div>
                </header>

                <main className="flex-1 w-full max-w-[1600px] mx-auto overflow-y-auto space-y-4 sm:space-y-6 px-1">
                    {isAdmin && globalAdminView && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                            <Card className="bg-primary/5 border-primary/20">
                                <CardHeader className="p-3 pb-0"><CardTitle className="text-[10px] uppercase text-muted-foreground flex items-center gap-1.5"><FileSpreadsheet className="w-3 h-3" /> Total Global</CardTitle></CardHeader>
                                <CardContent className="p-3 pt-1"><p className="text-xl font-bold">{adminMetrics.total}</p></CardContent>
                            </Card>
                            <Card className="bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800">
                                <CardHeader className="p-3 pb-0"><CardTitle className="text-[10px] uppercase text-emerald-600 flex items-center gap-1.5"><CheckSquare className="w-3 h-3" /> Contatados</CardTitle></CardHeader>
                                <CardContent className="p-3 pt-1"><p className="text-xl font-bold text-emerald-600">{adminMetrics.contatado}</p></CardContent>
                            </Card>
                            <Card className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
                                <CardHeader className="p-3 pb-0"><CardTitle className="text-[10px] uppercase text-amber-600 flex items-center gap-1.5"><Info className="w-3 h-3" /> Aguardando</CardTitle></CardHeader>
                                <CardContent className="p-3 pt-1"><p className="text-xl font-bold text-amber-600">{adminMetrics.aguardando}</p></CardContent>
                            </Card>
                            <Card className="bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800">
                                <CardHeader className="p-3 pb-0"><CardTitle className="text-[10px] uppercase text-red-600 flex items-center gap-1.5"><X className="w-3 h-3" /> Sem Contato</CardTitle></CardHeader>
                                <CardContent className="p-3 pt-1"><p className="text-xl font-bold text-red-600">{adminMetrics.semContato}</p></CardContent>
                            </Card>
                            <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                                <CardHeader className="p-3 pb-0"><CardTitle className="text-[10px] uppercase text-blue-600 flex items-center gap-1.5"><BarChart3 className="w-3 h-3" /> Antecipações</CardTitle></CardHeader>
                                <CardContent className="p-3 pt-1"><p className="text-xl font-bold text-blue-600">{adminMetrics.confirmada}</p></CardContent>
                            </Card>
                            <Card className="bg-purple-50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800">
                                <CardHeader className="p-3 pb-0"><CardTitle className="text-[10px] uppercase text-purple-600 flex items-center gap-1.5"><Users className="w-3 h-3" /> Usuários Ativ.</CardTitle></CardHeader>
                                <CardContent className="p-3 pt-1"><p className="text-xl font-bold text-purple-600">{adminMetrics.usuariosAtivos}</p></CardContent>
                            </Card>
                        </div>
                    )}
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
                                <div className="rounded-md border overflow-x-auto max-h-[calc(100vh-320px)]">
                                    <Table className="text-xs sm:text-sm">
                                        <TableHeader className="bg-muted/50">
                                            <TableRow>
                                                <TableHead className="w-10"></TableHead>
                                                <TableHead className="w-[140px]">Status</TableHead>
                                                <TableHead>SA / Setor</TableHead>
                                                <TableHead>Nome / Contato</TableHead>
                                                {isAdmin && globalAdminView && <TableHead>Carregado por</TableHead>}
                                                <TableHead>Data Orig.</TableHead>
                                                <TableHead className="w-[180px]">Decisão</TableHead>
                                                <TableHead className="w-[120px]">Data Nova</TableHead>
                                                <TableHead className="w-[110px]">Período</TableHead>
                                                <TableHead className="w-[100px]">Horário</TableHead>
                                                <TableHead className="text-center w-[160px]">Ações</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {[...data].reverse().map((item) => {
                                                // Determine row background color dynamically based on Status
                                                let rowColorClass = "";
                                                if (item.status === "Pendente") rowColorClass = "bg-gray-50/40 dark:bg-gray-900/10";
                                                else if (item.status === "Contatado") rowColorClass = "bg-emerald-50/60 dark:bg-emerald-900/20 border-l-4 border-l-emerald-500";
                                                else if (item.status === "Aguardando retorno") rowColorClass = "bg-amber-50/60 dark:bg-amber-900/20 border-l-4 border-l-amber-500";
                                                else if (item.status === "Sem Contato") rowColorClass = "bg-red-50/60 dark:bg-red-900/10 border-l-4 border-l-red-500 opacity-75";

                                                if (item.selecionado) {
                                                    rowColorClass = "bg-primary/10 border-primary";
                                                }

                                                return (
                                                    <TableRow key={item.id} className={rowColorClass}>
                                                        <TableCell>
                                                            <Checkbox checked={item.selecionado} onCheckedChange={() => toggleSelection(item.id)} />
                                                        </TableCell>
                                                        <TableCell>
                                                            <Select value={item.status} onValueChange={(v: any) => updateStatus(item.id, v)}>
                                                                <SelectTrigger className={`h-8 text-[11px] font-bold uppercase border-2 ${item.status === "Pendente" ? "border-gray-300 bg-gray-50 text-gray-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300" :
                                                                    item.status === "Contatado" ? "border-emerald-400 bg-emerald-50 text-emerald-700 dark:border-emerald-500 dark:bg-emerald-900/40 dark:text-emerald-300" :
                                                                        item.status === "Aguardando retorno" ? "border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-500 dark:bg-amber-900/40 dark:text-amber-300" :
                                                                            item.status === "Sem Contato" ? "border-red-400 bg-red-50 text-red-700 dark:border-red-500 dark:bg-red-900/40 dark:text-red-300" : ""
                                                                    }`}>
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="Pendente"><span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-gray-400"></span>Pendente</span></SelectItem>
                                                                    <SelectItem value="Contatado"><span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-500"></span>Contatado</span></SelectItem>
                                                                    <SelectItem value="Aguardando retorno"><span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-amber-500"></span>Aguardando</span></SelectItem>
                                                                    <SelectItem value="Sem Contato"><span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-red-500"></span>Sem Contato</span></SelectItem>
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
                                                        {isAdmin && globalAdminView && (
                                                            <TableCell>
                                                                <span className="text-[10px] px-2 py-1 rounded-full bg-primary/10 text-primary font-medium">
                                                                    {item.user_nome}
                                                                </span>
                                                            </TableCell>
                                                        )}
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
                                                            <Input
                                                                type="date"
                                                                className="h-8 text-xs"
                                                                disabled={item.decisao !== "Confirmada"}
                                                                value={item.dataNova || ""}
                                                                onChange={(e) => updateField(item.id, "dataNova", e.target.value)}
                                                            />
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
                                                                    <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600" onClick={() => openWhatsApp(item)} title="WhatsApp e iniciar Timer!"><MessageSquare className="w-4 h-4" /></Button>
                                                                </TooltipTrigger><TooltipContent>WhatsApp</TooltipContent></Tooltip>

                                                                <Tooltip><TooltipTrigger asChild>
                                                                    <Button size="icon" variant="ghost" className="h-7 w-7 text-blue-500" onClick={() => openTelegram(item)} title="Telegram e iniciar Timer!"><Send className="w-4 h-4" /></Button>
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
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </main>

                <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle>Exportar Resultados</DialogTitle>
                            <DialogDescription>
                                Você deseja exportar os registros selecionados. Após exportar, gostaria de limpar estes itens do seu histórico atual ou mantê-los para visualização?
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter className="flex flex-col sm:flex-row gap-2">
                            <Button 
                                variant="outline" 
                                onClick={() => {
                                    exportResults();
                                    setExportDialogOpen(false);
                                }}
                            >
                                Exportar e manter histórico
                            </Button>
                            <Button 
                                variant="default"
                                onClick={async () => {
                                    const selectedItems = data.filter(i => i.selecionado);
                                    exportResults();
                                    // Soft delete selected items
                                    try {
                                        await supabase.from("reagenda_history" as any)
                                            .update({ deleted_by_user: true })
                                            .in("id", selectedItems.map(i => i.id));
                                        setData(prev => prev.filter(i => !i.selecionado));
                                    } catch (e) {}
                                    setExportDialogOpen(false);
                                }}
                            >
                                Exportar e limpar do painel
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </TooltipProvider>
    );
};

export default Reagenda;
