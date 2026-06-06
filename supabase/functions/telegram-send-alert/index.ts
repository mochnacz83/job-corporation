import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

function normCity(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

function topN(map: Map<string, number>, n = 3): Array<[string, number]> {
  return [...map.entries()]
    .filter(([k]) => k && k !== "-")
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

function parseDateMaybe(v: unknown): Date | null {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;
  const iso = new Date(s);
  if (!isNaN(iso.getTime())) return iso;
  const m = s.match(
    /^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (m) {
    const [, dd, mm, yyyy, hh = "00", mi = "00", ss = "00"] = m;
    const d = new Date(`${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}-03:00`);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function isOpen(estado: string | null): boolean {
  if (!estado) return true;
  const lower = estado.toLowerCase();
  if (lower.includes("conclu")) return false;
  if (lower.includes("cancel")) return false;
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const telegramKey = Deno.env.get("TELEGRAM_API_KEY");
  const supabase = createClient(supabaseUrl, serviceRole);

  const url = new URL(req.url);
  const isTest = url.searchParams.get("test") === "true";
  const triggeredBy =
    req.headers.get("x-trigger") ||
    url.searchParams.get("trigger") ||
    (isTest ? "manual-test" : "cron");

  // Auth: only require user auth for non-cron callers. Cron passes service-role key.
  let isCron = false;
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const triggerHeader = req.headers.get("x-trigger") || "";
  if (token && token === serviceRole) {
    isCron = true;
  } else if (triggerHeader === "cron-hourly") {
    // Cron call via pg_net using anon key; allowed because verify_jwt=false and the
    // function only sends messages to pre-configured chat IDs (cooldown protects spam).
    isCron = true;
  } else {
    try {
      const { data: userData, error } = await supabase.auth.getUser(token);
      if (error || !userData?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userData.user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (!roleData) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } catch {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  try {
    if (!lovableKey || !telegramKey) {
      throw new Error("Conexão Telegram não configurada (LOVABLE_API_KEY/TELEGRAM_API_KEY ausente).");
    }

    // Load config + recipients
    const [{ data: configRow }, { data: recipients }, { data: thresholds }] =
      await Promise.all([
        supabase.from("telegram_alert_config").select("*").limit(1).maybeSingle(),
        supabase.from("telegram_alert_recipients").select("*").eq("active", true),
        supabase.from("telegram_alert_thresholds").select("*").eq("active", true),
      ]);

    if (!isTest && !configRow?.enabled) {
      return new Response(
        JSON.stringify({ ok: true, skipped: "alerts disabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const activeRecipients = (recipients || []).filter((r: any) => r.chat_id);
    if (activeRecipients.length === 0) {
      const err = "Nenhum destinatário ativo cadastrado.";
      await supabase.from("telegram_alert_log").insert({
        success: false, error_message: err, triggered_by: triggeredBy,
      });
      return new Response(JSON.stringify({ ok: false, error: err }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let messageText = "";
    let cidadeAlerta: string | null = null;
    let totalReparosAlerta = 0;
    let novosUltimaHoraAlerta = 0;

    if (isTest) {
      messageText =
        `✅ <b>Teste de Alerta — Concentração de Reparos</b>\n` +
        `Disparo manual em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.\n` +
        `Destinatários ativos: ${activeRecipients.length}.\n` +
        `Cidades monitoradas: ${(thresholds || []).map((t: any) => `${t.cidade}>${t.limite}`).join(", ") || "—"}`;
    } else {
      // Build threshold map
      const thrMap = new Map<string, number>();
      (thresholds || []).forEach((t: any) => thrMap.set(normCity(t.cidade), t.limite));
      if (thrMap.size === 0) {
        return new Response(JSON.stringify({ ok: true, skipped: "no thresholds" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch atividades (paginated)
      const all: any[] = [];
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from("atividades_fato")
          .select("ds_estado, raw")
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < pageSize) break;
      }

      const oneHourAgo = Date.now() - 60 * 60 * 1000;

      // Aggregate per city
      type Acc = {
        total: number;
        novosHora: number;
        bairros: Map<string, number>;
        cdos: Map<string, number>;
        olts: Map<string, number>;
      };
      const perCity = new Map<string, Acc>();

      for (const r of all) {
        if (!isOpen(r.ds_estado)) continue;
        const raw = (r.raw || {}) as Record<string, unknown>;
        const municipio = normCity(String(raw["ds_municipio"] || ""));
        if (!municipio) continue;
        if (!thrMap.has(municipio)) continue;

        let acc = perCity.get(municipio);
        if (!acc) {
          acc = { total: 0, novosHora: 0, bairros: new Map(), cdos: new Map(), olts: new Map() };
          perCity.set(municipio, acc);
        }
        acc.total++;

        const abertura =
          parseDateMaybe(raw["dh_dataaberturaos"]) ||
          parseDateMaybe(raw["dh_abertura_ba"]) ||
          parseDateMaybe(raw["data_naf"]);
        if (abertura && abertura.getTime() >= oneHourAgo) acc.novosHora++;

        const bairro = String(raw["ds_bairro"] || "").toUpperCase().trim() || "-";
        const cdo = String(raw["cdo"] || "").toUpperCase().trim() || "-";
        const olt = String(raw["olt"] || "").toUpperCase().trim() || "-";
        acc.bairros.set(bairro, (acc.bairros.get(bairro) || 0) + 1);
        acc.cdos.set(cdo, (acc.cdos.get(cdo) || 0) + 1);
        acc.olts.set(olt, (acc.olts.get(olt) || 0) + 1);
      }

      // Build alerting cities (above threshold)
      const alerting: Array<{ cidade: string; acc: Acc; limite: number }> = [];
      for (const [cidade, acc] of perCity.entries()) {
        const limite = thrMap.get(cidade)!;
        if (acc.total > limite) alerting.push({ cidade, acc, limite });
      }
      alerting.sort((a, b) => b.acc.total - a.acc.total);

      if (alerting.length === 0) {
        return new Response(
          JSON.stringify({ ok: true, skipped: "no city above threshold" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Cooldown: if no new opens in the last hour for any alerting city, skip
      const cooldownMin = configRow?.cooldown_minutes ?? 60;
      const cooldownAgo = new Date(Date.now() - cooldownMin * 60 * 1000).toISOString();
      const totalNovos = alerting.reduce((s, a) => s + a.acc.novosHora, 0);
      if (totalNovos === 0) {
        const { data: recent } = await supabase
          .from("telegram_alert_log")
          .select("id")
          .eq("success", true)
          .gte("sent_at", cooldownAgo)
          .not("cidade", "is", null)
          .limit(1);
        if (recent && recent.length > 0) {
          return new Response(
            JSON.stringify({ ok: true, skipped: "cooldown, no new repairs" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }

      const now = new Date().toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
      });
      const parts: string[] = [`🚨 <b>Concentração de Reparos</b> — ${now}`];
      for (const { cidade, acc, limite } of alerting) {
        const delta = acc.novosHora > 0 ? ` | <b>+${acc.novosHora}</b> na última hora` : "";
        const bairros = topN(acc.bairros, 3).map(([k, v]) => `${k} (${v})`).join(", ") || "—";
        const cdos = topN(acc.cdos, 3).map(([k, v]) => `${k} (${v})`).join(", ") || "—";
        const olts = topN(acc.olts, 3).map(([k, v]) => `${k} (${v})`).join(", ") || "—";
        parts.push(
          `\n📍 <b>${cidade}</b> — ${acc.total} abertos (limite ${limite})${delta}` +
            `\n   • Bairros: ${bairros}` +
            `\n   • CDOs: ${cdos}` +
            `\n   • OLTs: ${olts}`,
        );
      }
      messageText = parts.join("\n");
      cidadeAlerta = alerting.map((a) => a.cidade).join(", ");
      totalReparosAlerta = alerting.reduce((s, a) => s + a.acc.total, 0);
      novosUltimaHoraAlerta = totalNovos;
    }

    // Send to each recipient
    const results: Array<{ chat_id: string; ok: boolean; error?: string }> = [];
    for (const rec of activeRecipients) {
      try {
        const resp = await fetch(`${GATEWAY_URL}/sendMessage`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovableKey}`,
            "X-Connection-Api-Key": telegramKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            chat_id: rec.chat_id,
            text: messageText,
            parse_mode: "HTML",
            disable_web_page_preview: true,
          }),
        });
        const body = await resp.text();
        if (!resp.ok) {
          results.push({ chat_id: rec.chat_id, ok: false, error: `[${resp.status}] ${body}` });
        } else {
          results.push({ chat_id: rec.chat_id, ok: true });
        }
      } catch (e) {
        results.push({ chat_id: rec.chat_id, ok: false, error: String(e) });
      }
    }

    const allOk = results.every((r) => r.ok);
    const errors = results.filter((r) => !r.ok).map((r) => `${r.chat_id}: ${r.error}`).join(" | ");

    await supabase.from("telegram_alert_log").insert({
      cidade: cidadeAlerta,
      total_reparos: totalReparosAlerta || null,
      novos_ultima_hora: novosUltimaHoraAlerta || null,
      recipients_count: activeRecipients.length,
      success: allOk,
      error_message: allOk ? null : errors,
      message_text: messageText,
      payload: { results, test: isTest },
      triggered_by: triggeredBy,
    });

    return new Response(
      JSON.stringify({ ok: allOk, results, message: messageText }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("telegram-send-alert error:", msg);
    await supabase.from("telegram_alert_log").insert({
      success: false,
      error_message: msg,
      triggered_by: triggeredBy,
    });
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});