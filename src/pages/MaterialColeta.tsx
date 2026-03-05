import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Plus, Trash2, Camera, Upload, FileSpreadsheet, Search, Download } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

interface MaterialItem {
  id: string;
  codigo_material: string;
  nome_material: string;
  quantidade: number;
  unidade: string;
  serial: string;
}

interface Tecnico {
  tr: string;
  tt: string;
  nome_empresa: string;
  nome_tecnico: string;
  supervisor: string;
  coordenador: string;
}

interface MaterialCadastro {
  codigo: string;
  nome_material: string;
}

interface ColetaRecord {
  id: string;
  nome_tecnico: string;
  atividade: string;
  tipo_aplicacao: string;
  circuito: string | null;
  ba: string | null;
  created_at: string;
  material_coleta_items: { codigo_material: string; nome_material: string; quantidade: number; unidade: string; serial: string | null }[];
}

const MaterialColeta = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("formulario");

  // Form state
  const [nomeTecnico, setNomeTecnico] = useState("");
  const [atividade, setAtividade] = useState("");
  const [tipoAplicacao, setTipoAplicacao] = useState("");
  const [circuito, setCircuito] = useState("");
  const [ba, setBa] = useState("");
  const [materiais, setMateriais] = useState<MaterialItem[]>([
    { id: crypto.randomUUID(), codigo_material: "", nome_material: "", quantidade: 1, unidade: "Un", serial: "" },
  ]);
  const [submitting, setSubmitting] = useState(false);

  // Cadastro lists
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [materiaisCadastro, setMateriaisCadastro] = useState<MaterialCadastro[]>([]);

  // Consultation state
  const [searchBa, setSearchBa] = useState("");
  const [searchCircuito, setSearchCircuito] = useState("");
  const [searchTecnico, setSearchTecnico] = useState("");
  const [coletas, setColetas] = useState<ColetaRecord[]>([]);
  const [searching, setSearching] = useState(false);

  // Camera ref
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraActive, setCameraActive] = useState<string | null>(null);

  // Load technicians and materials catalogs
  useEffect(() => {
    supabase.from("tecnicos_cadastro").select("tr, tt, nome_empresa, nome_tecnico, supervisor, coordenador").then(({ data }) => {
      if (data) setTecnicos(data as Tecnico[]);
    });
    supabase.from("materiais_cadastro").select("codigo, nome_material").then(({ data }) => {
      if (data) setMateriaisCadastro(data as MaterialCadastro[]);
    });
  }, []);

  // Upload technician spreadsheet
  const handleTecnicoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws);

      const mapped = rows.map((r) => ({
        tr: String(r.TR || r.tr || ""),
        tt: String(r.TT || r.tt || ""),
        nome_empresa: String(r["Nome Empresa"] || r.nome_empresa || ""),
        nome_tecnico: String(r["Nome Técnico"] || r["Nome Tecnico"] || r.nome_tecnico || ""),
        supervisor: String(r.Supervisor || r.supervisor || ""),
        coordenador: String(r.Coordenador || r.coordenador || ""),
        uploaded_by: user.id,
      }));

      const { error } = await supabase.from("tecnicos_cadastro").insert(mapped as any);
      if (error) throw error;
      toast.success(`${mapped.length} técnicos importados com sucesso`);
      setTecnicos((prev) => [...prev, ...mapped]);
    } catch (err: any) {
      toast.error("Erro ao importar planilha: " + err.message);
    }
    e.target.value = "";
  };

  // Upload material spreadsheet
  const handleMaterialUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws);

      const mapped = rows.map((r) => ({
        codigo: String(r.Codigo || r.codigo || r["Código"] || ""),
        nome_material: String(r["Nome Material"] || r.nome_material || r["Nome"] || ""),
        uploaded_by: user.id,
      }));

      const { error } = await supabase.from("materiais_cadastro").insert(mapped as any);
      if (error) throw error;
      toast.success(`${mapped.length} materiais importados com sucesso`);
      setMateriaisCadastro((prev) => [...prev, ...mapped]);
    } catch (err: any) {
      toast.error("Erro ao importar planilha: " + err.message);
    }
    e.target.value = "";
  };

  // Auto-fill material name from code
  const handleCodigoChange = (id: string, codigo: string) => {
    setMateriais((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        const found = materiaisCadastro.find((mc) => mc.codigo === codigo);
        return { ...m, codigo_material: codigo, nome_material: found?.nome_material || m.nome_material };
      })
    );
  };

  const updateMaterial = (id: string, field: keyof MaterialItem, value: string | number) => {
    setMateriais((prev) => prev.map((m) => (m.id === id ? { ...m, [field]: value } : m)));
  };

  const addMaterial = () => {
    setMateriais((prev) => [
      ...prev,
      { id: crypto.randomUUID(), codigo_material: "", nome_material: "", quantidade: 1, unidade: "Un", serial: "" },
    ]);
  };

  const removeMaterial = (id: string) => {
    if (materiais.length <= 1) return;
    setMateriais((prev) => prev.filter((m) => m.id !== id));
  };

  // Camera for serial barcode
  const startCamera = async (materialId: string) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraActive(materialId);
      toast.info("Câmera aberta. Se não conseguir ler, digite o serial manualmente.");
    } catch {
      toast.error("Não foi possível acessar a câmera. Digite o serial manualmente.");
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(null);
  };

  // Submit form
  const handleSubmit = async () => {
    if (!user) return;
    if (!nomeTecnico || !atividade || !tipoAplicacao) {
      toast.error("Preencha os campos obrigatórios: Técnico, Atividade e Tipo Aplicação");
      return;
    }
    if (materiais.some((m) => !m.codigo_material || !m.nome_material)) {
      toast.error("Preencha código e nome de todos os materiais");
      return;
    }

    setSubmitting(true);
    try {
      const { data: coleta, error: coletaError } = await supabase
        .from("material_coletas")
        .insert({ user_id: user.id, nome_tecnico: nomeTecnico, atividade, tipo_aplicacao: tipoAplicacao, circuito: circuito || null, ba: ba || null } as any)
        .select("id")
        .single();

      if (coletaError) throw coletaError;

      const items = materiais.map((m) => ({
        coleta_id: (coleta as any).id,
        codigo_material: m.codigo_material,
        nome_material: m.nome_material,
        quantidade: m.quantidade,
        unidade: m.unidade,
        serial: m.serial || null,
      }));

      const { error: itemsError } = await supabase.from("material_coleta_items").insert(items as any);
      if (itemsError) throw itemsError;

      toast.success("Coleta registrada com sucesso!");
      // Reset form
      setNomeTecnico("");
      setAtividade("");
      setTipoAplicacao("");
      setCircuito("");
      setBa("");
      setMateriais([{ id: crypto.randomUUID(), codigo_material: "", nome_material: "", quantidade: 1, unidade: "Un", serial: "" }]);
    } catch (err: any) {
      toast.error("Erro ao salvar: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Search / Consultation
  const handleSearch = async () => {
    setSearching(true);
    try {
      let query = supabase.from("material_coletas").select("id, nome_tecnico, atividade, tipo_aplicacao, circuito, ba, created_at, material_coleta_items(codigo_material, nome_material, quantidade, unidade, serial)") as any;

      if (searchBa) query = query.ilike("ba", `%${searchBa}%`);
      if (searchCircuito) query = query.ilike("circuito", `%${searchCircuito}%`);
      if (searchTecnico) query = query.ilike("nome_tecnico", `%${searchTecnico}%`);

      const { data, error } = await query.order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      setColetas((data || []) as ColetaRecord[]);
    } catch (err: any) {
      toast.error("Erro na consulta: " + err.message);
    } finally {
      setSearching(false);
    }
  };

  // Export
  const handleExport = () => {
    if (coletas.length === 0) {
      toast.error("Nenhum dado para exportar");
      return;
    }
    const rows = coletas.flatMap((c) =>
      c.material_coleta_items.map((item) => ({
        BA: c.ba || "",
        Circuito: c.circuito || "",
        Técnico: c.nome_tecnico,
        Atividade: c.atividade,
        "Tipo Aplicação": c.tipo_aplicacao,
        "Código Material": item.codigo_material,
        "Nome Material": item.nome_material,
        Quantidade: item.quantidade,
        Unidade: item.unidade,
        Serial: item.serial || "",
        Data: new Date(c.created_at).toLocaleDateString("pt-BR"),
      }))
    );
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Coletas");
    XLSX.writeFile(wb, `coleta_materiais_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 h-14 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="p-1 bg-transparent w-9 h-9 flex items-center justify-center overflow-hidden">
            <img src="/ability-logo.png" alt="Logo" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-base font-bold text-foreground">Formulário de Coleta Material Dados</h1>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-4 overflow-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="formulario">Formulário</TabsTrigger>
            <TabsTrigger value="cadastros">Cadastros</TabsTrigger>
            <TabsTrigger value="consulta">Consulta / Exportar</TabsTrigger>
          </TabsList>

          {/* ── TAB: FORMULÁRIO ── */}
          <TabsContent value="formulario" className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Dados da Coleta</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Técnico */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Nome do Técnico *</Label>
                    <Select value={nomeTecnico} onValueChange={setNomeTecnico}>
                      <SelectTrigger><SelectValue placeholder="Selecione o técnico" /></SelectTrigger>
                      <SelectContent>
                        {tecnicos.map((t, i) => (
                          <SelectItem key={i} value={t.nome_tecnico}>{t.nome_tecnico}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {nomeTecnico === "" && tecnicos.length === 0 && (
                      <p className="text-xs text-muted-foreground">Importe a planilha de técnicos na aba "Cadastros"</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label>BA</Label>
                    <Input value={ba} onChange={(e) => setBa(e.target.value)} placeholder="Número do BA" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label>Atividade *</Label>
                    <Select value={atividade} onValueChange={setAtividade}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Ativação">Ativação</SelectItem>
                        <SelectItem value="Retirada">Retirada</SelectItem>
                        <SelectItem value="Reparo">Reparo</SelectItem>
                        <SelectItem value="Preventiva">Preventiva</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Tipo Aplicação *</Label>
                    <Select value={tipoAplicacao} onValueChange={setTipoAplicacao}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Baixa">Baixa</SelectItem>
                        <SelectItem value="Reversa">Reversa</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Circuito</Label>
                    <Input value={circuito} onChange={(e) => setCircuito(e.target.value)} placeholder="Circuito" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Materials */}
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-base">Materiais Aplicados</CardTitle>
                <Button size="sm" variant="outline" onClick={addMaterial}>
                  <Plus className="w-4 h-4 mr-1" /> Adicionar
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {materiais.map((mat, idx) => (
                  <div key={mat.id} className="border rounded-lg p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-muted-foreground">Material {idx + 1}</span>
                      {materiais.length > 1 && (
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeMaterial(mat.id)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Código *</Label>
                        <Input
                          value={mat.codigo_material}
                          onChange={(e) => handleCodigoChange(mat.id, e.target.value)}
                          placeholder="Código"
                          list={`materiais-list-${mat.id}`}
                        />
                        <datalist id={`materiais-list-${mat.id}`}>
                          {materiaisCadastro.map((mc) => (
                            <option key={mc.codigo} value={mc.codigo}>{mc.nome_material}</option>
                          ))}
                        </datalist>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Nome Material *</Label>
                        <Input
                          value={mat.nome_material}
                          onChange={(e) => updateMaterial(mat.id, "nome_material", e.target.value)}
                          placeholder="Nome"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Qtde</Label>
                        <Input
                          type="number"
                          min={1}
                          value={mat.quantidade}
                          onChange={(e) => updateMaterial(mat.id, "quantidade", Number(e.target.value))}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Un/Metro</Label>
                        <Select value={mat.unidade} onValueChange={(v) => updateMaterial(mat.id, "unidade", v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Un">Un</SelectItem>
                            <SelectItem value="Metro">Metro</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Serial</Label>
                        <div className="flex gap-1">
                          <Input
                            value={mat.serial}
                            onChange={(e) => updateMaterial(mat.id, "serial", e.target.value)}
                            placeholder="Serial"
                            className="flex-1"
                          />
                          <Button size="icon" variant="outline" className="h-10 w-10 shrink-0" onClick={() => startCamera(mat.id)} title="Usar câmera">
                            <Camera className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Camera modal */}
            {cameraActive && (
              <Card className="border-primary">
                <CardContent className="p-4 flex flex-col items-center gap-3">
                  <video ref={videoRef} className="w-full max-w-sm rounded border" />
                  <p className="text-sm text-muted-foreground">Aponte para o código de barras. Se não funcionar, feche e digite manualmente.</p>
                  <Button variant="outline" onClick={stopCamera}>Fechar Câmera</Button>
                </CardContent>
              </Card>
            )}

            <Button onClick={handleSubmit} disabled={submitting} className="w-full md:w-auto">
              {submitting ? "Salvando..." : "Registrar Coleta"}
            </Button>
          </TabsContent>

          {/* ── TAB: CADASTROS ── */}
          <TabsContent value="cadastros" className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5" /> Planilha de Técnicos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Colunas esperadas: <strong>TR, TT, Nome Empresa, Nome Técnico, Supervisor, Coordenador</strong>
                </p>
                <label className="inline-flex items-center gap-2 cursor-pointer px-4 py-2 border rounded-md text-sm hover:bg-accent transition-colors">
                  <Upload className="w-4 h-4" /> Importar Planilha
                  <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleTecnicoUpload} />
                </label>
                {tecnicos.length > 0 && (
                  <div className="max-h-48 overflow-auto border rounded">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">TR</TableHead>
                          <TableHead className="text-xs">TT</TableHead>
                          <TableHead className="text-xs">Empresa</TableHead>
                          <TableHead className="text-xs">Técnico</TableHead>
                          <TableHead className="text-xs">Supervisor</TableHead>
                          <TableHead className="text-xs">Coordenador</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tecnicos.slice(0, 50).map((t, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs">{t.tr}</TableCell>
                            <TableCell className="text-xs">{t.tt}</TableCell>
                            <TableCell className="text-xs">{t.nome_empresa}</TableCell>
                            <TableCell className="text-xs">{t.nome_tecnico}</TableCell>
                            <TableCell className="text-xs">{t.supervisor}</TableCell>
                            <TableCell className="text-xs">{t.coordenador}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5" /> Planilha de Materiais
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Colunas esperadas: <strong>Codigo, Nome Material</strong>
                </p>
                <label className="inline-flex items-center gap-2 cursor-pointer px-4 py-2 border rounded-md text-sm hover:bg-accent transition-colors">
                  <Upload className="w-4 h-4" /> Importar Planilha
                  <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleMaterialUpload} />
                </label>
                {materiaisCadastro.length > 0 && (
                  <div className="max-h-48 overflow-auto border rounded">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Código</TableHead>
                          <TableHead className="text-xs">Nome Material</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {materiaisCadastro.slice(0, 50).map((m, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs">{m.codigo}</TableCell>
                            <TableCell className="text-xs">{m.nome_material}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── TAB: CONSULTA ── */}
          <TabsContent value="consulta" className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Consultar Coletas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">BA</Label>
                    <Input value={searchBa} onChange={(e) => setSearchBa(e.target.value)} placeholder="Buscar BA" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Circuito</Label>
                    <Input value={searchCircuito} onChange={(e) => setSearchCircuito(e.target.value)} placeholder="Buscar Circuito" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Técnico</Label>
                    <Input value={searchTecnico} onChange={(e) => setSearchTecnico(e.target.value)} placeholder="Buscar Técnico" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleSearch} disabled={searching}>
                    <Search className="w-4 h-4 mr-1" /> {searching ? "Buscando..." : "Consultar"}
                  </Button>
                  <Button variant="outline" onClick={handleExport}>
                    <Download className="w-4 h-4 mr-1" /> Exportar Excel
                  </Button>
                </div>
              </CardContent>
            </Card>

            {coletas.length > 0 && (
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-auto max-h-[60vh]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Data</TableHead>
                          <TableHead className="text-xs">BA</TableHead>
                          <TableHead className="text-xs">Circuito</TableHead>
                          <TableHead className="text-xs">Técnico</TableHead>
                          <TableHead className="text-xs">Atividade</TableHead>
                          <TableHead className="text-xs">Tipo</TableHead>
                          <TableHead className="text-xs">Materiais</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {coletas.map((c) => (
                          <TableRow key={c.id}>
                            <TableCell className="text-xs">{new Date(c.created_at).toLocaleDateString("pt-BR")}</TableCell>
                            <TableCell className="text-xs">{c.ba || "-"}</TableCell>
                            <TableCell className="text-xs">{c.circuito || "-"}</TableCell>
                            <TableCell className="text-xs">{c.nome_tecnico}</TableCell>
                            <TableCell className="text-xs">{c.atividade}</TableCell>
                            <TableCell className="text-xs">{c.tipo_aplicacao}</TableCell>
                            <TableCell className="text-xs">
                              {c.material_coleta_items.map((item, i) => (
                                <div key={i}>{item.codigo_material} - {item.nome_material} (x{item.quantidade})</div>
                              ))}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default MaterialColeta;
