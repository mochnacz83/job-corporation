import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ESTADO_DE_PARA: Record<string, string> = {
  "atribuÃ\u00ad-do": "Atribuído",
  "atribuído": "Atribuído",
  "atribui\u00addo": "Atribuído",
  "cancelado": "Cancelado",
  "concluÃ\u00addo com sucesso": "Concluído com sucesso",
  "concluído com sucesso": "Concluído com sucesso",
  "conclui\u00addo com sucesso": "Concluído com sucesso",
  "concluÃ\u00addo sem sucesso": "Concluído sem sucesso",
  "concluído sem sucesso": "Concluído sem sucesso",
  "conclui\u00addo sem sucesso": "Concluído sem sucesso",
  "em deslocamento": "Em deslocamento",
  "em execuÃ§Ã£o": "Em execução",
  "em execução": "Em execução",
  "em execucao": "Em execução",
  "nÃ£o atribuÃ\u00ad-do": "Não atribuído",
  "não atribuído": "Não atribuído",
  "nao atribuido": "Não atribuído",
  "recebido": "Recebido",
};

function normalizeEstado(raw: string | null | undefined): string {
  if (!raw) return "";
  const cleaned = raw.toString().trim();
  const lower = cleaned.toLowerCase();
  if (ESTADO_DE_PARA[lower]) return ESTADO_DE_PARA[lower];
  // fallback: try to fix common mojibake then return cleaned
  return cleaned;
}

function detectDelimiter(headerLine: string): string {
  const candidates = [";", ",", "\t", "|"];
  let best = ";";
  let max = 0;
  for (const d of candidates) {
    const c = headerLine.split(d).length;
    if (c > max) {
      max = c;
      best = d;
    }
  }
  return best;
}

function parseCSVLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (ch === delim && !inQuote) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function findCol(headers: string[], candidates: string[]): number {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
  const normHeaders = headers.map(norm);
  for (const c of candidates) {
    const idx = normHeaders.indexOf(norm(c));
    if (idx >= 0) return idx;
  }
  return -1;
}

function parseDate(v: string): string | null {
  if (!v) return null;
  const s = v.trim();
  if (!s) return null;
  // try ISO
  const iso = new Date(s);
  if (!isNaN(iso.getTime())) return iso.toISOString();
  // try DD/MM/YYYY HH:MM:SS
  const m = s.match(
    /^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (m) {
    const [_, dd, mm, yyyy, hh = "00", mi = "00", ss = "00"] = m;
    const d = new Date(
      `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}-03:00`,
    );
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRole);

  // Create sync log
  const triggeredBy =
    req.headers.get("x-trigger") ||
    (new URL(req.url).searchParams.get("trigger") ?? "manual");

  const { data: logRow } = await supabase
    .from("atividades_sync_log")
    .insert({ status: "running", triggered_by: triggeredBy })
    .select("id")
    .single();

  const logId = logRow?.id as string | undefined;

  const finalize = async (status: string, rows: number, err?: string) => {
    if (!logId) return;
    await supabase
      .from("atividades_sync_log")
      .update({
        status,
        rows_imported: rows,
        error_message: err ?? null,
        finished_at: new Date().toISOString(),
      })
      .eq("id", logId);
  };

  try {
    // Read URL from app_settings
    const { data: settingRow, error: settingErr } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "atividades_csv_url")
      .maybeSingle();

    if (settingErr) throw settingErr;

    const url =
      typeof settingRow?.value === "string"
        ? settingRow.value
        : (settingRow?.value as { url?: string })?.url;

    if (!url) {
      await finalize("error", 0, "URL do CSV não configurada em app_settings.");
      return new Response(
        JSON.stringify({ ok: false, error: "URL do CSV não configurada" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Download CSV
    const resp = await fetch(url);
    if (!resp.ok) {
      const txt = await resp.text();
      let hint = "";
      if (resp.status === 403 || resp.status === 401) {
        hint =
          " | A URL configurada exige autenticação do navegador (login Google). " +
          "Use uma URL ASSINADA do GCS (signed URL via 'gsutil signurl') OU torne o objeto público " +
          "(allUsers = Storage Object Viewer) e use https://storage.googleapis.com/<bucket>/<arquivo>.";
      }
      throw new Error(
        `Falha ao baixar CSV (${resp.status}): ${txt.slice(0, 200)}${hint}`,
      );
    }

    // Try latin1 decoding first (common BR), fallback utf-8
    const buf = new Uint8Array(await resp.arrayBuffer());
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: false }).decode(buf);
      // detect mojibake
      if (text.includes("Ã") && !text.includes("ç") && !text.includes("ã")) {
        text = new TextDecoder("windows-1252").decode(buf);
      }
    } catch {
      text = new TextDecoder("windows-1252").decode(buf);
    }

    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) {
      await finalize("success", 0);
      return new Response(
        JSON.stringify({ ok: true, rows: 0, message: "CSV vazio" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const delim = detectDelimiter(lines[0]);
    const headers = parseCSVLine(lines[0], delim);

    const idxEstado = findCol(headers, [
      "ds_estado",
      "estado",
      "ds estado",
    ]);
    const idxMacro = findCol(headers, [
      "ds_macro_atividade",
      "macro_atividade",
      "macro atividade",
      "ds macro atividade",
    ]);
    const idxTT = findCol(headers, [
      "matricula_tt",
      "matricula tt",
      "tt",
      "cd_matricula_tt",
    ]);
    const idxTR = findCol(headers, [
      "matricula_tr",
      "matricula tr",
      "tr",
      "cd_matricula_tr",
    ]);
    const idxNome = findCol(headers, [
      "nome_tecnico",
      "nome tecnico",
      "tecnico",
      "nome_funcionario",
      "funcionario",
    ]);
    const idxDataTermino = findCol(headers, [
      "dt_termino",
      "data_termino",
      "data termino",
      "dt termino",
      "data_fim",
      "dt_fim",
    ]);
    const idxDataAtividade = findCol(headers, [
      "dt_atividade",
      "data_atividade",
      "data atividade",
      "dt referencia",
      "data_referencia",
    ]);

    const rows: Array<Record<string, unknown>> = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i], delim);
      if (cols.length === 1 && !cols[0]) continue;
      const rawObj: Record<string, string> = {};
      headers.forEach((h, j) => (rawObj[h] = cols[j] ?? ""));

      const estadoRaw = idxEstado >= 0 ? cols[idxEstado] : "";
      const dtTermino = idxDataTermino >= 0 ? parseDate(cols[idxDataTermino]) : null;
      let dataAtividade: string | null = null;
      if (idxDataAtividade >= 0 && cols[idxDataAtividade]) {
        const d = parseDate(cols[idxDataAtividade]);
        if (d) dataAtividade = d.slice(0, 10);
      }
      if (!dataAtividade && dtTermino) dataAtividade = dtTermino.slice(0, 10);

      rows.push({
        ds_estado: normalizeEstado(estadoRaw),
        ds_macro_atividade:
          idxMacro >= 0 ? (cols[idxMacro] || "").trim() : null,
        matricula_tt:
          idxTT >= 0 ? (cols[idxTT] || "").trim().toUpperCase() : null,
        matricula_tr:
          idxTR >= 0 ? (cols[idxTR] || "").trim().toUpperCase() : null,
        nome_tecnico: idxNome >= 0 ? (cols[idxNome] || "").trim() : null,
        data_atividade: dataAtividade,
        data_termino: dtTermino,
        raw: rawObj,
      });
    }

    // Replace strategy: delete all and reinsert (snapshot atual do dia N)
    const { error: delErr } = await supabase
      .from("atividades_fato")
      .delete()
      .gte("imported_at", "1900-01-01");
    if (delErr) throw delErr;

    // Batch insert (1000 por vez)
    const batchSize = 1000;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += batchSize) {
      const slice = rows.slice(i, i + batchSize);
      const { error: insErr } = await supabase
        .from("atividades_fato")
        .insert(slice);
      if (insErr) throw insErr;
      inserted += slice.length;
    }

    await finalize("success", inserted);
    return new Response(
      JSON.stringify({ ok: true, rows: inserted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("sync-atividades-fato error:", msg);
    await finalize("error", 0, msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});