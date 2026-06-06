# Integração Telegram — Alertas de Concentração de Reparos

## Objetivo
Enviar automaticamente mensagens no Telegram (a cada hora) quando determinadas cidades ultrapassarem os limites de reparos abertos, detalhando bairros, CDOs, OLTs e quantidade de reparos novos na última hora.

---

## Como vai funcionar (visão geral)

1. Você cria um bot no Telegram via **@BotFather** (passo a passo abaixo).
2. Conecta o Telegram no Lovable (via Connector — eu vou solicitar quando estiver pronto).
3. Eu crio uma tela administrativa **"Alertas Telegram"** onde você cadastra:
   - **Chat IDs destinatários** (pessoas/grupos que recebem o alerta)
   - **Limites por cidade** (Itajaí >30, Blumenau >35, Joinville >35, Florianópolis >20, Brusque >20) — editáveis
   - Liga/desliga alertas e botão "Enviar teste agora"
4. Um **cron a cada hora** executa uma Edge Function que:
   - Lê `fato_reparos` (reparos abertos = sem `data_fechamento`)
   - Agrupa por cidade, compara com limites
   - Para cada cidade acima do limite, calcula:
     - Total de reparos abertos
     - **Novos reparos na última hora** (delta)
     - Top bairros (com qtd)
     - Top CDOs (com qtd)
     - Top OLTs (com qtd)
   - Monta mensagem formatada e envia para cada destinatário via Telegram Bot API (gateway Lovable)
   - Registra log em `telegram_alert_log` para auditoria e evitar duplicidade

---

## Passo a passo para você (usuário)

### 1. Criar o bot no Telegram
1. No Telegram, busque **@BotFather** e abra a conversa.
2. Envie `/newbot` → escolha um nome (ex: "Alertas Reparos SC") → escolha um username terminando em `bot` (ex: `alertas_reparos_sc_bot`).
3. O BotFather devolve um **token** (algo como `123456:ABC-DEF...`). **Copie e guarde.**

### 2. Descobrir o Chat ID de cada destinatário
- **Para pessoa individual:** a pessoa precisa abrir o bot e enviar `/start`. Depois acesse `https://api.telegram.org/bot<SEU_TOKEN>/getUpdates` no navegador — pegue o `chat.id` (número).
- **Para grupo:** adicione o bot ao grupo, envie qualquer mensagem, acesse o mesmo URL e pegue o `chat.id` do grupo (geralmente negativo, ex: `-1001234567890`).
- Salve esses Chat IDs — você vai colá-los na tela de configuração.

### 3. Conectar o Telegram no Lovable
Quando eu pedir, clique no botão de conectar e cole o **token do bot**. Após isso, o Lovable cuida da autenticação automaticamente — o token não fica exposto no código.

### 4. Cadastrar destinatários e limites
Vá em **Concentração de Reparos → aba "Alertas Telegram"** (vou criar) e:
- Adicione um Chat ID por linha com label (ex: "Grupo Operação SC").
- Ajuste os limites por cidade.
- Ative o alerta.
- Clique **"Enviar teste"** para validar.

---

## O que vou implementar (técnico)

### Banco
Migração criando:
- `telegram_alert_config` — config global (1 linha): `enabled`, `cooldown_minutes` (padrão 60)
- `telegram_alert_recipients` — `chat_id`, `label`, `active`
- `telegram_alert_thresholds` — `cidade`, `limite` (seed: Itajaí 30, Blumenau 35, Joinville 35, Florianópolis 20, Brusque 20)
- `telegram_alert_log` — `cidade`, `total_reparos`, `novos_ultima_hora`, `sent_at`, `success`, `error_message`, `payload`
- RLS: leitura/escrita apenas para `admin`; GRANTs corretos.

### Edge Functions
1. **`telegram-send-alert`** (`verify_jwt = true`, admin-only)
   - Calcula concentrações em `fato_reparos` (cidades acima do limite, top bairros/CDOs/OLTs, delta última hora).
   - Envia mensagem formatada via gateway `https://connector-gateway.lovable.dev/telegram/sendMessage` para cada destinatário ativo.
   - Aceita `?test=true` para forçar envio de mensagem de teste.
   - Grava em `telegram_alert_log`.

2. **Cron horário (pg_cron + pg_net)** — agendado via `supabase--insert` para chamar a função a cada hora cheia.

### Frontend
- Nova aba **"Alertas Telegram"** em `ConcentracaoReparos.tsx` (admin-only) com:
  - Switch "Alertas ativos"
  - Tabela de destinatários (CRUD: chat_id, label, ativo)
  - Tabela de limites por cidade (editáveis)
  - Botão "Enviar teste agora"
  - Histórico dos últimos 20 envios (`telegram_alert_log`)
  - Instruções resumidas de como obter chat_id

### Formato da mensagem (exemplo)
```text
🚨 Concentração de Reparos — 14:00

📍 ITAJAÍ — 42 abertos (limite 30) | +5 na última hora
   Bairros: Centro (12), Fazenda (8), Cordeiros (6)
   CDOs: CDOE-1234 (9), CDOE-5678 (7)
   OLTs: OLT-ITJ-01 (15), OLT-ITJ-02 (10)

📍 BLUMENAU — 38 abertos (limite 35) | +3 na última hora
   ...
```

---

## Ordem de execução
1. Migração do banco (espera sua aprovação).
2. Solicito a conexão do Telegram (você cola o token).
3. Crio Edge Function + cron.
4. Crio a aba de configuração no frontend.
5. Você cadastra destinatários, clica "Enviar teste" e confirma recebimento.

---

## Observações
- Regras de negócio existentes em `ConcentracaoReparos` **não serão alteradas** — apenas adiciono uma aba nova.
- Tudo restrito a admin (consistente com o padrão do app).
- O cooldown evita spam: se a cidade já alertou na última hora e o delta novo é 0, não reenvia.

Aprovar para eu começar?
