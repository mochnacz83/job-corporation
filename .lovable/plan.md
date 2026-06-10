## Módulo Qualidade FTTH

Novo módulo independente. **Nada das regras existentes é alterado** — Telegram, Concentração de Reparos, Material Coleta, permissões atuais permanecem intactos.

### 1. Banco de dados (1 nova migração)

**Tabela única `quality_records`** (mais simples que 8 tabelas, mesma performance com índice por `indicador`):

| campo | tipo | observação |
|---|---|---|
| `id` | uuid PK | |
| `indicador` | text | `'reparo_por_planta'`, `'reparo_no_prazo'`, `'instalacao_no_prazo'`, `'infancia_30_dias'`, `'cumprimento_1a_reparo'`, `'cumprimento_1a_instalacao'`, `'infancia_30_dias_instalacao'`, `'repetida_30_dias'` |
| `tecnico` | text | matrícula (TR/TT) extraída do CSV |
| `num_documento` | text | id do reparo/instalação |
| `municipio` / `uf` / `cdo` / `cdo_name` | text | filtros |
| `dat_abertura` / `dat_fechamento` | timestamptz | |
| `in_flag_indicador` | text | `'SIM'`/`'NAO'` |
| `raw` | jsonb | linha bruta completa |
| `imported_at` | timestamptz | |
| `import_batch` | uuid | |

Índices: `(indicador, tecnico)`, `(indicador, dat_abertura)`.

**Tabela `quality_imports`**: log de importações (arquivo, indicador, linhas, quem importou, quando).

**Tabela `quality_tecnicos_extra`** (opcional, vazia por padrão): mapeia `matricula → supervisor, coordenador` quando vier separadamente. Por padrão usa `tecnicos_cadastro` existente.

**RLS**:
- `quality_records` / `quality_imports`: SELECT para `authenticated` com permissão `qualidade_ftth`; INSERT/UPDATE/DELETE para admin ou `qualidade_upload`.
- GRANTs explícitos.

### 2. Permissões

Duas novas chaves em `area_permissions` (sem alterar lógica existente):
- `qualidade_ftth` — leitura/visualização do módulo
- `qualidade_upload` — importação de bases

Admin tem acesso automático (regra já existente).

### 3. Edge function `upload-qualidade-csv`

- Recebe `multipart/form-data` com `file` + `indicador`.
- Detecta cabeçalho (delimitador `;`), normaliza colunas, extrai `tecnico` (campo `tecnico` ou `matricula_tecnico`), `municipio`, `uf`, `cdo`/`cdo_name`, `dat_abertura`, `dat_fechamento`, `in_flag_indicador`, e guarda a linha bruta em `raw`.
- Estratégia de carga: **substitui** todos os registros do indicador selecionado pelos do CSV (igual ao padrão de Concentração de Reparos com `raw_b2b` etc.).
- Loga em `quality_imports`.
- Valida permissão (`admin` ou `qualidade_upload`) com JWT do usuário.

### 4. Página `src/pages/QualidadeFTTH.tsx` (3 abas)

**Aba 1 — Painel por Supervisor (default)**
- Tabela com colunas: `Supervisor | Coordenador | Reparo Planta (qtd / %) | Reparo Prazo | Instalação Prazo | Infância 30d | 1ª Agenda Reparo | 1ª Agenda Instalação | Infância Instalação | Repetida 30d`
- Cada célula mostra `qtd / pct%` (formato pedido pelo usuário).
- `%` = (SIM / total) × 100 do `in_flag_indicador`.
- Agregação: JOIN `quality_records.tecnico` → `tecnicos_cadastro.matricula` → `supervisor`.
- Filtro por UF/município/CDO no topo.
- Click no supervisor → muda para Aba 2 já filtrada.

**Aba 2 — Detalhe por Técnico**
- Seletor de supervisor (preenchido ao clicar na Aba 1).
- Mesma tabela, mas linhas = técnicos daquele supervisor.
- Botão "Voltar para Painel".

**Aba 3 — Carregar Bases** (somente admin/`qualidade_upload`)
- 8 cards, um por indicador. Cada card mostra:
  - Nome amigável do indicador
  - Data da última importação + qtd de linhas
  - Botão "Carregar CSV" (input file `.csv`)
  - Link de referência para o usuário baixar manualmente do bucket vtal (já que GCS exige login)
- Após upload: toast com resumo, painel se atualiza.

### 5. Sidebar e roteamento

- Item novo "Qualidade FTTH" em `AppSidebar.tsx`, visível somente para quem tem `qualidade_ftth` ou é admin (regra atual de `area_permissions` já cobre isso).
- Rota `/qualidade-ftth` em `App.tsx` com `ProtectedRoute`.
- Página fica montada e oculta via CSS, igual às demais (regra existente preservada).

### 6. Orientação ao usuário (entregue no chat após o build)

Passo a passo com prints conceituais explicando:
1. Como entrar no GCS pelo navegador (você já está logado), baixar os 8 CSVs.
2. Como abrir o módulo e ir em "Carregar Bases".
3. Como subir cada arquivo no card correto.
4. Como liberar o módulo para outros usuários (Admin → Permissões → marcar `qualidade_ftth`).
5. Como interpretar a tabela e clicar nos supervisores.

### O que NÃO muda

- Telegram, cron, Concentração de Reparos, Material Coleta, autenticação, sidebar das demais áreas, regras de RLS existentes, schemas atuais. Zero alteração em código já funcional.

### Entrega

Tudo em uma única rodada após sua aprovação:
- 1 migração SQL (tabelas + RLS + permissões)
- 1 edge function nova
- 1 página nova + entradas no sidebar e router
- Documentação em chat ao final
