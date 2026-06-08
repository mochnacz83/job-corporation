# Ajustes no Bot Telegram — Concentração de Reparos

Tudo fica **só no bot/edge functions**. As regras de negócio da página `ConcentracaoReparos` não serão alteradas.

---

## 1. Novo layout hierárquico das mensagens automáticas

Cada cidade acima do limite vai sair assim (HTML do Telegram):

```text
📍 BLUMENAU — 46 abertos (limite 35) | +4 na última hora

🏘 ITOUPAVA CENTRAL (5 abertos)
└── 🔌 CDOs:
        CDOE-4427M (2)
        CDOI-316 (1)
        CDOE-4424M (1)

🏘 ITOUPAVAZINHA (5 abertos)
└── 🔌 CDOs:
        CDOE-9707 (2)
        CDOE-3314 (1)
        CDOE-3901 (1)

⚡️ OLTs:
     SC-ITSC1-GHUA (8)
     SC-AGVY1-GHUA (6)
     SC-ITSC2-GHUA (6)
```

- Top 3 bairros (com top 3 CDOs **dentro de cada bairro**).
- Bloco único de top 3 OLTs ao final da cidade.
- Reescrevo a função `telegram-send-alert` para montar esse formato.

---

## 2. Janela de horários (em vez de só cooldown em minutos)

Substituo a configuração atual por uma agenda semanal simples:

- `enabled` (liga/desliga geral)
- `start_hour` (ex.: 08) e `end_hour` (ex.: 20) — só envia automaticamente dentro dessa janela
- `weekdays` (segunda a domingo, multi-seleção)
- `interval_minutes` (15/30/60) — frequência dentro da janela
- `cooldown_minutes` mantido como anti-spam por cidade

Na UI da aba **Alertas Telegram**:
- Card "Janela de envio" com sliders/selects para início/fim, dias da semana, intervalo.
- Indicador "Próximo envio previsto: HH:MM" e "Status agora: ATIVO/FORA DA JANELA".
- O cron continua de hora em hora, mas a função **só dispara** se a hora atual estiver dentro da janela.

---

## 3. Bot interativo com IA + Excel

Crio um segundo edge function **`telegram-webhook`** (`verify_jwt=false`) que recebe mensagens do Telegram, com:

### Comandos diretos (rápidos, sem IA)
- `/start` — boas-vindas + menu inline
- `/totais` — total de reparos abertos por cidade
- `/cidade <nome>` — resumo da cidade (bairros, CDOs, OLTs)
- `/potencia` — reparos com causa relacionada a potência ótica
- `/operadora <nome>` — reparos por operadora (produto/cliente)
- `/excel <filtro>` — gera planilha XLSX e envia como documento
- `/ajuda` — lista de comandos

### Modo conversa com IA
Qualquer mensagem em texto livre é enviada ao **Lovable AI Gateway** (`google/gemini-2.5-flash`) com **function calling**. As funções expostas para a IA:
- `consultar_reparos({cidade?, bairro?, cdo?, olt?, operadora?, causa?, tecnologia?})`
- `top_concentracoes({por: 'cidade'|'bairro'|'cdo'|'olt', limite?})`
- `exportar_excel({filtros})` → devolve link/arquivo

A IA interpreta perguntas como *"quantos reparos abertos por potência em Itajaí hoje?"* e chama a função certa. Resposta volta formatada e, quando aplicável, com botão inline **"📊 Exportar Excel"**.

### Exportação Excel
- Geração do XLSX dentro do edge function (`xlsx` via esm.sh).
- Colunas pré-definidas: Protocolo, Designação, Cliente, Produto, Cidade, Bairro, CDO, OLT, Causa N1/N2/N3, TMR, Data Abertura.
- Enviado como `sendDocument` pelo gateway Telegram.

### Registro do webhook
Faço o `setWebhook` automaticamente após o deploy (chamada via gateway, com `secret_token` derivado do `TELEGRAM_API_KEY`, conforme padrão Lovable).

---

## 4. Banco — nova tabela de agenda

```sql
ALTER TABLE telegram_alert_config
  ADD COLUMN start_hour int DEFAULT 8,
  ADD COLUMN end_hour int DEFAULT 20,
  ADD COLUMN weekdays int[] DEFAULT '{1,2,3,4,5,6,0}',
  ADD COLUMN interval_minutes int DEFAULT 60;
```

Tabela nova `telegram_chat_sessions` (opcional, para guardar contexto curto da conversa por chat_id).

---

## 5. Arquivos afetados

**Criar:**
- `supabase/functions/telegram-webhook/index.ts` (interativo + IA + Excel)
- `supabase/migrations/<timestamp>_telegram_schedule.sql`

**Editar:**
- `supabase/functions/telegram-send-alert/index.ts` — novo layout + checagem de janela
- `supabase/config.toml` — adicionar `[functions.telegram-webhook] verify_jwt=false`
- `src/components/TelegramAlertsTab.tsx` — UI da janela de horários, dias da semana, intervalo, status atual, prévia do novo layout
- `.lovable/plan.md` — atualizar com este novo escopo

---

## 6. Ordem de execução

1. Migração (`ALTER TABLE` + tabela de sessões).
2. Reescrita do `telegram-send-alert` (layout + janela).
3. Novo `telegram-webhook` (comandos + IA + Excel) e registro do webhook.
4. UI da aba Alertas Telegram.
5. Deploy de ambas as funções e teste prático: enviar `/start` ao bot, pedir "reparos por potência em Blumenau", clicar "Exportar Excel".

---

## Observações importantes

- Sem mudanças em `ConcentracaoReparos.tsx` (regras de negócio intactas).
- Tudo continua admin-only no painel.
- A IA usa o `LOVABLE_API_KEY` já existente — sem custos extras de chave.
- Posso seguir? Se aprovar, executo tudo de uma vez e deixo operacional.
