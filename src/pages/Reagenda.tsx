import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Upload, MessageSquare, FileSpreadsheet, Download } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";

interface ReagendaData {
    nome: string;
    contato: string;
    operadora: string;
    tipoAtividade: string;
    dataAgendamento: string;
}

const Reagenda = () => {
    const [data, setData] = useState<ReagendaData[]>([]);
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const { toast } = useToast();

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

                const formattedData: ReagendaData[] = jsonData.map((row) => ({
                    nome: row["NOME"] || row["Nome"] || "",
                    contato: String(row["CONTATO"] || row["Contato"] || "").replace(/\D/g, ""),
                    operadora: row["OPERADORA"] || row["Operadora"] || "",
                    tipoAtividade: row["TIPO DE ATIVIDADE"] || row["Tipo de Atividade"] || row["ATIVIDADE"] || "",
                    dataAgendamento: row["DATA DE AGENDAMENTO"] || row["Data de Agendamento"] || row["DATA"] || "",
                }));

                const validData = formattedData.filter(item => item.nome && item.contato);
                setData(validData);

                toast({
                    title: "Planilha carregada",
                    description: `${validData.length} registros encontrados.`,
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
            }
        };
        reader.readAsBinaryString(file);
    };

    const sendWhatsAppMessage = (item: ReagendaData) => {
        const message = `Olá, ${item.nome}! Tudo bem?

Aqui é da equipe de agendamento da ${item.operadora}.

Identificamos aqui no sistema que você possui uma solicitação de ${item.tipoAtividade} para sua internet ${item.operadora}, agendada originalmente para o dia ${item.dataAgendamento}.

Estou entrando em contato pois conseguimos uma abertura em nossa agenda e podemos antecipar o seu atendimento! 🚀

Você teria interesse em realizar esse serviço antes do prazo?

Se sim, por favor, me confirme qual período (manhã ou tarde) e horário você teria disponibilidade para nos receber.

Fico no aguardo!`;

        const encodedMessage = encodeURIComponent(message);
        const whatsappUrl = `https://wa.me/55${item.contato}?text=${encodedMessage}`;
        window.open(whatsappUrl, "_blank");
    };

    const downloadSample = () => {
        const sampleData = [
            {
                "NOME": "João Silva",
                "CONTATO": "11999999999",
                "OPERADORA": "Vivo",
                "TIPO DE ATIVIDADE": "Instalação",
                "DATA DE AGENDAMENTO": "10/03/2026"
            },
            {
                "NOME": "Maria Oliveira",
                "CONTATO": "11888888888",
                "OPERADORA": "Claro",
                "TIPO DE ATIVIDADE": "Reparo",
                "DATA DE AGENDAMENTO": "12/03/2026"
            }
        ];

        const worksheet = XLSX.utils.json_to_sheet(sampleData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Reagendamentos");
        XLSX.writeFile(workbook, "modelo_reagendamento.xlsx");
    };

    return (
        <div className="min-h-screen bg-background p-4">
            <header className="container mx-auto max-w-6xl mb-6 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
                        <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
                    </Button>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <FileSpreadsheet className="w-6 h-6 text-primary" />
                        Sistema de Reagendamento
                    </h1>
                </div>
                <Button variant="outline" size="sm" onClick={downloadSample} className="flex items-center gap-2">
                    <Download className="w-4 h-4" /> Baixar Planilha Modelo
                </Button>
            </header>

            <main className="container mx-auto max-w-6xl space-y-6">
                <Card className="glass-card">
                    <CardHeader>
                        <CardTitle>Carregar Planilha</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-col items-center justify-center border-2 border-dashed border-muted-foreground/25 rounded-lg p-10 hover:border-primary/50 transition-colors bg-card/50">
                            <Upload className="w-10 h-10 text-muted-foreground mb-4" />
                            <p className="text-sm text-muted-foreground mb-4 text-center">
                                Arraste ou selecione um arquivo Excel (.xlsx ou .csv)<br />
                                com as colunas: NOME, CONTATO, OPERADORA, TIPO DE ATIVIDADE, DATA DE AGENDAMENTO
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
                        <CardHeader>
                            <CardTitle>Registros Encontrados</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-md border overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Nome</TableHead>
                                            <TableHead>Contato</TableHead>
                                            <TableHead>Operadora</TableHead>
                                            <TableHead>Atividade</TableHead>
                                            <TableHead>Data Original</TableHead>
                                            <TableHead className="text-right">Ação</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {data.map((item, index) => (
                                            <TableRow key={index}>
                                                <TableCell className="font-medium whitespace-nowrap">{item.nome}</TableCell>
                                                <TableCell className="whitespace-nowrap">{item.contato}</TableCell>
                                                <TableCell className="whitespace-nowrap">{item.operadora}</TableCell>
                                                <TableCell className="whitespace-nowrap">{item.tipoAtividade}</TableCell>
                                                <TableCell className="whitespace-nowrap text-center">{item.dataAgendamento}</TableCell>
                                                <TableCell className="text-right whitespace-nowrap">
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="bg-green-50 hover:bg-green-100 text-green-700 border-green-200"
                                                        onClick={() => sendWhatsAppMessage(item)}
                                                    >
                                                        <MessageSquare className="w-4 h-4 mr-2" />
                                                        WhatsApp
                                                    </Button>
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
    );
};

export default Reagenda;
