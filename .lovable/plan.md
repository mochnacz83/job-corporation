## Objetivo

Quando **Atividade = REPARO** e **Tipo Aplicação = APLICAR/BAIXAR**, o módulo Controle de Materiais passa a permitir registrar, em cada linha de material, **dois seriais**: o **Serial Aplicado** (material novo instalado) e o **Serial Retirado** (material defeituoso recolhido). Ao salvar, são gerados dois registros independentes:

1. **Coleta APLICAR/BAIXAR** — entra normalmente no fluxo Gestech (com o serial aplicado).
2. **Coleta REVERSA** vinculada — gera PDF de reversa próprio com o serial retirado, e fica disponível no relatório como item de logística reversa.

## Escopo blindado (NÃO mexer)

- Lógica e regras de qualquer outro tipo (`ATIVAÇÃO`, `PREVENTIVA`, `RETIRADA`, `SEM MATERIAL`, `REVERSA` standalone) permanece intacta.
- Validação global de serial único, edit-request workflow, PDFs já existentes, filtros, dedup do Gestech, RLS, assinaturas e fluxo de almoxarifado seguem como estão.
- Nada muda quando `tipo_aplicacao = APLICAR/BAIXAR` em `ATIVAÇÃO` ou `PREVENTIVA` — comportamento atual preservado.

## Mudanças

### 1. Banco (migração)

- Adicionar coluna `serial_retirado text NULL` em `material_coleta_items` (não afeta seriais existentes).
- Adicionar coluna `linked_aplicacao_id uuid NULL` em `material_coletas` para amarrar a reversa gerada à coleta de aplicação que a originou (referência fraca, sem FK para evitar bloqueios).
- Ajustar a função `enforce_unique_serial` para também checar o `serial_retirado` no mesmo conjunto único (mesmas regras de ignorar vazio/N/A/-).

### 2. UI do formulário (`src/pages/MaterialColeta.tsx`)

- Novo flag derivado: `isReparoAplicarBaixar = atividade === "REPARO" && tipoAplicacao === "APLICAR/BAIXAR"`.
- Quando `isReparoAplicarBaixar`, em cada linha de material exibir dois campos lado a lado:
  - **Serial Aplicado** (campo `serial` atual, com scanner)
  - **Serial Retirado** (novo campo, com scanner)
  - Validação on-the-fly de unicidade global em ambos.
- Bloco extra de "Documentação da Reversa" (somente quando `isReparoAplicarBaixar`):
  - Foto dos materiais retirados (compressão como hoje)
  - Assinatura do colaborador (canvas)
  - Assinatura do almoxarifado opcional (mesmo padrão de reversa atual)
- O bloco original de aplicação (sem assinatura) continua valendo para a parte aplicada.

### 3. Salvamento

Ao submeter com `isReparoAplicarBaixar`:

1. Validar serial aplicado e serial retirado obrigatórios em cada item; foto e assinatura do colaborador obrigatórios para a reversa.
2. Inserir **coleta A (APLICAR/BAIXAR)** com `material_coleta_items` carregando `serial = serial_aplicado` e `serial_retirado = serial_retirado` (auditoria).
3. Inserir **coleta B (REVERSA)** com `linked_aplicacao_id = A.id`, copiando técnico/cidade/UF/BA/circuito/data, com itens contendo apenas `serial = serial_retirado` e a foto/assinaturas da reversa.
4. Gerar PDF padrão de aplicação para A e PDF de reversa para B (reutilizando funções existentes — sem alterar a função de PDF de reversa).
5. Trackear ambas as ações.

### 4. Relatórios e Gestech

- Coleta A aparece como APLICAR/BAIXAR → continua elegível para exportação Gestech (regra atual).
- Coleta B aparece como REVERSA → continua excluída do Gestech (já é a regra hoje, sem alteração).
- Visualização da coleta mostra link "Reversa vinculada" quando `linked_aplicacao_id` existe.

## Detalhes técnicos

- Tipo `MaterialItem` ganha campo opcional `serial_retirado: string`.
- Tipo `ColetaRecord.material_coleta_items` ganha `serial_retirado: string | null` (somente leitura, para futuras telas).
- Reuso integral de:
  - `validateSeriaisUnique` (estendido para incluir `serial_retirado`).
  - Funções de geração de PDF (`generateReversaPDF` / `generateAplicacaoPDF` existentes).
  - Upload de foto e assinaturas (mesmas helpers).
- Tudo o que envolve `tipoAplicacao === "REVERSA"` standalone (criada manualmente) continua funcionando — não alteramos esse caminho.

## Arquivos afetados

- `supabase/migrations/<timestamp>_reparo_aplicar_baixar_dual_serial.sql` (novo)
- `src/pages/MaterialColeta.tsx` (UI + lógica de submit)
- `mem://features/material-coleta/form-logic` (atualizar memória com a nova regra)

## Confirmações antes de codar

1. PDF da reversa vinculada deve usar **o mesmo template** da reversa standalone atual (sem mudanças no template), correto?
2. Se admin futuramente excluir a coleta A (aplicação), a coleta B (reversa) deve ficar **órfã** ou ser excluída em cascata?
