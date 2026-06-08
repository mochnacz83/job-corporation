import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-trigger",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

const STATUS_ABERTO = new Set([
  "atribuido",
  "cancelado",
  "emdeslocamento",
  "emexecucao",
  "naoatribuido",
  "recebido",
  "concluidosemsucesso",
  "fechadoemwfm",
]);

const statusNames: Record<string, string> = {
  all: "Todos",
  ok: "Potência OK",
  sem: "Sem Potência",
  ate: "Sinal Atenuado",
  olt: "OLT Atenuado",
  ont: "ONT Atenuada",
};

function norm(s: string): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function normCity(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

function fixText(s: string): string {
  if (!s) return "";
  return s
    .replace(/Ã£/g, "ã")
    .replace(/Ã¡/g, "á")
    .replace(/Ã©/g, "é")
    .replace(/Ã­/g, "í")
    .replace(/Ã³/g, "ó")
    .replace(/Ãº/g, "ú")
    .replace(/Ã§/g, "ç")
    .replace(/Ãµ/g, "õ")
    .replace(/Ã¢/g, "â")
    .replace(/Ãª/g, "ê")
    .replace(/Ã´/g, "ô")
    .replace(/Ã /g, "à")
    .replace(/Ã‰/g, "É")
    .replace(/Ã‡/g, "Ç")
    .replace(/Ã“/g, "Ó")
    .replace(/Ã”/g, "Ô")
    .replace(/Ã‚/g, "Â")
    .replace(/Ãƒ/g, "Ã")
    .replace(/Ã\x8D/g, "Í")
    .replace(/Ã\x81/g, "Á")
    .replace(/Ã\x9A/g, "Ú")
    .replace(/NULL/gi, "")
    .trim();
}

function fixEstado(s: string): string {
  const f = fixText(s);
  if (/n.?o\s*atribu/i.test(f)) return "Não Atribuido";
  if (/^atribu/i.test(f)) return "Atribuido";
  return f;
}

function cleanLocal(s: string): string {
  return fixText(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getRaw(
  raw: Record<string, unknown> | null | undefined,
  keys: string[],
): string {
  if (!raw) return "";
  const lookup = new Map<string, string>();
  Object.keys(raw).forEach((k) => {
    lookup.set(norm(k), String(raw[k] ?? ""));
  });
  for (const c of keys) {
    const v = lookup.get(norm(c));
    if (v && v.toUpperCase() !== "NULL") return v;
  }
  return "";
}

function fmtDateTime(val: string): string {
  if (!val) return "";
  const v = val.trim();
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})[\sT]+(\d{2}:\d{2}:\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1].slice(-2)} ${m[4]}`;
  m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})[\sT]+(\d{2}:\d{2}:\d{2})/);
  if (m) return `${m[1]}/${m[2]}/${m[3].slice(-2)} ${m[4]}`;
  return v;
}

function fmtPot(val: string): string {
  if (!val) return "";
  const n = parseFloat(val.replace(",", "."));
  if (isNaN(n)) return val;
  return n.toFixed(2).replace(".", ",");
}

function parsePot(val: string): number | null {
  if (!val) return null;
  const n = parseFloat(val.replace(",", "."));
  return isNaN(n) ? null : n;
}

function computeStatusPot(
  statusNaf: string,
  potOlt: string,
  potOnt: string,
): string {
  if (!statusNaf) return "";
  if (/sem\s*pot/i.test(statusNaf)) return "Sem Potência";
  if (/com\s*pot/i.test(statusNaf)) {
    const olt = parsePot(potOlt);
    const ont = parsePot(potOnt);
    const oltAt = olt !== null && olt < -27;
    const ontAt = ont !== null && ont < -27;
    if (oltAt && ontAt) return "Sinal_Atenuado";
    if (oltAt) return "OLT_Atenuado";
    if (ontAt) return "ONT_Atenuada";
    return "Potência OK";
  }
  return statusNaf;
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
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const triggerHeader = req.headers.get("x-trigger") || "";

  let update: any = null;
  let isWebhook = false;

  // Detect Telegram webhook payload
  if (req.method === "POST" && !authHeader) {
    try {
      const body = await req.json();
      if (body && (body.update_id || body.message || body.callback_query)) {
        update = body;
        isWebhook = true;
      }
    } catch {
      // not JSON or parsing failed
    }
  }

  // If it's a webhook call, process it immediately without admin checks (since it comes from Telegram)
  if (isWebhook && update) {
    try {
      if (!lovableKey || !telegramKey) {
        console.error("Configurações do Telegram ausentes.");
        return new Response("ok", { headers: corsHeaders });
      }

      const chatId = update.message?.chat?.id || update.callback_query?.message?.chat?.id;
      const messageId = update.callback_query?.message?.message_id;
      const callbackQueryId = update.callback_query?.id;
      const text = update.message?.text?.trim();
      const callbackData = update.callback_query?.data;

      if (!chatId) {
        return new Response("ok", { headers: corsHeaders });
      }

      const sendMessage = async (cid: number | string, msgText: string, replyMarkup?: any) => {
        return await fetch(`${GATEWAY_URL}/sendMessage`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovableKey}`,
            "X-Connection-Api-Key": telegramKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            chat_id: cid,
            text: msgText,
            parse_mode: "HTML",
            disable_web_page_preview: true,
            reply_markup: replyMarkup,
          }),
        });
      };

      const editMessage = async (cid: number | string, mid: number, msgText: string, replyMarkup?: any) => {
        return await fetch(`${GATEWAY_URL}/editMessageText`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovableKey}`,
            "X-Connection-Api-Key": telegramKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            chat_id: cid,
            message_id: mid,
            text: msgText,
            parse_mode: "HTML",
            disable_web_page_preview: true,
            reply_markup: replyMarkup,
          }),
        });
      };

      const answerCallbackQuery = async (queryId: string, alertText?: string) => {
        return await fetch(`${GATEWAY_URL}/answerCallbackQuery`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovableKey}`,
            "X-Connection-Api-Key": telegramKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            callback_query_id: queryId,
            text: alertText,
          }),
        });
      };

      const getFilteredSAs = async (cidade: string, status: string, operadora: string) => {
        const { data: fatoData, error } = await supabase
          .from("atividades_fato")
          .select("ds_estado, ds_macro_atividade, raw")
          .eq("ds_macro_atividade", "REP-FTTH");
        
        if (error) throw error;
        const base = (fatoData || []).filter((r: any) => {
          const raw = r.raw || {};
          const uf = getRaw(raw, ["cd_uf", "uf"]).trim().toUpperCase();
          if (uf !== "SC") return false;
          const pe = getRaw(raw, ["in_pronto_execucao", "pronto_execucao"]).trim().toUpperCase();
          if (pe !== "SIM") return false;
          const estadoKey = norm(fixEstado(r.ds_estado || ""));
          if (!STATUS_ABERTO.has(estadoKey)) return false;
          return true;
        });

        return base.filter((r: any) => {
          const raw = r.raw || {};
          if (cidade !== "all") {
            const mun = cleanLocal(getRaw(raw, ["ds_municipio"])).toUpperCase();
            if (mun !== cidade.toUpperCase()) return false;
          }
          if (status !== "all") {
            const sn = getRaw(raw, ["status_naf"]);
            const sp = computeStatusPot(sn, getRaw(raw, ["potencia_na_olt"]), getRaw(raw, ["potencia_na_ont"]));
            let targetStatus = "";
            if (status === "ok") targetStatus = "Potência OK";
            else if (status === "sem") targetStatus = "Sem Potência";
            else if (status === "ate") targetStatus = "Sinal_Atenuado";
            else if (status === "olt") targetStatus = "OLT_Atenuado";
            else if (status === "ont") targetStatus = "ONT_Atenuada";

            if (sp !== targetStatus) return false;
          }
          if (operadora !== "all") {
            const cp = getRaw(raw, ["cp", "cd_cp"]).trim().toUpperCase();
            if (cp !== operadora.toUpperCase()) return false;
          }
          return true;
        });
      };

      if (callbackData) {
        if (callbackData === "start") {
          const textMsg = "Olá! Bem-vindo ao bot de Concentração de Reparos da Ability Tecnologia. 🤖\n\nAqui você pode consultar ordens de serviço (SA) e aplicar filtros com a mesma regra de negócio do site.";
          const replyMarkup = {
            inline_keyboard: [
              [
                { "text": "🔍 Filtrar e Consultar", "callback_data": "menu:all:all:all" },
                { "text": "📊 Resumo de Alertas", "callback_data": "alerts_summary" }
              ],
              [
                { "text": "📥 Baixar Relatório (.xlsx)", "callback_data": "down:all:all:all" }
              ]
            ]
          };
          await editMessage(chatId, messageId, textMsg, replyMarkup);
          await answerCallbackQuery(callbackQueryId);
          return new Response("ok", { headers: corsHeaders });
        }

        if (callbackData === "alerts_summary") {
          const { data: thresholds } = await supabase.from("telegram_alert_thresholds").select("*").eq("active", true);
          const thrMap = new Map<string, number>();
          (thresholds || []).forEach((t: any) => thrMap.set(normCity(t.cidade), t.limite));

          const { data: fatoData } = await supabase
            .from("atividades_fato")
            .select("ds_estado, ds_macro_atividade, raw")
            .eq("ds_macro_atividade", "REP-FTTH");

          const base = (fatoData || []).filter((r: any) => {
            const raw = r.raw || {};
            const uf = getRaw(raw, ["cd_uf", "uf"]).trim().toUpperCase();
            if (uf !== "SC") return false;
            const pe = getRaw(raw, ["in_pronto_execucao", "pronto_execucao"]).trim().toUpperCase();
            if (pe !== "SIM") return false;
            const estadoKey = norm(fixEstado(r.ds_estado || ""));
            if (!STATUS_ABERTO.has(estadoKey)) return false;
            return true;
          });

          const counts: Record<string, number> = {};
          base.forEach((r: any) => {
            const raw = r.raw || {};
            const mun = normCity(getRaw(raw, ["ds_municipio"]));
            if (mun && thrMap.has(mun)) {
              counts[mun] = (counts[mun] || 0) + 1;
            }
          });

          let summaryText = "📊 <b>Resumo Atual de Alertas:</b>\n(Cidades que excederam o limite configurado)\n";
          let foundAny = false;
          for (const [cidade, limit] of thrMap.entries()) {
            const count = counts[cidade] || 0;
            if (count > limit) {
              summaryText += `\n📍 <b>${cidade}</b>: ${count} abertos (limite ${limit}) 🚨`;
              foundAny = true;
            }
          }
          if (!foundAny) {
            summaryText += "\n✅ Nenhuma cidade ultrapassou o limite no momento.";
          }

          const replyMarkup = {
            inline_keyboard: [
              [
                { "text": "⬅️ Voltar ao Menu", "callback_data": "start" }
              ]
            ]
          };

          await editMessage(chatId, messageId, summaryText, replyMarkup);
          await answerCallbackQuery(callbackQueryId);
          return new Response("ok", { headers: corsHeaders });
        }

        const parts = callbackData.split(":");
        const action = parts[0];
        
        if (action === "menu") {
          const cidade = parts[1] || "all";
          const status = parts[2] || "all";
          const operadora = parts[3] || "all";

          let count = 0;
          try {
            const filtered = await getFilteredSAs(cidade, status, operadora);
            count = filtered.length;
          } catch (err) {
            console.error(err);
          }

          const textMsg = `🔍 <b>Filtros Ativos:</b>\n` +
            `• 📍 Cidade: <b>${cidade === "all" ? "Todas" : cidade.toUpperCase()}</b>\n` +
            `• 🔌 Status Potência: <b>${statusNames[status]}</b>\n` +
            `• ⚡ Operadora: <b>${operadora === "all" ? "Todas" : operadora.toUpperCase()}</b>\n\n` +
            `Selecione uma opção para ajustar os filtros:`;

          const replyMarkup = {
            inline_keyboard: [
              [
                { "text": "📍 Filtrar Cidade", "callback_data": `sel:cidade:${cidade}:${status}:${operadora}` },
                { "text": "🔌 Filtrar Status Potência", "callback_data": `sel:status:${cidade}:${status}:${operadora}` }
              ],
              [
                { "text": "⚡ Filtrar Operadora", "callback_data": `sel:operadora:${cidade}:${status}:${operadora}` }
              ],
              [
                { "text": `📊 Consultar Resultados (${count} SAs)`, "callback_data": `show:${cidade}:${status}:${operadora}` }
              ],
              [
                { "text": "📥 Baixar Relatório (.xlsx)", "callback_data": `down:${cidade}:${status}:${operadora}` }
              ],
              [
                { "text": "❌ Limpar Filtros", "callback_data": "menu:all:all:all" },
                { "text": "⬅️ Voltar ao Início", "callback_data": "start" }
              ]
            ]
          };

          await editMessage(chatId, messageId, textMsg, replyMarkup);
          await answerCallbackQuery(callbackQueryId);
          return new Response("ok", { headers: corsHeaders });
        }

        if (action === "sel") {
          const page = parts[1];
          const cidade = parts[2] || "all";
          const status = parts[3] || "all";
          const operadora = parts[4] || "all";

          if (page === "cidade") {
            const textMsg = "📍 <b>Filtrar por Cidade:</b>\nSelecione a cidade desejada:";
            const replyMarkup = {
              inline_keyboard: [
                [
                  { "text": "Itajaí", "callback_data": `menu:itajai:${status}:${operadora}` },
                  { "text": "Joinville", "callback_data": `menu:joinville:${status}:${operadora}` }
                ],
                [
                  { "text": "Blumenau", "callback_data": `menu:blumenau:${status}:${operadora}` },
                  { "text": "Florianópolis", "callback_data": `menu:florianopolis:${status}:${operadora}` }
                ],
                [
                  { "text": "Brusque", "callback_data": `menu:brusque:${status}:${operadora}` }
                ],
                [
                  { "text": "Todas as Cidades", "callback_data": `menu:all:${status}:${operadora}` }
                ],
                [
                  { "text": "⬅️ Voltar", "callback_data": `menu:${cidade}:${status}:${operadora}` }
                ]
              ]
            };
            await editMessage(chatId, messageId, textMsg, replyMarkup);
          } else if (page === "status") {
            const textMsg = "🔌 <b>Filtrar por Status Potência:</b>\nSelecione a potência:";
            const replyMarkup = {
              inline_keyboard: [
                [
                  { "text": "Potência OK", "callback_data": `menu:${cidade}:ok:${operadora}` },
                  { "text": "Sem Potência", "callback_data": `menu:${cidade}:sem:${operadora}` }
                ],
                [
                  { "text": "Sinal Atenuado", "callback_data": `menu:${cidade}:ate:${operadora}` },
                  { "text": "OLT Atenuado", "callback_data": `menu:${cidade}:olt:${operadora}` }
                ],
                [
                  { "text": "ONT Atenuada", "callback_data": `menu:${cidade}:ont:${operadora}` }
                ],
                [
                  { "text": "Todos os Status", "callback_data": `menu:${cidade}:all:${operadora}` }
                ],
                [
                  { "text": "⬅️ Voltar", "callback_data": `menu:${cidade}:${status}:${operadora}` }
                ]
              ]
            };
            await editMessage(chatId, messageId, textMsg, replyMarkup);
          } else if (page === "operadora") {
            const textMsg = "⚡ <b>Filtrar por Operadora:</b>\nSelecione a operadora:";
            const replyMarkup = {
              inline_keyboard: [
                [
                  { "text": "TIM", "callback_data": `menu:${cidade}:${status}:tim` },
                  { "text": "NIO", "callback_data": `menu:${cidade}:${status}:nio` }
                ],
                [
                  { "text": "Todas", "callback_data": `menu:${cidade}:${status}:all` }
                ],
                [
                  { "text": "⬅️ Voltar", "callback_data": `menu:${cidade}:${status}:${operadora}` }
                ]
              ]
            };
            await editMessage(chatId, messageId, textMsg, replyMarkup);
          }
          await answerCallbackQuery(callbackQueryId);
          return new Response("ok", { headers: corsHeaders });
        }

        if (action === "show") {
          const cidade = parts[1] || "all";
          const status = parts[2] || "all";
          const operadora = parts[3] || "all";

          let filtered: any[] = [];
          try {
            filtered = await getFilteredSAs(cidade, status, operadora);
          } catch (err) {
            console.error(err);
          }

          let timCount = 0;
          let nioCount = 0;
          let comPotCount = 0;
          let semPotCount = 0;

          filtered.forEach((r: any) => {
            const raw = r.raw || {};
            const cp = getRaw(raw, ["cp", "cd_cp"]).trim().toUpperCase();
            if (cp === "TIM") timCount++;
            else if (cp === "NIO") nioCount++;

            const sn = getRaw(raw, ["status_naf"]);
            if (/com\s*pot/i.test(sn)) comPotCount++;
            else if (/sem\s*pot/i.test(sn)) semPotCount++;
          });

          const textMsg = `📊 <b>Resultados da Consulta:</b>\n` +
            `• Cidade: <b>${cidade === "all" ? "Todas" : cidade.toUpperCase()}</b>\n` +
            `• Status Potência: <b>${statusNames[status]}</b>\n` +
            `• Operadora: <b>${operadora === "all" ? "Todas" : operadora.toUpperCase()}</b>\n\n` +
            `🔹 Total de Reparos: <b>${filtered.length}</b>\n` +
            `🔹 Operadora TIM: <b>${timCount}</b>\n` +
            `🔹 Operadora NIO: <b>${nioCount}</b>\n` +
            `🔹 NAF Com Potência: <b>${comPotCount}</b>\n` +
            `🔹 NAF Sem Potência: <b>${semPotCount}</b>\n\n` +
            `Você pode baixar a planilha com a listagem completa desses registros clicando no botão abaixo:`;

          const replyMarkup = {
            inline_keyboard: [
              [
                { "text": "📥 Baixar Planilha (.xlsx)", "callback_data": `down:${cidade}:${status}:${operadora}` }
              ],
              [
                { "text": "⬅️ Voltar aos Filtros", "callback_data": `menu:${cidade}:${status}:${operadora}` }
              ]
            ]
          };

          await editMessage(chatId, messageId, textMsg, replyMarkup);
          await answerCallbackQuery(callbackQueryId);
          return new Response("ok", { headers: corsHeaders });
        }

        if (action === "down") {
          const cidade = parts[1] || "all";
          const status = parts[2] || "all";
          const operadora = parts[3] || "all";

          await answerCallbackQuery(callbackQueryId, "Gerando planilha...");

          let filtered: any[] = [];
          try {
            filtered = await getFilteredSAs(cidade, status, operadora);
          } catch (err) {
            console.error(err);
          }

          const excelData = filtered.map((r: any) => {
            const raw = r.raw || {};
            const sa = getRaw(raw, ["cd_nrba", "nrba"]);
            const estado = fixEstado(r.ds_estado || "");
            const abertura = fmtDateTime(getRaw(raw, ["dh_abertura_ba"]));
            const gpon = getRaw(raw, ["cd_gpon"]);
            const municipio = cleanLocal(getRaw(raw, ["ds_municipio"]));
            const estacao = getRaw(raw, ["cd_estacao"]);
            const setor = getRaw(raw, ["cd_setor"]);
            const logradouro = fixText(getRaw(raw, ["ds_logradouro"]));
            const numero = fixText(getRaw(raw, ["ds_numero"]));
            const compTipo = fixText(getRaw(raw, ["ds_complemento_tipo"]));
            const compDesc = fixText(getRaw(raw, ["ds_complemento_desc"]));
            const rua = [logradouro, numero, compTipo, compDesc].filter(Boolean).join(", ");
            const bairro = cleanLocal(getRaw(raw, ["ds_bairro"]));
            const cabo1 = getRaw(raw, ["cabo_primario"]);
            const cabo2 = getRaw(raw, ["cabo_secundario"]);
            const olt = getRaw(raw, ["olt"]);
            const cdo = getRaw(raw, ["cdo"]);
            const statusNaf = getRaw(raw, ["status_naf"]);
            const potOlt = fmtPot(getRaw(raw, ["potencia_na_olt"]));
            const potOnt = fmtPot(getRaw(raw, ["potencia_na_ont"]));
            const statusPot = computeStatusPot(statusNaf, getRaw(raw, ["potencia_na_olt"]), getRaw(raw, ["potencia_na_ont"]));
            return {
              SA: sa,
              Atividade: "REP-FTTH",
              Status_SA: estado,
              Abertura: abertura,
              Gpon: gpon,
              "Município": municipio,
              "Estação": estacao,
              Setor: setor,
              Rua: rua,
              Bairro: bairro,
              Cabo_Primario: cabo1,
              Cabo_Secundario: cabo2,
              olt: olt,
              cdo: cdo,
              "Status Naf": statusNaf,
              "Status Potências": statusPot,
              Ptcia_OLT: potOlt,
              Ptcia_ONT: potOnt,
              "Nome do Cliente": "",
              "Contato": "",
            };
          });

          const ws = XLSX.utils.json_to_sheet(excelData);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, "Concentracao");
          const fileBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

          const formData = new FormData();
          formData.append("chat_id", String(chatId));
          formData.append(
            "document",
            new Blob([fileBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
            "concentracao_reparos.xlsx"
          );
          formData.append(
            "caption",
            `📥 <b>Planilha de Concentração de Reparos</b>\n` +
            `• Cidade: ${cidade === "all" ? "Todas" : cidade.toUpperCase()}\n` +
            `• Status Potência: ${statusNames[status]}\n` +
            `• Operadora: ${operadora === "all" ? "Todas" : operadora.toUpperCase()}\n` +
            `• Total: <b>${filtered.length} SAs</b>`
          );

          await fetch(`${GATEWAY_URL}/sendDocument`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${lovableKey}`,
              "X-Connection-Api-Key": telegramKey,
            },
            body: formData,
          });

          return new Response("ok", { headers: corsHeaders });
        }
      }

      if (text) {
        const trimmed = text.trim();
        const isCommand = /^\/(start|menu|ajuda|help)\b/i.test(trimmed);

        // Check AI flag
        const { data: cfgRow } = await supabase
          .from("telegram_alert_config")
          .select("ai_enabled")
          .limit(1)
          .maybeSingle();
        const aiOn = cfgRow?.ai_enabled !== false;

        const showMenu = async () => {
          const textMsg = "Olá! Bem-vindo ao bot de Concentração de Reparos da Ability Tecnologia. 🤖\n\nVocê pode <b>conversar comigo em português</b> (ex.: <i>“quantos reparos abertos em Itajaí com sem potência?”</i>) ou usar os botões abaixo.";
          const replyMarkup = {
            inline_keyboard: [
              [
                { "text": "🔍 Filtrar e Consultar", "callback_data": "menu:all:all:all" },
                { "text": "📊 Resumo de Alertas", "callback_data": "alerts_summary" }
              ],
              [
                { "text": "📥 Baixar Relatório (.xlsx)", "callback_data": "down:all:all:all" }
              ]
            ]
          };
          await sendMessage(chatId, textMsg, replyMarkup);
        };

        if (isCommand || !aiOn) {
          await showMenu();
        } else {
          // ====== AI mode (Lovable AI Gateway) ======
          try {
            // Compute current full snapshot once
            const { data: fatoData } = await supabase
              .from("atividades_fato")
              .select("ds_estado, ds_macro_atividade, raw")
              .eq("ds_macro_atividade", "REP-FTTH");

            const base = (fatoData || []).filter((r: any) => {
              const raw = r.raw || {};
              const uf = getRaw(raw, ["cd_uf", "uf"]).trim().toUpperCase();
              if (uf !== "SC") return false;
              const pe = getRaw(raw, ["in_pronto_execucao", "pronto_execucao"]).trim().toUpperCase();
              if (pe !== "SIM") return false;
              const estadoKey = norm(fixEstado(r.ds_estado || ""));
              if (!STATUS_ABERTO.has(estadoKey)) return false;
              return true;
            });

            const stats: any = {
              total: base.length,
              por_cidade: {} as Record<string, number>,
              por_operadora: {} as Record<string, number>,
              por_status_potencia: {} as Record<string, number>,
              top_bairros: {} as Record<string, number>,
              top_olts: {} as Record<string, number>,
              top_cdos: {} as Record<string, number>,
            };
            base.forEach((r: any) => {
              const raw = r.raw || {};
              const mun = cleanLocal(getRaw(raw, ["ds_municipio"])).toUpperCase() || "—";
              const cp = getRaw(raw, ["cp", "cd_cp"]).trim().toUpperCase() || "—";
              const sn = getRaw(raw, ["status_naf"]);
              const sp = computeStatusPot(sn, getRaw(raw, ["potencia_na_olt"]), getRaw(raw, ["potencia_na_ont"])) || "—";
              const bairro = (getRaw(raw, ["ds_bairro"]) || "—").toUpperCase().trim();
              const olt = (getRaw(raw, ["olt"]) || "—").toUpperCase().trim();
              const cdo = (getRaw(raw, ["cdo"]) || "—").toUpperCase().trim();
              stats.por_cidade[mun] = (stats.por_cidade[mun] || 0) + 1;
              stats.por_operadora[cp] = (stats.por_operadora[cp] || 0) + 1;
              stats.por_status_potencia[sp] = (stats.por_status_potencia[sp] || 0) + 1;
              stats.top_bairros[bairro] = (stats.top_bairros[bairro] || 0) + 1;
              stats.top_olts[olt] = (stats.top_olts[olt] || 0) + 1;
              stats.top_cdos[cdo] = (stats.top_cdos[cdo] || 0) + 1;
            });
            const topK = (obj: Record<string, number>, k = 10) =>
              Object.fromEntries(Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, k));
            stats.top_bairros = topK(stats.top_bairros, 15);
            stats.top_olts = topK(stats.top_olts, 10);
            stats.top_cdos = topK(stats.top_cdos, 15);

            const sysPrompt =
              "Você é o assistente do módulo Concentração de Reparos da Ability Tecnologia. " +
              "Responda sempre em português do Brasil, de forma curta, direta e usando os dados do JSON fornecido. " +
              "Se a pergunta for sobre quantidades por cidade, operadora, status de potência, bairros, OLTs ou CDOs, use o JSON. " +
              "Se faltar dado, diga claramente que não está disponível no momento. " +
              "Quando fizer sentido, sugira que o usuário use o menu (/start) para baixar a planilha Excel completa. " +
              "Use emojis com moderação e formate com HTML simples (apenas <b> e <i>).";
            const userPrompt = `Pergunta do usuário: ${trimmed}\n\nDados atuais (snapshot):\n${JSON.stringify(stats)}`;

            const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${lovableKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "google/gemini-2.5-flash",
                messages: [
                  { role: "system", content: sysPrompt },
                  { role: "user", content: userPrompt },
                ],
              }),
            });
            const aiJson = await aiResp.json();
            const reply = aiJson?.choices?.[0]?.message?.content?.toString().trim();
            if (reply) {
              const replyMarkup = {
                inline_keyboard: [[
                  { text: "🔍 Menu", callback_data: "start" },
                  { text: "📥 Baixar Excel", callback_data: "down:all:all:all" },
                ]],
              };
              await sendMessage(chatId, reply, replyMarkup);
            } else {
              await showMenu();
            }
          } catch (e) {
            console.error("AI error:", e);
            await showMenu();
          }
        }
      }

      return new Response("ok", { headers: corsHeaders });
    } catch (err) {
      console.error("Erro processando webhook Telegram:", err);
      return new Response("ok", { headers: corsHeaders });
    }
  }

  // Auth: only require user auth for non-cron / non-webhook callers
  let isCron = false;
  if (token && token === serviceRole) {
    isCron = true;
  } else if (triggerHeader === "cron-hourly") {
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

  const isTest = url.searchParams.get("test") === "true";
  const triggeredBy =
    req.headers.get("x-trigger") ||
    url.searchParams.get("trigger") ||
    (isTest ? "manual-test" : "cron");

  try {
    if (!lovableKey || !telegramKey) {
      throw new Error("Conexão Telegram não configurada (LOVABLE_API_KEY/TELEGRAM_API_KEY ausente).");
    }

    if (url.searchParams.get("setWebhook") === "true") {
      const webhookUrl = `${supabaseUrl}/functions/v1/telegram-send-alert`;
      const resp = await fetch(`${GATEWAY_URL}/setWebhook`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": telegramKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: webhookUrl,
        }),
      });
      const resText = await resp.text();
      return new Response(
        JSON.stringify({ ok: resp.ok, text: resText, webhookUrl }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    // Janela de horário (apenas para envio automático/cron; testes ignoram)
    if (!isTest) {
      const startH = configRow?.start_hour ?? 8;
      const endH = configRow?.end_hour ?? 20;
      const weekdays: number[] = Array.isArray(configRow?.weekdays)
        ? configRow.weekdays
        : [0, 1, 2, 3, 4, 5, 6];
      const intervalMin = configRow?.interval_minutes ?? 60;

      const nowSP = new Date(
        new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }),
      );
      const dow = nowSP.getDay(); // 0=dom, 6=sab
      const hour = nowSP.getHours();
      const minute = nowSP.getMinutes();

      const dowOk = weekdays.includes(dow);
      // janela [startH, endH) — se end<=start, considera atravessando meia-noite
      const hourOk = endH > startH
        ? hour >= startH && hour < endH
        : hour >= startH || hour < endH;

      // controle de intervalo: só envia se o último envio bem-sucedido foi há >= intervalMin
      if (dowOk && hourOk && intervalMin > 1) {
        const sinceIso = new Date(Date.now() - (intervalMin - 1) * 60 * 1000).toISOString();
        const { data: recentSent } = await supabase
          .from("telegram_alert_log")
          .select("id")
          .eq("success", true)
          .gte("sent_at", sinceIso)
          .not("cidade", "is", null)
          .limit(1);
        if (recentSent && recentSent.length > 0) {
          return new Response(
            JSON.stringify({ ok: true, skipped: `interval ${intervalMin}min not elapsed` }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }

      if (!dowOk || !hourOk) {
        return new Response(
          JSON.stringify({
            ok: true,
            skipped: `outside schedule (dow=${dow}, hour=${hour}:${String(minute).padStart(2,"0")}, window=${startH}-${endH}h, days=${weekdays.join(",")})`,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const sanitizeChat = (s: string) => {
      const v = String(s || "").trim();
      const neg = v.startsWith("-");
      const digits = v.replace(/[^0-9]/g, "");
      return digits ? (neg ? `-${digits}` : digits) : "";
    };
    const activeRecipients = (recipients || [])
      .map((r: any) => ({ ...r, chat_id: sanitizeChat(r.chat_id) }))
      .filter((r: any) => r.chat_id);
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
      // Auto-set/refresh the Telegram webhook URL when sending a test!
      try {
        const webhookUrl = `${supabaseUrl}/functions/v1/telegram-send-alert`;
        await fetch(`${GATEWAY_URL}/setWebhook`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovableKey}`,
            "X-Connection-Api-Key": telegramKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: webhookUrl,
          }),
        });
      } catch (err) {
        console.error("Erro configurando Webhook no teste:", err);
      }

      messageText =
        `✅ <b>Teste de Alerta — Concentração de Reparos</b>\n` +
        `Disparo manual em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.\n` +
        `Destinatários ativos: ${activeRecipients.length}.\n` +
        `Cidades monitoradas: ${(thresholds || []).map((t: any) => `${t.cidade}>${t.limite}`).join(", ") || "—"}`;
    } else {
      const thrMap = new Map<string, number>();
      (thresholds || []).forEach((t: any) => thrMap.set(normCity(t.cidade), t.limite));
      if (thrMap.size === 0) {
        return new Response(JSON.stringify({ ok: true, skipped: "no thresholds" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch from atividadesfato applying exact website business rules
      const { data: fatoData, error: fatoError } = await supabase
        .from("atividades_fato")
        .select("ds_estado, ds_macro_atividade, raw")
        .eq("ds_macro_atividade", "REP-FTTH");
      
      if (fatoError) throw fatoError;

      const base = (fatoData || []).filter((r: any) => {
        const raw = r.raw || {};
        const uf = getRaw(raw, ["cd_uf", "uf"]).trim().toUpperCase();
        if (uf !== "SC") return false;
        const pe = getRaw(raw, ["in_pronto_execucao", "pronto_execucao"]).trim().toUpperCase();
        if (pe !== "SIM") return false;
        const estadoKey = norm(fixEstado(r.ds_estado || ""));
        if (!STATUS_ABERTO.has(estadoKey)) return false;
        return true;
      });

      const oneHourAgo = Date.now() - 60 * 60 * 1000;

      // Group and Aggregate
      type BairroInfo = {
        nome: string;
        total: number;
        cdos: Map<string, number>;
      };
      type Acc = {
        total: number;
        novosHora: number;
        bairros: Map<string, BairroInfo>;
        olts: Map<string, number>;
      };
      const perCity = new Map<string, Acc>();

      for (const r of base) {
        const raw = (r.raw || {}) as Record<string, unknown>;
        const municipio = normCity(String(raw["ds_municipio"] || ""));
        if (!municipio) continue;
        if (!thrMap.has(municipio)) continue;

        let acc = perCity.get(municipio);
        if (!acc) {
          acc = { total: 0, novosHora: 0, bairros: new Map(), olts: new Map() };
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

        let bInfo = acc.bairros.get(bairro);
        if (!bInfo) {
          bInfo = { nome: bairro, total: 0, cdos: new Map() };
          acc.bairros.set(bairro, bInfo);
        }
        bInfo.total++;
        bInfo.cdos.set(cdo, (bInfo.cdos.get(cdo) || 0) + 1);

        acc.olts.set(olt, (acc.olts.get(olt) || 0) + 1);
      }

      // Build alerts
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

      // Cooldown check
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

      const nowStr = new Date().toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
      });
      
      const blocks: string[] = [`🚨 <b>Concentração de Reparos</b> — ${nowStr}`];
      for (const { cidade, acc, limite } of alerting) {
        const delta = acc.novosHora > 0 ? ` | <b>+${acc.novosHora}</b> na última hora` : "";
        const lines: string[] = [];
        lines.push(`\n📍 <b>${cidade}</b> — ${acc.total} abertos (limite ${limite})${delta}`);

        const sortedBairros = [...acc.bairros.values()]
          .sort((a, b) => b.total - a.total)
          .slice(0, 3);
        for (const bInfo of sortedBairros) {
          lines.push(`🏘 <b>${bInfo.nome}</b> (${bInfo.total} abertos)`);
          const sortedCDOs = [...bInfo.cdos.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);
          if (sortedCDOs.length > 0) {
            lines.push(`└── 🔌 CDOs:`);
            sortedCDOs.forEach(([cdoName, cdoCount]) => {
              lines.push(`           <code>${cdoName}</code> (${cdoCount})`);
            });
          }
        }

        const olts = topN(acc.olts, 3);
        if (olts.length > 0) {
          lines.push(`⚡️ OLTs:`);
          olts.forEach(([k, v]) => {
            lines.push(`        <code>${k}</code> (${v})`);
          });
        }

        blocks.push(lines.join("\n"));
      }

      messageText = blocks.join("\n");
      cidadeAlerta = alerting.map((a) => a.cidade).join(", ");
      totalReparosAlerta = alerting.reduce((s, a) => s + a.acc.total, 0);
      novosUltimaHoraAlerta = totalNovos;
    }

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

    let userFacingError: string | null = null;
    const chatNotFound = results.find((r) => !r.ok && (r.error || "").includes("chat not found"));
    if (chatNotFound) {
      let botUsername = "";
      try {
        const meResp = await fetch(`${GATEWAY_URL}/getMe`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovableKey}`,
            "X-Connection-Api-Key": telegramKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        });
        const meJson = await meResp.json();
        botUsername = meJson?.result?.username ? ` (@${meJson.result.username})` : "";
      } catch {
        botUsername = "";
      }
      userFacingError = `O Telegram não encontrou o Chat ID ${chatNotFound.chat_id} no bot conectado${botUsername}. Abra esse bot no Telegram e envie /start, ou informe o chat_id correto desse mesmo bot.`;
    } else if (!allOk) {
      userFacingError = results.find((r) => !r.ok)?.error || "Falha ao enviar mensagem no Telegram.";
    }

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
      JSON.stringify({ ok: allOk, results, message: messageText, error: userFacingError }),
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