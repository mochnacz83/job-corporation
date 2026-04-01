import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import React, { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAccessTracking } from "@/hooks/useAccessTracking";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ArrowLeft, Plus, Trash2, Upload, FileSpreadsheet, Search, ScanBarcode, CheckCircle2, AlertTriangle, AlertCircle, RefreshCw, X, Check } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { Html5Qrcode } from "html5-qrcode";

interface InventoryBaseItem {
  id: string;
  serial: string;
  modelo: string | null;
  nome_tecnico: string;
  matricula_tt: string;
  setor: string | null;
  supervisor: string | null;
  coordenador: string | null;
}

interface SubmissionItem {
  id?: string;
  serial: string;
  modelo: string | null;
  status: 'presente' | 'falta' | 'extra';
}

const Inventory = () => {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { trackAction } = useAccessTracking("/inventario");

  const [activeTab, setActiveTab] = useState("colaborador");
  
  // Colaborador State
  const [tt, setTt] = useState("");
  const [nomeTecnico, setNomeTecnico] = useState("");
  const [baseItems, setBaseItems] = useState<InventoryBaseItem[]>([]);
  const [submissionItems, setSubmissionItems] = useState<Record<string, 'presente' | 'falta' | null>>({});
  const [extraItems, setExtraItems] = useState<SubmissionItem[]>([]);
  const [loadingBase, setLoadingBase] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Admin State
  const [uploading, setUploading] = useState(false);
  const [allSubmissions, setAllSubmissions] = useState<any[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);

  // Scanner State
  const [scannerOpen, setScannerOpen] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    trackAction("Acessou o Módulo de Inventário");
  }, []);

  // --- Colaborador Functions ---

  const handleFetchBase = async () => {
    if (!tt) return;
    setLoadingBase(true);
    try {
      const { data, error } = await (supabase.from as any)("inventory_base")
        .select("*")
        .eq("matricula_tt", tt.toUpperCase());

      if (error) throw error;
      
      setBaseItems(data || []);
      if (data && data.length > 0) {
        setNomeTecnico(data[0].nome_tecnico);
        // Initialize submission items
        const initial: Record<string, 'presente' | 'falta' | null> = {};
        data.forEach((item: any) => {
          initial[item.id] = null;
        });
        setSubmissionItems(initial);
      } else {
        toast.info("Nenhum item encontrado para esta matrícula.");
        setNomeTecnico("");
      }
    } catch (err: any) {
      toast.error("Erro ao carger carga: " + err.message);
    } finally {
      setLoadingBase(false);
    }
  };

  const handleStatusChange = (id: string, status: 'presente' | 'falta') => {
    setSubmissionItems(prev => ({ ...prev, [id]: status }));
  };

  const handleAddExtra = (serial: string, modelo: string) => {
    const upperSerial = serial.toUpperCase();
    // Check if it's already in base
    const inBase = baseItems.find(item => item.serial.toUpperCase() === upperSerial);
    if (inBase) {
      toast.warning("Este serial já consta na sua carga original. Marque-o como 'Possuo'.");
      return;
    }
    
    // Check if already in extras
    if (extraItems.find(item => item.serial === upperSerial)) {
      toast.error("Serial já adicionado.");
      return;
    }

    setExtraItems(prev => [...prev, { serial: upperSerial, modelo, status: 'extra' }]);
    toast.success("Item extra adicionado.");
  };

  const handleRemoveExtra = (index: number) => {
    setExtraItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmitInventory = async () => {
    // Validate: all base items must have a status
    const incomplete = Object.values(submissionItems).some(val => val === null);
    if (incomplete) {
      toast.error("Por favor, valide todos os itens da sua carga antes de finalizar.");
      return;
    }

    setSubmitting(true);
    try {
      // 1. Create submission record
      const { data: subData, error: subError } = await (supabase.from as any)("inventory_submissions")
        .insert({
          matricula_tt: tt.toUpperCase(),
          nome_tecnico: nomeTecnico,
          status: 'finalizado',
          data_fim: new Date().toISOString(),
          user_id: user?.id
        })
        .select()
        .single();

      if (subError) throw subError;

      // 2. Prepare all items
      const finalItems = [
        ...baseItems.map(item => ({
          submission_id: subData.id,
          serial: item.serial,
          modelo: item.modelo,
          status: submissionItems[item.id] as string
        })),
        ...extraItems.map(item => ({
          submission_id: subData.id,
          serial: item.serial,
          modelo: item.modelo,
          status: 'extra'
        }))
      ];

      // 3. Bulk insert
      const { error: itemsError } = await (supabase.from as any)("inventory_submission_items")
        .insert(finalItems);

      if (itemsError) throw itemsError;

      toast.success("Inventário finalizado com sucesso!");
      // Reset state
      setTt("");
      setBaseItems([]);
      setSubmissionItems({});
      setExtraItems([]);
      setNomeTecnico("");
    } catch (err: any) {
      toast.error("Erro ao salvar inventário: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // --- Admin Functions ---

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      // Expected columns: Serial, Modelo, Técnico, TT, Setor, Supervisor, Coordenador
      const mappedData = jsonData.map((row: any) => ({
        serial: String(row.Serial || row.serial || "").trim(),
        modelo: String(row.Modelo || row.modelo || "").trim(),
        nome_tecnico: String(row["Nome Técnico"] || row["Nome Tecnico"] || row.tecnico || "").trim(),
        matricula_tt: String(row["Matrícula TT"] || row["Matricula TT"] || row.tt || "").trim().toUpperCase(),
        setor: String(row.Setor || row.setor || "").trim(),
        supervisor: String(row.Supervisor || row.supervisor || "").trim(),
        coordenador: String(row.Coordenador || row.coordenador || "").trim(),
      })).filter(item => item.serial && item.matricula_tt);

      if (mappedData.length === 0) {
        throw new Error("Nenhum dado válido encontrado na planilha.");
      }

      // Optional: Clear old base? 
      // const { error: deleteError = await (supabase.from as any)("inventory_base").delete().neq("id", "00000000-0000-0000-0000-000000000000");

      const { error } = await (supabase.from as any)("inventory_base").insert(mappedData);
      if (error) throw error;

      toast.success(`${mappedData.length} itens carregados com sucesso!`);
    } catch (err: any) {
      toast.error("Erro no upload: " + err.message);
    } finally {
      setUploading(false);
      if (e.target) e.target.value = "";
    }
  };

  const fetchSubmissions = async () => {
    setLoadingReports(true);
    try {
      const { data, error } = await (supabase.from as any)("inventory_submissions")
        .select(`
          *,
          inventory_submission_items(*)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setAllSubmissions(data || []);
    } catch (err: any) {
      toast.error("Erro ao carregar envios: " + err.message);
    } finally {
      setLoadingReports(false);
    }
  };

  useEffect(() => {
    if (activeTab === "admin" && isAdmin) {
      fetchSubmissions();
    }
  }, [activeTab]);

  // --- Scanner Logic ---
  
  const startScanner = async () => {
    setScannerOpen(true);
    setTimeout(async () => {
      try {
        const html5Qr = new Html5Qrcode("inventory-scanner");
        scannerRef.current = html5Qr;
        await html5Qr.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 150 } },
          (decodedText) => {
            handleAddExtra(decodedText, "ONT"); // Default model
            stopScanner();
          },
          () => {}
        );
      } catch (err) {
        toast.error("Erro ao acessar câmera.");
        setScannerOpen(false);
      }
    }, 300);
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current = null;
      } catch (_) {}
    }
    setScannerOpen(false);
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 space-y-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")} className="rounded-full">
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <h1 className="text-3xl font-bold tracking-tight text-primary">Mini Inventário</h1>
            </div>
            <p className="text-muted-foreground ml-12">Controle e validação de carga de ONTs</p>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full md:w-auto">
            <TabsList className="grid grid-cols-2 w-full md:w-[400px]">
              <TabsTrigger value="colaborador">Colaborador</TabsTrigger>
              <TabsTrigger value="admin" disabled={!isAdmin}>Admin</TabsTrigger>
            </TabsList>
          </Tabs>
        </header>

        <TabsContent value="colaborador" className="m-0 space-y-6">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle>Validar Minha Carga</CardTitle>
              <CardDescription>Informe sua matrícula TT para ver os equipamentos atribuídos a você.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-row gap-3 items-end">
                <div className="space-y-2 flex-1">
                  <Label>Matrícula TT</Label>
                  <Input 
                    placeholder="Ex: TT12345" 
                    value={tt} 
                    onChange={e => setTt(e.target.value.toUpperCase())}
                    onKeyDown={e => e.key === 'Enter' && handleFetchBase()}
                  />
                </div>
                <Button onClick={handleFetchBase} disabled={loadingBase || !tt}>
                  {loadingBase ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
                  Buscar
                </Button>
              </div>

              {nomeTecnico && (
                <div className="p-3 bg-primary/10 rounded-lg flex items-center gap-2 text-primary font-medium">
                  <CheckCircle2 className="w-5 h-5" />
                  Técnico: {nomeTecnico}
                </div>
              )}
            </CardContent>
          </Card>

          {baseItems.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {baseItems.map((item) => (
                <Card key={item.id} className={`transition-all ${submissionItems[item.id] === 'presente' ? 'border-success/50 bg-success/5' : submissionItems[item.id] === 'falta' ? 'border-destructive/50 bg-destructive/5' : ''}`}>
                  <CardContent className="p-4 space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-xs text-muted-foreground uppercase font-semibold">Serial</p>
                        <p className="text-lg font-bold">{item.serial}</p>
                        <p className="text-sm text-muted-foreground">{item.modelo || "ONT"}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          size="sm" 
                          variant={submissionItems[item.id] === 'presente' ? 'default' : 'outline'}
                          className={submissionItems[item.id] === 'presente' ? 'bg-success hover:bg-success/90' : ''}
                          onClick={() => handleStatusChange(item.id, 'presente')}
                        >
                          <Check className="w-4 h-4 mr-1" /> Possuo
                        </Button>
                        <Button 
                          size="sm" 
                          variant={submissionItems[item.id] === 'falta' ? 'destructive' : 'outline'}
                          onClick={() => handleStatusChange(item.id, 'falta')}
                        >
                          <X className="w-4 h-4 mr-1" /> Falta
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {baseItems.length > 0 && (
            <Card className="border-dashed">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div>
                  <CardTitle className="text-md">Itens Extras</CardTitle>
                  <CardDescription>Adicione equipamentos que você possui mas não estão na lista.</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={startScanner}>
                  <ScanBarcode className="w-4 h-4 mr-2" /> Bipar Serial
                </Button>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {extraItems.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-secondary/20 rounded-md border">
                      <div>
                        <p className="font-mono text-sm">{item.serial}</p>
                        <p className="text-xs text-muted-foreground">{item.modelo}</p>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => handleRemoveExtra(idx)}>
                        <X className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Input id="manual-serial" placeholder="Serial Manual" className="h-9" />
                    <Button onClick={() => {
                      const input = document.getElementById('manual-serial') as HTMLInputElement;
                      if (input.value) {
                        handleAddExtra(input.value, "ONT");
                        input.value = "";
                      }
                    }} size="sm">Adicionar</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {baseItems.length > 0 && (
            <div className="flex justify-center pt-4">
              <Button size="lg" className="w-full md:w-auto px-12" onClick={handleSubmitInventory} disabled={submitting}>
                {submitting ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                Finalizar Inventário
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="admin" className="m-0 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Carga de Materiais</CardTitle>
                <CardDescription>Importe a base de equipamentos esperada para cada técnico.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-8 space-y-4 hover:bg-secondary/10 transition-colors">
                  <Upload className="w-10 h-10 text-muted-foreground" />
                  <div className="text-center">
                    <p className="font-medium">Clique para fazer upload</p>
                    <p className="text-xs text-muted-foreground">XLSX com Serial, TT, Técnico, Setor, etc.</p>
                  </div>
                  <Input 
                    type="file" 
                    accept=".xlsx, .xls" 
                    className="hidden" 
                    id="base-upload" 
                    onChange={handleFileUpload}
                    disabled={uploading}
                  />
                  <Button asChild disabled={uploading}>
                    <label htmlFor="base-upload" className="cursor-pointer">
                      {uploading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                      Selecionar Planilha
                    </label>
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Histórico e Relatórios</CardTitle>
                <CardDescription>Veja os inventários realizados e as divergências encontradas.</CardDescription>
              </CardHeader>
              <CardContent className="h-full flex flex-col justify-between">
                <p className="text-sm text-muted-foreground">Total de envios realizados: {allSubmissions.length}</p>
                <Button variant="outline" className="mt-4" onClick={fetchSubmissions}>
                  <RefreshCw className="w-4 h-4 mr-2" /> Atualizar Lista
                </Button>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Divergências Registradas</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Técnico</TableHead>
                    <TableHead>TT</TableHead>
                    <TableHead>Faltas</TableHead>
                    <TableHead>Extras</TableHead>
                    <TableHead>Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allSubmissions.map((sub) => {
                    const faltas = sub.inventory_submission_items.filter((i: any) => i.status === 'falta').length;
                    const extras = sub.inventory_submission_items.filter((i: any) => i.status === 'extra').length;
                    
                    return (
                      <TableRow key={sub.id}>
                        <TableCell>{new Date(sub.created_at).toLocaleDateString()}</TableCell>
                        <TableCell>{sub.nome_tecnico}</TableCell>
                        <TableCell>{sub.matricula_tt}</TableCell>
                        <TableCell className="text-destructive font-medium">{faltas}</TableCell>
                        <TableCell className="text-warning font-medium">{extras}</TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost">Ver Detalhes</Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {allSubmissions.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        Nenhum inventário finalizado encontrado.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </div>

      {/* Dialog for Scanner */}
      <Dialog open={scannerOpen} onOpenChange={setScannerOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Escanear Código de Barras</DialogTitle>
            <DialogDescription>Posicione o serial da ONT dentro do quadro.</DialogDescription>
          </DialogHeader>
          <div id="inventory-scanner" className="w-full aspect-square bg-black rounded-lg overflow-hidden flex items-center justify-center">
            <RefreshCw className="w-10 h-10 animate-spin text-white opacity-20" />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={stopScanner}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Inventory;
