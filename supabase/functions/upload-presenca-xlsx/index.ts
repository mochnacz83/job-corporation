import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-upload-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

const findKey = (obj: Record<string, unknown>, candidates: string[]) => {
  const keys = Object.keys(obj);
  const map = new Map(keys.map((k) => [norm(k), k]));
  for (const c of candidates) {
    const k = map.get(norm(c));
    if (k) return k;
  }
  return null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const expectedToken = Deno.env.get("ATIVIDADES_UPLOAD_TOKEN");
  const providedToken =
    req.headers.get("x-upload-token") ||
    new URL(req.url).searchParams.get("token");

  if (!expectedToken || providedToken !== expectedToken) {
    return new Response(
      JSON.stringify({ ok: false, error: "Token inválido ou ausente" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRole);

  try {
    const buf = new Uint8Array(await req.arrayBuffer());
    if (buf.byteLength === 0) {
      throw new Error("Corpo da requisição vazio. Envie o arquivo XLSX no body.");
    }

    const wb = XLSX.read(buf, { type: "array" });
    const sheet =
      wb.Sheets["Tecnicos"] ||
      wb.Sheets["TECNICOS"] ||
      wb.Sheets["Técnicos"] ||
      wb.Sheets[wb.SheetNames[0]];
    if (!sheet) throw new Error("Aba 'Tecnicos' não encontrada");

    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
      raw: false,
    });

    const rows = json.map((r) => {
      const kTR = findKey(r, ["TR"]);
      const kTT = findKey(r, ["TT"]);
      const kFunc = findKey(r, ["FUNCIONARIO", "FUNCIONÁRIO", "NOME"]);
      const kOp = findKey(r, ["OPERADORA"]);
      const kSup = findKey(r, ["SUPERVISOR"]);
      const kCoord = findKey(r, ["COORDENADOR"]);
      const kSetorO = findKey(r, ["SETOR ORIGEM", "SETOR_ORIGEM", "SETORORIGEM"]);
      const kSetorA = findKey(r, ["SETOR ATUAL", "SETOR_ATUAL", "SETORATUAL"]);
      const kStatus = findKey(r, ["STATUS"]);
      return {
        tr: kTR ? String(r[kTR] || "").trim().toUpperCase() : null,
        tt: kTT ? String(r[kTT] || "").trim().toUpperCase() : null,
        funcionario: kFunc ? String(r[kFunc] || "").trim() : null,
        operadora: kOp ? String(r[kOp] || "").trim() : null,
        supervisor: kSup ? String(r[kSup] || "").trim() : null,
        coordenador: kCoord ? String(r[kCoord] || "").trim() : null,
        setor_origem: kSetorO ? String(r[kSetorO] || "").trim() : null,
        setor_atual: kSetorA ? String(r[kSetorA] || "").trim() : null,
        status: kStatus ? String(r[kStatus] || "").trim() : null,
      };
    }).filter((r) => r.tt || r.tr);

    const { error: delErr } = await supabase
      .from("tecnicos_presenca")
      .delete()
      .gte("uploaded_at", "1900-01-01");
    if (delErr) throw delErr;

    const batch = 500;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += batch) {
      const slice = rows.slice(i, i + batch);
      const { error } = await supabase.from("tecnicos_presenca").insert(slice);
      if (error) throw error;
      inserted += slice.length;
    }

    return new Response(
      JSON.stringify({ ok: true, rows: inserted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("upload-presenca-xlsx error:", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});