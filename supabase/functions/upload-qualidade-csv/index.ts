import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VALID_INDICADORES = new Set([
  "reparo_por_planta",
  "reparo_no_prazo",
  "instalacao_no_prazo",
  "infancia_30_dias",
  "cumprimento_1a_reparo",
  "cumprimento_1a_instalacao",
  "infancia_30_dias_instalacao",
  "repetida_30_dias",
]);

function detectDelimiter(headerLine: string): string {
  const candidates = [";", ",", "\t", "|"];
  let best = ";";
  let max = 0;
  for (const d of candidates) {
    const c = headerLine.split(d).length;
    if (c > max) { max = c; best = d; }
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
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else { inQuote = !inQuote; }
    } else if (ch === delim && !inQuote) {
      out.push(cur); cur = "";
    } else { cur += ch; }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function findCol(headers: string[], candidates: string[]): number {
  const normHeaders = headers.map(norm);
  for (const c of candidates) {
    const idx = normHeaders.indexOf(norm(c));
    if (idx >= 0) return idx;
  }
  return -1;
}

function parseDate(v: string): string | null {
  if (!v) return null;
  let s = v.trim();
  if (!s) return null;
  s = s.replace(/\s+(UTC|GMT)\s*$/i, "Z").replace(" ", "T");
  const iso = new Date(s);
  if (!isNaN(iso.getTime())) return iso.toISOString();
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const [, dd, mm, yyyy, hh = "00", mi = "00", ss = "00"] = m;
    const d = new Date(`${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}-03:00`);
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
  const admin = createClient(supabaseUrl, serviceRole);

  // Validate caller: must be admin
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return new Response(JSON.stringify({ ok: false, error: "Não autenticado" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ ok: false, error: "Sessão inválida" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { data: roleRow } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleRow) {
    return new Response(JSON.stringify({ ok: false, error: "Acesso restrito a administradores" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const form = await req.formData();
    const indicador = String(form.get("indicador") || "").trim();
    const file = form.get("file") as File | null;

    if (!VALID_INDICADORES.has(indicador)) {
      throw new Error(`Indicador inválido: ${indicador}`);
    }
    if (!file || !(file instanceof File)) {
      throw new Error("Arquivo CSV não enviado");
    }

    const buf = new Uint8Array(await file.arrayBuffer());
    if (buf.byteLength === 0) throw new Error("Arquivo vazio");

    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: false }).decode(buf);
      if (text.includes("Ã") && !text.includes("ç") && !text.includes("ã")) {
        text = new TextDecoder("windows-1252").decode(buf);
      }
    } catch {
      text = new TextDecoder("windows-1252").decode(buf);
    }

    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) {
      throw new Error("CSV sem dados");
    }

    const delim = detectDelimiter(lines[0]);
    const headers = parseCSVLine(lines[0], delim);

    const idxTec = findCol(headers, ["tecnico", "matricula_tecnico"]);
    const idxDoc = findCol(headers, ["num_documento", "num_ba", "numero_ba", "documento_associado"]);
    const idxMun = findCol(headers, ["municipio", "ds_municipio", "cidade"]);
    const idxUf = findCol(headers, ["uf", "cd_uf", "sg_uf"]);
    const idxCdo = findCol(headers, ["cdo_name", "cdo"]);
    const idxAb = findCol(headers, [
      "dat_abertura", "abertura_reparo", "abertura_instalacao", "dh_dataaberturaos",
    ]);
    const idxFc = findCol(headers, [
      "dat_fechamento", "fechamento_reparo", "fechamento_instalacao", "dh_fim_execucao_real",
    ]);
    const idxFlag = findCol(headers, ["in_flag_indicador"]);

    const batch = crypto.randomUUID();
    const rows: Array<Record<string, unknown>> = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i], delim);
      if (cols.length === 1 && !cols[0]) continue;
      const rawObj: Record<string, string> = {};
      headers.forEach((h, j) => (rawObj[h] = cols[j] ?? ""));

      const tec = (idxTec >= 0 ? (cols[idxTec] || "").trim().toUpperCase() : "") || null;
      const doc = (idxDoc >= 0 ? (cols[idxDoc] || "").trim() : "") || null;
      const mun = (idxMun >= 0 ? (cols[idxMun] || "").trim().toUpperCase() : "") || null;
      const uf = (idxUf >= 0 ? (cols[idxUf] || "").trim().toUpperCase() : "") || null;
      const cdo = (idxCdo >= 0 ? (cols[idxCdo] || "").trim().toUpperCase() : "") || null;
      const ab = idxAb >= 0 ? parseDate(cols[idxAb]) : null;
      const fc = idxFc >= 0 ? parseDate(cols[idxFc]) : null;
      const flag = (idxFlag >= 0 ? (cols[idxFlag] || "").trim().toUpperCase() : "") || null;

      rows.push({
        indicador,
        tecnico_matricula: tec,
        num_documento: doc,
        municipio: mun,
        uf,
        cdo,
        dat_abertura: ab,
        dat_fechamento: fc,
        in_flag_indicador: flag,
        raw: rawObj,
        import_batch: batch,
      });
    }

    // Replace strategy: delete previous records for this indicador
    const { error: delErr } = await admin
      .from("quality_records")
      .delete()
      .eq("indicador", indicador);
    if (delErr) throw delErr;

    const batchSize = 1000;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += batchSize) {
      const slice = rows.slice(i, i + batchSize);
      const { error: insErr } = await admin.from("quality_records").insert(slice);
      if (insErr) throw insErr;
      inserted += slice.length;
    }

    await admin.from("quality_imports").insert({
      indicador,
      file_name: file.name || null,
      rows_count: inserted,
      status: "success",
      imported_by: userData.user.id,
    });

    return new Response(
      JSON.stringify({ ok: true, rows: inserted, indicador }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("upload-qualidade-csv error:", msg);
    try {
      await admin.from("quality_imports").insert({
        indicador: "unknown",
        rows_count: 0,
        status: "error",
        error_message: msg,
        imported_by: userData.user.id,
      });
    } catch { /* ignore */ }
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});