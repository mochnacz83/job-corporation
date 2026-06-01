import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Search, ScanBarcode, Upload, FileSpreadsheet, Download,
  RefreshCw, Trash2, ArrowRight, User, Users, Network,
  CheckCircle2, AlertTriangle, AlertCircle, HelpCircle,
  Database, Eye, FileText, Layers, Check, Info, IdCard,
  QrCode,
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { ontGet, ontSet, ontDel } from "@/lib/ontStorage";
import JSZip from "jszip";
import {
  fetchSharedBase, uploadSharedBase, deleteSharedBase,
  fetchAllMeta, upsertMeta, cacheLocal, readLocalCache,
  type OntBaseType,
} from "@/lib/ontSharedBases";
import { supabase } from "@/integrations/supabase/client";
import { QRCodeSVG } from "qrcode.react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

/* ============================================================
   Interfaces (alinhadas com os layouts reais das planilhas)
   ============================================================ */

// Dimensão de colaboradores (planilha Presença → aba "Técnicos")
interface DimPresenca {
  tr: string;
  tt: string;
  funcionario: string;
  funcao: string;
  operadora: string;
  supervisor: string;
  coordenador: string;
  setor_origem: string;
  setor_atual: string;
  status: string;
  municipio: string;
  uf: string;
}

// 1. Saldo Gestech consolidado (Estoque por Técnico → filtrado ONT/ROTEADOR e somado por TT+codmaterial)
interface SaldoGestech {
  matricula_tt: string;  // codarmazem
  nome_tecnico: string;  // armazem
  codigo_material: string; // codmaterial
  nome_material: string;   // material
  quantidade: number;      // soma de "saldo" (mantido p/ compat)
  saldo: number;
  disponivel: number;
  reversa: number;
  devolucao: number;
  defeito: number;
  bloqueado: number;
  achegar: number;
  emtransito: number;
}

// 2. Saldo SAP (Saldo_Sap_PA_TA_SC) — granularidade serial
interface SaldoSap {
  serial: string;            // Nº de série
  codigo_material: string;   // Material
  nome_material: string;     // Texto breve material
  centro: string;            // Centro
  deposito: string;          // Depósito
  modificado_em: string;     // Modificado em
  modificado_por: string;    // Modificado por (matrícula)
  status_sap: string;        // Status do sistema
  lote: string;              // Lote
}

// 3. Cruzamento SAP x Gestech (Consulta_Serial_SAP_X_Gestech) — última operação por serial
interface CruzamentoSapGestech {
  serial: string;
  codmat: string;
  material: string;
  codarm: string;          // codarmazem (TT)
  armazem: string;         // nome do armazém / técnico
  empresa: string;
  centro: string;
  deposito: string;
  ultimaoperacaoem: string; // ISO/string ordenável
  matricula: string;       // matrícula de quem efetuou
  efetuadapor: string;     // nome
  tipooperacao: string;
  notas: string;
  dataultimaaplicacao: string;
  dataultimareversa: string;
}

// 4. Seriais aplicados (Ativos na Planta) — aguardando base oficial
interface SerialAplicado {
  serial: string;
  codigo_material: string;
  nome_material: string;
  cliente: string;
  gpon: string;
  alias: string;
  data_instalacao: string;
  tecnico_instalador: string;
}

/* ============================================================
   Helpers
   ============================================================ */
const norm = (s: any) => String(s ?? "").trim();
const upper = (s: any) => norm(s).toUpperCase();
// Normaliza serial p/ comparação: maiúsculo, sem espaços e sem zeros à esquerda.
const normSerial = (s: any) => {
  const u = upper(s).replace(/\s+/g, "");
  return u.replace(/^0+/, "") || u;
};
const numberOr0 = (v: any) => {
  const n = Number(String(v ?? "0").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
// Filtro de materiais: ONT, ROTEADOR, MESH e REPETIDOR (chave do escopo de rastreabilidade).
const isAllowedMaterial = (mat: string) => {
  const m = upper(mat);
  return m.includes("ONT") || m.includes("ROTEADOR") || m.includes("MESH") || m.includes("REPETIDOR");
};
// alias legado mantido para evitar quebra de referências
const isOntOrRoteador = isAllowedMaterial;
// Aceita várias variantes de chave do header
const pick = (row: any, keys: string[]) => {
  const map: Record<string, any> = {};
  Object.keys(row).forEach((k) => (map[k.toLowerCase().trim()] = row[k]));
  for (const k of keys) {
    const v = map[k.toLowerCase().trim()];
    if (v !== undefined && v !== null && String(v) !== "") return v;
  }
  return "";
};

// XLSX → JSON usando a 1ª aba que tiver dados; tenta vários offsets de header
const readSheetAsJson = (workbook: XLSX.WorkBook, preferredSheets: string[] = []) => {
  const tryNames = [...preferredSheets, ...workbook.SheetNames];
  for (const name of tryNames) {
    if (!workbook.Sheets[name]) continue;
    const ws = workbook.Sheets[name];
    // Tenta com header em row1, row2 e row3
    for (const range of [undefined, "A2", "A3"]) {
      const opts: any = { defval: "", raw: false };
      if (range) opts.range = range;
      try {
        const j = XLSX.utils.sheet_to_json<any>(ws, opts);
        if (j.length > 0 && Object.keys(j[0]).length > 1) return j;
      } catch { /* tenta o próximo */ }
    }
  }
  return [];
};

// Leitor que força um cabeçalho específico (linha 1-indexada). Usado p/ planilhas
// do Gestech/Cruzamento que vêm do sistema com 2 linhas de título antes do header.
const readSheetForcedHeader = (
  workbook: XLSX.WorkBook,
  headerRow: number,
  preferredSheets: string[] = [],
  strictPreferred = false,
) => {
  const tryNames = strictPreferred
    ? preferredSheets.filter((n) => workbook.Sheets[n])
    : [...preferredSheets, ...workbook.SheetNames];
  for (const name of tryNames) {
    if (!workbook.Sheets[name]) continue;
    const ws = workbook.Sheets[name];
    try {
      const j = XLSX.utils.sheet_to_json<any>(ws, {
        defval: "",
        raw: false,
        range: headerRow - 1, // sheet_to_json range numérico = índice 0 da linha do header
      });
      if (j.length > 0) return j;
    } catch { /* tenta o próximo */ }
  }
  return [];
};

/* ============================================================
   Componente
   ============================================================ */
const RastreabilidadeOnt = () => {
  const { isAdmin } = useAuth();

  const KEY_PRESENCA = "ont_rastreabilidade_presenca";
  const KEY_GESTECH = "ont_rastreabilidade_gestech";
  const KEY_SAP = "ont_rastreabilidade_sap";
  const KEY_CRUZAMENTO = "ont_rastreabilidade_cruzamento";
  const KEY_APLICADOS = "ont_rastreabilidade_aplicados";

  const [presenca, setPresenca] = useState<DimPresenca[]>([]);
  const [saldoGestech, setSaldoGestech] = useState<SaldoGestech[]>([]);
  const [saldoSap, setSaldoSap] = useState<SaldoSap[]>([]);
  const [cruzamento, setCruzamento] = useState<CruzamentoSapGestech[]>([]);
  const [aplicados, setAplicados] = useState<SerialAplicado[]>([]);

  const [searchType, setSearchType] = useState<"matricula" | "nome" | "serial" | "supervisor" | "tr" | "coordenador" | "codigo">("matricula");
  const [searchQuery, setSearchQuery] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [searchResults, setSearchResults] = useState<any>(null);
  // Guarda último resultado de supervisor/coordenador p/ permitir voltar
  const [supervisorContext, setSupervisorContext] = useState<any>(null);
  // Drilldown do Saldo Gestech
  const [showGestechDrill, setShowGestechDrill] = useState(false);
  // Drilldown por código (supervisor expandido)
  const [expandedSupervisor, setExpandedSupervisor] = useState<string | null>(null);

  const [massInput, setMassInput] = useState("");
  const [massResults, setMassResults] = useState<any[]>([]);
  const [massStats, setMassStats] = useState({ total: 0, withTech: 0, applied: 0, notFound: 0 });
  const [searchingMass, setSearchingMass] = useState(false);

  const [uploadTimestamps, setUploadTimestamps] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState("consultas");

  useEffect(() => {
    (async () => {
      // 1) cache local primeiro (UI imediata) — versão antiga (legacy) inclusive.
      const legacy = (k: string) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch { return null; } };
      const loadLocal = async (type: OntBaseType, legacyKey: string) =>
        (await readLocalCache<any>(type)) ?? (await ontGet<any>(legacyKey)) ?? legacy(legacyKey) ?? [];

      setPresenca(await loadLocal("presenca", KEY_PRESENCA));
      setSaldoGestech(await loadLocal("gestech", KEY_GESTECH));
      setSaldoSap(await loadLocal("sap", KEY_SAP));
      setCruzamento(await loadLocal("cruzamento", KEY_CRUZAMENTO));
      setAplicados(await loadLocal("aplicados", KEY_APLICADOS));

      // 2) bases compartilhadas (fonte de verdade)
      try {
        const types: OntBaseType[] = ["presenca", "gestech", "sap", "cruzamento", "aplicados"];
        const [pr, ge, sa, cr, ap, meta] = await Promise.all([
          fetchSharedBase("presenca"),
          fetchSharedBase("gestech"),
          fetchSharedBase("sap"),
          fetchSharedBase("cruzamento"),
          fetchSharedBase("aplicados"),
          fetchAllMeta(),
        ]);
        if (pr) { setPresenca(pr as any); cacheLocal("presenca", pr); }
        if (ge) { setSaldoGestech(ge as any); cacheLocal("gestech", ge); }
        if (sa) { setSaldoSap(sa as any); cacheLocal("sap", sa); }
        if (cr) { setCruzamento(cr as any); cacheLocal("cruzamento", cr); }
        if (ap) { setAplicados(ap as any); cacheLocal("aplicados", ap); }

        const ts: Record<string, string> = {};
        types.forEach((t) => {
          if (meta[t]?.updated_at) ts[t] = new Date(meta[t].updated_at).toLocaleString("pt-BR");
        });
        if (Object.keys(ts).length) setUploadTimestamps(ts);
      } catch (err) {
        console.warn("Falha ao baixar bases compartilhadas:", err);
      }
    })();
  }, []);

  const saveBase = async (_legacyKey: string, data: any, type: string) => {
    try {
      // 1) Sobrepõe a base compartilhada no Supabase (RLS limita a admins)
      await uploadSharedBase(type as OntBaseType, data);
      // 2) Atualiza metadata (qtd + usuário + data)
      const { data: u } = await supabase.auth.getUser();
      await upsertMeta(type as OntBaseType, data.length, u.user?.email ?? null);
      // 3) Cache local
      await cacheLocal(type as OntBaseType, data);
      const now = new Date().toLocaleString("pt-BR");
      setUploadTimestamps((prev) => ({ ...prev, [type]: now }));
      toast.success("Base sobreposta e disponível para todos os usuários autorizados.");
    } catch (err: any) {
      toast.error("Erro ao gravar base compartilhada: " + (err?.message || "desconhecido"));
    }
  };

  const handleClearBase = async (type: string) => {
    if (!isAdmin) {
      toast.error("Apenas administradores podem limpar bases.");
      return;
    }
    if (!window.confirm(`Deseja limpar todos os dados da base ${type.toUpperCase()}?`)) return;
    const map: Record<string, [any, string]> = {
      presenca: [setPresenca, KEY_PRESENCA],
      gestech: [setSaldoGestech, KEY_GESTECH],
      sap: [setSaldoSap, KEY_SAP],
      cruzamento: [setCruzamento, KEY_CRUZAMENTO],
      aplicados: [setAplicados, KEY_APLICADOS],
    };
    const [setter, key] = map[type] || [];
    if (setter) { setter([]); ontDel(key); }
    try {
      await deleteSharedBase(type as OntBaseType);
      await (supabase.from("ont_bases_meta" as any) as any).delete().eq("base_type", type);
      await cacheLocal(type as OntBaseType, []);
      setUploadTimestamps((prev) => { const c = { ...prev }; delete c[type]; return c; });
    } catch (err: any) {
      toast.error("Erro ao remover base compartilhada: " + (err?.message || "desconhecido"));
      return;
    }
    toast.success(`Base ${type.toUpperCase()} redefinida.`);
  };

  /* ============================================================
     Index por matrícula TT (e TR) na dim Presença
     ============================================================ */
  const presencaIdx = useMemo(() => {
    const byTT: Record<string, DimPresenca> = {};
    const byTR: Record<string, DimPresenca> = {};
    const byNome: Record<string, DimPresenca> = {};
    presenca.forEach((p) => {
      if (p.tt) byTT[upper(p.tt)] = p;
      if (p.tr) byTR[upper(p.tr)] = p;
      if (p.funcionario) byNome[upper(p.funcionario)] = p;
    });
    return { byTT, byTR, byNome };
  }, [presenca]);

  const enrichByTT = (tt: string) => presencaIdx.byTT[upper(tt)];
  const enrichByTR = (tr: string) => presencaIdx.byTR[upper(tr)];

  /* ============================================================
     Cruzamento deduplicado por serial (última operação)
     ============================================================ */
  const cruzamentoDedup = useMemo(() => {
    const map: Record<string, CruzamentoSapGestech> = {};
    cruzamento.forEach((c) => {
      const s = upper(c.serial);
      if (!s) return;
      const prev = map[s];
      if (!prev) { map[s] = c; return; }
      // Compara datas (ISO ou DD/MM/YYYY HH:mm)
      const toTime = (v: string) => {
        if (!v) return 0;
        const t = Date.parse(v);
        if (!isNaN(t)) return t;
        const m = v.match(/(\d{2})\/(\d{2})\/(\d{4})\s*(\d{2}):?(\d{2})?/);
        if (m) return new Date(+m[3], +m[2] - 1, +m[1], +m[4], +(m[5] || 0)).getTime();
        return 0;
      };
      if (toTime(c.ultimaoperacaoem) >= toTime(prev.ultimaoperacaoem)) map[s] = c;
    });
    return Object.values(map);
  }, [cruzamento]);

  const cruzBySerial = useMemo(() => {
    const m: Record<string, CruzamentoSapGestech> = {};
    cruzamentoDedup.forEach((c) => { m[normSerial(c.serial)] = c; });
    return m;
  }, [cruzamentoDedup]);

  // Índices normalizados (sem zeros à esquerda) para Aplicados e SAP — melhora o hit-rate da busca em massa.
  const aplicadosBySerial = useMemo(() => {
    const m: Record<string, SerialAplicado> = {};
    aplicados.forEach((a) => { const k = normSerial(a.serial); if (k) m[k] = a; });
    return m;
  }, [aplicados]);
  const sapBySerial = useMemo(() => {
    const m: Record<string, SaldoSap> = {};
    saldoSap.forEach((s) => { const k = normSerial(s.serial); if (k) m[k] = s; });
    return m;
  }, [saldoSap]);

  // Totais Gestech (somas das colunas), p/ painel "Bases ativas" e drilldown.
  const gestechTotals = useMemo(() => {
    const t = { saldo: 0, disponivel: 0, reversa: 0, devolucao: 0, defeito: 0, bloqueado: 0, achegar: 0, emtransito: 0 };
    saldoGestech.forEach((g: any) => {
      t.saldo       += g.saldo       || 0;
      t.disponivel  += g.disponivel  || 0;
      t.reversa     += g.reversa     || 0;
      t.devolucao   += g.devolucao   || 0;
      t.defeito     += g.defeito     || 0;
      t.bloqueado   += g.bloqueado   || 0;
      t.achegar     += g.achegar     || 0;
      t.emtransito  += g.emtransito  || 0;
    });
    return t;
  }, [saldoGestech]);

  // Lista única de códigos de material disponíveis nas bases (p/ filtro por código)
  const codigosDisponiveis = useMemo(() => {
    const s = new Set<string>();
    saldoGestech.forEach((g: any) => g.codigo_material && s.add(String(g.codigo_material)));
    cruzamentoDedup.forEach((c) => c.codmat && s.add(String(c.codmat)));
    saldoSap.forEach((x) => x.codigo_material && s.add(String(x.codigo_material)));
    return Array.from(s).sort();
  }, [saldoGestech, cruzamentoDedup, saldoSap]);

  // QR Code state — popup discreto ao clicar no botão ao lado do serial.
  const [qrSerial, setQrSerial] = useState<string | null>(null);

  /* ============================================================
     Uploads
     ============================================================ */
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: string) => {
    if (!isAdmin) {
      toast.error("Apenas administradores podem carregar/sobrepor bases.");
      e.target.value = "";
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;

    // Caso especial: ALL_GPON_ONU.ZIP — várias CSVs empilhadas (header na linha 10)
    if (type === "aplicados" && /\.zip$/i.test(file.name)) {
      (async () => {
        try {
          toast.info("Processando ZIP de Ativos na Planta… pode levar alguns segundos.");
          const buf = await file.arrayBuffer();
          const zip = await JSZip.loadAsync(buf);
          const csvEntries = Object.values(zip.files).filter(
            (f) => !f.dir && /\.csv$/i.test(f.name),
          );
          if (csvEntries.length === 0) {
            toast.error("Nenhum CSV encontrado dentro do ZIP.");
            return;
          }
          const parsed: SerialAplicado[] = [];
          for (const entry of csvEntries) {
            const text = await entry.async("string");
            // Detecta separador (na maioria das vezes vírgula; alguns sistemas usam ; ou tab)
            const firstLines = text.split(/\r?\n/).slice(0, 15).join("\n");
            let delim: string = ",";
            if ((firstLines.match(/;/g) || []).length > (firstLines.match(/,/g) || []).length) delim = ";";
            else if ((firstLines.match(/\t/g) || []).length > (firstLines.match(/,/g) || []).length) delim = "\t";

            // Pula primeiras 9 linhas; usa a 10ª como cabeçalho.
            const wb = XLSX.read(text, { type: "string", FS: delim, raw: false });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json<any>(sheet, { defval: "", raw: false, range: 9 });
            rows.forEach((r: any) => {
              const sn = norm(pick(r, ["SN", "sn", "Serial Number", "SERIAL NUMBER"]));
              // SN normalmente vem como "VENDOR1234 (REALSERIAL)" — extrai o que está entre parênteses
              const m = sn.match(/\(([^)]+)\)/);
              const serial = upper(m ? m[1] : sn);
              if (!serial) return;
              const alias = norm(pick(r, ["Alias", "ALIAS"]));
              const deviceName = norm(pick(r, ["DEVICE NAME", "Device Name", "DeviceName"]));
              const onuLocation = norm(pick(r, ["NAME", "Name"]));
              parsed.push({
                serial,
                codigo_material: norm(pick(r, ["EQUIP TYPE", "Equip Type", "EQUIPMENT TYPE", "VENDOR"])),
                nome_material: deviceName || norm(pick(r, ["MODEL", "Model"])),
                cliente: alias, // identificação do cliente (GPON)
                gpon: onuLocation, // ONU/frame/slot/port/onuID
                alias,
                data_instalacao: norm(pick(r, ["DATE", "Date", "INSTALL DATE", "Install Date"])),
                tecnico_instalador: "",
              });
            });
          }
          // Dedup por serial (mantém última ocorrência)
          const map: Record<string, SerialAplicado> = {};
          parsed.forEach((p) => { map[upper(p.serial)] = p; });
          const finalRows = Object.values(map);
          setAplicados(finalRows);
          await saveBase(KEY_APLICADOS, finalRows, "aplicados");
          toast.success(`${finalRows.length} seriais aplicados importados do ZIP (${csvEntries.length} CSV(s)).`);
        } catch (err: any) {
          toast.error("Erro ao processar ZIP: " + (err?.message || "desconhecido"));
        } finally {
          e.target.value = "";
        }
      })();
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array", cellDates: true });

        if (type === "presenca") {
          // Conforme orientação: usar EXCLUSIVAMENTE a aba "Técnicos" da planilha Presença.
          const hasTec = workbook.SheetNames.find((n) => upper(n) === "TÉCNICOS" || upper(n) === "TECNICOS");
          if (!hasTec) {
            toast.error("Aba 'Técnicos' não encontrada na planilha. Verifique se está enviando a Presença.xlsx correta.");
            return;
          }
          const j = XLSX.utils.sheet_to_json<any>(workbook.Sheets[hasTec], { defval: "", raw: false });
          const parsed: DimPresenca[] = j.map((r: any) => ({
            tr: upper(pick(r, ["TR"])),
            tt: upper(pick(r, ["TT"])),
            funcionario: norm(pick(r, ["FUNCIONÁRIO", "FUNCIONARIO", "Funcionário", "Funcionario", "Nome"])),
            funcao: norm(pick(r, ["FUNÇÃO", "FUNCAO", "Função"])),
            operadora: norm(pick(r, ["OPERADORA"])),
            supervisor: norm(pick(r, ["SUPERVISOR"])),
            coordenador: norm(pick(r, ["COORDENADOR"])),
            setor_origem: norm(pick(r, ["SETOR ORIGEM", "SETOR_ORIGEM"])),
            setor_atual: norm(pick(r, ["SETOR ATUAL", "SETOR_ATUAL"])),
            status: norm(pick(r, ["Status", "STATUS"])),
            municipio: norm(pick(r, ["MUNICIPIO", "MUNICÍPIO"])),
            uf: norm(pick(r, ["UF"])),
          })).filter((p) => p.tt || p.tr);
          setPresenca(parsed); saveBase(KEY_PRESENCA, parsed, "presenca");
          toast.success(`${parsed.length} colaboradores importados (aba Técnicos).`);
          return;
        }

        if (type === "gestech") {
          // Planilha vinda do sistema possui 2 linhas de título — header está na linha 3.
          const j = readSheetForcedHeader(workbook, 3);
          // Mapeia linhas, filtra ONT/ROTEADOR/MESH/REPETIDOR
          const rows = j.map((r: any) => ({
            tt: upper(pick(r, ["codarmazem", "matricula", "matricula_tt", "Matrícula"])),
            nome: norm(pick(r, ["armazem", "nome_tecnico", "Nome Técnico", "Nome"])),
            codmat: norm(pick(r, ["codmaterial", "codigo_material", "Código"])),
            mat: norm(pick(r, ["material", "nome_material", "Material"])),
            saldo: numberOr0(pick(r, ["saldo", "Saldo", "Quantidade", "quantidade", "Qtd"])),
            disponivel: numberOr0(pick(r, ["disponivel", "Disponivel", "disponível", "Disponível"])),
            reversa: numberOr0(pick(r, ["reversa", "Reversa"])),
            devolucao: numberOr0(pick(r, ["devolucao", "Devolucao", "devolução", "Devolução"])),
            defeito: numberOr0(pick(r, ["defeito", "Defeito"])),
            bloqueado: numberOr0(pick(r, ["bloqueado", "Bloqueado"])),
            achegar: numberOr0(pick(r, ["achegar", "a chegar", "A Chegar", "A_Chegar", "aChegar"])),
            emtransito: numberOr0(pick(r, ["emtransito", "em transito", "Em Transito", "em_transito", "Em Trânsito", "emtrânsito"])),
          })).filter((x) => x.tt && x.codmat && isAllowedMaterial(x.mat));

          // Soma por TT + codmaterial
          const agg: Record<string, SaldoGestech> = {};
          rows.forEach((x) => {
            const k = `${x.tt}|${x.codmat}`;
            if (!agg[k]) {
              const dim = enrichByTT(x.tt);
              agg[k] = {
                matricula_tt: x.tt,
                nome_tecnico: dim?.funcionario || x.nome,
                codigo_material: x.codmat,
                nome_material: x.mat,
                quantidade: 0,
                saldo: 0, disponivel: 0, reversa: 0, devolucao: 0,
                defeito: 0, bloqueado: 0, achegar: 0, emtransito: 0,
              };
            }
            agg[k].saldo       += x.saldo;
            agg[k].disponivel  += x.disponivel;
            agg[k].reversa     += x.reversa;
            agg[k].devolucao   += x.devolucao;
            agg[k].defeito     += x.defeito;
            agg[k].bloqueado   += x.bloqueado;
            agg[k].achegar     += x.achegar;
            agg[k].emtransito  += x.emtransito;
            // "quantidade" mantém o saldo total p/ compatibilidade com telas existentes
            agg[k].quantidade = agg[k].saldo;
          });
          const parsed = Object.values(agg).filter((x) =>
            (x.saldo + x.disponivel + x.reversa + x.devolucao + x.defeito + x.bloqueado + x.achegar + x.emtransito) > 0,
          );
          setSaldoGestech(parsed); saveBase(KEY_GESTECH, parsed, "gestech");
          toast.success(`${parsed.length} itens consolidados (ONT/ROTEADOR/MESH/REPETIDOR) por técnico.`);
          return;
        }

        if (type === "sap") {
          const j = readSheetAsJson(workbook);
          const parsed: SaldoSap[] = j.map((r: any) => ({
            serial: upper(pick(r, ["Nº de série", "N° de série", "No de serie", "Nº Série", "Nº Serie", "serial", "Serial"])),
            codigo_material: norm(pick(r, ["Material", "codigo_material", "Código"])),
            nome_material: norm(pick(r, ["Texto breve material", "nome_material", "Material descricao"])),
            centro: norm(pick(r, ["Centro"])),
            deposito: norm(pick(r, ["Depósito", "Deposito"])),
            modificado_em: norm(pick(r, ["Modificado em"])),
            modificado_por: norm(pick(r, ["Modificado por"])),
            status_sap: norm(pick(r, ["Status do sistema", "Status", "Status SAP"])),
            lote: norm(pick(r, ["Lote"])),
          })).filter((r) => r.serial && isOntOrRoteador(r.nome_material));
          setSaldoSap(parsed); saveBase(KEY_SAP, parsed, "sap");
          toast.success(`${parsed.length} seriais SAP importados (ONT/ROTEADOR).`);
          return;
        }

        if (type === "cruzamento") {
          // Planilha do sistema: 2 linhas de título; cabeçalho na linha 3.
          const j = readSheetForcedHeader(workbook, 3);
          const parsed: CruzamentoSapGestech[] = j.map((r: any) => ({
            serial: upper(pick(r, ["serial", "Serial"])),
            codmat: norm(pick(r, ["codmat", "codigo_material", "Código"])),
            material: norm(pick(r, ["material", "Material"])),
            codarm: upper(pick(r, ["codarm", "codarmazem"])),
            armazem: norm(pick(r, ["armazem", "Armazem", "Armazém"])),
            empresa: norm(pick(r, ["empresa"])),
            centro: norm(pick(r, ["centro"])),
            deposito: norm(pick(r, ["deposito", "Depósito"])),
            ultimaoperacaoem: norm(pick(r, ["ultimaoperacaoem", "Ultima Operacao Em", "Última Operação Em"])),
            matricula: upper(pick(r, ["matricula", "Matrícula"])),
            efetuadapor: norm(pick(r, ["efetuadapor", "efetuado por", "Efetuado Por"])),
            tipooperacao: norm(pick(r, ["tipooperacao", "Tipo Operacao", "Tipo Operação"])),
            notas: norm(pick(r, ["notas", "observacao", "Observação"])),
            dataultimaaplicacao: norm(pick(r, ["dataultimaaplicacao"])),
            dataultimareversa: norm(pick(r, ["dataultimareversa"])),
          })).filter((r) => r.serial);
          setCruzamento(parsed); saveBase(KEY_CRUZAMENTO, parsed, "cruzamento");
          toast.success(`${parsed.length} linhas brutas importadas (cruzamento). Última operação por serial será aplicada automaticamente.`);
          return;
        }

        if (type === "aplicados") {
          const j = readSheetAsJson(workbook);
          const parsed: SerialAplicado[] = j.map((r: any) => ({
            serial: upper(pick(r, ["Serial", "serial"])),
            codigo_material: norm(pick(r, ["Código", "Codigo", "codigo_material"])),
            nome_material: norm(pick(r, ["Material", "nome_material", "Modelo"])),
            cliente: norm(pick(r, ["Cliente", "cliente"])),
            gpon: norm(pick(r, ["GPON", "gpon", "Porta GPON"])),
            alias: norm(pick(r, ["Alias", "alias"])),
            data_instalacao: norm(pick(r, ["Data Instalação", "Data Instalacao", "data_instalacao"])),
            tecnico_instalador: norm(pick(r, ["Técnico", "Tecnico", "tecnico_instalador"])),
          })).filter((r) => r.serial);
          setAplicados(parsed); saveBase(KEY_APLICADOS, parsed, "aplicados");
          toast.success(`${parsed.length} seriais aplicados importados.`);
          return;
        }
      } catch (err: any) {
        toast.error("Erro ao processar arquivo: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDownloadTemplate = (type: string) => {
    let headers: string[] = [];
    let example: any[][] = [];
    if (type === "presenca") {
      headers = ["UF","TR","TT","FUNCIONÁRIO","FUNÇÃO","OPERADORA","SUPERVISOR","COORDENADOR","SETOR ORIGEM","SETOR ATUAL","Status","MUNICIPIO"];
      example = [["SC","TR537702","TT826817","EVELTON AMARAL DOS SANTOS","TÉCNICO MULTIFUNCIONAL","TENANT/NIO","CARLOS ROGERIO DA SILVA","JUNIOMAR MOCHNACZ","SC.VL2.BCU.11","SC.VL2.BCU.11","Ativo","RIO DO SUL"]];
    } else if (type === "gestech") {
      headers = ["codarmazem","armazem","codmaterial","material","saldo"];
      example = [["TT826817","EVELTON AMARAL DOS SANTOS","3000123","ONT NOKIA G-1425G-A",3]];
    } else if (type === "sap") {
      headers = ["Material","Texto breve material","Nº de série","Centro","Depósito","Modificado em","Modificado por","Status do sistema","Lote"];
      example = [["3000331755","ROTEADOR CPE DATACOM DM2500","6658051","1599","TA01","2026-03-06","SISPS4GES","DEPS","GTECH"]];
    } else if (type === "cruzamento") {
      headers = ["serial","codmat","material","codarm","armazem","empresa","centro","deposito","ultimaoperacaoem","matricula","efetuadapor","tipooperacao","notas"];
      example = [["6658051","3000331755","ROTEADOR CPE DATACOM DM2500","TT826817","EVELTON AMARAL","MRED","1599","TA01","2026-05-15 09:00","TT826817","EVELTON AMARAL","Aplicacao","OK"]];
    } else if (type === "aplicados") {
      headers = ["Serial","Código","Material","Cliente","GPON","Alias","Data Instalação","Técnico"];
      example = [["6658051","3000331755","ROTEADOR CPE DATACOM DM2500","Maria Souza","OLT-SP-LAPA-01 1/1/2/4","SP-LAPA-ONT-4562","2026-05-10","Evelton Amaral"]];
    }
    const ws = XLSX.utils.aoa_to_sheet([headers, ...example]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, `modelo_base_${type}.xlsx`);
    toast.success(`Modelo de base ${type.toUpperCase()} baixado.`);
  };

  /* ============================================================
     Consulta dinâmica
     ============================================================ */
  const runTechnicianResult = (tt: string) => {
    const dim = enrichByTT(tt);
    const techGestech = saldoGestech.filter((g) => upper(g.matricula_tt) === upper(tt));
    // Seriais associados via Cruzamento (última operação)
    const seriaisTec = cruzamentoDedup.filter(
      (c) => upper(c.codarm) === upper(tt) || upper(c.matricula) === upper(tt),
    );
    if (techGestech.length === 0 && seriaisTec.length === 0 && !dim) {
      return { type: "empty", message: "Nenhum técnico localizado com essa matrícula." };
    }
    const nome = dim?.funcionario || techGestech[0]?.nome_tecnico || tt;
    const supervisor = dim?.supervisor || "—";
    const coordenador = dim?.coordenador || "—";
    const tr = dim?.tr || "—";

    let materials = techGestech.map((i) => ({
      codigo: i.codigo_material, nome: i.nome_material, quantidade: i.quantidade,
    }));

    // Fallback: se não houver carga consolidada do Gestech, deriva materiais agrupando os seriais do Cruzamento.
    if (materials.length === 0 && seriaisTec.length > 0) {
      const agg: Record<string, { codigo: string; nome: string; quantidade: number }> = {};
      seriaisTec.forEach((c) => {
        if (!isOntOrRoteador(c.material)) return;
        const k = `${c.codmat}|${c.material}`;
        if (!agg[k]) agg[k] = { codigo: c.codmat, nome: c.material, quantidade: 0 };
        agg[k].quantidade += 1;
      });
      materials = Object.values(agg);
    }

    const serials = seriaisTec.map((c) => {
      const key = normSerial(c.serial);
      const aplic = aplicadosBySerial[key];
      const sap = sapBySerial[key];
      return {
        serial: c.serial,
        codigo: c.codmat,
        modelo: c.material,
        status: aplic ? "Aplicado no Cliente" : (sap ? "Com Técnico (Físico)" : "No Cruzamento"),
        deposito: sap?.deposito || c.deposito || "—",
        crossStatus: c.tipooperacao || "—",
        obs: aplic ? `Cliente: ${aplic.cliente} | GPON: ${aplic.gpon}` : (c.notas || `Última op.: ${c.ultimaoperacaoem}`),
      };
    });

    return { type: "technician", matricula: tt, tr, nome, supervisor, coordenador, materials, serials };
  };

  const handleDynamicSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setHasSearched(true);
    const q = searchQuery.trim();
    if (!q) { setSearchResults(null); return; }
    const Q = q.toLowerCase();

    if (searchType === "supervisor" || searchType === "coordenador") {
      const field = searchType === "supervisor" ? "supervisor" : "coordenador";
      const matched = presenca.filter((p) => (p as any)[field].toLowerCase().includes(Q));
      if (matched.length === 0) {
        setSearchResults({ type: "empty", message: `Nenhum colaborador encontrado para o(a) ${field}.` });
        return;
      }
      const techs = matched.map((p) => {
        const total = saldoGestech.filter((g) => upper(g.matricula_tt) === upper(p.tt)).reduce((s, i) => s + i.quantidade, 0);
        return { matricula: p.tt, tr: p.tr, nome: p.funcionario, supervisor: p.supervisor, coordenador: p.coordenador, materialsCount: total };
      });
      const res = { type: "supervisor", supervisorName: matched[0][field === "supervisor" ? "supervisor" : "coordenador"], technicians: techs };
      setSearchResults(res);
      setSupervisorContext(res); // guarda contexto p/ "voltar à equipe"
      return;
    }

    if (searchType === "tr") {
      const p = enrichByTR(q);
      if (!p) { setSearchResults({ type: "empty", message: "TR não localizado na base de Presença." }); return; }
      setSearchResults(runTechnicianResult(p.tt));
      return;
    }

    if (searchType === "matricula") { setSupervisorContext(null); setSearchResults(runTechnicianResult(q)); return; }

    if (searchType === "nome") {
      const p = presenca.find((x) => x.funcionario.toLowerCase().includes(Q));
      const tt = p?.tt || saldoGestech.find((g) => g.nome_tecnico.toLowerCase().includes(Q))?.matricula_tt;
      if (!tt) { setSearchResults({ type: "empty", message: "Nenhum técnico encontrado pelo nome." }); return; }
      setSupervisorContext(null);
      setSearchResults(runTechnicianResult(tt));
      return;
    }

    if (searchType === "serial") {
      const S = upper(q);
      const K = normSerial(q);
      const aplic = aplicadosBySerial[K];
      const sap = sapBySerial[K];
      const cross = cruzBySerial[K];
      if (!aplic && !sap && !cross) {
        setSearchResults({ type: "empty", message: "Serial não localizado em nenhuma das bases ativas." });
        return;
      }
      let status = "Não Localizado", details: any = {};
      if (aplic) {
        status = "Aplicado no Sistema";
        details = { ...aplic, modelo: aplic.nome_material, codigo: aplic.codigo_material, tecnico: aplic.tecnico_instalador };
      } else if (cross) {
        const dim = enrichByTT(cross.codarm) || enrichByTT(cross.matricula);
        status = "Com Técnico (Físico)";
        details = {
          tecnico: dim?.funcionario || cross.armazem || cross.efetuadapor || "—",
          matricula: cross.codarm || cross.matricula,
          tr: dim?.tr || "—",
          supervisor: dim?.supervisor || "—",
          coordenador: dim?.coordenador || "—",
          deposito: sap?.deposito || cross.deposito || "—",
          statusSap: sap?.status_sap || "—",
          modelo: cross.material || sap?.nome_material,
          codigo: cross.codmat || sap?.codigo_material,
          ultimaOperacao: cross.ultimaoperacaoem,
          tipoOperacao: cross.tipooperacao,
        };
      } else if (sap) {
        status = "Disponível em Depósito SAP";
        details = { modelo: sap.nome_material, codigo: sap.codigo_material, deposito: sap.deposito, statusSap: sap.status_sap, modificadoPor: sap.modificado_por };
      }
      setSearchResults({ type: "serial", serial: S, status, details });
      return;
    }

    if (searchType === "codigo") {
      const codes = Array.from(new Set(q.split(/[,;\n\t]+/).map((c) => c.trim()).filter(Boolean)));
      if (codes.length === 0) { setSearchResults({ type: "empty", message: "Informe ao menos um código de material." }); return; }

      // Por código: agrupar por Supervisor → Técnico (vindo de Cruzamento + Gestech) e por Depósito (vindo de SAP)
      type TechAgg = { matricula: string; tr: string; nome: string; supervisor: string; coordenador: string; quantidade: number };
      const bySupervisor: Record<string, { supervisor: string; total: number; techs: Record<string, TechAgg> }> = {};
      const byDeposito: Record<string, number> = {};

      // 1) Saldo Gestech por TT (somas confiáveis)
      saldoGestech.forEach((g: any) => {
        if (!codes.includes(String(g.codigo_material))) return;
        const dim = enrichByTT(g.matricula_tt);
        const sup = dim?.supervisor || "—";
        const coord = dim?.coordenador || "—";
        if (!bySupervisor[sup]) bySupervisor[sup] = { supervisor: sup, total: 0, techs: {} };
        const tt = g.matricula_tt;
        if (!bySupervisor[sup].techs[tt]) {
          bySupervisor[sup].techs[tt] = { matricula: tt, tr: dim?.tr || "—", nome: dim?.funcionario || g.nome_tecnico, supervisor: sup, coordenador: coord, quantidade: 0 };
        }
        bySupervisor[sup].techs[tt].quantidade += g.quantidade || 0;
        bySupervisor[sup].total += g.quantidade || 0;
      });

      // 2) Depósito a partir do SAP (almoxarifado) — somente para os códigos pedidos
      saldoSap.forEach((x) => {
        if (!codes.includes(String(x.codigo_material))) return;
        const dep = x.deposito || "—";
        byDeposito[dep] = (byDeposito[dep] || 0) + 1;
      });

      const supervisores = Object.values(bySupervisor)
        .map((s) => ({ ...s, techs: Object.values(s.techs).sort((a, b) => b.quantidade - a.quantidade) }))
        .sort((a, b) => b.total - a.total);
      const depositos = Object.entries(byDeposito).map(([deposito, qtd]) => ({ deposito, qtd })).sort((a, b) => b.qtd - a.qtd);
      const totalGeral = supervisores.reduce((s, x) => s + x.total, 0);

      if (supervisores.length === 0 && depositos.length === 0) {
        setSearchResults({ type: "empty", message: "Nenhum equipamento encontrado para os códigos informados." });
        return;
      }
      setSupervisorContext(null);
      setExpandedSupervisor(null);
      setSearchResults({ type: "codigo", codes, supervisores, depositos, totalGeral });
      return;
    }
  };

  const handleSelectTechnician = (matricula: string) => {
    setSearchType("matricula");
    setSearchQuery(matricula);
    setHasSearched(true);
    // mantém supervisorContext caso já exista — permite voltar
    setSearchResults(runTechnicianResult(matricula));
  };

  const handleBackToSupervisor = () => {
    if (!supervisorContext) return;
    setSearchType("supervisor");
    setSearchQuery(supervisorContext.supervisorName || "");
    setSearchResults(supervisorContext);
  };

  /* ============================================================
     Busca em massa
     ============================================================ */
  const handleMassSearch = () => {
    if (!massInput.trim()) { toast.warning("Insira ao menos um serial."); return; }
    setSearchingMass(true);
    const seriais = Array.from(new Set(massInput.split(/[\n,; \t]+/).map(upper).filter(Boolean)));
    let wt = 0, ap = 0, nf = 0;
    const results = seriais.map((serial) => {
      const key = normSerial(serial);
      const aplic = aplicadosBySerial[key];
      if (aplic) {
        ap++;
        return { serial, status: "aplicado", equipamento: `${aplic.nome_material} (${aplic.codigo_material})`, detalhes: `Cliente: ${aplic.cliente} | GPON: ${aplic.gpon} | Alias: ${aplic.alias}` };
      }
      const cross = cruzBySerial[key];
      if (cross) {
        const dim = enrichByTT(cross.codarm) || enrichByTT(cross.matricula);
        wt++;
        return {
          serial, status: "tecnico",
          equipamento: `${cross.material} (${cross.codmat})`,
          tecnico: dim?.funcionario || cross.armazem || cross.efetuadapor,
          matricula: cross.codarm || cross.matricula,
          tr: dim?.tr || "—",
          supervisor: dim?.supervisor || "—",
          coordenador: dim?.coordenador || "—",
          detalhes: `Com: ${dim?.funcionario || cross.armazem || "—"} | TT: ${cross.codarm || cross.matricula} | Sup: ${dim?.supervisor || "—"} | Coord: ${dim?.coordenador || "—"} | Última op.: ${cross.ultimaoperacaoem}`,
        };
      }
      const sap = sapBySerial[key];
      if (sap) {
        // Sem cruzamento => está no almoxarifado / depósito SAP, sem técnico atribuído.
        wt++;
        return { serial, status: "almox", equipamento: `${sap.nome_material} (${sap.codigo_material})`, detalhes: `Almoxarifado SAP — Depósito: ${sap.deposito} | Centro: ${sap.centro} | Status: ${sap.status_sap}` };
      }
      nf++;
      return { serial, status: "not_found", equipamento: "—", detalhes: "Não localizado em nenhuma base (Aplicados / Cruzamento / SAP)" };
    });
    setMassResults(results);
    setMassStats({ total: seriais.length, withTech: wt, applied: ap, notFound: nf });
    setSearchingMass(false);
    toast.success(`${seriais.length} seriais processados.`);
  };

  const handleExportMassResults = () => {
    if (massResults.length === 0) return;
    const dataToExport = massResults.map((r) => ({
      "Número de Série": r.serial,
      "Status Localização":
        r.status === "aplicado" ? "Aplicado no Sistema" :
        r.status === "tecnico"  ? "Com Técnico (Físico)" :
        r.status === "almox"    ? "Almoxarifado / Depósito SAP" :
        "Não Encontrado",
      "Equipamento / Modelo": r.equipamento,
      "Matrícula TT": r.matricula || "",
      "TR": r.tr || "",
      "Técnico": r.tecnico || "",
      "Supervisor": r.supervisor || "",
      "Coordenador": r.coordenador || "",
      "Informações": r.detalhes,
    }));
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rastreabilidade Massa");
    XLSX.writeFile(wb, `resultado_rastreabilidade_massa_${new Date().toISOString().split("T")[0]}.xlsx`);
    toast.success("Excel gerado.");
  };

  // Exporta a carga de UM técnico (materiais + seriais detalhados)
  const handleExportTechnician = (tech: any) => {
    if (!tech) return;
    const wb = XLSX.utils.book_new();
    const head = [{
      "Matrícula TT": tech.matricula,
      "TR": tech.tr,
      "Nome": tech.nome,
      "Supervisor": tech.supervisor,
      "Coordenador": tech.coordenador,
    }];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(head), "Resumo");

    const mats = (tech.materials || []).map((m: any) => ({
      "Matrícula TT": tech.matricula,
      "Técnico": tech.nome,
      "Código": m.codigo,
      "Material": m.nome,
      "Quantidade": m.quantidade,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mats), "Materiais");

    const serials = (tech.serials || []).map((s: any) => ({
      "Matrícula TT": tech.matricula,
      "Técnico": tech.nome,
      "Supervisor": tech.supervisor,
      "Coordenador": tech.coordenador,
      "Serial": s.serial,
      "Código": s.codigo,
      "Equipamento": s.modelo,
      "Status": s.status,
      "Operação": s.crossStatus,
      "Depósito": s.deposito,
      "Observações": s.obs,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(serials), "Seriais");

    const safe = (tech.nome || tech.matricula || "tecnico").toString().replace(/[^a-z0-9]+/gi, "_").slice(0, 40);
    XLSX.writeFile(wb, `carga_${safe}_${new Date().toISOString().split("T")[0]}.xlsx`);
    toast.success("Carga do técnico exportada.");
  };

  // Exporta a carga de TODA uma equipe (supervisor/coordenador) com seriais consolidados
  const handleExportSupervisor = () => {
    if (!searchResults || searchResults.type !== "supervisor") return;
    const techs: any[] = searchResults.technicians || [];
    if (techs.length === 0) return;
    const allMats: any[] = [];
    const allSerials: any[] = [];
    techs.forEach((t) => {
      const full = runTechnicianResult(t.matricula);
      if (!full || full.type !== "technician") return;
      (full.materials || []).forEach((m: any) => allMats.push({
        "Matrícula TT": full.matricula, "TR": full.tr, "Técnico": full.nome,
        "Supervisor": full.supervisor, "Coordenador": full.coordenador,
        "Código": m.codigo, "Material": m.nome, "Quantidade": m.quantidade,
      }));
      (full.serials || []).forEach((s: any) => allSerials.push({
        "Matrícula TT": full.matricula, "TR": full.tr, "Técnico": full.nome,
        "Supervisor": full.supervisor, "Coordenador": full.coordenador,
        "Serial": s.serial, "Código": s.codigo, "Equipamento": s.modelo,
        "Status": s.status, "Operação": s.crossStatus, "Depósito": s.deposito,
        "Observações": s.obs,
      }));
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(techs.map((t: any) => ({
      "Matrícula TT": t.matricula, "TR": t.tr, "Técnico": t.nome,
      "Supervisor": t.supervisor, "Coordenador": t.coordenador, "Itens (qtd)": t.materialsCount,
    }))), "Equipe");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(allMats), "Materiais");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(allSerials), "Seriais");
    const safe = (searchResults.supervisorName || "equipe").toString().replace(/[^a-z0-9]+/gi, "_").slice(0, 40);
    XLSX.writeFile(wb, `carga_equipe_${safe}_${new Date().toISOString().split("T")[0]}.xlsx`);
    toast.success("Carga da equipe exportada.");
  };

  /* ============================================================
     UI
     ============================================================ */
  const BaseCard = ({ color, title, desc, count, ts, type, longDesc }: any) => (
    <Card className="border-slate-100 shadow-sm bg-white rounded-xl overflow-hidden">
      <CardHeader className="pb-4 border-b border-slate-100 bg-slate-50/50">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${color}`}></span>
              {title}
            </CardTitle>
            <CardDescription className="text-xs mt-1">{desc}</CardDescription>
          </div>
          <div className="text-right">
            <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200">
              {count} Linhas
            </Badge>
            <p className="text-[9px] text-slate-400 mt-1">Modificado: {ts || "—"}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6 space-y-4">
        <p className="text-xs text-slate-500 leading-relaxed">{longDesc}</p>
        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <div className="flex-1 relative">
            <input type="file" accept=".xlsx, .xls, .csv" className="hidden" id={`upload-${type}`} onChange={(e) => handleFileUpload(e, type)} />
            <label htmlFor={`upload-${type}`}>
              <Button asChild variant="outline" className="w-full text-xs border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer">
                <span><Upload className="w-3.5 h-3.5 mr-2" />Importar Planilha</span>
              </Button>
            </label>
          </div>
          <Button variant="ghost" className="text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-50" onClick={() => handleClearBase(type)}>
            <Trash2 className="w-3.5 h-3.5 mr-1" /> Limpar Base
          </Button>
        </div>
        <Button variant="link" className="text-xs text-sky-600 h-auto p-0 font-medium" onClick={() => handleDownloadTemplate(type)}>
          <Download className="w-3 h-3 mr-1" /> Baixar Template Estruturado (.xlsx)
        </Button>
      </CardContent>
    </Card>
  );

  return (
    <div className="flex flex-col h-full bg-slate-50/50 p-6 overflow-y-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-sky-50 text-sky-600 rounded-xl"><ScanBarcode className="w-6 h-6" /></div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Rastreabilidade de ONT</h1>
            <p className="text-xs text-slate-500 mt-0.5">Cruzamento de SAP, Gestech, Presença e Aplicados — chave primária TT/TR</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="px-3 py-1 bg-sky-50 text-sky-700 hover:bg-sky-50/80 font-medium text-xs rounded-full">
            <Users className="w-3 h-3 mr-1.5" /> {presenca.length} colaboradores ativos
          </Badge>
          <Badge variant="secondary" className="px-3 py-1 bg-slate-100 text-slate-700 font-medium text-xs rounded-full">
            <Database className="w-3 h-3 mr-1.5" /> Local Cache
          </Badge>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-6">
        <TabsList className="bg-slate-100/80 p-1 rounded-xl border border-slate-200/50 w-full md:w-auto flex md:inline-flex">
          <TabsTrigger value="consultas" className="flex-1 md:flex-none rounded-lg text-xs py-2 px-4"><Search className="w-3.5 h-3.5 mr-2" />Consultas Dinâmicas</TabsTrigger>
          <TabsTrigger value="massa" className="flex-1 md:flex-none rounded-lg text-xs py-2 px-4"><Layers className="w-3.5 h-3.5 mr-2" />Busca em Massa</TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="bases" className="flex-1 md:flex-none rounded-lg text-xs py-2 px-4"><Database className="w-3.5 h-3.5 mr-2" />Gerenciamento de Bases</TabsTrigger>
          )}
        </TabsList>

        {/* CONSULTAS */}
        <TabsContent value="consultas" className="space-y-6 outline-none">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-1 border-slate-100 shadow-sm bg-white rounded-xl">
              <CardHeader className="pb-4">
                <CardTitle className="text-sm font-semibold text-slate-800">Filtro de Consulta</CardTitle>
                <CardDescription className="text-xs">Consulte por TT, TR, nome, supervisor, coordenador ou serial</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleDynamicSearch} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-600">Consultar por:</label>
                    <Select value={searchType} onValueChange={(v: any) => { setSearchType(v); setSearchQuery(""); setHasSearched(false); setSearchResults(null); setSupervisorContext(null); setExpandedSupervisor(null); }}>
                      <SelectTrigger className="w-full bg-slate-50 border-slate-200 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="matricula" className="text-xs">Matrícula TT</SelectItem>
                        <SelectItem value="tr" className="text-xs">TR</SelectItem>
                        <SelectItem value="nome" className="text-xs">Nome do Técnico</SelectItem>
                        <SelectItem value="serial" className="text-xs">Número de Série</SelectItem>
                        <SelectItem value="supervisor" className="text-xs">Supervisor</SelectItem>
                        <SelectItem value="coordenador" className="text-xs">Coordenador</SelectItem>
                        <SelectItem value="codigo" className="text-xs">Código de Equipamento</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-600">Termo de Busca:</label>
                    <div className="relative">
                      <Input
                        type="text"
                        placeholder={
                          searchType === "tr" ? "Ex: TR000000" :
                          searchType === "matricula" ? "Ex: TT000000" :
                          searchType === "serial" ? "Ex: 0000000000" :
                          searchType === "supervisor" ? "Ex: Nome do Supervisor" :
                          searchType === "coordenador" ? "Ex: Nome do Coordenador" :
                          searchType === "nome" ? "Ex: Nome do Técnico" :
                          searchType === "codigo" ? "Ex: 0000000000, 0000000001" :
                          "Digite o termo..."
                        }
                        className="bg-slate-50 border-slate-200 text-xs pr-10"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                      <Search className="absolute right-3.5 top-3 w-4 h-4 text-slate-400" />
                    </div>
                    {searchType === "codigo" && codigosDisponiveis.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <label className="text-[10px] font-semibold text-slate-500">Adicionar código da lista:</label>
                        <Select onValueChange={(code) => {
                          const cur = searchQuery.split(/[,;\n]+/).map((c) => c.trim()).filter(Boolean);
                          if (cur.includes(code)) return;
                          setSearchQuery([...cur, code].join(", "));
                        }}>
                          <SelectTrigger className="w-full bg-slate-50 border-slate-200 text-xs h-8"><SelectValue placeholder="Selecionar código..." /></SelectTrigger>
                          <SelectContent className="max-h-60">
                            {codigosDisponiveis.map((c) => (
                              <SelectItem key={c} value={c} className="text-xs font-mono">{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-[10px] text-slate-400">Você pode digitar vários códigos separados por vírgula.</p>
                      </div>
                    )}
                  </div>
                  <Button type="submit" className="w-full bg-sky-600 hover:bg-sky-700 text-white text-xs py-2.5 rounded-lg">
                    <Search className="w-3.5 h-3.5 mr-2" />Buscar Rastreabilidade
                  </Button>
                </form>
                <div className="mt-6 pt-5 border-t border-slate-100 space-y-2 text-[11px] text-slate-500">
                  <h4 className="text-xs font-semibold text-slate-700 mb-2">Bases ativas:</h4>
                  <p>• Presença (dim): <strong>{presenca.length}</strong></p>
                  <p className="flex items-center gap-1">
                    • Saldo Gestech: <strong>{gestechTotals.disponivel}</strong>
                    <button type="button" onClick={() => setShowGestechDrill((v) => !v)} className="ml-1 text-[10px] text-sky-600 hover:underline">
                      {showGestechDrill ? "ocultar" : "drill-down"}
                    </button>
                    <span className="text-slate-400">(linhas: {saldoGestech.length})</span>
                  </p>
                  {showGestechDrill && (
                    <div className="ml-3 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] bg-slate-50/60 p-2 rounded border border-slate-100">
                      <span>Saldo:</span>            <strong className="text-right">{gestechTotals.saldo}</strong>
                      <span>Disponível:</span>       <strong className="text-right">{gestechTotals.disponivel}</strong>
                      <span>Reversa:</span>          <strong className="text-right">{gestechTotals.reversa}</strong>
                      <span>Devolução:</span>        <strong className="text-right">{gestechTotals.devolucao}</strong>
                      <span>Defeito:</span>          <strong className="text-right">{gestechTotals.defeito}</strong>
                      <span>Bloqueado:</span>        <strong className="text-right">{gestechTotals.bloqueado}</strong>
                      <span>A Chegar:</span>         <strong className="text-right">{gestechTotals.achegar}</strong>
                      <span>Em Trânsito:</span>      <strong className="text-right">{gestechTotals.emtransito}</strong>
                    </div>
                  )}
                  <p>• Saldo SAP: <strong>{saldoSap.length}</strong></p>
                  <p>• Cruzamento (deduplicado): <strong>{cruzamentoDedup.length}</strong> / bruto <strong>{cruzamento.length}</strong></p>
                  <p>• Aplicados: <strong>{aplicados.length}</strong></p>
                </div>
              </CardContent>
            </Card>

            <div className="lg:col-span-2 space-y-6">
              {!hasSearched ? (
                <div className="h-[300px] bg-white border border-slate-100 rounded-xl flex flex-col items-center justify-center text-slate-400 p-6 shadow-sm">
                  <Search className="w-12 h-12 text-slate-200 mb-3" />
                  <p className="text-sm font-semibold text-slate-600">Pronto para Consulta</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-[320px] text-center">Selecione um filtro e digite o termo para consultar.</p>
                </div>
              ) : !searchResults ? (
                <div className="h-[300px] bg-white border border-slate-100 rounded-xl flex flex-col items-center justify-center text-rose-500 p-6 shadow-sm">
                  <AlertTriangle className="w-12 h-12 text-rose-200 mb-3" />
                  <p className="text-sm font-semibold text-rose-600">Nenhum resultado</p>
                </div>
              ) : searchResults.type === "empty" ? (
                <div className="h-[300px] bg-white border border-slate-100 rounded-xl flex flex-col items-center justify-center text-slate-500 p-6 shadow-sm">
                  <AlertCircle className="w-12 h-12 text-amber-200 mb-3" />
                  <p className="text-sm font-semibold text-amber-600">Nenhum registro localizado</p>
                  <p className="text-xs text-slate-500 mt-1 text-center max-w-[360px]">{searchResults.message}</p>
                </div>
              ) : searchResults.type === "supervisor" ? (
                <Card className="border-slate-100 shadow-sm rounded-xl bg-white">
                  <CardHeader className="pb-4 border-b border-slate-100">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Users className="w-5 h-5 text-sky-500" />
                        <div>
                          <CardTitle className="text-sm font-bold text-slate-800">Equipe</CardTitle>
                          <CardDescription className="text-xs">Liderança: <span className="font-semibold text-slate-700">{searchResults.supervisorName}</span></CardDescription>
                        </div>
                      </div>
                      <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-100 rounded-full font-semibold">{searchResults.technicians.length} técnicos</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <div className="flex justify-end mb-4">
                      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs" onClick={handleExportSupervisor}>
                        <FileSpreadsheet className="w-3.5 h-3.5 mr-2" />Exportar Carga da Equipe (.xlsx)
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {searchResults.technicians.map((tech: any) => (
                        <div key={tech.matricula} className="p-4 rounded-xl border border-slate-100 hover:border-sky-200 bg-slate-50/50 hover:bg-white transition-all shadow-sm group cursor-pointer" onClick={() => handleSelectTechnician(tech.matricula)}>
                          <div className="flex justify-between items-start">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-lg bg-sky-100/80 text-sky-600 flex items-center justify-center font-bold text-xs">{tech.nome.split(" ").slice(0,2).map((n: string) => n[0]).join("")}</div>
                              <div>
                                <h4 className="text-xs font-bold text-slate-800 group-hover:text-sky-600">{tech.nome}</h4>
                                <p className="text-[10px] text-slate-500 mt-0.5">TT: {tech.matricula} • TR: {tech.tr}</p>
                              </div>
                            </div>
                            <Badge className="bg-slate-200 text-slate-700 text-[10px] rounded-full">{tech.materialsCount} ITENS</Badge>
                          </div>
                          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[10px] text-sky-600 font-semibold">
                            <span>Ver Carga</span><ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ) : searchResults.type === "technician" ? (
                <div className="space-y-6">
                  {supervisorContext && (
                    <div className="flex justify-start">
                      <Button variant="outline" size="sm" className="text-xs border-slate-200" onClick={handleBackToSupervisor}>
                        <ArrowRight className="w-3.5 h-3.5 mr-2 rotate-180" /> Voltar à equipe de {supervisorContext.supervisorName}
                      </Button>
                    </div>
                  )}
                  <Card className="border-slate-100 shadow-sm rounded-xl bg-white">
                    <CardContent className="p-6">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-sky-50 text-sky-600 rounded-xl flex items-center justify-center"><User className="w-6 h-6" /></div>
                          <div>
                            <h3 className="text-sm font-bold text-slate-800">{searchResults.nome}</h3>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 mt-1">
                              <span>TT: <strong className="text-slate-700">{searchResults.matricula}</strong></span>
                              <span className="text-slate-300">•</span>
                              <span>TR: <strong className="text-slate-700">{searchResults.tr}</strong></span>
                              <span className="text-slate-300">•</span>
                              <span>Supervisor: <strong className="text-slate-700">{searchResults.supervisor}</strong></span>
                              <span className="text-slate-300">•</span>
                              <span>Coordenador: <strong className="text-slate-700">{searchResults.coordenador}</strong></span>
                            </div>
                          </div>
                        </div>
                        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100 border px-3 py-1 font-semibold rounded-full text-xs">Ativo</Badge>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-slate-100 shadow-sm rounded-xl bg-white">
                    <CardHeader className="pb-3 border-b border-slate-100">
                      <CardTitle className="text-sm font-bold text-slate-800">Materiais (ONT/ROTEADOR/MESH/REPETIDOR) — Gestech</CardTitle>
                      <CardDescription className="text-xs">Soma de saldo por código de material</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                      {searchResults.materials.length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-500">Sem itens na carga deste técnico.</div>
                      ) : (
                        <Table>
                          <TableHeader className="bg-slate-50/50"><TableRow className="border-b border-slate-100">
                            <TableHead className="text-xs font-semibold text-slate-600 py-3 pl-6">Código</TableHead>
                            <TableHead className="text-xs font-semibold text-slate-600 py-3">Material</TableHead>
                            <TableHead className="text-xs font-semibold text-slate-600 py-3 text-right pr-6">Quantidade</TableHead>
                          </TableRow></TableHeader>
                          <TableBody>
                            {searchResults.materials.map((m: any, i: number) => (
                              <TableRow key={i} className="border-b border-slate-100 hover:bg-slate-50/20">
                                <TableCell className="text-xs font-semibold text-slate-700 py-3 pl-6">{m.codigo}</TableCell>
                                <TableCell className="text-xs text-slate-600 py-3">{m.nome}</TableCell>
                                <TableCell className="text-xs font-bold text-slate-800 py-3 text-right pr-6"><span className="bg-sky-50 text-sky-700 px-2 py-0.5 rounded font-mono border border-sky-100">{m.quantidade}</span></TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                </div>
              ) : searchResults.type === "codigo" ? (
                <div className="space-y-6">
                  <Card className="border-slate-100 shadow-sm rounded-xl bg-white">
                    <CardHeader className="pb-3 border-b border-slate-100">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-sm font-bold text-slate-800">Equipamentos por Código</CardTitle>
                          <CardDescription className="text-xs">Códigos consultados: <span className="font-mono">{searchResults.codes.join(", ")}</span></CardDescription>
                        </div>
                        <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-100 rounded-full font-semibold">Total c/ técnico: {searchResults.totalGeral}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-2">
                      <p className="text-[11px] font-semibold text-slate-600 mb-1">Por Supervisor (clique para ver técnicos):</p>
                      {searchResults.supervisores.length === 0 ? (
                        <p className="text-xs text-slate-500">Nenhum equipamento atribuído a técnicos para os códigos.</p>
                      ) : (
                        <div className="space-y-2">
                          {searchResults.supervisores.map((sup: any) => (
                            <div key={sup.supervisor} className="border border-slate-100 rounded-lg overflow-hidden">
                              <button
                                type="button"
                                onClick={() => setExpandedSupervisor(expandedSupervisor === sup.supervisor ? null : sup.supervisor)}
                                className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50/60 hover:bg-slate-100/60 text-left"
                              >
                                <div className="flex items-center gap-2">
                                  <Users className="w-3.5 h-3.5 text-sky-500" />
                                  <span className="text-xs font-semibold text-slate-700">{sup.supervisor}</span>
                                  <Badge variant="outline" className="text-[10px] bg-white">{sup.techs.length} téc.</Badge>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-xs font-bold text-sky-700">{sup.total} itens</span>
                                  <ArrowRight className={`w-3.5 h-3.5 text-slate-400 transition-transform ${expandedSupervisor === sup.supervisor ? "rotate-90" : ""}`} />
                                </div>
                              </button>
                              {expandedSupervisor === sup.supervisor && (
                                <div className="px-3 py-2 bg-white border-t border-slate-100">
                                  <Table>
                                    <TableHeader><TableRow className="border-b border-slate-100">
                                      <TableHead className="text-[10px] py-2">Técnico</TableHead>
                                      <TableHead className="text-[10px] py-2">TT</TableHead>
                                      <TableHead className="text-[10px] py-2">TR</TableHead>
                                      <TableHead className="text-[10px] py-2 text-right">Qtd</TableHead>
                                      <TableHead className="text-[10px] py-2 w-16"></TableHead>
                                    </TableRow></TableHeader>
                                    <TableBody>
                                      {sup.techs.map((t: any) => (
                                        <TableRow key={t.matricula} className="border-b border-slate-100 hover:bg-slate-50/40">
                                          <TableCell className="text-xs py-2">{t.nome}</TableCell>
                                          <TableCell className="text-xs py-2 font-mono">{t.matricula}</TableCell>
                                          <TableCell className="text-xs py-2 font-mono">{t.tr}</TableCell>
                                          <TableCell className="text-xs py-2 text-right font-bold">{t.quantidade}</TableCell>
                                          <TableCell className="text-xs py-2">
                                            <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] text-sky-600" onClick={() => handleSelectTechnician(t.matricula)}>
                                              Ver carga
                                            </Button>
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {searchResults.depositos.length > 0 && (
                    <Card className="border-slate-100 shadow-sm rounded-xl bg-white">
                      <CardHeader className="pb-3 border-b border-slate-100">
                        <CardTitle className="text-sm font-bold text-slate-800">Visão por Depósito (SAP)</CardTitle>
                        <CardDescription className="text-xs">Quantidade de seriais no almoxarifado por depósito</CardDescription>
                      </CardHeader>
                      <CardContent className="p-0">
                        <Table>
                          <TableHeader className="bg-slate-50/50"><TableRow>
                            <TableHead className="text-xs py-2 pl-6">Depósito</TableHead>
                            <TableHead className="text-xs py-2 text-right pr-6">Quantidade</TableHead>
                          </TableRow></TableHeader>
                          <TableBody>
                            {searchResults.depositos.map((d: any) => (
                              <TableRow key={d.deposito} className="border-b border-slate-100">
                                <TableCell className="text-xs py-2 pl-6 font-mono">{d.deposito}</TableCell>
                                <TableCell className="text-xs py-2 text-right pr-6 font-bold">{d.qtd}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  )}
                </div>
              ) : (
                <Card className="border-slate-100 shadow-sm rounded-xl bg-white">
                  <CardHeader className="pb-4 border-b border-slate-100">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ScanBarcode className="w-5 h-5 text-sky-500" />
                        <div>
                          <CardTitle className="text-sm font-bold text-slate-800">Resultado do Serial</CardTitle>
                          <CardDescription className="text-xs">N° de série: <span className="font-mono font-bold text-slate-700">{searchResults.serial}</span></CardDescription>
                        </div>
                      </div>
                      <Badge className={searchResults.status === "Aplicado no Sistema" ? "bg-emerald-500 text-white" : searchResults.status === "Com Técnico (Físico)" ? "bg-blue-500 text-white" : "bg-slate-500 text-white"}>{searchResults.status.toUpperCase()}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-6 items-start">
                      <div>
                    {searchResults.status === "Aplicado no Sistema" ? (
                      <div className="space-y-4">
                        <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-100 flex items-start gap-3">
                          <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5" />
                          <div><h4 className="text-xs font-bold text-emerald-800">Aplicado em Cliente</h4></div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="p-3 rounded-lg border border-slate-100"><span className="text-[10px] font-semibold text-slate-500 uppercase">Equipamento</span><p className="text-xs font-bold text-slate-800 mt-0.5 truncate">{searchResults.details.modelo}</p><p className="text-[10px] text-slate-500">Cód: {searchResults.details.codigo}</p></div>
                          <div className="p-3 rounded-lg border border-slate-100"><span className="text-[10px] font-semibold text-slate-500 uppercase">Cliente</span><p className="text-xs font-bold text-slate-800 mt-0.5 truncate">{searchResults.details.cliente}</p><p className="text-[10px] text-slate-500">Instalação: {searchResults.details.data_instalacao}</p></div>
                          <div className="p-3 rounded-lg border border-slate-100"><span className="text-[10px] font-semibold text-slate-500 uppercase">GPON</span><p className="text-xs font-bold text-slate-800 font-mono mt-0.5 truncate">{searchResults.details.gpon}</p></div>
                          <div className="p-3 rounded-lg border border-slate-100"><span className="text-[10px] font-semibold text-slate-500 uppercase">Alias</span><p className="text-xs font-bold text-slate-800 font-mono mt-0.5 truncate">{searchResults.details.alias}</p></div>
                        </div>
                        <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-500 flex items-center gap-1"><User className="w-3.5 h-3.5" /><span>Técnico: <strong>{searchResults.details.tecnico}</strong></span></div>
                      </div>
                    ) : searchResults.status === "Com Técnico (Físico)" ? (
                      <div className="space-y-4">
                        <div className="bg-sky-50/50 p-4 rounded-xl border border-sky-100 flex items-start gap-3">
                          <Info className="w-5 h-5 text-sky-600 mt-0.5" />
                          <div><h4 className="text-xs font-bold text-sky-800">Em carga com colaborador</h4><p className="text-[11px] text-sky-700/80 mt-0.5">Última operação: {searchResults.details.ultimaOperacao} ({searchResults.details.tipoOperacao})</p></div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="p-3 rounded-lg border border-slate-100"><span className="text-[10px] font-semibold text-slate-500 uppercase">Equipamento</span><p className="text-xs font-bold text-slate-800 mt-0.5 truncate">{searchResults.details.modelo}</p><p className="text-[10px] text-slate-500">Cód: {searchResults.details.codigo}</p></div>
                          <div className="p-3 rounded-lg border border-slate-100"><span className="text-[10px] font-semibold text-slate-500 uppercase">Colaborador</span><p className="text-xs font-bold text-slate-800 mt-0.5 truncate">{searchResults.details.tecnico}</p><p className="text-[10px] text-slate-500">TT: {searchResults.details.matricula} • TR: {searchResults.details.tr}</p></div>
                          <div className="p-3 rounded-lg border border-slate-100"><span className="text-[10px] font-semibold text-slate-500 uppercase">Supervisor</span><p className="text-xs font-bold text-slate-800 mt-0.5 truncate">{searchResults.details.supervisor}</p></div>
                          <div className="p-3 rounded-lg border border-slate-100"><span className="text-[10px] font-semibold text-slate-500 uppercase">Coordenador</span><p className="text-xs font-bold text-slate-800 mt-0.5 truncate">{searchResults.details.coordenador}</p></div>
                          <div className="p-3 rounded-lg border border-slate-100"><span className="text-[10px] font-semibold text-slate-500 uppercase">Depósito</span><p className="text-xs font-bold text-slate-800 font-mono mt-0.5">{searchResults.details.deposito}</p></div>
                          <div className="p-3 rounded-lg border border-slate-100"><span className="text-[10px] font-semibold text-slate-500 uppercase">Status SAP</span><p className="text-xs font-bold text-slate-800 mt-0.5">{searchResults.details.statusSap}</p></div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-100 flex items-start gap-3">
                          <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                          <div><h4 className="text-xs font-bold text-amber-800">Disponível em Depósito SAP</h4></div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="p-3 rounded-lg border border-slate-100"><span className="text-[10px] font-semibold text-slate-500 uppercase">Equipamento</span><p className="text-xs font-bold text-slate-800 mt-0.5 truncate">{searchResults.details.modelo}</p><p className="text-[10px] text-slate-500">Cód: {searchResults.details.codigo}</p></div>
                          <div className="p-3 rounded-lg border border-slate-100"><span className="text-[10px] font-semibold text-slate-500 uppercase">Depósito</span><p className="text-xs font-bold text-slate-800 font-mono mt-0.5">{searchResults.details.deposito}</p></div>
                          <div className="p-3 rounded-lg border border-slate-100"><span className="text-[10px] font-semibold text-slate-500 uppercase">Status</span><p className="text-xs font-bold text-slate-800 mt-0.5">{searchResults.details.statusSap}</p></div>
                          <div className="p-3 rounded-lg border border-slate-100"><span className="text-[10px] font-semibold text-slate-500 uppercase">Modificado por</span><p className="text-xs font-bold text-slate-800 mt-0.5">{searchResults.details.modificadoPor}</p></div>
                        </div>
                      </div>
                    )}
                      </div>
                      {/* Coluna QR Code do serial */}
                      <div className="flex flex-col items-center gap-2 p-3 rounded-xl border border-slate-100 bg-slate-50/40">
                        <span className="text-[10px] font-semibold text-slate-500 uppercase">QR do Serial</span>
                        <div className="p-2 bg-white rounded-lg border border-slate-200">
                          <QRCodeSVG value={String(searchResults.serial)} size={140} level="M" includeMargin={false} />
                        </div>
                        <p className="text-[10px] font-mono text-slate-500 break-all text-center">{searchResults.serial}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          {/* Detalhamento de Seriais — full-width abaixo da grade do filtro */}
          {searchResults?.type === "technician" && (
            <Card className="border-slate-100 shadow-sm rounded-xl bg-white">
              <CardHeader className="pb-3 border-b border-slate-100">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-sm font-bold text-slate-800">Detalhamento de Seriais</CardTitle>
                    <CardDescription className="text-xs">Cruzamento (última operação) + SAP + Aplicados</CardDescription>
                  </div>
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs" onClick={() => handleExportTechnician(searchResults)}>
                    <FileSpreadsheet className="w-3.5 h-3.5 mr-2" />Exportar Carga (.xlsx)
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {searchResults.serials.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500">Nenhum serial associado nas bases de cruzamento.</div>
                ) : (
                  <Table>
                    <TableHeader className="bg-slate-50/50"><TableRow className="border-b border-slate-100">
                      <TableHead className="text-xs font-semibold text-slate-600 py-3 pl-6">Serial</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-600 py-3">Equipamento</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-600 py-3">Status</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-600 py-3" title="Tipo da última movimentação no Cruzamento. 'No Cruzamento' indica que o serial existe apenas na base de cruzamento e não foi localizado no SAP nem em Aplicados.">Operação</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-600 py-3 pr-6">Observações</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {searchResults.serials.map((s: any, i: number) => (
                        <TableRow key={i} className="border-b border-slate-100 hover:bg-slate-50/20">
                          <TableCell className="text-xs font-bold text-slate-800 py-3 pl-6 font-mono">
                            <div className="inline-flex items-center gap-1.5">
                              <span>{s.serial}</span>
                              <button
                                type="button"
                                title="Ver QR Code do serial"
                                onClick={(e) => { e.stopPropagation(); setQrSerial(String(s.serial)); }}
                                className="text-slate-300 hover:text-sky-600 transition-colors"
                              >
                                <QrCode className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </TableCell>
                          <TableCell className="text-[11px] text-slate-500 py-3">{s.modelo}</TableCell>
                          <TableCell className="text-xs py-3"><Badge className={s.status.includes("Aplicado") ? "bg-emerald-50 text-emerald-700 border-emerald-200 border text-[10px] font-semibold" : "bg-blue-50 text-blue-700 border-blue-200 border text-[10px] font-semibold"}>{s.status}</Badge></TableCell>
                          <TableCell className="text-xs py-3"><Badge variant="outline" className="text-slate-600 border-slate-200">{s.crossStatus}</Badge></TableCell>
                          <TableCell className="text-[11px] text-slate-500 py-3 pr-6">{s.obs}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* MASSA */}
        <TabsContent value="massa" className="space-y-6 outline-none">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-1 border-slate-100 shadow-sm bg-white rounded-xl">
              <CardHeader><CardTitle className="text-sm font-semibold text-slate-800">Busca em Massa</CardTitle><CardDescription className="text-xs">Cole uma lista de seriais</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <Textarea placeholder="Cole os seriais aqui (um por linha ou separado por vírgula)..." rows={8} className="bg-slate-50 border-slate-200 text-xs font-mono" value={massInput} onChange={(e) => setMassInput(e.target.value)} />
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 text-xs border-slate-200" onClick={() => { setMassInput(""); setMassResults([]); }}>Limpar</Button>
                  <Button className="flex-1 bg-sky-600 hover:bg-sky-700 text-white text-xs" onClick={handleMassSearch} disabled={searchingMass}>
                    {searchingMass ? (<><RefreshCw className="w-3.5 h-3.5 mr-2 animate-spin" />Buscando...</>) : (<><Layers className="w-3.5 h-3.5 mr-2" />Pesquisar</>)}
                  </Button>
                </div>
              </CardContent>
            </Card>
            <div className="lg:col-span-2 space-y-6">
              {massResults.length === 0 ? (
                <div className="h-[350px] bg-white border border-slate-100 rounded-xl flex flex-col items-center justify-center text-slate-400 p-6 shadow-sm">
                  <Layers className="w-12 h-12 text-slate-200 mb-3" />
                  <p className="text-sm font-semibold text-slate-600">Resultados</p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card className="border-slate-100 shadow-sm rounded-xl bg-white p-4"><span className="text-[10px] font-semibold text-slate-500 uppercase block">Total</span><p className="text-2xl font-black text-slate-800 mt-1">{massStats.total}</p></Card>
                    <Card className="border-slate-100 shadow-sm rounded-xl bg-white p-4"><span className="text-[10px] font-semibold text-slate-500 uppercase block">Com Técnico</span><p className="text-2xl font-black text-blue-600 mt-1">{massStats.withTech}</p></Card>
                    <Card className="border-slate-100 shadow-sm rounded-xl bg-white p-4"><span className="text-[10px] font-semibold text-slate-500 uppercase block">Aplicados</span><p className="text-2xl font-black text-emerald-600 mt-1">{massStats.applied}</p></Card>
                    <Card className="border-slate-100 shadow-sm rounded-xl bg-white p-4"><span className="text-[10px] font-semibold text-slate-500 uppercase block">Não Encontrados</span><p className="text-2xl font-black text-rose-600 mt-1">{massStats.notFound}</p></Card>
                  </div>
                  <Card className="border-slate-100 shadow-sm rounded-xl bg-white">
                    <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
                      <div><CardTitle className="text-sm font-bold text-slate-800">Detalhe</CardTitle></div>
                      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs" onClick={handleExportMassResults}><FileSpreadsheet className="w-3.5 h-3.5 mr-2" />Exportar XLSX</Button>
                    </CardHeader>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader className="bg-slate-50/50"><TableRow className="border-b border-slate-100">
                          <TableHead className="text-xs font-semibold text-slate-600 py-3 pl-6">Serial</TableHead>
                          <TableHead className="text-xs font-semibold text-slate-600 py-3">Equipamento</TableHead>
                          <TableHead className="text-xs font-semibold text-slate-600 py-3">Status</TableHead>
                          <TableHead className="text-xs font-semibold text-slate-600 py-3 pr-6">Detalhes</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                          {massResults.map((r, i) => (
                            <TableRow key={i} className="border-b border-slate-100 hover:bg-slate-50/20">
                              <TableCell className="text-xs font-bold text-slate-800 py-3 pl-6 font-mono">
                                <div className="inline-flex items-center gap-1.5">
                                  <span>{r.serial}</span>
                                  <button
                                    type="button"
                                    title="Ver QR Code do serial"
                                    onClick={(e) => { e.stopPropagation(); setQrSerial(String(r.serial)); }}
                                    className="text-slate-300 hover:text-sky-600 transition-colors"
                                  >
                                    <QrCode className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </TableCell>
                              <TableCell className="text-xs text-slate-500 py-3">{r.equipamento}</TableCell>
                              <TableCell className="text-xs py-3">
                                <Badge className={
                                  r.status === "aplicado" ? "bg-emerald-50 text-emerald-700 border-emerald-200 border text-[10px]" :
                                  r.status === "tecnico"  ? "bg-blue-50 text-blue-700 border-blue-200 border text-[10px]" :
                                  r.status === "almox"    ? "bg-amber-50 text-amber-700 border-amber-200 border text-[10px]" :
                                                            "bg-rose-50 text-rose-700 border-rose-200 border text-[10px]"
                                }>
                                  {r.status === "aplicado" ? "Aplicado" :
                                   r.status === "tecnico"  ? "Com Técnico" :
                                   r.status === "almox"    ? "Almox / SAP" :
                                                             "Não Localizado"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-[11px] text-slate-600 py-3 pr-6">{r.detalhes}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* BASES */}
        <TabsContent value="bases" className="space-y-6 outline-none">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <BaseCard color="bg-indigo-500" title="0. Presença (Dimensão Técnicos)" desc="Chave primária TT/TR para enriquecimento dos demais relatórios" count={presenca.length} ts={uploadTimestamps.presenca} type="presenca"
              longDesc="Importe a planilha Presença (aba Técnicos). Esta base alimenta TR, Técnico, Supervisor e Coordenador em todas as consultas. Inclui todos os colaboradores ativos da Ability indiferente de status." />
            <BaseCard color="bg-sky-500" title="1. Saldo Gestech (ONT/ROTEADOR)" desc="Carga consolidada por TT + código de material" count={saldoGestech.length} ts={uploadTimestamps.gestech} type="gestech"
              longDesc="Importe a planilha 'Estoque por Técnico'. O sistema filtra apenas ONT e ROTEADOR e soma o saldo agrupando por técnico (codarmazem) + codmaterial." />
            <BaseCard color="bg-violet-500" title="2. Saldo SAP com Seriais" desc="Nº de série logístico no SAP (PA/TA/SC)" count={saldoSap.length} ts={uploadTimestamps.sap} type="sap"
              longDesc="Importe a planilha 'Saldo SAP PA TA SC'. Mantém colunas Material, Texto breve, Nº de série, Centro, Depósito, Modificado em/por, Status, Lote — filtrado para ONT/ROTEADOR." />
            <BaseCard color="bg-amber-500" title="3. Cruzamento SAP x Gestech" desc="Histórico de operações por serial (última prevalece)" count={cruzamentoDedup.length} ts={uploadTimestamps.cruzamento} type="cruzamento"
              longDesc="Importe a planilha 'Consulta Serial SAP X Gestech'. O sistema deduplica por serial mantendo a última 'ultimaoperacaoem'. Cruza por 'serial' (SAP) e 'codmat' + 'matricula' (Gestech)." />
            <BaseCard color="bg-emerald-500" title="4. Seriais Aplicados (Ativos na Planta)" desc="Aguardando base oficial" count={aplicados.length} ts={uploadTimestamps.aplicados} type="aplicados"
              longDesc="Estrutura preparada para receber a base 'Ativos na Planta'. Sem dados fictícios para não atravessar a informação — importe quando disponível." />
          </div>
        </TabsContent>
      </Tabs>

      {/* QR Code do serial */}
      <Dialog open={!!qrSerial} onOpenChange={(o) => !o && setQrSerial(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-sm">QR Code do Serial</DialogTitle>
            <DialogDescription className="text-[11px] font-mono break-all">{qrSerial}</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center py-2">
            {qrSerial && (
              <div className="p-4 bg-white rounded-lg border border-slate-200">
                <QRCodeSVG value={qrSerial} size={200} level="M" includeMargin={false} />
              </div>
            )}
          </div>
          <p className="text-[10px] text-slate-400 text-center">Aponte o leitor para registrar o serial.</p>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RastreabilidadeOnt;
